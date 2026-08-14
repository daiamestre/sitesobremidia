import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CriarUsuarioPayload {
  nome: string;
  email: string;
  telefone?: string | null;
  perfilId: string;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const handler = async (req: Request): Promise<Response> => {
  console.log("create-corporate-user function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Autentica o chamador com a sessão REAL do Supabase
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autorizado" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) {
      return json({ error: "Sessão inválida" }, 401);
    }

    // 2. Payload e validação básica
    const payload = (await req.json()) as CriarUsuarioPayload;
    const nome = (payload.nome ?? "").trim();
    const email = (payload.email ?? "").trim().toLowerCase();

    if (!nome || !email || !payload.perfilId) {
      return json({ error: "Dados incompletos: nome, email e perfil são obrigatórios" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "E-mail inválido" }, 400);
    }

    // 3. Carrega o registro corporativo do chamador
    const { data: callerUser, error: callerErr } = await adminClient
      .from("usuarios")
      .select("id, email, empresa_operadora_id, is_owner, perfil:perfis(nome)")
      .eq("id", caller.id)
      .single();

    if (callerErr || !callerUser) {
      return json({ error: "Usuário corporativo não encontrado" }, 403);
    }

    const callerPerfil = callerUser.perfil?.nome ?? null;
    const isOwner = callerUser.is_owner === true;
    const isAdmin = typeof callerPerfil === "string" && callerPerfil.toUpperCase() === "ADMIN";

    if (!isOwner && !isAdmin) {
      return json({ error: "Apenas OWNER ou ADMIN podem criar usuários" }, 403);
    }

    // 4. Permissões granulares (Central Corporativa de Acessos):
    //    ADMIN precisa de users.create; criar ADMIN exige users.create_admin.
    //    A autorização REAL é revalidada dentro da RPC criar_usuario_corporativo.
    if (!isOwner) {
      const { data: perms, error: permsErr } = await adminClient
        .from("permissoes_usuarios")
        .select("permissao")
        .eq("usuario_id", caller.id);
      if (permsErr) {
        return json({ error: "Falha ao verificar permissões" }, 500);
      }
      const minhas = new Set((perms ?? []).map((p: { permissao: string }) => p.permissao));
      if (!minhas.has("users.create")) {
        return json({ error: "Acesso Negado: permissão users.create não concedida" }, 403);
      }
      const { data: perfilAlvo } = await adminClient
        .from("perfis")
        .select("nome")
        .eq("id", payload.perfilId)
        .single();
      if (perfilAlvo?.nome?.toUpperCase() === "ADMIN" && !minhas.has("users.create_admin")) {
        return json({ error: "Acesso Negado: criar ADMIN requer users.create_admin" }, 403);
      }
    }

    // 5. Cria a identidade Supabase Auth SEM confirmação: o e-mail de convite
    //    oficial do Supabase Auth é enviado automaticamente e o novo usuário
    //    define sua própria senha (mecanismo oficial de convite)
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        full_name: nome,
        invited_by: caller.id,
        corporate_user: true,
      },
    });

    if (authErr) {
      if (authErr.message.toLowerCase().includes("already been registered")) {
        return json({ error: "EMAIL_JA_CADASTRADO" }, 409);
      }
      return json({ error: authErr.message }, 400);
    }

    const newUserId = authData.user!.id;

    // 6. RPC criar_usuario_corporativo (SECURITY DEFINER no banco):
    //    revalida sessão, tenant, OWNER/ADMIN + users.create, perfil alvo,
    //    grava usuarios + representantes (se REP) + auditoria USER_CREATED
    //    + notificação USUARIO_CREATED. Executada COM O TOKEN DO CHAMADOR
    //    para que auth.uid() dentro do banco identifique o autor real.
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: rpcData, error: rpcErr } = await callerClient.rpc("criar_usuario_corporativo", {
      p_uid: newUserId,
      p_email: email,
      p_nome: nome,
      p_telefone: payload.telefone ?? null,
      p_perfil_id: payload.perfilId,
    });

    if (rpcErr || !rpcData) {
      // Rollback da identidade de autenticação se o registro corporativo falhar.
      // GoTrue admin.deleteUser é intermitente ("Database error deleting user"):
      // tentativas com backoff; se persistir, o usuário órfão é removido pelos
      // testes via SQL direto (limpeza determinística).
      let rollbackOk = false;
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const { error: delErr } = await adminClient.auth.admin.deleteUser(newUserId);
        if (!delErr) {
          rollbackOk = true;
          break;
        }
        await new Promise((res) => setTimeout(res, 1500 * (tentativa + 1)));
      }
      if (!rollbackOk) {
        console.error("create-corporate-user rollback incompleto para", email, "— limpar via SQL.");
      }
      console.error("create-corporate-user RPC error:", rpcErr?.message);
      return json({ error: rpcErr?.message ?? "Falha ao registrar usuário corporativo" }, 403);
    }

    return json({
      success: true,
      userId: newUserId,
      email,
      mensagem: "Usuário criado. Um convite foi enviado por e-mail.",
    });
  } catch (error: any) {
    console.error("Error in create-corporate-user function:", error);
    return json({ error: error.message ?? "Erro interno" }, 500);
  }
};

serve(handler);
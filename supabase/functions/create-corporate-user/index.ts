import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ======================================================================
// SOBRE MÍDIA — create-corporate-user (v2 PROVISIONAMENTO DIRETO)
// Missão §3/§5/§7: usuário criado por Owner/Admin autorizado (ou ANUNCIANTE
// para a própria equipe) recebe SENHA INICIAL ALEATÓRIA E FORTE gerada no
// backend, exatamente uma vez na resposta. Nada é persistido em texto puro.
// O novo acesso nasce ACTIVE/APPROVED com troca obrigatória de senha.
// ======================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CriarUsuarioPayload {
  nome: string;
  email: string;
  telefone?: string | null;
  perfilId: string;
  clienteId?: string | null;
  /** Metadados de prospecção persistidos em solicitacoes_acesso.dados_cadastro */
  dadosExtra?: Record<string, unknown> | null;
}

/**
 * Senha inicial criptograficamente aleatória: 22 caracteres com garantia de
 * maiúsculas, minúsculas, dígitos e símbolos (sem caracteres ambíguos).
 * Gerada exclusivamente em memória — nunca logada nem armazenada.
 */
function gerarSenhaInicial(): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%*&+-=";
  const all = lower + upper + digits + symbols;

  const randInts = (n: number): number[] => {
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    return Array.from(buf, (x) => x >>> 0);
  };

  const pick = (pool: string, r: number) => pool[r % pool.length];

  const chars: string[] = [];
  for (const r of randInts(5)) chars.push(pick(lower, r));
  for (const r of randInts(5)) chars.push(pick(upper, r));
  for (const r of randInts(4)) chars.push(pick(digits, r));
  for (const r of randInts(2)) chars.push(pick(symbols, r));
  while (chars.length < 16) chars.push(pick(all, randInts(1)[0]));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInts(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const handler = async (req: Request): Promise<Response> => {
  console.log("create-corporate-user v2 called");

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
    // PROBE [diag]: identificar versão em execução — remover depois
    if (req.headers.get("x-diag-probe")) {
      return json({ probe: "v14-diag-marker", diag: true });
    }
    // 1. Autentica o chamador pela sessão REAL
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) return json({ error: "Sessão inválida" }, 401);

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

    // 3. Registro corporativo do chamador (autorização revalidada na RPC)
    const { data: callerUser, error: callerErr } = await adminClient
      .from("usuarios")
      .select("id, email, empresa_operadora_id, is_owner, perfil:perfis(nome)")
      .eq("id", caller.id)
      .single();
    if (callerErr || !callerUser) {
      return json({ error: "Usuário corporativo não encontrado" }, 403);
    }

    const callerPerfil = String(callerUser.perfil?.nome ?? "").toUpperCase();
    const isOwner = callerUser.is_owner === true;
    const isAdmin = callerPerfil === "ADMIN";

    // Permissões granulares pré-via (a RPC revalida com has_admin_permission):
    // ADMIN exige users.create; REPRESENTANTE só provisiona GESTOR (prospecção)
    // ou CLIENTE/ANUNCIANTE da própria carteira; ANUNCIANTE só a própria equipe.
    if (!isOwner && !isAdmin && !["ANUNCIANTE", "REPRESENTANTE"].includes(callerPerfil)) {
      return json({ error: "Apenas OWNER, ADMIN, REPRESENTANTE ou ANUNCIANTE podem criar usuários" }, 403);
    }
    if (!isOwner && isAdmin) {
      const { data: perms, error: permsErr } = await adminClient
        .from("permissoes_usuarios")
        .select("permissao")
        .eq("usuario_id", caller.id);
      if (permsErr) return json({ error: "Falha ao verificar permissões" }, 500);
      const minhas = new Set((perms ?? []).map((p: { permissao: string }) => p.permissao));
      if (!minhas.has("users.create")) {
        return json({ error: "Acesso Negado: permissão users.create não concedida" }, 403);
      }
      const { data: perfilAlvo } = await adminClient
        .from("perfis")
        .select("nome")
        .eq("id", payload.perfilId)
        .single();
      if (String(perfilAlvo?.nome ?? "").toUpperCase() === "ADMIN" && !minhas.has("users.create_admin")) {
        return json({ error: "Acesso Negado: criar ADMIN requer users.create_admin" }, 403);
      }
    }

    // ============================================================
    // ROTEAMENTO POR NATUREZA DO PERFIL ALVO (reconciliação dos dois fluxos):
    //   EXTERNOS (ANUNCIANTE/PARCEIRO/CLIENTE) → FLUXO DE AUTORIZAÇÃO:
    //     identidade sem senha; RPC criar_usuario_corporativo nasce PENDING;
    //     trigger notifica OWNER na Central; após aprovação o usuário define
    //     a própria senha (handle-approval envia link oficial).
    //   INTERNOS/DEMAIS → PROVISIONAMENTO DIRETO (missão portal):
    //     senha inicial backend + troca obrigatória no primeiro acesso.
    // Nenhum dos caminhos é bypass: ambos passam pelas RPCs oficiais com
    // RBAC, tenant e auditoria.
    // ============================================================
    const { data: perfilAlvoRow } = await adminClient
      .from("perfis")
      .select("nome")
      .eq("id", payload.perfilId)
      .single();
    const perfilAlvoNome = String(perfilAlvoRow?.nome ?? "").toUpperCase();
    const PERFIS_EXTERNOS = new Set(["ANUNCIANTE", "PARCEIRO", "CLIENTE"]);
    // REPRESENTANTE fecha o negócio e entrega credencial na hora
    // (fechamento comercial / prospecção GESTOR): sempre provisionamento direto.
    // Demais chamadores mantêm o fluxo de aprovação para perfis externos.
    const requerAprovacao = PERFIS_EXTERNOS.has(perfilAlvoNome) && callerPerfil !== "REPRESENTANTE";

    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    if (requerAprovacao) {
      // ---------- FLUXO DE AUTORIZAÇÃO (EXTERNOS) ----------
      const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: {
          full_name: nome,
          invited_by: caller.id,
          corporate_user: true,
          provisioned_via: "create-corporate-user/aprovacao",
        },
      });
      if (authErr) {
        if (authErr.message.toLowerCase().includes("already been registered")) {
          return json({ error: "EMAIL_JA_CADASTRADO" }, 409);
        }
        return json({ error: authErr.message }, 400);
      }
      const newUserId = authData.user!.id;

      // RPC oficial v2: usuário PENDING + solicitação PENDING +
      // trigger trg_solicitacao_acesso_notifica_owner (Central IN_APP + e-mail).
      const { error: rpcErr } = await callerClient.rpc(
        "criar_usuario_corporativo",
        {
          p_uid: newUserId,
          p_email: email,
          p_nome: nome,
          p_telefone: payload.telefone ?? null,
          p_perfil_id: payload.perfilId,
          p_cliente_id: payload.clienteId ?? null,
        }
      );

      if (rpcErr) {
        let rollbackOk = false;
        for (let tentativa = 0; tentativa < 3; tentativa++) {
          const { error: delErr } = await adminClient.auth.admin.deleteUser(newUserId);
          if (!delErr) { rollbackOk = true; break; }
          await new Promise((res) => setTimeout(res, 1500 * (tentativa + 1)));
        }
        if (!rollbackOk) console.error("create-corporate-user rollback incompleto para", email);
        return json({ error: rpcErr.message ?? "Falha ao registrar usuário corporativo" }, 403);
      }

      return json({
        success: true,
        userId: newUserId,
        email,
        requer_aprovacao: true,
        mensagem: `Usuário criado como PENDING. Solicitação de autorização enviada ao OWNER via Central de Comunicação (${perfilAlvoNome}).`,
      });
    }

    // ---------- PROVISIONAMENTO DIRETO (INTERNOS) ----------
    // 4. Senha inicial automática (backend, única por criação)
    const senhaInicial = gerarSenhaInicial();

    // 5. Identidade já confirmada e COM senha — sem dependência de convite/e-mail
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email,
      password: senhaInicial,
      email_confirm: true,
      user_metadata: {
        full_name: nome,
        invited_by: caller.id,
        corporate_user: true,
        provisioned_via: "create-corporate-user/v2",
      },
    });

    if (authErr) {
      if (authErr.message.toLowerCase().includes("already been registered")) {
        return json({ error: "EMAIL_JA_CADASTRADO" }, 409);
      }
      return json({ error: authErr.message }, 400);
    }

    const newUserId = authData.user!.id;

    // 6. RPC de provisionamento executada COM O TOKEN DO CHAMADOR
    //    (auth.uid() identifica o autor real dentro do banco).
    //    Cria usuarios ATIVO/APPROVED + must_change_password TRUE +
    //    solicitação APPROVADA (modelo de login existente preservado).
    const { data: rpcData, error: rpcErr } = await callerClient.rpc(
      "provisionar_usuario_corporativo",
      {
        p_uid: newUserId,
        p_email: email,
        p_nome: nome,
        p_telefone: payload.telefone ?? null,
        p_perfil_id: payload.perfilId,
        p_cliente_id: payload.clienteId ?? null,
        p_dados_extra: payload.dadosExtra ?? null,
      }
    );

    if (rpcErr || !rpcData) {
      let rollbackOk = false;
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const { error: delErr } = await adminClient.auth.admin.deleteUser(newUserId);
        if (!delErr) { rollbackOk = true; break; }
        await new Promise((res) => setTimeout(res, 1500 * (tentativa + 1)));
      }
      if (!rollbackOk) {
        console.error("create-corporate-user rollback incompleto para", email);
      }
      console.error("create-corporate-user RPC error:", rpcErr?.message);
      return json({ error: rpcErr?.message ?? "Falha ao provisionar usuário corporativo" }, 403);
    }

    // 7. Resposta entrega a senha inicial UMA ÚNICA VEZ ao administrador.
    //    Não há persistência, log, analytics nem envio da credencial.
    return json({
      success: true,
      userId: newUserId,
      email,
      senha_inicial: senhaInicial,
      deve_trocar_senha: true,
      requer_aprovacao: false,
      mensagem:
        "Usuário provisionado com acesso imediato. Copie a senha inicial agora — ela não será exibida novamente. O usuário deverá trocá-la no primeiro login.",
    });
  } catch (error: any) {
    console.error("Error in create-corporate-user:", error);
    return json({ error: error?.message ?? "Erro interno" }, 500);
  }
};

serve(handler);

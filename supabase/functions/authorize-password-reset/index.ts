import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ======================================================================
// SOBRE MÍDIA — authorize-password-reset (§11 da missão)
// Emitir NOVA SENHA TEMPORÁRIA para solicitação APROVADA na Central.
//
// Contrato de segurança:
//   - chamador autenticado e OWNER/Admin (revalidado no banco);
//   - solicitação tipo PASSWORD_RESET_REQUEST com status APROVADA
//     (via RPC decidir_reset_senha) e credencial ainda NÃO emitida;
//   - emissão única: UPDATE condicional credencial_emitida_em IS NULL;
//   - senha gerada por CSPRNG, retornada UMA vez, nunca persistida/logada;
//   - usuário marcado must_change_password (troca obrigatória).
// ======================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function gerarSenhaTemporaria(): string {
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Sessão real do chamador
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) return json({ error: "Sessão inválida" }, 401);

    // 2. Chamador precisa ser OWNER/ADMIN/GESTOR/GERENTE/FINANCEIRO/SUPERVISOR
    const { data: callerRow, error: callerErr } = await adminClient
      .from("usuarios")
      .select("id, empresa_operadora_id, is_owner, perfil:perfis(nome)")
      .eq("id", caller.id)
      .single();
    if (callerErr || !callerRow) return json({ error: "Usuário não registrado" }, 403);

    const perfil = String(callerRow.perfil?.nome ?? "").toUpperCase();
    const privilegiado =
      callerRow.is_owner === true ||
      ["ADMIN", "GESTOR", "GERENTE", "FINANCEIRO", "SUPERVISOR"].includes(perfil);
    if (!privilegiado) {
      return json({ error: "Acesso Negado: apenas Owner/Admin autorizado podem emitir a credencial." }, 403);
    }

    // 3. Solicitação alvo — mesma tenant do chamador
    const body = await req.json().catch(() => ({}));
    const solicitacaoId = String(body?.solicitacao_id ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(solicitacaoId)) {
      return json({ error: "solicitacao_id inválido" }, 400);
    }

    const { data: sol, error: solErr } = await adminClient
      .from("solicitacoes")
      .select("id, empresa_operadora_id, entidade_tipo, entidade_id, tipo_solicitacao, status, credencial_emitida_em")
      .eq("id", solicitacaoId)
      .single();
    if (solErr || !sol) return json({ error: "Solicitação inexistente" }, 404);
    if (sol.empresa_operadora_id !== callerRow.empresa_operadora_id) {
      return json({ error: "Acesso Negado: solicitação de outro tenant." }, 403);
    }
    if (sol.tipo_solicitacao !== "PASSWORD_RESET_REQUEST") {
      return json({ error: "Solicitação não é de redefinição de senha." }, 400);
    }
    if (sol.status !== "APROVADA") {
      return json({ error: "Solicitação precisa estar APROVADA antes da emissão." }, 409);
    }
    if (sol.credencial_emitida_em) {
      return json({ error: "Credencial já emitida para esta solicitação." }, 409);
    }

    const alvoUserId = sol.entidade_id as string;

    const { data: alvoRow } = await adminClient
      .from("usuarios")
      .select("id, email, nome")
      .eq("id", alvoUserId)
      .single();
    if (!alvoRow) return json({ error: "Usuário alvo inexistente." }, 404);

    // 4. Emissão única (corrida segura): marca credencial_emitida_em primeiro;
    //    se outro processo vencer, abortamos sem tocar o GoTrue.
    const agora = new Date().toISOString();
    const { data: claimData, error: claimErr } = await adminClient
      .from("solicitacoes")
      .update({ credencial_emitida_em: agora })
      .eq("id", solicitacaoId)
      .eq("status", "APROVADA")
      .is("credencial_emitida_em", null)
      .select("id");

    if (claimErr) return json({ error: claimErr.message }, 500);
    if (!claimData || claimData.length !== 1) {
      return json({ error: "Credencial já emitida para esta solicitação." }, 409);
    }

    try {
      // 5. Gera senha temporária forte e aplica no GoTrue Admin
      const senhaTemporaria = gerarSenhaTemporaria();
      const { error: updAuthErr } = await adminClient.auth.admin.updateUserById(alvoUserId, {
        password: senhaTemporaria,
        user_metadata: { must_change_password: true },
      });
      if (updAuthErr) throw new Error(updAuthErr.message);

      // 6. Flag corporativa de troca obrigatória
      await adminClient
        .from("usuarios")
        .update({ must_change_password: true })
        .eq("id", alvoUserId);

      // 7. Auditoria SEM segredo
      await adminClient.from("auditoria_logs").insert({
        empresa_operadora_id: sol.empresa_operadora_id,
        usuario_id: caller.id,
        usuario_email: caller.email ?? null,
        usuario_role: perfil || null,
        entidade_tipo: "USUARIO",
        entidade_id: alvoUserId,
        acao: "PASSWORD_RESET_CREDENTIAL_ISSUED",
        status_novo: "ACTIVE",
        observacoes:
          "Nova senha temporária emitida pela Central. Alvo: " + String(alvoRow.email ?? "") +
          ". Solicitação: " + solicitacaoId,
      });

      // 8. Entrega única ao administrador aprovador
      return json({
        success: true,
        email_alvo: alvoRow.email,
        nome_alvo: alvoRow.nome,
        senha_temporaria: senhaTemporaria,
        deve_trocar_senha: true,
        mensagem:
          "Senha temporária gerada. Copie agora — não será exibida novamente. O usuário deverá trocá-la no próximo login.",
      });
    } catch (e: any) {
      // Libera o claim para nova tentativa legítima em caso de falha técnica
      await adminClient
        .from("solicitacoes")
        .update({ credencial_emitida_em: null })
        .eq("id", solicitacaoId);
      return json({ error: e?.message ?? "Falha ao aplicar nova senha." }, 500);
    }
  } catch (error: any) {
    console.error("authorize-password-reset:", error);
    return json({ error: error?.message ?? "Erro interno" }, 500);
  }
};

serve(handler);

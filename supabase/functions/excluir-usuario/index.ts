import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ======================================================================
// SOBRE MÍDIA — excluir-usuario (F-140)
// Exclui um usuário (funcionário, gestor de mídias, membro da equipe do anunciante).
//   1) Com a sessão de quem pediu, chama fn_excluir_usuario: é o banco que confere quem pode excluir quem
//      (dono/administrador da própria empresa; titular da conta do cliente para a própria equipe) e arquiva
//      o cadastro. Se o banco recusar, nada mais acontece.
//   2) Só depois encerra a conta de login com a chave de serviço (exclusão lógica: o registro fica para o
//      histórico, o acesso acaba e o e-mail é liberado para um novo cadastro).
// A chave de serviço nunca sai do servidor e nunca é usada antes de o banco autorizar.
// ======================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Método não permitido." });

  try {
    const autorizacao = req.headers.get("Authorization") || "";
    if (!autorizacao.startsWith("Bearer ")) return json(401, { ok: false, error: "É preciso estar logado." });

    const { usuarioId } = await req.json().catch(() => ({ usuarioId: null }));
    if (typeof usuarioId !== "string" || !UUID.test(usuarioId)) return json(400, { ok: false, error: "Usuário inválido." });

    const url = Deno.env.get("SUPABASE_URL")!;
    const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: autorizacao } } });
    const { data: quem, error: erroSessao } = await comoUsuario.auth.getUser(autorizacao.slice(7));
    if (erroSessao || !quem?.user) return json(401, { ok: false, error: "Sessão inválida. Entre de novo." });

    // 1) o banco decide e arquiva (com a sessão de quem pediu)
    const { data: resultado, error: erroBanco } = await comoUsuario.rpc("fn_excluir_usuario", { p_usuario: usuarioId });
    if (erroBanco) return json(erroBanco.code === "42501" ? 403 : 409, { ok: false, error: erroBanco.message });

    // 2) encerra a conta de login (exclusão lógica: libera o e-mail e impede novo acesso)
    const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { error: erroLogin } = await servico.auth.admin.deleteUser(usuarioId, true);
    if (erroLogin) {
      // O cadastro já está arquivado e inativo (não entra mais no sistema); só o e-mail não foi liberado.
      return json(200, { ok: true, ...(resultado as Record<string, unknown>), aviso: "Usuário excluído, mas o e-mail dele ainda não foi liberado para um novo cadastro. Se precisar reutilizar esse e-mail, avise o suporte." });
    }
    return json(200, { ok: true, ...(resultado as Record<string, unknown>) });
  } catch (_e) {
    return json(500, { ok: false, error: "Não foi possível excluir o usuário agora." });
  }
});

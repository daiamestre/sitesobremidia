import { supabase } from '@/integrations/supabase/client';

/** F-205: um aparelho que pode ir para a tela (mesma conta da tela). */
export interface AparelhoParaVincular {
  aparelho: string;
  versao: string | null;
  compativel: boolean;
  online: boolean;
  visto_em: string | null;
  tela_id: string | null;
  tela_nome: string | null;
  playlist_nome: string | null;
  nesta_tela: boolean;
}

interface Resposta { status?: string; message?: string; data?: AparelhoParaVincular[] }

// as funções F-205 ainda não estão nos tipos gerados do banco
// (bind: a função precisa continuar presa ao cliente, senão falha antes de chamar o servidor)
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as unknown as Rpc).call(supabase, fn, args);

export async function listarAparelhosParaVincular(telaId: string): Promise<AparelhoParaVincular[]> {
  const { data, error } = await rpc('fn_aparelhos_para_vincular', { p_tela: telaId });
  if (error) throw new Error(error.message);
  const r = data as Resposta | null;
  if (r?.status !== 'SUCCESS') throw new Error(r?.message || 'Não foi possível listar os aparelhos.');
  return r.data ?? [];
}

/** Liga o aparelho nesta tela (ele sai da tela antiga sozinho). Devolve a mensagem para o usuário. */
export async function vincularAparelhoNaTela(telaId: string, aparelho: string): Promise<string> {
  const { data, error } = await rpc('fn_vincular_aparelho_na_tela', { p_tela: telaId, p_aparelho: aparelho });
  if (error) throw new Error(error.message);
  const r = data as Resposta | null;
  if (r?.status !== 'SUCCESS') throw new Error(r?.message || 'Não foi possível vincular o aparelho.');
  return r.message || 'Aparelho vinculado.';
}

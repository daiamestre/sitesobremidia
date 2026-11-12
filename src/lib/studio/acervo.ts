/**
 * F-310 (pedido do dono, 12/11/2026) — ACERVO DO STUDIO. Tudo o que os usuários enviam (fundo, logo, imagem) e cada criação
 * que salvam (palco, encarte, arte) fica guardado no SOBRE MÍDIA, por segmento, para o dono/ADM transformar em modelo do
 * sistema. Gravação silenciosa: nunca interrompe nem atrapalha quem está criando (falha é ignorada). Só dono/ADM leem.
 */
import { supabase } from '@/integrations/supabase/client';

export type TipoNoAcervo = 'fundo' | 'logo' | 'imagem' | 'palco' | 'encarte' | 'arte';
export interface ItemDoAcervo {
  id: string; tipo: TipoNoAcervo; segmento: string | null; nome: string | null; url: string | null; video: string | null;
  dados: Record<string, unknown> | null; promovido_para: string | null; criado_em: string; usuario_id: string; autor: string;
}

type Rpc = (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

/** Guarda no acervo sem esperar e sem avisar (se falhar, a criação do usuário segue normal). */
export function guardarNoAcervo(o: { tipo: TipoNoAcervo; segmento?: string | null; nome?: string | null; url?: string | null; video?: string | null; dados?: unknown }): void {
  if (!o.url && !o.video && !o.dados) return;
  if (o.url && !/^(https:\/\/|\/studio\/)/.test(o.url)) return; // imagem local (blob:, data:) não vai
  void rpc('studio_acervo_registrar', {
    p_tipo: o.tipo, p_segmento: o.segmento ?? null, p_nome: o.nome ?? null, p_url: o.url ?? null,
    p_video: o.video && /^https:\/\//.test(o.video) ? o.video : null, p_dados: o.dados ?? null,
  }).catch(() => undefined);
}

export async function listarAcervo(segmento?: string | null): Promise<ItemDoAcervo[]> {
  const { data, error } = await rpc('studio_acervo_listar', { p_segmento: segmento ?? null, p_limite: 500 });
  if (error) throw new Error(error.message);
  return (data ?? []) as ItemDoAcervo[];
}

export async function marcarPromovido(id: string, modelo: string): Promise<void> {
  const { error } = await rpc('studio_acervo_promovido', { p_id: id, p_modelo: modelo });
  if (error) throw new Error(error.message);
}

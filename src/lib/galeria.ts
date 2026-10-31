// F-225 — galeria em PASTAS por segmento (as mesmas pastas de modelos do SOBRE MÍDIA Studio). Cada pessoa só vê as
// suas pastas e mídias (RLS em galeria_pastas/galeria_midias). Mídia sem pasta aparece em "Outras mídias".
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as unknown as SupabaseClient;
export type OrigemDaMidia = 'media' | 'cliente_assets';
export interface PastaDaGaleria { chave: string; nome: string; segmento?: string | null }
export interface PastaGravada extends PastaDaGaleria { capa_url: string | null; atualizado_em?: string }
export const OUTRAS = '__outras';

/** Põe a mídia (recém-criada no Studio) na pasta do modelo, criando a pasta na galeria da pessoa se for a primeira. */
export async function guardarNaPasta(usuarioId: string, origem: OrigemDaMidia, midiaId: string, pasta: PastaDaGaleria) {
  const p = await db.from('galeria_pastas').upsert(
    { usuario_id: usuarioId, chave: pasta.chave.slice(0, 80), nome: pasta.nome.slice(0, 120), segmento: pasta.segmento ?? null },
    { onConflict: 'usuario_id,chave', ignoreDuplicates: true },
  );
  if (p.error) throw new Error(p.error.message);
  const m = await db.from('galeria_midias').upsert({ usuario_id: usuarioId, origem, midia_id: midiaId, chave: pasta.chave.slice(0, 80) }, { onConflict: 'usuario_id,origem,midia_id' });
  if (m.error) throw new Error(m.error.message);
}

export async function lerGaleria(origem: OrigemDaMidia): Promise<{ pastas: PastaGravada[]; mapa: Map<string, string> }> {
  const [p, m] = await Promise.all([
    db.from('galeria_pastas').select('chave, nome, segmento, capa_url, atualizado_em'),
    db.from('galeria_midias').select('midia_id, chave').eq('origem', origem),
  ]);
  return {
    pastas: (p.data ?? []) as PastaGravada[],
    mapa: new Map(((m.data ?? []) as { midia_id: string; chave: string }[]).map((x) => [x.midia_id, x.chave])),
  };
}

export async function trocarCapa(chave: string, capaUrl: string | null) {
  const { error } = await db.from('galeria_pastas').update({ capa_url: capaUrl, atualizado_em: new Date().toISOString() }).eq('chave', chave);
  if (error) throw new Error(error.message);
}

export interface ItemDaGaleria { id: string; nome: string; capa: string | null; criado?: string }
export interface GrupoDaGaleria<T extends ItemDaGaleria> { chave: string; nome: string; capa: string | null; capaPropria: boolean; itens: T[] }

/** Agrupa as mídias nas pastas (mais recentes primeiro) e deixa "Outras mídias" por último. */
export function agruparEmPastas<T extends ItemDaGaleria>(itens: T[], mapa: Map<string, string>, pastas: PastaGravada[]): GrupoDaGaleria<T>[] {
  const porChave = new Map(pastas.map((p) => [p.chave, p]));
  const grupos = new Map<string, T[]>();
  for (const i of itens) {
    const ch = mapa.get(i.id);
    const chave = ch && porChave.has(ch) ? ch : OUTRAS;
    grupos.set(chave, [...(grupos.get(chave) ?? []), i]);
  }
  const lista = [...grupos.entries()].map(([chave, l]) => {
    const p = porChave.get(chave);
    return { chave, nome: p?.nome ?? 'Outras mídias', capa: p?.capa_url ?? l.find((x) => x.capa)?.capa ?? null, capaPropria: !!p?.capa_url, itens: l };
  });
  const recente = (g: GrupoDaGaleria<T>) => g.itens.reduce((a, x) => (x.criado && x.criado > a ? x.criado : a), '');
  return lista.sort((a, b) => (a.chave === OUTRAS ? 1 : b.chave === OUTRAS ? -1 : recente(b).localeCompare(recente(a))));
}

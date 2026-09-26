import { supabase } from '@/integrations/supabase/client';
import { hojeBrasilia } from './ofertaWidget';

/**
 * Widget de Publicidade: o widget guarda só `campanhaId`; título, datas e criativos vêm SEMPRE da campanha
 * (campanhas/campanha_midias). Mesmo formato que o Player recebe em `config.campanha` (fn_widget_campanha_dados, 20261243).
 */
export interface CampanhaWidgetDados {
  id: string;
  titulo: string;
  status: string;
  data_inicio: string;
  data_fim: string;
  vigente: boolean;
  /** URLs públicas dos criativos em imagem (vídeos ficam de fora: vão como mídia comum da playlist). */
  criativos: string[];
}

/** Campanha "no ar" para o widget. */
export const STATUS_CAMPANHA_NO_AR = ['APPROVED', 'ACTIVE'];

export function campanhaVigente(c: Pick<CampanhaWidgetDados, 'status' | 'data_inicio' | 'data_fim'> & { deleted_at?: string | null }, agora: Date = new Date()): boolean {
  const hoje = hojeBrasilia(agora);
  return STATUS_CAMPANHA_NO_AR.includes(c.status) && !c.deleted_at && c.data_inicio <= hoje && hoje <= c.data_fim;
}

const IMAGEM = /\.(png|jpe?g|webp|gif)$/i;
export function ehCriativoImagem(m: { content_type: string | null; storage_path: string }): boolean {
  return m.content_type ? m.content_type.toLowerCase().startsWith('image/') : IMAGEM.test(m.storage_path);
}

interface CampanhaLinha {
  id: string; titulo: string; status: string; data_inicio: string; data_fim: string; deleted_at: string | null;
  midias?: Array<{ storage_path: string; content_type: string | null; created_at: string }>;
}

export function campanhaParaWidget(c: CampanhaLinha, urlPublica: (path: string) => string, agora: Date = new Date()): CampanhaWidgetDados {
  const criativos = (c.midias || [])
    .filter(ehCriativoImagem)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, 6)
    .map((m) => urlPublica(m.storage_path));
  return { id: c.id, titulo: c.titulo, status: c.status, data_inicio: c.data_inicio, data_fim: c.data_fim, vigente: campanhaVigente(c, agora), criativos };
}

const urlDoBucket = (path: string) => supabase.storage.from('campanhas_midia').getPublicUrl(path).data.publicUrl;
const SELECT = 'id, titulo, status, data_inicio, data_fim, deleted_at, midias:campanha_midias(storage_path, content_type, created_at)';

/** Campanhas que quem está logado pode ver (RLS de campanhas), sem as excluídas. */
export async function listarCampanhasWidget(): Promise<CampanhaWidgetDados[]> {
  const { data, error } = await supabase.from('campanhas').select(SELECT).is('deleted_at', null).order('data_inicio', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as CampanhaLinha[]).map((c) => campanhaParaWidget(c, urlDoBucket));
}

export async function buscarCampanhaWidget(campanhaId: string): Promise<CampanhaWidgetDados | null> {
  const { data, error } = await supabase.from('campanhas').select(SELECT).eq('id', campanhaId).maybeSingle();
  if (error || !data) return null;
  return campanhaParaWidget(data as unknown as CampanhaLinha, urlDoBucket);
}

import { supabase } from '@/integrations/supabase/client';

/** F-107 — Pontos parceiros no Portal do Anunciante (RPCs portal_* e anunciar_no_ponto). */
export interface PontoParceiroResumo {
  id: string;
  nome: string;
  categoria: string | null;
  descricao: string | null;
  foto_url: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  logradouro: string | null;
  numero: string | null;
  latitude: number | null;
  longitude: number | null;
  valor_anuncio: number | null;
  periodicidade: string | null;
  quantidade_telas: number | null;
  telas_conectadas: number;
  meus_anuncios: number;
}

export interface AnuncioNoPonto {
  id: string;
  status: 'ATIVO' | 'PAUSADO';
  asset_id: string;
  nome: string;
  tipo: string;
  url: string | null;
  desde: string;
}

export interface PontoParceiroDetalhe extends Omit<PontoParceiroResumo, 'meus_anuncios'> {
  cep: string | null;
  complemento: string | null;
  galeria: { url: string; credito?: string }[] | null;
  horario_funcionamento: string | null;
  publico_estimado_dia: number | null;
  regras_comerciais: string | null;
  telas_online: number;
  meus_anuncios: AnuncioNoPonto[];
}

export interface MidiaDoCliente {
  id: string;
  nome: string;
  tipo: 'imagem' | 'video';
  object_url: string;
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, (args ?? {}) as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export const pontosParceirosService = {
  listar: () => rpc<PontoParceiroResumo[]>('portal_pontos_parceiros'),
  detalhe: (id: string) => rpc<PontoParceiroDetalhe | null>('portal_ponto_parceiro', { p_ponto: id }),
  anunciar: (ponto: string, asset: string) => rpc<{ status: string; anuncio_id: string; telas_no_ponto: number }>('anunciar_no_ponto', { p_ponto: ponto, p_asset: asset }),
  pausar: (anuncio: string) => rpc<{ status: string }>('pausar_anuncio_no_ponto', { p_anuncio: anuncio }),

  /** Mídias do anunciante que podem ir para as telas (imagem e vídeo). */
  async minhasMidias(clienteId: string): Promise<MidiaDoCliente[]> {
    const { data, error } = await supabase
      .from('cliente_assets')
      .select('id, nome, tipo, object_url')
      .eq('cliente_id', clienteId)
      .in('tipo', ['imagem', 'video'])
      .not('object_url', 'is', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MidiaDoCliente[];
  },
};

export const enderecoCompleto = (p: { logradouro?: string | null; numero?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null }) =>
  [[p.logradouro, p.numero].filter(Boolean).join(', '), p.bairro, [p.cidade, p.estado].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');

export const brl = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

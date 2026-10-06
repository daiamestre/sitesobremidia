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

export type StatusAnuncio = 'EM_ANALISE' | 'AGUARDANDO_PAGAMENTO' | 'ATIVO' | 'PAUSADO' | 'SUSPENSO' | 'RECUSADO';

export const ROTULO_ANUNCIO: Record<StatusAnuncio, { texto: string; cor: string }> = {
  EM_ANALISE: { texto: 'Mídia em análise', cor: 'bg-sky-500/15 text-sky-300' },
  AGUARDANDO_PAGAMENTO: { texto: 'Aguardando pagamento', cor: 'bg-amber-500/15 text-amber-300' },
  ATIVO: { texto: 'No ar', cor: 'bg-emerald-500/15 text-emerald-300' },
  PAUSADO: { texto: 'Pausado', cor: 'bg-slate-500/20 text-slate-300' },
  SUSPENSO: { texto: 'Fora do ar por atraso', cor: 'bg-red-500/15 text-red-300' },
  RECUSADO: { texto: 'Mídia recusada', cor: 'bg-red-500/15 text-red-300' },
};

export interface TelaParaAnunciar {
  id: string;
  local: string;
  foto_url: string | null;
  orientacao: string | null;
  polegadas: number | null;
  valor: number | null;
  /** F-148: áreas da tela que aceitam anúncio (vazio = tela sem divisão). */
  zonas?: { numero: number; nome: string; parte_da_tela: number }[];
}

export interface AnuncioNoPonto {
  id: string;
  status: StatusAnuncio;
  valor: number | null;
  valido_ate: string | null;
  motivo: string | null;
  telas: number;
  /** F-148: área da tela em que o anúncio toca (nulo = toda a programação). */
  zona?: number | null;
  cobranca: { codigo: string; identificador: string; status: string; vencimento: string } | null;
  asset_id: string;
  nome: string;
  tipo: string;
  url: string | null;
  desde: string;
}

export interface PontoParceiroDetalhe extends Omit<PontoParceiroResumo, 'meus_anuncios'> {
  cep: string | null;
  complemento: string | null;
  galeria: { url: string; legenda?: string | null; credito?: string | null }[] | null;
  /** F-108: onde cada tela fica dentro do estabelecimento */
  onde_ficam_as_telas: { local: string; detalhe?: string | null }[] | null;
  horario_funcionamento: string | null;
  publico_estimado_dia: number | null;
  regras_comerciais: string | null;
  telas_online: number;
  telas: TelaParaAnunciar[];
  meus_anuncios: AnuncioNoPonto[];
}

export interface MidiaDoCliente {
  id: string;
  nome: string;
  tipo: 'imagem' | 'video';
  object_url: string;
  moderacao_status: 'PENDENTE' | 'EM_ANALISE_MANUAL' | 'APROVADA' | 'RECUSADA';
  moderacao_motivo: string | null;
}

export interface ResultadoAnunciar {
  status: 'EM_ANALISE' | 'AGUARDANDO_PAGAMENTO' | 'ATIVO';
  anuncio_id: string;
  /** F-113: CONTRATO = telas vendidas pelo representante (sem cobrança avulsa). */
  origem?: 'PORTAL' | 'CONTRATO' | 'GRATUITO';
  valor: number;
  telas: number;
  cobranca: { codigo: string; identificador: string; vencimento: string } | null;
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, (args ?? {}) as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export const pontosParceirosService = {
  listar: () => rpc<PontoParceiroResumo[]>('portal_pontos_parceiros'),
  detalhe: (id: string) => rpc<PontoParceiroDetalhe | null>('portal_ponto_parceiro', { p_ponto: id }),
  anunciar: (ponto: string, asset: string, telas: string[], zona?: number | null) => zona
    ? rpc<ResultadoAnunciar>('anunciar_no_ponto_na_zona', { p_ponto: ponto, p_asset: asset, p_telas: telas, p_zona: zona })
    : rpc<ResultadoAnunciar>('anunciar_no_ponto', { p_ponto: ponto, p_asset: asset, p_telas: telas }),
  /** F-113: telas deste ponto já incluídas no contrato do anunciante. */
  telasContratadas: (ponto: string) => rpc<string[]>('portal_telas_contratadas', { p_ponto: ponto }),
  reativar: (anuncio: string) => rpc<{ status: string }>('reativar_anuncio_no_ponto', { p_anuncio: anuncio }),
  pausar: (anuncio: string) => rpc<{ status: string }>('pausar_anuncio_no_ponto', { p_anuncio: anuncio }),

  /** Mídias do anunciante que podem ir para as telas (imagem e vídeo). */
  async minhasMidias(clienteId: string): Promise<MidiaDoCliente[]> {
    const { data, error } = await supabase
      .from('cliente_assets')
      .select('id, nome, tipo, object_url, moderacao_status, moderacao_motivo')
      .eq('cliente_id', clienteId)
      .in('tipo', ['imagem', 'video'])
      .not('object_url', 'is', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as MidiaDoCliente[];
  },
};

export const enderecoCompleto = (p: { logradouro?: string | null; numero?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null }) =>
  [[p.logradouro, p.numero].filter(Boolean).join(', '), p.bairro, [p.cidade, p.estado].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');

export const brl = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

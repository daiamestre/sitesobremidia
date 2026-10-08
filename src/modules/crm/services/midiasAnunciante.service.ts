/**
 * F-166 — Owner/ADM: valor da mídia por anunciante e liberação de mídias grátis (com motivo).
 * Tudo passa por RPC do banco (conferem Owner/ADM e a empresa do anunciante); nada é gravado direto da tela.
 */
import { supabase } from '@/integrations/supabase/client';

export type MotivoDaLiberacao = 'PROMOCAO' | 'DATA_COMEMORATIVA' | 'CORTESIA' | 'OUTRO';

export interface AnuncianteDeMidias {
  cliente_id: string;
  nome: string;
  documento?: string | null;
  cidade?: string | null;
  valor: number;
  valor_personalizado: boolean;
  gratis_restantes: number;
  playlists: number;
}

export interface LiberacaoAdmin {
  id: string;
  quantidade: number;
  usadas: number;
  motivo: MotivoDaLiberacao;
  data_comemorativa: string | null;
  explicacao: string | null;
  mensagem: string;
  valor_proxima: number;
  criado_em: string;
  cancelado_em: string | null;
}

export interface DetalheDeMidias {
  valor: number;
  valor_padrao: number;
  valor_personalizado: { valor: number; motivo: string | null; atualizado_em: string } | null;
  gratis_primeira_playlist: 'DISPONIVEL' | 'USADA';
  playlists: number;
  midias_pagas: number;
  liberacoes: LiberacaoAdmin[];
}

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc: Rpc = (fn, args) => (supabase as unknown as { rpc: Rpc }).rpc(fn, args);

async function chamar<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const midiasAnuncianteService = {
  listar: (busca?: string) =>
    chamar<{ valor_padrao: number; clientes: AnuncianteDeMidias[] }>('admin_midias_listar_clientes', { p_busca: busca?.trim() || null }),
  detalhe: (clienteId: string) => chamar<DetalheDeMidias>('admin_midias_cliente', { p_cliente: clienteId }),
  /** valor null = volta ao valor padrão */
  definirValor: (clienteId: string, valor: number | null, motivo?: string) =>
    chamar<{ ok: boolean; valor: number }>('admin_midias_definir_valor', { p_cliente: clienteId, p_valor: valor, p_motivo: motivo?.trim() || null }),
  definirPadrao: (valor: number) => chamar<{ ok: boolean; valor_padrao: number }>('admin_midias_definir_padrao', { p_valor: valor }),
  liberar: (o: { clienteId: string; quantidade: number; motivo: MotivoDaLiberacao; dataComemorativa?: string; explicacao?: string }) =>
    chamar<{ ok: boolean; mensagem: string; valor_proxima: number }>('admin_midias_liberar', {
      p_cliente: o.clienteId, p_quantidade: o.quantidade, p_motivo: o.motivo,
      p_data_comemorativa: o.dataComemorativa?.trim() || null, p_explicacao: o.explicacao?.trim() || null,
    }),
  cancelar: (liberacaoId: string) => chamar<{ ok: boolean }>('admin_midias_cancelar_liberacao', { p_liberacao: liberacaoId }),
};

/** "9,99", "9.99", "R$ 9,99" → 9.99 (null se não for um valor válido). */
export function lerValor(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 && n <= 9999 ? Math.round(n * 100) / 100 : null;
}

/** O que o Owner/ADM confirma antes de liberar: o texto que o anunciante vai ler e o aviso do valor da próxima. */
export function previaDaLiberacao(o: { quantidade: number; motivo: MotivoDaLiberacao; dataComemorativa?: string; explicacao?: string; valor: number }): string {
  const q = o.quantidade;
  const brl = `R$ ${o.valor.toFixed(2).replace('.', ',')}`;
  const motivo = o.motivo === 'PROMOCAO' ? ' em uma promoção'
    : o.motivo === 'DATA_COMEMORATIVA' ? ` em comemoração a ${o.dataComemorativa?.trim() || '…'}`
    : o.motivo === 'CORTESIA' ? ' como cortesia da SOBRE MÍDIA' : '';
  const exp = o.explicacao?.trim();
  return `Liberamos ${q} ${q === 1 ? 'mídia grátis' : 'mídias grátis'} para você${motivo}.${exp ? ` ${/[.!?]$/.test(exp) ? exp : exp + '.'}` : ''} `
    + `Depois ${q === 1 ? 'dessa mídia' : `dessas ${q} mídias`}, a próxima mídia que você adicionar a uma playlist custa ${brl}.`;
}

/** Texto sem acento e em minúsculas, para a busca achar "Cafe" em "Café". */
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const soDigitos = (s: string) => s.replace(/\D/g, '');

/** Busca por nome (sem acento) ou CNPJ (só números, a partir de 3 dígitos). */
export function filtrarAnunciantes(lista: AnuncianteDeMidias[], busca: string): AnuncianteDeMidias[] {
  const q = normalizar(busca.trim());
  if (!q) return lista;
  const d = soDigitos(q);
  return lista.filter((c) => normalizar(c.nome).includes(q) || (d.length >= 3 && soDigitos(c.documento ?? '').includes(d)));
}

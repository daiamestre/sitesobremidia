import { supabase } from '@/integrations/supabase/client';
import type { Oferta, OfertaStatus } from '@/types/customerPortal';
import { BRASILIA_TZ } from './brasiliaTime';

/**
 * Widget de Oferta: o widget guarda só `ofertaId`; os dados vêm SEMPRE do cadastro de ofertas (ofertas/oferta_itens/produtos).
 * Mesmo formato que o Player recebe em `config.oferta` (fn_widget_oferta_dados, migração 20261242).
 */
export interface OfertaWidgetItem {
  nome: string;
  marca: string | null;
  unidade: string | null;
  imagem_url: string | null;
  preco_original: number;
  preco_oferta: number;
  desconto: number;
  destaque: boolean;
}

export interface OfertaWidgetDados {
  id: string;
  titulo: string;
  descricao: string | null;
  status: OfertaStatus;
  data_inicio: string;
  data_fim: string;
  vigente: boolean;
  itens: OfertaWidgetItem[];
}

/** Mesma regra da tela Ofertas: oferta "no ar". */
export const STATUS_NO_AR: OfertaStatus[] = ['APPROVED', 'SCHEDULED', 'PUBLISHED'];

/** Data de hoje (AAAA-MM-DD) no Horário de Brasília. */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BRASILIA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

export function ofertaVigente(o: Pick<OfertaWidgetDados, 'status' | 'data_inicio' | 'data_fim'>, agora: Date = new Date()): boolean {
  const hoje = hojeBrasilia(agora);
  return STATUS_NO_AR.includes(o.status) && o.data_inicio <= hoje && hoje <= o.data_fim;
}

/** Converte a oferta do cadastro no formato do widget (até 6 itens, destaques primeiro, só produtos ativos). */
export function ofertaParaWidget(o: Oferta, agora: Date = new Date()): OfertaWidgetDados {
  const itens = (o.itens || [])
    .filter((i) => i.produto && i.produto.ativo !== false)
    .map((i) => ({
      nome: i.produto!.nome,
      marca: i.produto!.marca ?? null,
      unidade: i.produto!.unidade_medida ?? null,
      imagem_url: i.produto!.imagem_url ?? null,
      preco_original: Number(i.preco_original),
      preco_oferta: Number(i.preco_oferta),
      desconto: Number(i.desconto_porcentagem || 0),
      destaque: !!i.destaque,
    }))
    .sort((a, b) => Number(b.destaque) - Number(a.destaque) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 6);
  return {
    id: o.id, titulo: o.titulo, descricao: o.descricao, status: o.status,
    data_inicio: o.data_inicio, data_fim: o.data_fim, vigente: ofertaVigente(o, agora), itens,
  };
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const precoBR = (v: number) => BRL.format(v).replace(/ /g, ' ');

/** Percentual exibido: o cadastrado, ou o calculado pelos preços. */
export function descontoDoItem(i: Pick<OfertaWidgetItem, 'desconto' | 'preco_original' | 'preco_oferta'>): number {
  if (i.desconto > 0) return Math.round(i.desconto);
  if (i.preco_original > 0 && i.preco_oferta < i.preco_original) return Math.round((1 - i.preco_oferta / i.preco_original) * 100);
  return 0;
}

/** "Válido até 30/09" (ou "Válido hoje"). */
export function validadeTexto(dataFim: string, agora: Date = new Date()): string {
  if (dataFim === hojeBrasilia(agora)) return 'Válido só hoje';
  const [, m, d] = dataFim.split('-');
  return `Válido até ${d}/${m}`;
}

/** Lê a oferta com a permissão de quem está logado (RLS da tabela ofertas). */
export async function buscarOfertaWidget(ofertaId: string): Promise<OfertaWidgetDados | null> {
  const { data, error } = await supabase
    .from('ofertas')
    .select('*, itens:oferta_itens(*, produto:produtos(*))')
    .eq('id', ofertaId)
    .maybeSingle();
  if (error || !data) return null;
  return ofertaParaWidget(data as unknown as Oferta);
}

/** Preço em partes para o destaque de varejo: 14,90 -> { inteiro: '14', centavos: '90' }. */
export function partesPreco(v: number): { inteiro: string; centavos: string } {
  const [inteiro, centavos] = v.toFixed(2).split('.');
  return { inteiro: Number(inteiro).toLocaleString('pt-BR'), centavos };
}

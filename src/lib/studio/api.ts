// SOBRE MÍDIA Studio de IA — acesso do navegador. Só LÊ as tabelas (RLS) e MUDA tudo por funções do banco
// (studio_*), que tiram empresa/cliente/usuário da sessão. Nenhuma chave de IA passa por aqui.
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/lib/r2Upload';
import { recortarImagem } from '@/lib/tabloide/recorte';
import {
  chaveDoPedido, type EdicaoCena, type Estado, type FotoProduto, type PedidoStudio, type PlanoCriativo, type VersaoImagem,
} from '../../../supabase/functions/_shared/studio/contrato.ts';

export interface CenaImagens { versoes: VersaoImagem[]; escolhida?: number; gerar?: boolean; instrucao?: string }
export interface VerificacaoQC { nome: string; ok: boolean; detalhe: string; bloqueia?: boolean }
export interface Producao {
  id: string; empresa_operadora_id: string; cliente_id: string | null; user_id: string; titulo: string;
  tipo: PedidoStudio['tipo']; formato: PedidoStudio['formato']; duracao_s: number; cenas_qtd: number;
  briefing: PedidoStudio['briefing']; produtos: PedidoStudio['produtos']; estado: Estado; plano: PlanoCriativo | null; plano_versao: number;
  instrucao_ajuste: string | null; cenas: Record<string, CenaImagens>; edicoes: Record<string, EdicaoCena>; ordem: number[] | null; edicao_versao: number;
  montagem: Record<string, unknown>; rotulo: string | null; custo_neurons: number; custo_usd: number; erro: string | null;
  resultado: { video_url?: string; imagem_url?: string; imagens?: string[]; miniatura_url?: string; quadros?: string[]; largura?: number; altura?: number; tamanho?: number; qc?: { aprovado: boolean; verificacoes: VerificacaoQC[] } };
  resultado_asset_id: string | null; resultado_media_id: string | null; criado_em: string; atualizado_em: string;
}
export interface Etapa { id: string; agente: string; chave: string; modelo: string | null; versao_diretriz: string | null; neurons: number; custo_usd: number; tentativas: number; estado: string; erro: string | null; criado_em: string; saida: unknown }
export interface ProvedorStatus { id: string; tipo: string; nome: string; custo: string; custoTexto: string; disponivel: boolean; motivo: string | null }

// O cliente gerado (types.ts) ainda não conhece as tabelas studio_*; o acesso fica tipado aqui.
type Resposta<T> = Promise<{ data: T | null; error: { message: string } | null }>;
interface Consulta<T> extends PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  eq(c: string, v: unknown): Consulta<T>; order(c: string, o: { ascending: boolean }): Consulta<T>; limit(n: number): Consulta<T>; maybeSingle(): Resposta<T>;
}
const db = supabase as unknown as {
  from<T>(t: string): { select(c: string): Consulta<T> };
  rpc<T>(f: string, args?: Record<string, unknown>): Resposta<T>;
};

async function rpc<T>(f: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc<T>(f, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function listarProducoes(): Promise<Producao[]> {
  const { data, error } = await db.from<Producao>('studio_producoes').select('*').order('criado_em', { ascending: false }).limit(60);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function obterProducao(id: string): Promise<{ producao: Producao | null; etapas: Etapa[] }> {
  const [{ data: producao, error }, { data: etapas }] = await Promise.all([
    db.from<Producao>('studio_producoes').select('*').eq('id', id).maybeSingle(),
    db.from<Etapa>('studio_etapas').select('id, agente, chave, modelo, versao_diretriz, neurons, custo_usd, tentativas, estado, erro, criado_em, saida').eq('producao_id', id).order('criado_em', { ascending: true }),
  ]);
  if (error) throw new Error(error.message);
  return { producao, etapas: etapas ?? [] };
}

/** Pede ao orquestrador para avançar já (sem esperar o cron). Falha silenciosa: o cron de 1 min cobre. */
export async function cutucar(id: string) {
  try { await supabase.functions.invoke('studio-orquestrador', { body: { acao: 'cutucar', producao_id: id } }); } catch { /* o cron continua */ }
}

export async function criarProducao(userId: string, pedido: PedidoStudio): Promise<string> {
  const id = await rpc<string>('studio_criar_producao', { p_pedido: pedido, p_chave: await chaveDoPedido(userId, pedido) });
  void cutucar(id);
  return id;
}

export const aprovarPlano = async (id: string) => { await rpc('studio_aprovar_plano', { p_id: id }); void cutucar(id); };
export const pedirReplanejar = async (id: string, instrucao: string) => { await rpc('studio_pedir_replanejar', { p_id: id, p_instrucao: instrucao }); void cutucar(id); };
export const decidirImagem = (id: string, cena: number, versao: number, decisao: 'aprovada' | 'rejeitada') =>
  rpc('studio_decidir_imagem', { p_id: id, p_cena: cena, p_versao: versao, p_decisao: decisao });
export const pedirImagem = async (id: string, cena: number, instrucao: string) => { await rpc('studio_pedir_imagem', { p_id: id, p_cena: cena, p_instrucao: instrucao }); void cutucar(id); };
export const salvarEdicao = (id: string, edicoes: Record<string, EdicaoCena>, ordem: number[] | null) => rpc<number>('studio_salvar_edicao', { p_id: id, p_edicoes: edicoes, p_ordem: ordem });
export const pedirMontagem = async (id: string) => { await rpc('studio_pedir_montagem', { p_id: id }); void cutucar(id); };
export const entregar = (id: string, pasta: string | null) => rpc<{ destino: string; id: string }>('studio_entregar', { p_id: id, p_pasta: pasta });
export const cancelar = (id: string) => rpc('studio_cancelar', { p_id: id });
export const tentarDeNovo = async (id: string) => { const r = await rpc<string>('studio_tentar_de_novo', { p_id: id }); void cutucar(id); return r; };
export const minhaCota = () => rpc<Record<string, { usado: number; limite: number }>>('studio_minha_cota');

export async function provedores(): Promise<ProvedorStatus[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke('studio-orquestrador', { body: { acao: 'provedores' } });
    if (error || !data?.provedores) return null;
    return data.provedores as ProvedorStatus[];
  } catch { return null; }
}

/**
 * Envia a foto REAL do produto (caminho do próprio usuário no R2, pelo envio que já existe) e tenta tirar o fundo liso
 * com o mesmo recorte do Cartaz Digital. Sem fundo liso, a foto entra numa moldura (nunca é redesenhada pela IA).
 */
export async function enviarFotoProduto(userId: string, arquivo: File): Promise<FotoProduto> {
  if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) throw new Error('Envie uma foto JPG, PNG ou WEBP.');
  if (arquivo.size > 12 * 1024 * 1024) throw new Error('A foto pode ter até 12 MB.');
  const base = `${userId}/studio/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
  const original = await uploadToR2(arquivo, `${base}.${ext}`, arquivo.type, userId, { preventOverwrite: true });
  let recorte_url: string | null = null;
  const local = URL.createObjectURL(arquivo);
  try {
    const png = await recortarImagem(local, 1400);
    if (png) recorte_url = (await uploadToR2(png, `${base}-recorte.png`, 'image/png', userId, { preventOverwrite: true })).publicUrl;
  } catch { /* sem recorte: usa a foto inteira em moldura */ } finally { URL.revokeObjectURL(local); }
  return { url: original.publicUrl, path: original.filePath, recorte_url };
}

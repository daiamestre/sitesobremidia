// SOBRE MÍDIA STUDIO AI — acesso do navegador: lê as tabelas (RLS) e muda tudo por funções do banco ou pela Edge Function
// studio-ai (a chave da OpenAI nunca passa por aqui). Salvar e publicar reaproveitam os caminhos oficiais:
// cliente_assets + análise de conteúdo + playlists do portal (anunciante) e media + playlist_items (equipe).
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/lib/r2Upload';
import { playlistClienteService } from '@/modules/crm/services/playlistCliente.service';
import type { ModeloDeArte } from '@/lib/studio/modelos';

type Resposta<T> = Promise<{ data: T | null; error: { message: string } | null }>;
interface Consulta<T> extends PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  eq(c: string, v: unknown): Consulta<T>; in(c: string, v: unknown[]): Consulta<T>; order(c: string, o: { ascending: boolean }): Consulta<T>;
  limit(n: number): Consulta<T>; maybeSingle(): Resposta<T>;
}
// o cliente gerado (types.ts) ainda não conhece as tabelas novas: o acesso fica tipado aqui
const db = supabase as unknown as {
  from<T>(t: string): { select(c: string): Consulta<T>; insert(v: unknown): { select(c: string): { single(): Resposta<T> } } };
  rpc<T>(f: string, args?: Record<string, unknown>): Resposta<T>;
};
async function rpc<T>(f: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc<T>(f, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** paga = todos menos owner/ADM (F-219): 1 crédito (R$ 4,99) por criação com IA. */
export interface MeuSaldo { cliente: string | null; admin: boolean; pode: boolean; paga: boolean; saldo: number; reservado: number; preco_centavos: number; habilitado: boolean }
export interface Projeto { id: string; modelo_id: string; nome: string; formato: '16:9' | '9:16'; dados: Partial<ModeloDeArte>; miniatura_url: string | null; atualizado_em: string }
export interface Conversa { id: string; titulo: string; cliente_id: string | null; atualizado_em: string }
export type StatusJob = 'AGUARDANDO' | 'RESERVANDO' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHA' | 'CANCELADO' | 'ESTORNO_PENDENTE' | 'ESTORNADO';
export interface Job { id: string; conversa_id: string; tipo: 'gerar' | 'editar'; status: StatusJob; prompt_original: string; prompt_enviado: string; parametros: { proporcao: string; qualidade: string; transparente: boolean }; modelo: string; referencias: string[]; origem_imagem_id: string | null; cobrar: boolean; creditos: number; erro: string | null; criado_em: string; concluido_em: string | null }
export interface ImagemIA { id: string; job_id: string; conversa_id: string; versao_de: string | null; url: string; largura: number; altura: number; bytes: number; alfa: 'verificado' | 'ausente' | 'nao_verificado'; modelo: string; criado_em: string }
export interface Movimento { id: string; tipo: string; quantidade: number; saldo_apos: number; reservado_apos: number; motivo: string | null; job_id: string | null; criado_em: string }

export const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const EM_ANDAMENTO: StatusJob[] = ['AGUARDANDO', 'RESERVANDO', 'PROCESSANDO', 'ESTORNO_PENDENTE'];

export const meuSaldo = () => rpc<MeuSaldo>('studio_ai_meu_saldo');

// ---------------------------------------------------------------- modelos novos do catálogo (owner/ADM criam; todos usam)
export async function modelosDaEmpresa(): Promise<Array<ModeloDeArte & { daEmpresa: true; ativo: boolean }>> {
  const { data } = await db.from<{ id: string; dados: ModeloDeArte; ativo: boolean }>('studio_modelos').select('id, dados, ativo').order('atualizado_em', { ascending: false }).limit(500);
  return (data ?? []).map((m) => ({ ...m.dados, id: m.id, daEmpresa: true as const, ativo: m.ativo }));
}
export const salvarModelo = (id: string, dados: ModeloDeArte) => rpc<string>('studio_modelo_salvar', { p_id: id, p_dados: dados });
export const arquivarModelo = (id: string) => rpc('studio_modelo_arquivar', { p_id: id });

// ---------------------------------------------------------------- projetos do editor
export async function listarProjetos(): Promise<Projeto[]> {
  const { data, error } = await db.from<Projeto>('studio_projetos').select('*').order('atualizado_em', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function obterProjeto(id: string): Promise<Projeto | null> {
  const { data } = await db.from<Projeto>('studio_projetos').select('*').eq('id', id).maybeSingle();
  return data;
}
export const salvarProjeto = (p: { id: string | null; modeloId: string; nome: string; formato: string; dados: Partial<ModeloDeArte>; miniatura: string | null }) =>
  rpc<string>('studio_projeto_salvar', { p_id: p.id, p_modelo: p.modeloId, p_nome: p.nome, p_formato: p.formato, p_dados: p.dados, p_miniatura: p.miniatura });
export const apagarProjeto = (id: string) => rpc('studio_projeto_apagar', { p_id: id });

// ---------------------------------------------------------------- criação com IA
export async function listarConversas(): Promise<Conversa[]> {
  const { data, error } = await db.from<Conversa>('studio_ai_conversas').select('id, titulo, cliente_id, atualizado_em').order('atualizado_em', { ascending: false }).limit(60);
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function obterConversa(id: string): Promise<{ jobs: Job[]; imagens: ImagemIA[] }> {
  const [j, i] = await Promise.all([
    db.from<Job>('studio_ai_jobs').select('*').eq('conversa_id', id).order('criado_em', { ascending: true }),
    db.from<ImagemIA>('studio_ai_imagens').select('*').eq('conversa_id', id).order('criado_em', { ascending: true }),
  ]);
  if (j.error) throw new Error(j.error.message);
  return { jobs: j.data ?? [], imagens: i.data ?? [] };
}
export async function ultimasImagens(): Promise<ImagemIA[]> {
  const { data } = await db.from<ImagemIA>('studio_ai_imagens').select('*').order('criado_em', { ascending: false }).limit(60);
  return data ?? [];
}

async function chamarFuncao<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('studio-ai', { body: corpo });
  if (error) {
    // a função devolve { error } com status 4xx: o texto vem no corpo da resposta
    let msg = error.message;
    try { const ctx = (error as unknown as { context?: Response }).context; if (ctx) { const j = await ctx.json(); msg = j?.error ?? msg; if (j?.sem_creditos) throw new SemCreditos(msg); } } catch (e) { if (e instanceof SemCreditos) throw e; }
    throw new Error(msg);
  }
  return data as T;
}
export class SemCreditos extends Error {}

export interface PedidoIA { conversaId: string | null; prompt: string; promptOriginal: string; proporcao: 'quadrado' | 'horizontal' | 'vertical'; qualidade: 'low' | 'medium' | 'high'; transparente: boolean; referencias: string[]; origemImagemId: string | null }
export const gerarImagem = (p: PedidoIA) => chamarFuncao<{ job_id: string; conversa_id: string }>({
  acao: 'gerar', conversa_id: p.conversaId, prompt: p.prompt, prompt_original: p.promptOriginal, proporcao: p.proporcao, qualidade: p.qualidade,
  transparente: p.transparente, referencias: p.referencias, origem_imagem_id: p.origemImagemId, chave: crypto.randomUUID(),
});
export const sugerirPrompt = (texto: string) => chamarFuncao<{ prompt: string | null; dicas: string[]; aviso: string | null }>({ acao: 'melhorar_prompt', texto });

// ---------------------------------------------------------------- créditos (PIX pelo mesmo caminho das playlists)
export const comprarCreditos = (quantidade: number) => rpc<{ compra_id: string; cobranca_id: string; codigo: string; valor_centavos: number }>('studio_ai_comprar_creditos', { p_quantidade: quantidade });
export const confirmarCompra = (compraId: string) => rpc<{ creditado: boolean; quantidade?: number; status?: string }>('studio_ai_confirmar_compra', { p_compra: compraId });
export const creditarManual = (clienteId: string, quantidade: number, motivo: string) => rpc('studio_ai_creditar_manual', { p_cliente: clienteId, p_quantidade: quantidade, p_motivo: motivo });
export const salvarConfig = (cfg: Record<string, unknown>) => rpc('studio_ai_salvar_config', { p_cfg: cfg });
export async function extrato(): Promise<Movimento[]> {
  const { data } = await db.from<Movimento>('studio_ai_movimentos').select('*').order('criado_em', { ascending: false }).limit(200);
  return data ?? [];
}
export async function comprasPendentes(): Promise<Array<{ id: string; quantidade: number; valor_centavos: number; conta_receber_id: string; status: string; criado_em: string }>> {
  const { data } = await db.from<{ id: string; quantidade: number; valor_centavos: number; conta_receber_id: string; status: string; criado_em: string }>('studio_ai_compras')
    .select('*').eq('status', 'PENDENTE').order('criado_em', { ascending: false }).limit(10);
  return data ?? [];
}
export async function carteirasDaEmpresa(): Promise<Array<{ id: string; cliente_id: string; saldo: number; reservado: number; nome: string }>> {
  const { data } = await db.from<{ id: string; cliente_id: string; saldo: number; reservado: number }>('studio_ai_carteiras').select('id, cliente_id, saldo, reservado').order('saldo', { ascending: false }).limit(300);
  const ids = (data ?? []).map((c) => c.cliente_id);
  // o nome do anunciante fica em empresas (cliente_id → nome fantasia / razão social)
  const { data: nomes } = ids.length ? await supabase.from('empresas').select('cliente_id, razao_social, nome_fantasia').in('cliente_id', ids) : { data: [] };
  const mapa = new Map((nomes ?? []).map((n: { cliente_id: string; razao_social?: string | null; nome_fantasia?: string | null }) => [n.cliente_id, n.nome_fantasia || n.razao_social || n.cliente_id]));
  return (data ?? []).map((c) => ({ ...c, nome: String(mapa.get(c.cliente_id) ?? c.cliente_id) }));
}

/** Anunciantes da empresa (nome em empresas), para o dono/ADM escolher a quem dar cortesia. */
export async function clientesDaEmpresa(): Promise<Array<{ id: string; nome: string }>> {
  const { data } = await supabase.from('empresas').select('cliente_id, nome_fantasia, razao_social').not('cliente_id', 'is', null).is('deleted_at', null).limit(1000);
  return ((data ?? []) as Array<{ cliente_id: string; nome_fantasia: string | null; razao_social: string | null }>)
    .map((e) => ({ id: e.cliente_id, nome: e.nome_fantasia || e.razao_social || e.cliente_id }))
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
}

// ---------------------------------------------------------------- salvar nas mídias e publicar (caminhos oficiais)
export interface Salvo { tipo: 'cliente_assets' | 'media'; id: string; url: string }

/** Envia o PNG ao R2 (pasta do usuário) e registra como mídia: anunciante → Minhas Mídias (com análise); equipe → Mídias. */
export async function salvarNasMidias(o: { userId: string; clienteId: string | null; png: Blob; nome: string; largura: number; altura: number; formato: string }): Promise<Salvo> {
  const caminho = `${o.userId}/studio/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`;
  const { publicUrl, filePath } = await uploadToR2(o.png, caminho, 'image/png', o.userId, { preventOverwrite: true });
  if (o.clienteId) {
    const tenant = (await supabase.rpc('get_user_tenant_id')).data as string;
    const { data, error } = await supabase.from('cliente_assets').insert({
      cliente_id: o.clienteId, empresa_operadora_id: tenant, nome: o.nome.slice(0, 120), tipo: 'imagem', mime_type: 'image/png', object_url: publicUrl,
      tamanho: o.png.size, largura: o.largura, altura: o.altura, tags: ['studio-ai'], usuario_id: o.userId,
    } as never).select('id').single();
    if (error || !data) throw new Error(error?.message || 'Não foi possível salvar em Minhas Mídias.');
    const id = (data as { id: string }).id;
    void supabase.functions.invoke('analisar-midia', { body: { asset_id: id } });
    return { tipo: 'cliente_assets', id, url: publicUrl };
  }
  const { data, error } = await supabase.from('media').insert({
    user_id: o.userId, name: o.nome.slice(0, 120), file_path: filePath, file_url: publicUrl, file_type: 'image', file_size: o.png.size,
    mime_type: 'image/png', aspect_ratio: o.formato, thumbnail_url: publicUrl,
  } as never).select('id').single();
  if (error || !data) throw new Error(error?.message || 'Não foi possível salvar nas mídias.');
  return { tipo: 'media', id: (data as { id: string }).id, url: publicUrl };
}

export interface Destino { id: string; nome: string; detalhe?: string }

/** Playlists e telas em que o usuário pode publicar. */
export async function destinos(clienteId: string | null): Promise<{ playlists: Destino[]; telas: Destino[] }> {
  if (clienteId) {
    const [pls, pontos] = await Promise.all([playlistClienteService.listarPlaylists(), playlistClienteService.listarPontosContratados()]);
    return {
      playlists: pls.map((p) => ({ id: p.id, nome: p.nome, detalhe: `${p.itens?.length ?? 0} mídia(s)` })),
      telas: pontos.map((t) => ({ id: t.ponto_id, nome: t.nome, detalhe: [t.cidade, t.estado].filter(Boolean).join(' / ') || `${t.quantidade_telas} tela(s)` })),
    };
  }
  const [{ data: pls }, { data: telas }] = await Promise.all([
    supabase.from('playlists').select('id, name').order('name').limit(200),
    supabase.from('screens').select('id, name, playlist_id').not('playlist_id', 'is', null).order('name').limit(300),
  ]);
  return {
    playlists: (pls ?? []).map((p: { id: string; name: string }) => ({ id: p.id, nome: p.name })),
    telas: (telas ?? []).map((t: { id: string; name: string; playlist_id: string }) => ({ id: t.id, nome: t.name, detalhe: t.playlist_id })),
  };
}

export interface ResultadoPublicacao { ok: boolean; mensagem: string; cobrancaId?: string; valor?: number; playlistId?: string }

/** Anunciante: regra oficial de mídias da playlist (grátis/cortesia/paga por PIX). Equipe: item no fim da playlist. */
export async function publicar(salvo: Salvo, destino: { tipo: 'playlist' | 'tela'; id: string; nome: string }): Promise<ResultadoPublicacao> {
  if (salvo.tipo === 'cliente_assets') {
    let playlistId = destino.id;
    if (destino.tipo === 'tela') {
      const pls = await playlistClienteService.listarPlaylists();
      const ligada = pls.find((p) => (p.pontos ?? []).some((pt) => pt.ponto_id === destino.id));
      if (ligada) playlistId = ligada.id;
      else {
        playlistId = await playlistClienteService.criarPlaylist(`Studio – ${destino.nome}`.slice(0, 60), 'Criada pelo Studio AI');
        await playlistClienteService.vincularPontos(playlistId, [destino.id]);
      }
    }
    const r = await playlistClienteService.adicionarMidia(playlistId, salvo.id, 10);
    return r.cobrado
      ? { ok: false, mensagem: r.mensagem ?? 'Esta mídia tem custo na playlist.', cobrancaId: r.cobrancaId, valor: r.valor, playlistId }
      : { ok: true, mensagem: r.mensagem ?? 'Mídia adicionada à playlist.', playlistId };
  }
  let playlistId = destino.id;
  if (destino.tipo === 'tela') {
    const { data: tela } = await supabase.from('screens').select('playlist_id').eq('id', destino.id).maybeSingle();
    if (!(tela as { playlist_id?: string } | null)?.playlist_id) throw new Error('Esta tela não tem playlist.');
    playlistId = (tela as { playlist_id: string }).playlist_id;
  }
  const { data: ultimo } = await supabase.from('playlist_items').select('position').eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from('playlist_items').insert({ playlist_id: playlistId, media_id: salvo.id, position: ((ultimo as { position?: number } | null)?.position ?? -1) + 1, duration: 10 } as never);
  if (error) throw new Error(error.message);
  return { ok: true, mensagem: 'Imagem adicionada à playlist.', playlistId };
}

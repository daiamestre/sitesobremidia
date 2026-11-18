// SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO: os áudios SALVOS e os RASCUNHOS ficam no sistema da SOBRE MÍDIA (F-328), na conta de
// quem editou — abrem em qualquer aparelho. As faixas/clipes vão para a tabela `studio_audio_edicoes` (cada conta vê só as
// suas) e cada som vai UMA vez, em WAV 16 bits, para o armazenamento da SOBRE MÍDIA (R2), na pasta da própria conta.
import { supabase } from '@/integrations/supabase/client';
import type { Projeto } from './projeto';
import { sonsUsados, fimDoProjeto } from './projeto';
import { codificarWav, lerWav } from './arquivos';
import type { Som } from './som';

export type TipoDeEdicao = 'salvo' | 'rascunho';
export interface EdicaoNoSistema { id: string; tipo: TipoDeEdicao; nome: string; versao: number; duracao: number; faixas: number; atualizado_em: string }
export interface SomNoSistema { nome: string; url: string }

// a tabela é nova (F-328) e ainda não está nos tipos gerados do Supabase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = () => (supabase as any).from('studio_audio_edicoes');

/** envia um som (WAV 16 bits) para a pasta da conta e devolve o endereço */
export async function enviarSom(id: string, som: Som): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Entre na sua conta para guardar no sistema.');
  const bytes = codificarWav(som, 16);
  const fileName = `${session.user.id}/studio-audio/${id}.wav`;
  const inv = await supabase.functions.invoke('get-upload-url', { body: { bucket: 'clientes_assets', fileName, contentType: 'audio/wav' } });
  if (inv.error || !inv.data?.signedUrl || !inv.data?.publicUrl) throw new Error('O sistema não autorizou o envio do som.');
  const put = await fetch(inv.data.signedUrl, { method: 'PUT', body: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), headers: { 'Content-Type': 'audio/wav' } });
  if (!put.ok) throw new Error('Falha ao enviar o som.');
  return inv.data.publicUrl as string;
}

/**
 * Guarda a edição (nova ou por cima de uma existente). `urls` = os sons que já estão no sistema (não são enviados de novo);
 * os que faltam são enviados e entram em `urls`.
 */
export async function guardarEdicao(o: {
  id?: string | null; tipo: TipoDeEdicao; nome: string; versao: number; projeto: Projeto;
  sons: Map<string, { nome: string; som: Som }>; urls: Map<string, string>; aoEnviar?: (feitos: number, total: number) => void;
}): Promise<string> {
  const usados = [...sonsUsados(o.projeto)].filter((id) => o.sons.has(id));
  const faltam = usados.filter((id) => !o.urls.has(id));
  let feitos = 0;
  for (const id of faltam) { o.urls.set(id, await enviarSom(id, o.sons.get(id)!.som)); o.aoEnviar?.(++feitos, faltam.length); }
  const sons: Record<string, SomNoSistema> = {};
  for (const id of usados) sons[id] = { nome: o.sons.get(id)!.nome, url: o.urls.get(id)! };
  const linha = { tipo: o.tipo, nome: (o.nome.trim() || 'Áudio sem nome').slice(0, 120), versao: o.versao, duracao: fimDoProjeto(o.projeto), faixas: o.projeto.faixas.length, projeto: o.projeto, sons, atualizado_em: new Date().toISOString() };
  if (o.id) {
    const { data, error } = await tabela().update(linha).eq('id', o.id).select('id').maybeSingle();
    if (!error && data?.id) return data.id as string;
  }
  const { data, error } = await tabela().insert(linha).select('id').single();
  if (error || !data) throw new Error('Não foi possível guardar no sistema.');
  return data.id as string;
}

export async function listarEdicoes(): Promise<EdicaoNoSistema[]> {
  const { data, error } = await tabela().select('id, tipo, nome, versao, duracao, faixas, atualizado_em').order('atualizado_em', { ascending: false }).limit(300);
  if (error) throw new Error('Não foi possível abrir a biblioteca.');
  return (data ?? []) as EdicaoNoSistema[];
}

/** abre uma edição: as faixas e todos os sons (baixados do sistema) */
export async function abrirEdicao(id: string, aoBaixar?: (feitos: number, total: number) => void): Promise<{ edicao: EdicaoNoSistema; projeto: Projeto; sons: Map<string, { nome: string; som: Som; url: string }> }> {
  const { data, error } = await tabela().select('*').eq('id', id).single();
  if (error || !data) throw new Error('Essa edição não está mais no sistema.');
  const lista = Object.entries((data.sons ?? {}) as Record<string, SomNoSistema>);
  const sons = new Map<string, { nome: string; som: Som; url: string }>();
  let feitos = 0;
  await Promise.all(lista.map(async ([sid, s]) => {
    const r = await fetch(s.url); if (!r.ok) throw new Error('Um dos sons da edição não foi encontrado.');
    sons.set(sid, { nome: s.nome, som: lerWav(new Uint8Array(await r.arrayBuffer())), url: s.url });
    aoBaixar?.(++feitos, lista.length);
  }));
  return { edicao: data as EdicaoNoSistema, projeto: data.projeto as Projeto, sons };
}

export async function renomearEdicao(id: string, nome: string) { await tabela().update({ nome: nome.slice(0, 120) }).eq('id', id); }
export async function apagarEdicao(id: string) { const { error } = await tabela().delete().eq('id', id); if (error) throw new Error('Não foi possível apagar.'); }
export async function duplicarEdicao(id: string) {
  const { data } = await tabela().select('*').eq('id', id).single();
  if (!data) return;
  await tabela().insert({ tipo: data.tipo, nome: `${data.nome} (cópia)`.slice(0, 120), versao: 1, duracao: data.duracao, faixas: data.faixas, projeto: data.projeto, sons: data.sons });
}

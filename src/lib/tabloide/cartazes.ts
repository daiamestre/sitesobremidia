/**
 * Cartaz Digital (F-179) — os cartazes salvos de cada usuário ("Meus cartazes"):
 * guardar, abrir, duplicar, excluir, gerar as imagens finais (uma por página) e publicar no portal de ofertas.
 */
import { uploadToR2 } from '@/lib/r2Upload';
import { tabelaTabloide } from './db';
import { fontesUsadas, normalizarConfig, propsDasPaginas, type CartazParaDesenhar, type ConfigCartaz } from './cartaz';
import { carregarFonte } from './fontes';
import { renderizarPaginaEmPng } from './exportar';
import type { ProdutoTabloide } from './parseProdutos';
import type { Selo } from './selos';

export interface CartazSalvo extends CartazParaDesenhar {
  id: string;
  nome: string;
  atualizadoEm: string;
  publicado: boolean;
  imagensPublicadas: string[];
}

export const NOME_PADRAO = 'Meu cartaz';

function daLinha(d: Record<string, any>): CartazSalvo {
  return {
    id: d.id, nome: d.nome || NOME_PADRAO, atualizadoEm: d.updated_at ?? '',
    formatoId: d.formato, temaId: d.tema, segmentoId: d.segmento, grade: d.grade,
    produtos: Array.isArray(d.produtos) ? (d.produtos as ProdutoTabloide[]) : [],
    config: normalizarConfig(d.config),
    publicado: !!d.publicado, imagensPublicadas: Array.isArray(d.imagens_publicadas) ? d.imagens_publicadas : [],
  };
}

/** Os cartazes de quem está usando (a central enxerga os da empresa toda no banco; aqui a lista é só a própria). */
export async function listarCartazes(usuarioId: string): Promise<CartazSalvo[]> {
  const { data, error } = await tabelaTabloide('tabloides').select('*').eq('user_id', usuarioId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(60);
  if (error || !data) return [];
  return (data as Array<Record<string, any>>).map(daLinha);
}

export async function abrirCartaz(id: string): Promise<CartazSalvo | null> {
  const { data, error } = await tabelaTabloide('tabloides').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return daLinha(data as Record<string, any>);
}

export interface DadosDoCartaz extends CartazParaDesenhar { nome: string; clienteId: string | null }

const paraLinha = (c: DadosDoCartaz) => ({
  nome: c.nome.trim().slice(0, 80) || NOME_PADRAO, formato: c.formatoId, tema: c.temaId, segmento: c.segmentoId, grade: c.grade,
  produtos: c.produtos, config: c.config, cliente_id: c.clienteId,
});

/** Guarda o cartaz (novo quando `id` é nulo) e devolve o identificador. */
export async function salvarCartaz(id: string | null, c: DadosDoCartaz): Promise<string> {
  if (id) {
    const { error } = await tabelaTabloide('tabloides').update(paraLinha(c) as never).eq('id', id);
    if (error) throw new Error(error.message || 'Não foi possível salvar o cartaz.');
    return id;
  }
  const { data, error } = await tabelaTabloide('tabloides').insert(paraLinha(c) as never).select('id').single();
  if (error || !data) throw new Error(error?.message || 'Não foi possível salvar o cartaz.');
  return (data as { id: string }).id;
}

/** Cópia independente (a cópia nunca nasce publicada). */
export async function duplicarCartaz(c: CartazSalvo, clienteId: string | null): Promise<string> {
  return salvarCartaz(null, { ...c, nome: `${c.nome} (cópia)`, clienteId });
}

export async function excluirCartaz(id: string): Promise<void> {
  const { error } = await tabelaTabloide('tabloides').update({ deleted_at: new Date().toISOString(), publicado: false } as never).eq('id', id);
  if (error) throw new Error('Não foi possível excluir o cartaz.');
}

/** As imagens finais do cartaz, uma por página, no tamanho real do modelo. */
export async function gerarPngsDoCartaz(c: CartazParaDesenhar, selos: Selo[] | null): Promise<Blob[]> {
  await Promise.all(fontesUsadas(c.config).map(carregarFonte));
  const paginas = propsDasPaginas(c, selos);
  const out: Blob[] = [];
  for (const p of paginas) out.push(await renderizarPaginaEmPng(p));
  return out;
}

/** Versão leve (JPEG) para a página pública: o cliente da loja abre no celular. Se o navegador não converter, vai o PNG. */
export async function paraJpeg(png: Blob, qualidade = 0.88): Promise<Blob> {
  const url = URL.createObjectURL(png);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('imagem')); setTimeout(() => erro(new Error('demorou')), 8000); i.src = url; });
    const tela = document.createElement('canvas');
    tela.width = img.naturalWidth;
    tela.height = img.naturalHeight;
    const ctx = tela.getContext('2d');
    if (!ctx) return png;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, tela.width, tela.height);
    ctx.drawImage(img, 0, 0);
    const jpg = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', qualidade));
    return jpg && jpg.size < png.size ? jpg : png;
  } catch {
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Publica o cartaz no portal de ofertas: envia as imagens prontas e marca como publicado. */
export async function publicarNoPortal(id: string, pngs: Blob[], usuarioId: string): Promise<string[]> {
  const agora = Date.now();
  const urls: string[] = [];
  for (let i = 0; i < pngs.length; i++) {
    const leve = await paraJpeg(pngs[i]);
    const jpg = leve.type === 'image/jpeg';
    const { publicUrl } = await uploadToR2(leve, `${usuarioId}/cartaz/portal/${id}-${agora}-${i + 1}.${jpg ? 'jpg' : 'png'}`, jpg ? 'image/jpeg' : 'image/png', usuarioId);
    urls.push(publicUrl);
  }
  const { error } = await tabelaTabloide('tabloides').update({ publicado: true, imagens_publicadas: urls, publicado_em: new Date().toISOString() } as never).eq('id', id);
  if (error) throw new Error(error.message || 'Não foi possível publicar o cartaz.');
  return urls;
}

export async function tirarDoPortal(id: string): Promise<void> {
  const { error } = await tabelaTabloide('tabloides').update({ publicado: false } as never).eq('id', id);
  if (error) throw new Error('Não foi possível tirar o cartaz do portal.');
}

export const cartazVazio = (c: Pick<CartazParaDesenhar, 'produtos'>): boolean => c.produtos.length === 0;
export type { ConfigCartaz };

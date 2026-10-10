/**
 * Cartaz Digital (F-179) — biblioteca única de imagens do cartaz: logos 3D do cabeçalho, logo da marca e temas (fotos de fundo).
 * Um caminho só: o que o usuário envia é aceito e fica salvo na hora (nada de "em revisão"); o que a central envia vale
 * para a empresa toda. Selos simples desenhados em código não existem mais.
 */
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/lib/r2Upload';
import { tabelaTabloide } from './db';

export type TipoDeImagem = 'LOGO_CABECALHO' | 'LOGO_MARCA' | 'TEMA';

export interface Selo {
  id: string;
  slug: string;
  nome: string;
  categoria: string;
  titulo: string;
  imagem_url: string;
  mime: string;
  largura: number;
  altura: number;
  transparente: boolean;
  versao: number;
  estado: 'APROVADO' | 'REVISAO' | 'REPROVADO';
  origem: string;
  licenca: string | null;
  cliente_id: string | null;
  /** quem enviou (null = imagem da empresa, cadastrada pela central) */
  dono_id: string | null;
  tipo: TipoDeImagem;
  /** Versão leve só para a galeria (o cartaz e a exportação usam sempre o arquivo original). */
  miniatura_url: string | null;
  ordem: number;
}

/** Cópia de uma logo dentro de um cartaz (camada livre). Apagar a camada nunca apaga a logo da biblioteca. */
export interface ElementoLivre {
  id: string;
  seloId: string;
  nome: string;
  url: string;
  /** altura ÷ largura da imagem */
  ar: number;
  /** centro, em fração da largura/altura do cartaz (0..1) */
  cx: number;
  cy: number;
  /** largura, em fração da largura do cartaz */
  w: number;
  /** giro em graus */
  rot: number;
}

export const ORIGEM_UPLOAD = 'Enviada pelo usuário';
export const ORIGEM_CENTRAL = 'Cadastrada pela central da empresa';
export const LICENCA_UPLOAD = 'Declarada por quem enviou (não verificada pela SOBRE MÍDIA).';
export const GRUPO_MEUS_TEMAS = 'Meus temas';
export const GRUPO_TEMAS_GRATIS = 'Temas Grátis';

export interface RelatorioAlfa {
  transparente: boolean;
  /** parte da imagem totalmente transparente (0..1) */
  vazio: number;
  /** parte da imagem opaca (0..1) */
  opaco: number;
  cantosLivres: boolean;
}

/**
 * Lê o canal alfa de verdade (não confunde o "quadriculado" desenhado na imagem com transparência):
 * os 4 cantos precisam ser 100% transparentes, tem que haver área vazia e área opaca, e a imagem não pode ser toda opaca.
 */
export function validarAlfa(dados: Pick<ImageData, 'data' | 'width' | 'height'>): RelatorioAlfa {
  const { data, width: w, height: h } = dados;
  const total = w * h;
  let vazio = 0;
  let opaco = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 8) vazio++;
    else if (data[i] >= 250) opaco++;
  }
  const bloco = Math.max(2, Math.min(12, Math.floor(Math.min(w, h) / 8)));
  const cantoLivre = (x0: number, y0: number) => {
    for (let y = y0; y < y0 + bloco; y++) for (let x = x0; x < x0 + bloco; x++) if (data[(y * w + x) * 4 + 3] >= 8) return false;
    return true;
  };
  const cantosLivres = cantoLivre(0, 0) && cantoLivre(w - bloco, 0) && cantoLivre(0, h - bloco) && cantoLivre(w - bloco, h - bloco);
  const r = { vazio: vazio / total, opaco: opaco / total, cantosLivres };
  return { ...r, transparente: cantosLivres && r.vazio >= 0.05 && r.opaco >= 0.1 };
}

/** Abre a imagem enviada: tamanho real e leitura do canal alfa. */
export async function validarArquivoDeSelo(arq: Blob): Promise<{ largura: number; altura: number; alfa: RelatorioAlfa }> {
  const url = URL.createObjectURL(arq);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error('Imagem inválida.'));
      i.src = url;
    });
    const escala = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(16, Math.round(img.naturalWidth * escala));
    const h = Math.max(16, Math.round(img.naturalHeight * escala));
    const tela = document.createElement('canvas');
    tela.width = w;
    tela.height = h;
    const ctx = tela.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Este navegador não consegue ler a imagem.');
    ctx.drawImage(img, 0, 0, w, h);
    return { largura: img.naturalWidth, altura: img.naturalHeight, alfa: validarAlfa(ctx.getImageData(0, 0, w, h)) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Miniatura leve feita no navegador, só para as galerias (PNG mantém a transparência). */
export async function gerarMiniaturaPng(arq: Blob, ladoMax = 480): Promise<Blob> {
  const url = URL.createObjectURL(arq);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Imagem inválida.')); i.src = url; });
    const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
    const tela = document.createElement('canvas');
    tela.width = Math.max(1, Math.round(img.naturalWidth * escala));
    tela.height = Math.max(1, Math.round(img.naturalHeight * escala));
    tela.getContext('2d')?.drawImage(img, 0, 0, tela.width, tela.height);
    const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/png'));
    if (!blob) throw new Error('Não foi possível gerar a miniatura.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function listarSelos(): Promise<Selo[]> {
  const { data, error } = await tabelaTabloide('tabloide_selos').select('*').order('ordem', { ascending: true }).order('categoria', { ascending: true }).order('nome', { ascending: true }).limit(800);
  if (error || !data) return [];
  return data as Selo[];
}

const TIPOS_ACEITOS = ['image/png', 'image/webp', 'image/jpeg'];
const PREFIXO: Record<TipoDeImagem, string> = { LOGO_CABECALHO: 'logo', LOGO_MARCA: 'marca', TEMA: 'tema' };

export function identificadorDaImagem(tipo: TipoDeImagem, nome: string, sufixo = Date.now().toString(36)): string {
  const base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'imagem';
  return `${PREFIXO[tipo]}-${base}-${sufixo}`.slice(0, 60);
}

/**
 * Envia uma imagem para a biblioteca e ela já fica salva e disponível (estado APROVADO): logo 3D, logo da marca ou tema.
 * `daEmpresa` (só a central): vale para todos os usuários da empresa; senão, é de quem enviou.
 */
export async function enviarParaBiblioteca(opcoes: {
  arquivo: File | Blob; nome: string; tipo: TipoDeImagem; categoria: string; usuarioId: string; clienteId: string | null; daEmpresa: boolean; ordem?: number;
}): Promise<Selo> {
  const mime = opcoes.arquivo.type;
  if (!TIPOS_ACEITOS.includes(mime)) throw new Error('Envie uma imagem PNG, JPG ou WebP.');
  if (opcoes.arquivo.size > 12 * 1024 * 1024) throw new Error('A imagem tem mais de 12 MB. Escolha uma menor.');
  const { largura, altura, alfa } = await validarArquivoDeSelo(opcoes.arquivo);
  if (Math.min(largura, altura) < 16 || Math.max(largura, altura) > 8000) throw new Error('A imagem precisa ter entre 16 e 8000 pixels de lado.');
  const slug = identificadorDaImagem(opcoes.tipo, opcoes.nome);
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const pasta = `${opcoes.usuarioId}/cartaz/${PREFIXO[opcoes.tipo]}`;
  const { publicUrl } = await uploadToR2(opcoes.arquivo, `${pasta}/${slug}.${ext}`, mime, opcoes.usuarioId);
  let miniaturaUrl: string | null = null;
  try {
    const mini = await gerarMiniaturaPng(opcoes.arquivo);
    miniaturaUrl = (await uploadToR2(mini, `${pasta}/${slug}-mini.png`, 'image/png', opcoes.usuarioId)).publicUrl;
  } catch { /* sem miniatura a galeria usa o original */ }
  const linha = {
    slug, nome: opcoes.nome.slice(0, 80), categoria: opcoes.categoria.slice(0, 80), titulo: opcoes.nome.slice(0, 80), imagem_url: publicUrl, miniatura_url: miniaturaUrl,
    mime, largura, altura, transparente: alfa.transparente, estado: 'APROVADO', tipo: opcoes.tipo, ordem: opcoes.ordem ?? Math.floor(Date.now() / 60000),
    origem: opcoes.daEmpresa ? ORIGEM_CENTRAL : ORIGEM_UPLOAD, licenca: LICENCA_UPLOAD,
    cliente_id: opcoes.daEmpresa ? null : opcoes.clienteId, dono_id: opcoes.daEmpresa ? null : opcoes.usuarioId,
  };
  const { data, error } = await tabelaTabloide('tabloide_selos').insert(linha as never).select('*').single();
  if (error) throw new Error(error.message || 'Não foi possível salvar a imagem.');
  return data as Selo;
}

const ativos = (selos: Selo[] | null, tipo: TipoDeImagem) =>
  (selos ?? []).filter((s) => s.tipo === tipo && s.estado === 'APROVADO')
    // primeiro as da empresa (na ordem da galeria), depois as do próprio usuário; o que acabou de chegar entra no fim da fila
    .sort((a, b) => Number(!!a.dono_id) - Number(!!b.dono_id) || a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));

/** Logos 3D disponíveis para o cabeçalho (as da empresa e as que o próprio usuário enviou). */
export const logosDoCabecalho = (selos: Selo[] | null): Selo[] => ativos(selos, 'LOGO_CABECALHO');
/** Logos da marca (loja) que o usuário já enviou. */
export const logosDaMarca = (selos: Selo[] | null): Selo[] => ativos(selos, 'LOGO_MARCA');
/** Temas (fotos de fundo) disponíveis. */
export const temasDeFoto = (selos: Selo[] | null): Selo[] => ativos(selos, 'TEMA');

/** Acha a imagem pelo identificador estável. Devolve null se não existe mais ou foi arquivada. */
export function resolverImagem(selos: Selo[] | null, id: string | null | undefined, tipo: TipoDeImagem): Selo | null {
  if (!id) return null;
  return ativos(selos, tipo).find((s) => s.id === id) ?? null;
}
export const resolverLogoCabecalho = (selos: Selo[] | null, id: string | null | undefined): Selo | null => resolverImagem(selos, id, 'LOGO_CABECALHO');

/** Tira a imagem das galerias (a central para as da empresa; cada um para as suas). Cartazes que a usavam seguem sem ela. */
export async function arquivarSelo(id: string): Promise<void> {
  const { error } = await tabelaTabloide('tabloide_selos').update({ estado: 'REPROVADO' } as never).eq('id', id);
  if (error) throw error;
}

/** Cria uma camada livre a partir de uma logo da biblioteca. */
export function novoElemento(selo: Pick<Selo, 'id' | 'nome' | 'imagem_url' | 'largura' | 'altura'>, posicao?: Partial<Pick<ElementoLivre, 'cx' | 'cy' | 'w' | 'rot'>>): ElementoLivre {
  return {
    id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    seloId: selo.id, nome: selo.nome, url: selo.imagem_url, ar: selo.altura / selo.largura,
    cx: posicao?.cx ?? 0.5, cy: posicao?.cy ?? 0.5, w: posicao?.w ?? 0.34, rot: posicao?.rot ?? 0,
  };
}

/** Mantém a camada dentro do cartaz e o tamanho em limites razoáveis. */
export function ajustarElemento(e: ElementoLivre): ElementoLivre {
  const w = Math.min(0.95, Math.max(0.06, e.w));
  return { ...e, w, cx: Math.min(1, Math.max(0, e.cx)), cy: Math.min(1, Math.max(0, e.cy)), rot: Math.min(180, Math.max(-180, e.rot)) };
}

export function duplicarElemento(e: ElementoLivre): ElementoLivre {
  return ajustarElemento({ ...e, id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, cx: e.cx + 0.04, cy: e.cy + 0.05 });
}

/** O usuário é da central? (só ela gere as imagens da empresa) */
export async function ehCentral(): Promise<boolean> {
  const { data } = await supabase.rpc('is_central_privileged' as never);
  return data === true;
}

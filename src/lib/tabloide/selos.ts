/**
 * Tabloide Digital (F-177) — biblioteca permanente de selos promocionais 3D (PNG com transparência verdadeira).
 * Os selos da empresa são desenhados pelo próprio SOBRE MÍDIA (selo3d.ts), então a origem e a licença são nossas;
 * selos enviados por usuários ficam com origem "UPLOAD" e licença "declarada pelo usuário", nunca "verificada".
 */
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/lib/r2Upload';
import { tabelaTabloide } from './db';
import { desenharSelo3D, type CoresSelo } from './selo3d';

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
  /** 'SELO' = para colocar livre no cartaz · 'LOGO_CABECALHO' = opção da galeria "Logo do Cabeçalho" */
  tipo: 'SELO' | 'LOGO_CABECALHO';
  /** Versão leve só para a galeria (o cartaz e a exportação usam sempre o arquivo original). */
  miniatura_url: string | null;
  ordem: number;
}

/** Cópia de um selo dentro de um tabloide (camada livre). Apagar a camada nunca apaga o selo da biblioteca. */
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

export const ORIGEM_PROPRIA = 'SOBRE MÍDIA — desenho próprio (canvas)';
export const LICENCA_PROPRIA = 'Arte própria da SOBRE MÍDIA, sem material de terceiros.';
export const ORIGEM_UPLOAD = 'UPLOAD DO USUÁRIO';
export const LICENCA_UPLOAD = 'Declarada pelo usuário (não verificada pela SOBRE MÍDIA).';

const VERMELHO: CoresSelo = { placa: '#d90f1f', texto: '#ffffff', faixa: '#ffc800', textoFaixa: '#7a0a13' };
const VERMELHO_ESCURO: CoresSelo = { placa: '#9f0d1a', texto: '#ffffff', faixa: '#ffc800', textoFaixa: '#5a0a12' };
const LARANJA: CoresSelo = { placa: '#ea580c', texto: '#ffffff', faixa: '#fde047', textoFaixa: '#7c2d12' };
const AZUL: CoresSelo = { placa: '#1d4ed8', texto: '#ffffff', faixa: '#ffc800', textoFaixa: '#0b1f6b' };
const VERDE: CoresSelo = { placa: '#15803d', texto: '#ffffff', faixa: '#ffc800', textoFaixa: '#14532d' };
const ROXO: CoresSelo = { placa: '#7e22ce', texto: '#ffffff', faixa: '#ffc800', textoFaixa: '#3b0764' };
const PRETO_OURO: CoresSelo = { placa: '#18181b', texto: '#ffd54a', faixa: '#facc15', textoFaixa: '#18181b' };

/** Catálogo inicial: 20 categorias (não é um limite — novas entram pela mesma função). */
export const CATALOGO_INICIAL: Array<{ slug: string; categoria: string; titulo: string; cores: CoresSelo }> = [
  { slug: 'ofertas-do-dia', categoria: 'Ofertas do Dia', titulo: 'Ofertas do Dia', cores: VERMELHO },
  { slug: 'ofertas-da-semana', categoria: 'Ofertas da Semana', titulo: 'Ofertas da Semana', cores: VERMELHO },
  { slug: 'ofertas-do-mes', categoria: 'Ofertas do Mês', titulo: 'Ofertas do Mês', cores: VERMELHO_ESCURO },
  { slug: 'super-oferta', categoria: 'Super Oferta', titulo: 'Super Oferta', cores: VERMELHO },
  { slug: 'mega-promocao', categoria: 'Mega Promoção', titulo: 'Mega Promoção', cores: LARANJA },
  { slug: 'preco-baixo', categoria: 'Preço Baixo', titulo: 'Preço Baixo é Aqui', cores: AZUL },
  { slug: 'oferta-exclusiva', categoria: 'Oferta Exclusiva', titulo: 'Oferta Exclusiva', cores: VERMELHO_ESCURO },
  { slug: 'ofertas-imperdiveis', categoria: 'Ofertas Imperdíveis', titulo: 'Ofertas Imperdíveis', cores: VERMELHO },
  { slug: 'liquidacao', categoria: 'Liquidação', titulo: 'Grande Liquidação', cores: AZUL },
  { slug: 'ultimas-unidades', categoria: 'Últimas Unidades', titulo: 'Últimas Unidades', cores: LARANJA },
  { slug: 'leve-mais-pague-menos', categoria: 'Leve Mais, Pague Menos', titulo: 'Leve Mais Pague Menos', cores: VERDE },
  { slug: 'black-friday', categoria: 'Black Friday', titulo: 'Black Friday', cores: PRETO_OURO },
  { slug: 'oferta-relampago', categoria: 'Oferta Relâmpago', titulo: 'Oferta Relâmpago', cores: LARANJA },
  { slug: 'menor-preco', categoria: 'Menor Preço', titulo: 'Menor Preço', cores: AZUL },
  { slug: 'preco-especial', categoria: 'Preço Especial', titulo: 'Preço Especial', cores: VERMELHO },
  { slug: 'queima-de-estoque', categoria: 'Queima de Estoque', titulo: 'Queima de Estoque', cores: VERMELHO_ESCURO },
  { slug: 'lancamento', categoria: 'Lançamento', titulo: 'Lançamento', cores: ROXO },
  { slug: 'so-hoje', categoria: 'Só Hoje', titulo: 'Só Hoje', cores: VERMELHO },
  { slug: 'desconto-especial', categoria: 'Desconto Especial', titulo: 'Desconto Especial', cores: VERDE },
  { slug: 'novidade', categoria: 'Novidade', titulo: 'Novidade', cores: ROXO },
];

export const CATEGORIAS = CATALOGO_INICIAL.map((c) => c.categoria);

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

/** Desenha um selo 3D num canvas de verdade e devolve o PNG com o resultado da validação do canal alfa. */
export async function renderizarSeloPng(titulo: string, cores: CoresSelo, largura = 1080, altura = 400): Promise<{ blob: Blob; largura: number; altura: number; alfa: RelatorioAlfa }> {
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Este navegador não consegue desenhar o selo.');
  desenharSelo3D(ctx, largura, altura, titulo, cores);
  const alfa = validarAlfa(ctx.getImageData(0, 0, largura, altura));
  const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não foi possível gerar o PNG do selo.');
  return { blob, largura, altura, alfa };
}

/** Lê um PNG/WebP enviado e valida o canal alfa dele. */
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

export async function listarSelos(): Promise<Selo[]> {
  const { data, error } = await tabelaTabloide('tabloide_selos').select('*').order('ordem', { ascending: true }).order('categoria', { ascending: true }).order('nome', { ascending: true }).limit(500);
  if (error || !data) return [];
  return data as Selo[];
}

/** Guarda (ou atualiza, subindo a versão) um selo da biblioteca. Origem/licença desconhecidas ou transparência não validada => REVISAO. */
export async function registrarSelo(opcoes: {
  slug: string; nome: string; categoria: string; titulo: string; blob: Blob; largura: number; altura: number; alfa: RelatorioAlfa;
  origem: string; licenca: string | null; clienteId: string | null; usuarioId: string; origemConhecida: boolean;
  tipo?: 'SELO' | 'LOGO_CABECALHO'; miniatura?: Blob; ordem?: number;
}): Promise<Selo> {
  const { publicUrl } = await uploadToR2(opcoes.blob, `${opcoes.usuarioId}/tabloide-selos/${opcoes.slug}-${Date.now()}.${opcoes.blob.type === 'image/webp' ? 'webp' : 'png'}`, opcoes.blob.type || 'image/png', opcoes.usuarioId);
  const miniaturaUrl = opcoes.miniatura
    ? (await uploadToR2(opcoes.miniatura, `${opcoes.usuarioId}/tabloide-selos/${opcoes.slug}-${Date.now()}-mini.png`, 'image/png', opcoes.usuarioId)).publicUrl
    : null;
  const estado = opcoes.alfa.transparente && opcoes.origemConhecida ? 'APROVADO' : 'REVISAO';
  const linha = {
    slug: opcoes.slug, nome: opcoes.nome, categoria: opcoes.categoria, titulo: opcoes.titulo, imagem_url: publicUrl,
    mime: opcoes.blob.type === 'image/webp' ? 'image/webp' : 'image/png', largura: opcoes.largura, altura: opcoes.altura,
    transparente: opcoes.alfa.transparente, estado, origem: opcoes.origem, licenca: opcoes.licenca, cliente_id: opcoes.clienteId,
    tipo: opcoes.tipo ?? 'SELO', miniatura_url: miniaturaUrl, ordem: opcoes.ordem ?? 0,
  };
  const filtro = tabelaTabloide('tabloide_selos').select('id, versao').eq('slug', opcoes.slug);
  const { data: existente } = await (opcoes.clienteId ? filtro.eq('cliente_id', opcoes.clienteId) : filtro.is('cliente_id', null)).maybeSingle();
  if (existente) {
    const { data, error } = await tabelaTabloide('tabloide_selos').update({ ...linha, versao: (existente as { versao: number }).versao + 1 } as never).eq('id', (existente as { id: string }).id).select('*').single();
    if (error) throw error;
    return data as Selo;
  }
  const { data, error } = await tabelaTabloide('tabloide_selos').insert(linha as never).select('*').single();
  if (error) throw error;
  return data as Selo;
}

/** Só para a central: desenha, valida e guarda os 20 selos do catálogo inicial. Devolve quantos ficaram APROVADOS. */
export async function semearBibliotecaInicial(usuarioId: string, aoProgredir?: (feito: number, total: number, titulo: string) => void): Promise<{ aprovados: number; revisao: string[] }> {
  let aprovados = 0;
  const revisao: string[] = [];
  for (let i = 0; i < CATALOGO_INICIAL.length; i++) {
    const c = CATALOGO_INICIAL[i];
    aoProgredir?.(i, CATALOGO_INICIAL.length, c.titulo);
    const r = await renderizarSeloPng(c.titulo, c.cores);
    const selo = await registrarSelo({
      slug: c.slug, nome: c.titulo, categoria: c.categoria, titulo: c.titulo, blob: r.blob, largura: r.largura, altura: r.altura, alfa: r.alfa,
      origem: ORIGEM_PROPRIA, licenca: LICENCA_PROPRIA, clienteId: null, usuarioId, origemConhecida: true,
    });
    if (selo.estado === 'APROVADO') aprovados++; else revisao.push(c.titulo);
  }
  aoProgredir?.(CATALOGO_INICIAL.length, CATALOGO_INICIAL.length, '');
  return { aprovados, revisao };
}

/** Cria uma camada livre a partir de um selo da biblioteca. */
export function novoElemento(selo: Pick<Selo, 'id' | 'nome' | 'imagem_url' | 'largura' | 'altura'>, posicao?: Partial<Pick<ElementoLivre, 'cx' | 'cy' | 'w' | 'rot'>>): ElementoLivre {
  return {
    id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    seloId: selo.id, nome: selo.nome, url: selo.imagem_url, ar: selo.altura / selo.largura,
    cx: posicao?.cx ?? 0.5, cy: posicao?.cy ?? 0.5, w: posicao?.w ?? 0.34, rot: posicao?.rot ?? 0,
  };
}

/** Mantém o selo dentro do cartaz e o tamanho em limites razoáveis. */
export function ajustarElemento(e: ElementoLivre): ElementoLivre {
  const w = Math.min(0.95, Math.max(0.06, e.w));
  return { ...e, w, cx: Math.min(1, Math.max(0, e.cx)), cy: Math.min(1, Math.max(0, e.cy)), rot: Math.min(180, Math.max(-180, e.rot)) };
}

export function duplicarElemento(e: ElementoLivre): ElementoLivre {
  return ajustarElemento({ ...e, id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, cx: e.cx + 0.04, cy: e.cy + 0.05 });
}

/** O usuário é da central? (só ela gera/gere a biblioteca da empresa) */
export async function ehCentral(): Promise<boolean> {
  const { data } = await supabase.rpc('is_central_privileged' as never);
  return data === true;
}

/** Logos do cabeçalho disponíveis para escolha: só as cadastradas e aprovadas, na ordem da galeria. */
export function logosDoCabecalho(selos: Selo[] | null): Selo[] {
  return (selos ?? []).filter((s) => s.tipo === 'LOGO_CABECALHO' && s.estado === 'APROVADO' && s.transparente && !s.cliente_id).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Acha a logo pelo identificador estável. Devolve null se não existe mais, foi arquivada ou não está aprovada (o cabeçalho volta ao automático). */
export function resolverLogoCabecalho(selos: Selo[] | null, id: string | null | undefined): Selo | null {
  if (!id) return null;
  return logosDoCabecalho(selos).find((s) => s.id === id) ?? null;
}

/** Miniatura leve (PNG com transparência) feita no navegador, só para a galeria. */
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

/** Só para a central: arquiva (REPROVADO) uma logo — ela some da galeria; tabloides que a usavam voltam ao cabeçalho automático. */
export async function arquivarSelo(id: string): Promise<void> {
  const { error } = await tabelaTabloide('tabloide_selos').update({ estado: 'REPROVADO' } as never).eq('id', id);
  if (error) throw error;
}

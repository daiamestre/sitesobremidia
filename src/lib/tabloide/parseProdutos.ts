/**
 * Cartaz Digital (F-172) — lê o que o cliente digitou: um produto por linha.
 * Exemplos aceitos:
 *   Picanha kg R$ 49,90
 *   Arroz 5kg 25,90
 *   Coca-Cola 2L - 9,99
 *   Leite integral de 6,50 por 4,99
 *   Pão francês 12,90/kg
 */

export type FonteImagem = 'OPENFOODFACTS' | 'PEXELS' | 'PIXABAY' | 'WIKIMEDIA' | 'OPENVERSE' | 'UPLOAD' | 'IA';

export interface ImagemProduto {
  url: string;
  fonte: FonteImagem;
  credito?: string;
  /** Foto já sem fundo (PNG transparente): o cartaz desenha o produto solto. */
  recortada?: boolean;
}

export interface ProdutoTabloide {
  id: string;
  nome: string;
  preco: number | null;
  /** Preço antigo ("de"), quando o produto está em oferta. */
  precoDe: number | null;
  unidade: string | null;
  obs: string | null;
  imagem: ImagemProduto | null;
}

const UNIDADES: Record<string, string> = {
  kg: 'KG', kilo: 'KG', quilo: 'KG',
  un: 'UN', und: 'UN', unid: 'UN', unidade: 'UN',
  l: 'LITRO', lt: 'LITRO', litro: 'LITRO',
  pct: 'PACOTE', pacote: 'PACOTE',
  cx: 'CAIXA', caixa: 'CAIXA',
  dz: 'DÚZIA', duzia: 'DÚZIA', dúzia: 'DÚZIA',
  g: '100 G', '100g': '100 G', gr: '100 G',
  fatia: 'FATIA', porcao: 'PORÇÃO', porção: 'PORÇÃO',
  bandeja: 'BANDEJA', bdj: 'BANDEJA', par: 'PAR',
};

export const UNIDADES_DISPONIVEIS = ['KG', 'UN', 'LITRO', 'PACOTE', 'CAIXA', 'DÚZIA', '100 G', 'FATIA', 'PORÇÃO', 'BANDEJA', 'PAR'];

/** Chave de comparação do nome: sem acento, minúsculo, só letras e números. */
export function chaveDoProduto(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** "1.299,90" → 1299.9 · "9,99" → 9.99 · "9.99" → 9.99 · "12" → 12 */
export function lerValor(texto: string): number | null {
  let s = texto.replace(/r\$/gi, '').replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function formatarPreco(valor: number): { inteiro: string; centavos: string } {
  const [i, c] = valor.toFixed(2).split('.');
  return { inteiro: i.replace(/\B(?=(\d{3})+(?!\d))/g, '.'), centavos: c };
}

export function precoParaTexto(valor: number | null): string {
  return valor == null ? '' : valor.toFixed(2).replace('.', ',');
}

const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const RE_DE_POR = new RegExp(String.raw`\bde\s+(?:r\$\s*)?(${NUM})\s+por\s+(?:r\$\s*)?(${NUM})`, 'i');
const RE_RS = new RegExp(String.raw`r\$\s*(${NUM})`, 'gi');
// número "solto": não faz parte de "5kg", "2L", "500ml" nem de palavra
const RE_SOLTO = new RegExp(String.raw`(?<![\w,.])(${NUM})(?![\w,.])(?!\s*(?:kg|g|gr|ml|l|lt|un|und|mg)\b)`, 'gi');

function criarId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function limparBordas(s: string): string {
  return s.replace(/^[\s\-–—:=.,;|/]+|[\s\-–—:=.,;|/]+$/g, '').replace(/\s{2,}/g, ' ').trim();
}

export function lerLinha(linha: string): ProdutoTabloide | null {
  let resto = linha.trim();
  if (!resto) return null;
  let preco: number | null = null;
  let precoDe: number | null = null;
  let posFim = -1; // posição logo após o preço (para achar "/kg" colado)

  const dp = RE_DE_POR.exec(resto);
  if (dp) {
    precoDe = lerValor(dp[1]);
    preco = lerValor(dp[2]);
    posFim = dp.index + dp[0].length;
    resto = resto.slice(0, dp.index) + ' ' + resto.slice(posFim);
    posFim = dp.index + 1;
  } else {
    const comRs = [...resto.matchAll(RE_RS)];
    const solto = [...resto.matchAll(RE_SOLTO)];
    const escolhido = comRs.length ? comRs[comRs.length - 1] : solto.length ? solto[solto.length - 1] : null;
    if (escolhido && escolhido.index !== undefined) {
      preco = lerValor(escolhido[1]);
      posFim = escolhido.index + escolhido[0].length;
      resto = resto.slice(0, escolhido.index) + ' ' + resto.slice(posFim);
      posFim = escolhido.index + 1;
    }
  }

  // unidade colada ao preço: "12,90/kg", "R$ 12,90 kg" (já tirado o preço, ela ficou no ponto onde estava)
  let unidade: string | null = null;
  if (posFim >= 0) {
    const depois = /^\s*\/?\s*(kg|kilo|quilo|un|und|unid|unidade|l|lt|litro|pct|pacote|cx|caixa|dz|duzia|dúzia|fatia|porcao|porção|bandeja|bdj|par)\b/i.exec(resto.slice(posFim));
    if (depois) {
      unidade = UNIDADES[depois[1].toLowerCase()] ?? null;
      resto = resto.slice(0, posFim) + resto.slice(posFim + depois[0].length);
    }
  }
  // unidade no fim do nome: "Picanha kg"
  if (!unidade) {
    const texto = limparBordas(resto);
    const fim = /(?:^|\s)(kg|kilo|quilo|un|und|unid|unidade|pct|pacote|cx|caixa|dz|duzia|dúzia|fatia|porcao|porção|bandeja|bdj|par)\s*$/i.exec(texto);
    // "Arroz 5 kg" é medida do produto (fica no nome); "Picanha kg" é a unidade de venda
    if (fim && !/\d\s*$/.test(texto.slice(0, fim.index))) {
      unidade = UNIDADES[fim[1].toLowerCase()] ?? null;
      resto = texto.slice(0, fim.index);
    }
  }

  const nome = limparBordas(resto);
  if (nome.length < 2) return null;
  return { id: criarId(), nome, preco, precoDe, unidade, obs: null, imagem: null };
}

export function lerLista(texto: string): ProdutoTabloide[] {
  return texto.split(/\r?\n/).map(lerLinha).filter((p): p is ProdutoTabloide => p !== null);
}

/** Junta a lista nova com a que já existia: quem já tinha foto/observação mantém. */
export function mesclarListas(antiga: ProdutoTabloide[], nova: ProdutoTabloide[]): ProdutoTabloide[] {
  const porNome = new Map(antiga.map((p) => [chaveDoProduto(p.nome), p]));
  return nova.map((p) => {
    const velho = porNome.get(chaveDoProduto(p.nome));
    return velho ? { ...p, id: velho.id, imagem: velho.imagem, obs: velho.obs, unidade: p.unidade ?? velho.unidade } : p;
  });
}

/** Volta o produto para uma linha de texto (usado para preencher a caixa de digitação). */
export function paraLinha(p: ProdutoTabloide): string {
  const preco = p.preco == null ? '' : p.precoDe != null ? ` de ${precoParaTexto(p.precoDe)} por ${precoParaTexto(p.preco)}` : ` R$ ${precoParaTexto(p.preco)}`;
  return `${p.nome}${p.unidade && p.unidade !== 'UN' ? ` ${p.unidade.toLowerCase()}` : ''}${preco}`.trim();
}

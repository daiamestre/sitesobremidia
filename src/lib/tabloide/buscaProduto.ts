/**
 * F-256 — REGRA DO DONO: o cliente escreve nome, peso e preço, e o sistema traz exatamente o produto descrito. Compara o que foi
 * escrito com os produtos oficiais das marcas: a medida tem de ser a mesma e cada palavra escrita tem de estar no nome do produto.
 * Sem importações pesadas: só contas sobre a chave canônica do nome.
 */
import { chaveCanonica } from './chave';

/** Palavras que dizem o tipo do produto: quem escreve "Biscoito Maizena" não deixa de ser "Maizena Tradicional". */
const TIPO = new Set(['biscoito', 'biscoitos', 'bolacha', 'bolachas', 'macarrao', 'massa', 'refrigerante', 'refri', 'suco', 'cafe', 'arroz', 'feijao', 'acucar', 'tempero', 'molho', 'leite', 'oleo', 'farinha', 'sal', 'produto', 'pacote', 'pct', 'caixa', 'cx', 'fardo', 'lata', 'garrafa', 'pet', 'sache']);
/** Quem não escreve o sabor quer o comum: estas palavras não contam como diferença. */
const PADRAO = new Set(['tradicional', 'original', 'classico', 'classica']);
/** Estas dizem só o tipo, nunca o sabor ("leite", ao contrário, separa Maizena Leite de Maizena Tradicional). */
const NEUTRAS = new Set(['biscoito', 'biscoitos', 'bolacha', 'bolachas', 'macarrao', 'massa', 'refrigerante']);

const MEDIDA = /^(\d+(?:\.\d+)?)(kg|g|ml|l)$/;

/**
 * F-282 — o TIPO do produto: quem pede arroz nunca recebe feijão. Se o nome oficial diz um tipo e o cliente pediu outro, não é o produto.
 * (Nome oficial sem tipo nenhum, como "Tradicional Vácuo 500g Pilão", continua valendo.)
 */
const CATEGORIA: Record<string, string> = {
  arroz: 'arroz', feijao: 'feijao', leite: 'leite', cafe: 'cafe', cappuccino: 'cappuccino', acucar: 'acucar', adocante: 'adocante',
  oleo: 'oleo', azeite: 'azeite', farinha: 'farinha', fuba: 'fuba', sal: 'sal', macarrao: 'massa', massa: 'massa', espaguete: 'massa',
  penne: 'massa', parafuso: 'massa', lasanha: 'massa', talharim: 'massa', biscoito: 'biscoito', biscoitos: 'biscoito', bolacha: 'biscoito',
  bolachas: 'biscoito', refrigerante: 'refrigerante', refri: 'refrigerante', suco: 'suco', molho: 'molho', extrato: 'molho', tempero: 'tempero',
  achocolatado: 'achocolatado', cerveja: 'cerveja', agua: 'agua', sabao: 'sabao', detergente: 'detergente', amaciante: 'amaciante',
  margarina: 'margarina', manteiga: 'manteiga', queijo: 'queijo', iogurte: 'iogurte', requeijao: 'requeijao', creme: 'creme',
  maionese: 'maionese', ketchup: 'ketchup', mostarda: 'mostarda', vinagre: 'vinagre', chocolate: 'chocolate', bolo: 'bolo', pao: 'pao',
};
/**
 * F-282 — VARIANTES: quem não escreveu a variante quer o produto TRADICIONAL e mais vendido. Leite em pó, condensado, zero lactose,
 * desnatado, café solúvel ou em cápsula, arroz integral ou 7 grãos, feijão preto… só entram quando o cliente escreve.
 */
const VARIANTES = new Set(['po', 'condensado', 'evaporado', 'soluvel', 'capsula', 'capsulas', 'cappuccino', 'descafeinado',
  'desnatado', 'semidesnatado', 'zero', 'lactose', 'light', 'diet', 'integral', 'integrais', 'parboilizado', 'graos', 'organico', 'organica',
  'intenso', 'extra', 'forte', 'extraforte', 'fortissimo', 'gourmet', 'espresso', 'expresso', 'italiano', 'italiana', 'culinaria', 'fradinho',
  'jalo', 'rosinha', 'preto', 'branco', 'vermelho', 'arboreo', 'japones', 'cateto', 'basmati', 'a2', 'kids', 'infantil', 'proteico', 'proteina',
  'fermentado', 'chocolate', 'morango', 'baunilha', 'coco', 'mini', 'refil']);
/** Título de artigo ou de página lido por engano ("Como é feito o leite em pó?", "Leite UHT: segurança…"): nunca é foto de produto. */
export const naoEhProduto = (nome: string) => /[?:!]/.test(nome) || nome.trim().split(/\s+/).length > 14;

export interface Busca { palavras: string[]; medida: number | null; unidade: 'g' | 'ml' | null }
export interface ProdutoOficial { nome: string; nome_norm: string; imagem_url: string; credito?: string | null }

/** Separa a medida (500g e 0.5kg são a mesma) das palavras do nome. */
export function lerBusca(nome: string): Busca {
  const palavras: string[] = [];
  let medida: number | null = null, unidade: Busca['unidade'] = null;
  for (const t of chaveCanonica(nome).split(' ').filter(Boolean)) {
    const m = t.match(MEDIDA);
    if (m) {
      medida = Number(m[1]) * (m[2] === 'kg' || m[2] === 'l' ? 1000 : 1);
      unidade = m[2] === 'kg' || m[2] === 'g' ? 'g' : 'ml';
    } else palavras.push(t);
  }
  return { palavras, medida, unidade };
}

/** Palavras que vão à consulta do banco: sem as de tipo, porque o nome oficial nem sempre as tem. */
export const palavrasFortes = (b: Busca) => b.palavras.filter((p) => p.length >= 3 && /^[a-z0-9]+$/.test(p) && !TIPO.has(p));

const temPalavra = (lista: string[], p: string) => lista.some((t) => t === p || (p.length >= 4 && t.startsWith(p)));

/** Quantas palavras o produto tem além do que foi escrito (menos é mais exato). null = não é o produto descrito. */
export function diferenca(b: Busca, chave: string): number | null {
  const c = lerBusca(chave);
  if (b.medida !== null && c.medida !== null && (c.unidade !== b.unidade || Math.abs(c.medida - b.medida) > 0.01)) return null;
  if (!b.palavras.every((p) => TIPO.has(p) || temPalavra(c.palavras, p))) return null;
  // F-282: o tipo do produto tem de ser o mesmo (arroz ≠ feijão; leite ≠ leite condensado vem pelas variantes)
  const catPedida = new Set(b.palavras.map((p) => CATEGORIA[p]).filter(Boolean));
  const catOficial = new Set(c.palavras.map((p) => CATEGORIA[p]).filter(Boolean));
  if (catPedida.size && catOficial.size && ![...catPedida].some((k) => catOficial.has(k))) return null;
  // F-282: variante que o cliente não escreveu pesa muito (o tradicional vem primeiro)
  const variantes = c.palavras.filter((t) => VARIANTES.has(t) && !b.palavras.includes(t)).length;
  const sobra = c.palavras.filter((t) => !b.palavras.some((p) => t === p || (p.length >= 4 && t.startsWith(p))) && !PADRAO.has(t) && !NEUTRAS.has(t)).length
    - b.palavras.filter((p) => TIPO.has(p) && !NEUTRAS.has(p) && temPalavra(c.palavras, p)).length * 0.25; // a palavra escrita aparece no nome
  // produto sem medida no nome, quando o cliente pediu uma, vem depois do que confirma a medida
  const nota = sobra + variantes * 3;
  return b.medida !== null && c.medida === null ? nota + 0.5 : nota;
}

/** Os produtos oficiais que batem com o que foi escrito, do mais exato ao menos exato, uma linha por foto. */
export function ordenarOficiais(nome: string, linhas: ProdutoOficial[]): ProdutoOficial[] {
  const b = lerBusca(nome);
  const vistas = new Set<string>();
  return linhas
    .filter((l) => !naoEhProduto(l.nome))
    .map((l) => ({ l, d: diferenca(b, l.nome_norm) }))
    .filter((x): x is { l: ProdutoOficial; d: number } => x.d !== null)
    .sort((x, y) => x.d - y.d || x.l.nome.localeCompare(y.l.nome))
    .map((x) => x.l)
    .filter((l) => (vistas.has(l.imagem_url) ? false : vistas.add(l.imagem_url) && true));
}

/**
 * O produto, só quando não há dúvida: um único mais exato. Dois empatados (duas marcas, dois sabores) o cliente escolhe na lista.
 * Quem pediu um peso só recebe o produto que confirma esse peso: o que não diz o peso no nome também vai para a lista.
 */
export function produtoExato(nome: string, linhas: ProdutoOficial[]): ProdutoOficial | null {
  const b = lerBusca(nome);
  const achados = ordenarOficiais(nome, linhas);
  if (!achados.length) return null;
  if (b.medida !== null && lerBusca(achados[0].nome_norm).medida === null) return null;
  if (achados.length === 1) return achados[0];
  const notas = achados.slice(0, 2).map((l) => diferenca(b, l.nome_norm) ?? 99);
  return notas[0] < notas[1] ? achados[0] : null;
}

/**
 * F-282 — o produto mais provável SÓ quando é confiável: o mesmo tipo, a mesma medida (se o cliente escreveu uma) e nenhuma variante que o
 * cliente não pediu (o tradicional). Sem um confiável, devolve null: o sistema procura em outra fonte em vez de pôr um produto aleatório
 * da marca.
 */
export function melhorOficial(nome: string, linhas: ProdutoOficial[]): ProdutoOficial | null {
  const b = lerBusca(nome);
  const [melhor] = ordenarOficiais(nome, linhas);
  if (!melhor) return null;
  const d = diferenca(b, melhor.nome_norm) ?? 99;
  if (d > 2.5) return null; // tem variante não pedida ou muita coisa a mais
  if (b.medida !== null && lerBusca(melhor.nome_norm).medida === null) return null;
  return melhor;
}

/** A marca da foto oficial, pelo crédito ("Imagem oficial Camil" ou "Imagem oficial Camil (via Loja)"). */
export const marcaDoCredito = (credito?: string | null) => String(credito ?? '').replace(/^Imagem oficial\s+/i, '').replace(/\s*\(via .*\)\s*$/i, '').trim();

/**
 * F-283 — o que aparece para TROCAR a foto: primeiro os exatos; depois os RELACIONADOS (a mesma marca e o mesmo tipo de produto, em
 * outros pesos e sabores: "Arroz Camil" → arroz Camil de 1, 2 e 5 kg, nunca o feijão Camil). Título de artigo nunca entra.
 */
export function relacionadosDaMarca(nome: string, linhas: ProdutoOficial[]): ProdutoOficial[] {
  const b = lerBusca(nome);
  const exatos = ordenarOficiais(nome, linhas);
  const ja = new Set(exatos.map((l) => l.imagem_url));
  const pedidas = new Set(b.palavras);
  const catPedida = new Set(b.palavras.map((p) => CATEGORIA[p]).filter(Boolean));
  const outros = linhas
    .filter((l) => !ja.has(l.imagem_url) && !naoEhProduto(l.nome))
    .map((l) => {
      const marca = lerBusca(marcaDoCredito(l.credito)).palavras;
      if (!marca.length || !marca.every((m) => pedidas.has(m))) return null; // outra marca
      const c = lerBusca(l.nome_norm);
      const catOficial = new Set(c.palavras.map((p) => CATEGORIA[p]).filter(Boolean));
      if (catPedida.size && (!catOficial.size || ![...catPedida].some((k) => catOficial.has(k)))) return null; // outro tipo
      const variantes = c.palavras.filter((t) => VARIANTES.has(t) && !pedidas.has(t)).length;
      const medida = b.medida !== null && c.medida !== null ? Math.abs(Math.log((c.medida || 1) / (b.medida || 1))) : 1;
      return { l, nota: variantes * 3 + medida };
    })
    .filter((x): x is { l: ProdutoOficial; nota: number } => !!x)
    .sort((x, y) => x.nota - y.nota || x.l.nome.localeCompare(y.l.nome))
    .map((x) => x.l);
  const vistas = new Set<string>();
  return [...exatos, ...outros].filter((l) => (vistas.has(l.imagem_url) ? false : vistas.add(l.imagem_url) && true));
}

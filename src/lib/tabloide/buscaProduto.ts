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
  const sobra = c.palavras.filter((t) => !b.palavras.some((p) => t === p || (p.length >= 4 && t.startsWith(p))) && !PADRAO.has(t) && !NEUTRAS.has(t)).length
    - b.palavras.filter((p) => TIPO.has(p) && !NEUTRAS.has(p) && temPalavra(c.palavras, p)).length * 0.25; // a palavra escrita aparece no nome
  // produto sem medida no nome, quando o cliente pediu uma, vem depois do que confirma a medida
  return b.medida !== null && c.medida === null ? sobra + 0.5 : sobra;
}

/** Os produtos oficiais que batem com o que foi escrito, do mais exato ao menos exato, uma linha por foto. */
export function ordenarOficiais(nome: string, linhas: ProdutoOficial[]): ProdutoOficial[] {
  const b = lerBusca(nome);
  const vistas = new Set<string>();
  return linhas
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

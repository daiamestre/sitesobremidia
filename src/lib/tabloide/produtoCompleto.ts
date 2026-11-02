/**
 * F-242/F-256 — o que o produto precisa ter para o sistema trazer a imagem certa: nome, marca, medida e preço.
 * Frutas, verduras e carnes não têm marca. Serve às telas de produtos do Studio e do Cartaz Digital.
 */
import { ehFresco } from './imagens';
import { lerLinha, type ProdutoTabloide } from './parseProdutos';
import { MARCAS_CONHECIDAS } from './marcasConhecidas';

const MEDIDA = /\d+(?:[.,]\d+)?\s*(?:kg|g|gr|grs|mg|l|lt|lts|litros?|ml|cl|un|und|unid|unidades?|pct|cx|dz|m|cm|rolos?|folhas?|caps?|c\/\d+)\b/i;

export const FALTA_MEDIDA = 'medida (kg, g, L, ml ou un)';

/** O nome cita uma marca da lista? ("Coca-Cola 2L" já diz a marca; "Café" não.) */
function citaMarca(nome: string): boolean {
  const p = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  return p.some((_, i) => [1, 2, 3].some((n) => i + n <= p.length && MARCAS_CONHECIDAS.has(p.slice(i, i + n).join(' '))));
}

export function faltasDoProduto(p: Pick<ProdutoTabloide, 'nome' | 'preco' | 'unidade' | 'codigo'>): string[] {
  const faltas: string[] = [];
  const nome = p.nome.trim();
  if (p.preco == null) faltas.push('preço');
  if (!p.codigo && !p.unidade && !MEDIDA.test(nome)) faltas.push(FALTA_MEDIDA);
  const palavras = nome.replace(MEDIDA, ' ').split(/\s+/).filter((w) => w.length > 1);
  if (!p.codigo && !ehFresco(nome) && palavras.length < 2 && !citaMarca(nome)) faltas.push('marca');
  return faltas;
}

export interface ProdutoIncompleto { nome: string; motivo: string }

const lista = (t: string[]) => (t.length < 2 ? t.join('') : `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}`);

/** O que o cliente deve fazer, em uma frase. */
export function explicarFaltas(faltas: string[]): string {
  return `falta ${lista(faltas.map((f) => (f === 'preço' ? 'o preço' : f === 'marca' ? 'a marca' : f === FALTA_MEDIDA ? `a ${f}` : f)))}`;
}

/**
 * Confere o que está escrito na caixa e o que já entrou na lista, enquanto o cliente digita.
 * `semFoto`: produtos completos que o sistema não achou; `duvidas`: os que batem com vários produtos. Devolve só o que precisa de atenção.
 */
export function revisarProdutos(texto: string, produtos: Array<Pick<ProdutoTabloide, 'nome' | 'preco' | 'unidade' | 'codigo'>>, semFoto: string[] = [], duvidas: Record<string, number> = {}): { itens: ProdutoIncompleto[]; total: number } {
  const itens: ProdutoIncompleto[] = [];
  const vistos = new Set<string>();
  let total = 0;
  const conferir = (nome: string, faltas: string[]) => {
    const k = nome.trim().toLowerCase();
    if (!k || vistos.has(k)) return;
    vistos.add(k);
    total++;
    if (faltas.length) itens.push({ nome: nome.trim(), motivo: explicarFaltas(faltas) });
    else if (duvidas[nome]) itens.push({ nome: nome.trim(), motivo: `achamos ${duvidas[nome]} produtos parecidos: escreva o sabor, o tipo e o peso, ou toque na foto para escolher` });
    else if (semFoto.includes(nome)) itens.push({ nome: nome.trim(), motivo: 'não achamos a imagem deste produto: confira o nome, a marca e a medida, ou toque na foto para escolher' });
  };
  for (const linha of texto.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const p = lerLinha(linha);
    conferir(p?.nome || linha, p ? faltasDoProduto(p) : ['nome', 'preço']);
  }
  for (const p of produtos) conferir(p.nome, faltasDoProduto(p));
  return { itens, total };
}

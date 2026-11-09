/**
 * F-242/F-256 — o que o produto precisa ter para o sistema trazer a imagem certa: nome, marca, medida e preço.
 * Frutas, verduras e carnes não têm marca. Serve às telas de produtos do Studio e do Cartaz Digital.
 */
import { ehFresco } from './imagens';
import { lerLinha, lerValor, precoParaTexto, type ProdutoTabloide } from './parseProdutos';
import { MARCAS_CONHECIDAS } from './marcasConhecidas';

const MEDIDA = /\d+(?:[.,]\d+)?\s*(?:kg|g|gr|grs|mg|l|lt|lts|litros?|ml|cl|un|und|unid|unidades?|pct|cx|dz|m|cm|rolos?|folhas?|caps?|comp|comprimidos?|c[aá]psulas?|pastilhas?|dr[aá]geas?|sach[eê]s?|envelopes?|gotas|c\/\d+)(?![a-zà-ú])/i;

/** F-279: cortes de carne, frutas, legumes e verduras não têm marca (além dos de ehFresco) */
const SEM_MARCA = /\b(acem|musculo|cupim|maminha|fraldinha|lagarto|coxao|paleta|peito|chuchu|abobrinha|abobora|berinjela|quiabo|jilo|maxixe|couve|repolho|brocolis|rucula|agriao|mandioca|macaxeira|inhame|cara|beterraba|alho|gengibre|abacate|kiwi|goiaba|maracuja|morango|melao|pera|ameixa|caqui|pessego|coco|pinha|atemoia|acerola|caju|pitaya|graviola|figo|mirtilo|framboesa|lichia|roma|jabuticaba|tangerina|mexerica|vagem|milho|rabanete|nabo|espinafre|acelga|salsa|cebolinha|coentro|hortela|manjericao|alho-poro|salsao|cheiro-verde|ovos?|cogumelo|champignon|shimeji)\b/;
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

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
  if (!p.codigo && !ehFresco(nome) && !SEM_MARCA.test(semAcento(nome)) && palavras.length < 2 && !citaMarca(nome)) faltas.push('marca');
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
    else if (duvidas[nome]) itens.push({ nome: nome.trim(), motivo: `confira a foto: pode não ser exatamente este produto (achamos ${duvidas[nome]} parecidos). Toque na foto para escolher o certo` });
    else if (semFoto.includes(nome)) itens.push({ nome: nome.trim(), motivo: 'não achamos a imagem deste produto: confira o nome, a marca e a medida, ou toque na foto para escolher' });
  };
  for (const linha of texto.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const p = lerLinha(linha);
    conferir(p?.nome || linha, p ? faltasDoProduto(p) : ['nome', 'preço']);
  }
  for (const p of produtos) conferir(p.nome, faltasDoProduto(p));
  return { itens, total };
}

/** F-257: as perguntas do campo "Adicionar produto". */
export interface CamposDoProduto { nome: string; marca: string; sabor: string; quantidade: string; unidade: string; promocao: boolean; de: string; preco: string; /** F-279: leite, pão, iogurte e comida fitness integrais (opcional) */ integral?: boolean }
export const CAMPOS_VAZIOS: CamposDoProduto = { nome: '', marca: '', sabor: '', quantidade: '', unidade: 'g', promocao: false, de: '', preco: '', integral: false };
export const UNIDADES_DO_CAMPO = [
  { valor: 'g', nome: 'Gramas (g)' }, { valor: 'kg', nome: 'Quilo (kg)' }, { valor: 'ml', nome: 'Mililitros (ml)' }, { valor: 'L', nome: 'Litros (L)' },
  { valor: 'un', nome: 'Unidade (un)' }, { valor: 'pct', nome: 'Pacote (pct)' }, { valor: 'cx', nome: 'Caixa (cx)' }, { valor: 'dz', nome: 'Dúzia (dz)' },
  // F-259: farmácia
  { valor: 'mg', nome: 'Miligramas (mg)' }, { valor: 'comprimidos', nome: 'Comprimidos' }, { valor: 'cápsulas', nome: 'Cápsulas' }, { valor: 'pastilhas', nome: 'Pastilhas' },
];
/** Vendido por quilo, unidade ou dúzia: a medida não precisa de número ("Picanha kg 49,90"). */
const SEM_NUMERO = new Set(['kg', 'un', 'pct', 'cx', 'dz']);

/** O que falta preencher, em frases prontas para o aviso vermelho. */
export function errosDoCampo(c: CamposDoProduto): string[] {
  const e: string[] = [];
  const nome = c.nome.trim();
  const preco = lerValor(c.preco.trim());
  if (!nome) e.push('Escreva o nome do produto.');
  if (nome && !c.marca.trim() && !ehFresco(nome)) e.push('Escreva a marca. Fruta, verdura e carne não precisam.');
  if (!c.quantidade.trim() && !SEM_NUMERO.has(c.unidade)) e.push('Escreva o peso ou o volume. Exemplo: 350.');
  if (c.quantidade.trim() && lerValor(c.quantidade.trim()) == null) e.push('O peso ou volume deve ser um número. Exemplo: 350.');
  if (preco == null) e.push(c.promocao ? 'Escreva o preço da promoção no campo Por.' : 'Escreva o preço. Exemplo: 39,90.');
  if (c.promocao) {
    const de = lerValor(c.de.trim());
    if (de == null) e.push('Escreva o preço antigo no campo De.');
    else if (preco != null && de <= preco) e.push('O preço De precisa ser maior que o preço Por.');
  }
  return e;
}

/** A linha que vai para a caixa de produtos, no mesmo formato que o cliente já edita. */
export function linhaDoCampo(c: CamposDoProduto): string {
  // F-259: unidade por extenso (comprimidos, cápsulas) vai separada do número
  const medida = c.quantidade.trim() ? `${c.quantidade.trim()}${c.unidade.length > 3 ? ' ' : ''}${c.unidade}` : c.unidade;
  const preco = precoParaTexto(lerValor(c.preco.trim()));
  const valor = c.promocao ? `de ${precoParaTexto(lerValor(c.de.trim()))} por ${preco}` : preco;
  // F-279: "É integral?" marcado entra no nome (leite, pão, iogurte, fitness), sem repetir se já está escrito
  const integral = c.integral && !/\bintegra(l|is)\b/i.test(`${c.nome} ${c.sabor}`) ? 'Integral' : '';
  return [c.nome, integral, c.sabor, c.marca, medida, valor].map((t) => (t ?? '').trim().replace(/\s+/g, ' ')).filter(Boolean).join(' ');
}

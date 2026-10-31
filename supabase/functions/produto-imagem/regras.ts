/**
 * F-231 — regras puras da busca de fotos de produto (sem rede): marca e medida digitadas valem como regra,
 * e o código de barras é conferido pelo dígito verificador. Testadas em src/tests/unit/encartesProdutos231.test.ts.
 */

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * A mesma medida em qualquer escrita — "1kg" = "1000 g" = "1 quilo"; "2L" = "2 litros" = "2000 ml".
 * Volta "g1000", "ml2000"... para comparar o que foi digitado com o produto do catálogo.
 */
export function medidasCanonicas(texto: string): string[] {
  const t = norm(texto).replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d+(?:\.\d+)?)\s*(?:litros?|lts?)\b/g, '$1l')
    .replace(/(\d+(?:\.\d+)?)\s*(?:quilos?|kilos?|kgs)\b/g, '$1kg')
    .replace(/(\d+(?:\.\d+)?)\s*gramas?\b/g, '$1g');
  const out: string[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|l|mg)\b/g)) {
    const v = Number(m[1]);
    if (!Number.isFinite(v) || v <= 0) continue;
    const u = m[2];
    out.push(u === 'kg' ? `g${Math.round(v * 1000)}` : u === 'g' || u === 'gr' ? `g${Math.round(v)}` : u === 'l' ? `ml${Math.round(v * 1000)}` : u === 'ml' ? `ml${Math.round(v)}` : `mg${Math.round(v)}`);
  }
  return [...new Set(out)];
}

/**
 * Medida conflitante: o produto informa uma medida e nenhuma é a digitada — "5kg" × "1kg", e também "1L" × "800g"
 * (leite líquido × leite em pó) → não serve. Produto sem medida no nome não é descartado.
 */
export function medidaConflita(termo: string, produto: string): boolean {
  const quer = medidasCanonicas(termo);
  const tem = medidasCanonicas(produto);
  if (!quer.length || !tem.length) return false;
  return !quer.some((q) => tem.includes(q));
}

const tokensDaMarca = (m: string) => norm(m).split(/[^a-z0-9]+/).filter((p) => p.length >= 3);

/**
 * Marca e medida digitadas valem como REGRA:
 * - medida: "Arroz 5kg" nunca fica com o pacote de 1 kg;
 * - marca: se alguma palavra digitada (fora a principal) é a marca de algum produto achado ("Camil", "Liza"),
 *   só ficam os produtos dessa marca. Sem marca reconhecida, ficam todos (o nome continua decidindo).
 * `ps` = palavras do que foi digitado, a principal primeiro.
 */
export function respeitarMarcaEMedida<T extends { nome: string; marcas: string }>(termo: string, ps: string[], lista: T[]): T[] {
  const semConflito = lista.filter((x) => !medidaConflita(termo, x.nome));
  const digitadas = ps.slice(1).filter((p) => semConflito.some((x) => tokensDaMarca(x.marcas).includes(p)));
  const daMarca = digitadas.length ? semConflito.filter((x) => digitadas.some((p) => tokensDaMarca(x.marcas).includes(p))) : [];
  const base = daMarca.length ? daMarca : semConflito;
  // as palavras que dizem QUAL é o produto ("soja", "integral", "carioca") também valem: "Óleo de Soja Liza" nunca vira
  // "Óleo de Algodão Liza". Sem nenhum produto com todas elas, a lista volta vazia e a busca segue para a próxima fonte.
  const descritivas = ps.slice(1).filter((p) => !digitadas.includes(p) && !/^\d/.test(p));
  if (!descritivas.length) return base;
  return base.filter((x) => { const t = norm(`${x.nome} ${x.marcas}`); return descritivas.every((p) => t.includes(p)); });
}

/** Monta "Refrigerante Coca-Cola 2l": o nome do catálogo com a marca e a medida quando ainda não aparecem nele. */
export function nomeDoProduto(nome: string, marca: string, quantidade: string): string {
  let n = nome.replace(/\s+/g, ' ').trim();
  const m = marca.split(',')[0]?.trim() ?? '';
  const so = (x: string) => norm(x).replace(/[^a-z0-9]/g, '');
  if (m && !so(n).includes(so(m))) n = `${n} ${m}`;
  if (quantidade && !medidasCanonicas(n).length && medidasCanonicas(quantidade).length) n = `${n} ${quantidade.replace(/\s+/g, '')}`;
  return n.slice(0, 80);
}

/** Código de barras válido (EAN-8, UPC-12, EAN-13, GTIN-14) com o dígito verificador certo. */
export function codigoValido(c: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(c)) return false;
  const d = c.split('').map(Number);
  const verificador = d.pop()!;
  const soma = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === verificador;
}

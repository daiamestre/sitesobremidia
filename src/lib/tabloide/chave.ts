/**
 * Cartaz Digital (F-177) — chave canônica do nome do produto.
 * "Coca-Cola 2L", "2 litros Coca Cola" e "coca cola 2 lt" viram a mesma chave, para a foto já guardada ser achada
 * na hora, não importa quem digitou nem em que ordem. Sem importações: o script de semeadura do catálogo usa este arquivo.
 */

const SEM_PESO = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'e', 'a', 'o', 'as', 'os', 'para', 'tipo', 'un', 'und', 'unid', 'unidade', 'unidades', 'pct', 'pacote']);

/** Chave de comparação do nome: sem acento, medidas padronizadas, sem palavras de ligação e em ordem alfabética. */
export function chaveCanonica(nome: string): string {
  let s = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/(\d),(\d)/g, '$1.$2');
  // medidas: "2 litros" / "2 lt" / "2 L" → 2l; "1 kg"/"1 quilo" → 1kg; "500 g"/"500 gramas" → 500g; "350 ml" → 350ml
  s = s
    .replace(/(\d+(?:\.\d+)?)\s*(?:litros?|lts?|l)\b/g, '$1l')
    .replace(/(\d+(?:\.\d+)?)\s*(?:quilos?|kilos?|kgs?)\b/g, '$1kg')
    .replace(/(\d+(?:\.\d+)?)\s*(?:gramas?|grs?|g)\b/g, '$1g')
    .replace(/(\d+(?:\.\d+)?)\s*(?:mls?)\b/g, '$1ml');
  const tokens = s
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/(?<![0-9])\.|\.(?![0-9])/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !SEM_PESO.has(t));
  return [...new Set(tokens)].sort().join(' ');
}

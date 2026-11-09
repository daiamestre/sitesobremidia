/**
 * F-285 — CONFERE OS PRODUTOS DE EXEMPLO de todos os encartes e palcos (mercado, farmácia e segmentos): cada um tem de sair COMPLETO
 * (nome, marca, medida, preço) e com a foto EXATA, decidida pelo sistema sem aviso. Simula o site: nome exato no catálogo → produto
 * oficial exato/confiável da marca. Mostra o que falha para corrigir a lista (nunca deixar exemplo com alerta).
 *   node scripts/ops/conferir-exemplos.mjs
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { sqlBruto } from './recorte-do-catalogo.mjs';

const require = createRequire(import.meta.url);
// módulos do site esperam o navegador: só o mínimo para importar as regras
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const RAIZ = path.resolve(import.meta.dirname, '../..');
const jiti = require('jiti')(import.meta.filename, { alias: { '@/integrations/supabase/client': path.join(RAIZ, 'scripts/ops/stubs/supabase-cliente.ts'), '@': path.join(RAIZ, 'src') } });
const { chaveCanonica } = jiti('../../src/lib/tabloide/chave.ts');
const { lerBusca, palavrasFortes, produtoExato, melhorOficial } = jiti('../../src/lib/tabloide/buscaProduto.ts');
const { lerLista } = jiti('../../src/lib/tabloide/parseProdutos.ts');
const { faltasDoProduto } = jiti('../../src/lib/tabloide/produtoCompleto.ts');
const { CESTA_PADRAO, CESTA_FARMACIA, ENCARTES } = jiti('../../src/lib/tabloide/encartes.ts');
const { SEGMENTOS_DE_OFERTA } = jiti('../../src/lib/studio/segmentosDeOferta.ts');
const esc = (s) => String(s).replace(/'/g, "''");

const cestas = [['mercado', CESTA_PADRAO], ['farmacia', CESTA_FARMACIA], ...ENCARTES.map((e) => [e.id, e.produtos]), ...SEGMENTOS_DE_OFERTA.map((s) => [s.id, s.cesta])];
let ruins = 0;
for (const [nomeCesta, cesta] of cestas) {
  for (const p of lerLista(cesta)) {
    const faltas = faltasDoProduto(p);
    const chave = chaveCanonica(p.nome);
    const noCatalogo = await sqlBruto(`select fonte from public.tabloide_catalogo where cliente_id is null and nome_norm = '${esc(chave)}' limit 1`);
    let veio = noCatalogo.length ? `catálogo (${noCatalogo[0].fonte})` : '';
    const fortes = palavrasFortes(lerBusca(p.nome));
    let oficial = null;
    if (fortes.length) {
      const sel = (cond) => sqlBruto(`select nome, nome_norm, imagem_url, credito from public.tabloide_catalogo where fonte = 'MARCA' and cliente_id is null and (${cond}) limit 400`);
      const linhas = [...await sel(fortes.map((f) => `nome_norm like '%${esc(f)}%'`).join(' and ')), ...await sel(fortes.map((f) => `nome_norm like '%${esc(f)}%'`).join(' or '))];
      oficial = produtoExato(p.nome, linhas) ?? melhorOficial(p.nome, linhas);
    }
    if (oficial) veio = `oficial: ${oficial.nome}`;
    if (faltas.length || !veio) { ruins++; console.log(`${nomeCesta.padEnd(28)} ${p.nome.padEnd(48)} ${faltas.length ? `FALTA ${faltas.join(', ')}` : 'SEM FOTO EXATA'}`); }
  }
}
console.log(`RESULTADO exemplos com problema: ${ruins}`);

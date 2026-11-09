/**
 * F-291 — O QUE O SITE ESCOLHE para nomes de hortifrúti digitados pelo cliente (como no encarte): 1) nome exato no catálogo;
 * 2) produto oficial da marca (produtoExato / melhorOficial). Mostra nome pedido → foto escolhida, para achar foto trocada.
 *   node scripts/ops/hortifruti-simular.mjs ["Batata Doce" "Coentro" ...]
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { sqlBruto } from './recorte-do-catalogo.mjs';

const require = createRequire(import.meta.url);
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const RAIZ = path.resolve(import.meta.dirname, '../..');
const jiti = require('jiti')(import.meta.filename, { alias: { '@/integrations/supabase/client': path.join(RAIZ, 'scripts/ops/stubs/supabase-cliente.ts'), '@': path.join(RAIZ, 'src') } });
const { chaveCanonica } = jiti('../../src/lib/tabloide/chave.ts');
const { lerBusca, palavrasFortes, produtoExato, melhorOficial } = jiti('../../src/lib/tabloide/buscaProduto.ts');
const { ehPedidoDeHortifruti, nomeTradicionalDoHortifruti } = jiti('../../src/lib/tabloide/hortifruti.ts');
const esc = (s) => String(s).replace(/'/g, "''");

export const PEDIDOS = ['Batata Doce', 'Batata Doce Roxa', 'Batata Doce Branca', 'Alho', 'Cebola', 'Pimentão', 'Pimentão Verde', 'Coentro', 'Chuchu', 'Xuxu', 'Laranja', 'Abacaxi', 'Banana', 'Tomate', 'Batata', 'Cenoura', 'Mandioca', 'Aipim', 'Couve', 'Alface', 'Limão', 'Maçã', 'Mamão', 'Melancia', 'Cheiro Verde', 'Salsinha', 'Pepino', 'Abobrinha', 'Repolho', 'Beterraba', 'Inhame', 'Quiabo', 'Jiló', 'Maxixe', 'Abóbora', 'Milho', 'Gengibre', 'Uva', 'Manga', 'Goiaba', 'Maracujá', 'Ovos', 'Banana da Terra', 'Caju', 'Agrião', 'Salsão', 'Jabuticaba'];

/** a MESMA regra do site (imagens.ts, F-291): catálogo exato → (hortifrúti: variedade tradicional) → oficial da marca */
export async function simular(nome) {
  const horti = ehPedidoDeHortifruti(nome);
  const trad = horti ? nomeTradicionalDoHortifruti(nome) : null;
  const linha = async (n) => (await sqlBruto(`select nome, fonte, credito, segmento from public.tabloide_catalogo where cliente_id is null and nome_norm = '${esc(chaveCanonica(n))}' limit 1`))[0];
  let cat = await linha(nome);
  if (horti && cat && cat.segmento !== 'hortifruti') cat = null;
  if (horti && !cat && trad) { const t = await linha(trad); if (t?.segmento === 'hortifruti') cat = t; }
  if (cat && cat.fonte === 'MARCA') return { via: 'catálogo', nome: cat.nome, credito: cat.credito };
  const alvo = trad ?? nome;
  const fortes = palavrasFortes(lerBusca(alvo));
  if (fortes.length) {
    const sel = (cond) => sqlBruto(`select nome, nome_norm, imagem_url, credito, segmento from public.tabloide_catalogo where fonte = 'MARCA' and cliente_id is null and (${cond}) limit 400`);
    let linhas = [...await sel(fortes.map((x) => `nome_norm like '%${esc(x)}%'`).join(' and ')), ...await sel(fortes.map((x) => `nome_norm like '%${esc(x)}%'`).join(' or '))];
    if (horti) linhas = linhas.filter((l) => l.segmento === 'hortifruti');
    const o = produtoExato(alvo, linhas) ?? melhorOficial(alvo, linhas);
    if (o) return { via: 'oficial', nome: o.nome, credito: o.credito };
  }
  return { via: horti ? 'sem foto (pede aos agentes)' : 'sem foto', nome: '', credito: '' };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/ops/hortifruti-simular.mjs')) {
  const nomes = process.argv.slice(2).length ? process.argv.slice(2) : PEDIDOS;
  for (const n of nomes) {
    const r = await simular(n);
    console.log(`${n.padEnd(20)} → ${r.via.padEnd(10)} ${r.nome} ${r.credito ? `| ${String(r.credito).slice(0, 50)}` : ''}`);
  }
}

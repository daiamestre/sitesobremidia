/**
 * Loterias e Sorteios (F-94): último resultado e próximo sorteio de cada modalidade da CAIXA.
 * Fonte: API da CAIXA; reserva: espelho público (vale o concurso mais novo). Loteria sem dado fica como está.
 */
import { LOTERIAS, daCaixa, doEspelho, maisNovo, dataLonga } from '../loterias-dados.mjs';
import { htmlResultado, htmlProximo } from '../cartoes-loterias.mjs';

async function buscar(url) {
  for (let t = 1; t <= 3; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SobreMidiaConteudo/1.0)', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.json();
      console.log(`  ${url} -> HTTP ${r.status} (tentativa ${t})`);
    } catch (e) { console.log(`  ${url} -> ${e.message} (tentativa ${t})`); }
    await new Promise((ok) => setTimeout(ok, 2000 * t));
  }
  return null;
}
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400e3);

export async function produzirLoterias(hoje) {
  const out = { loterias: [], sorteios: [] };
  for (const lot of LOTERIAS) {
    const [c, e] = await Promise.all([
      buscar(`https://servicebus2.caixa.gov.br/portaldeloterias/api/${lot.slug}/`),
      buscar(`https://loteriascaixa-api.herokuapp.com/api/${lot.slug}/latest`),
    ]);
    const r = maisNovo(daCaixa(lot.slug, c), doEspelho(lot.slug, e));
    if (!r) { console.log(`${lot.nome}: sem dados nas duas fontes`); continue; }
    if (diasEntre(r.data, hoje) > 15) { console.log(`${lot.nome}: concurso ${r.concurso} antigo demais — ignorado`); continue; }
    console.log(`${lot.nome}: concurso ${r.concurso} (${r.data})`);
    out.loterias.push({ chave: lot.slug, nome: `${lot.nome} — resultado do concurso ${r.concurso}`,
      descricao: `Resultado oficial do concurso ${r.concurso} (${dataLonga(r.data)}). Fonte: CAIXA.`, html: (w, h) => htmlResultado(lot, r, w, h) });
    if (r.proximo?.data && diasEntre(hoje, r.proximo.data) >= 0) {
      out.sorteios.push({ chave: lot.slug, nome: `${lot.nome} — próximo sorteio ${dataLonga(r.proximo.data)}`,
        descricao: `Concurso ${r.proximo.concurso ?? ''}. Estimativa informada pela CAIXA.`, html: (w, h) => htmlProximo(lot, r, w, h) });
    }
  }
  return out;
}

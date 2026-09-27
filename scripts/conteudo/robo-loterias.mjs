/**
 * Robô das Loterias (F-94) — roda no GitHub Actions (conteudo-automatico.yml), 2x por dia e sob demanda.
 *  1. busca o último resultado de cada loteria (CAIXA; reserva: espelho público; vale o concurso mais novo);
 *  2. gera as artes (resultado -> pasta "Loterias"; próximo sorteio -> pasta "Sorteios"), 16:9 e 9:16;
 *  3. envia os JPGs ao R2 (conteudo/loterias|sorteios/...);
 *  4. publica nas pastas marcadas pela Edge Function conteudo-automatico (a regra fica no banco);
 *  5. apaga do R2 os arquivos que foram substituídos.
 * Falha de uma loteria não derruba as outras; sem dado novo, nada muda nas pastas.
 */
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { LOTERIAS, daCaixa, doEspelho, maisNovo, dataLonga } from './loterias-dados.mjs';
import { htmlResultado, htmlProximo } from './cartoes-loterias.mjs';

const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`variável ausente: ${k}`); return v; };
const PUBLICO = 'https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev/';
const ORIENTACOES = [['h', 1920, 1080, '16x9', 'horizontal'], ['v', 1080, 1920, '9x16', 'vertical']];

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

const hojeBrasilia = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400e3);

async function main() {
  const s3 = new S3Client({
    region: 'auto', endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
  });
  const bucket = env('R2_BUCKET');
  const funcao = `${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/conteudo-automatico`;
  const segredo = env('CONTENT_FACTORY_SECRET');
  const hoje = hojeBrasilia();

  const resultados = [];
  for (const lot of LOTERIAS) {
    const [c, e] = await Promise.all([
      buscar(`https://servicebus2.caixa.gov.br/portaldeloterias/api/${lot.slug}/`),
      buscar(`https://loteriascaixa-api.herokuapp.com/api/${lot.slug}/latest`),
    ]);
    const r = maisNovo(daCaixa(lot.slug, c), doEspelho(lot.slug, e));
    if (!r) { console.log(`${lot.nome}: sem dados nas duas fontes — mantém o que já está na pasta`); continue; }
    if (diasEntre(r.data, hoje) > 15) { console.log(`${lot.nome}: concurso ${r.concurso} de ${r.data} antigo demais — ignorado`); continue; }
    console.log(`${lot.nome}: concurso ${r.concurso} (${r.data}) via ${c && daCaixa(lot.slug, c)?.concurso === r.concurso ? 'CAIXA' : 'espelho'}`);
    resultados.push({ lot, r });
  }
  if (!resultados.length) throw new Error('nenhuma loteria disponível nas duas fontes');

  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  async function foto(html, w, h) {
    await pagina.setViewportSize({ width: w, height: h });
    await pagina.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });
    await pagina.evaluate(() => document.fonts.ready);
    return pagina.screenshot({ type: 'jpeg', quality: 88, fullPage: false });
  }
  async function enviar(pasta, base, buf) {
    const hash = crypto.createHash('md5').update(buf).digest('hex');
    const path = `conteudo/${pasta}/${base}-${hash.slice(0, 10)}.jpg`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: path, Body: buf, ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000, immutable' }));
    return { path, url: PUBLICO + path, hash, bytes: buf.length };
  }

  const itens = { loterias: [], sorteios: [] };
  for (const { lot, r } of resultados) {
    for (const [o, w, h, aspecto, nomeO] of ORIENTACOES) {
      const res = await enviar('loterias', `${lot.slug}-${r.concurso}-${o}`, await foto(htmlResultado(lot, r, w, h), w, h));
      itens.loterias.push({ chave: `${lot.slug}:${o}`, nome: `${lot.nome} — resultado do concurso ${r.concurso} (${nomeO})`,
        descricao: `Resultado oficial do concurso ${r.concurso} (${dataLonga(r.data)}). Fonte: CAIXA.`, tipo: 'image', aspecto, mime: 'image/jpeg', ...res });
      if (r.proximo?.data && diasEntre(hoje, r.proximo.data) >= 0) {
        const prox = await enviar('sorteios', `${lot.slug}-${r.proximo.concurso ?? 'prox'}-${o}`, await foto(htmlProximo(lot, r, w, h), w, h));
        itens.sorteios.push({ chave: `${lot.slug}:${o}`, nome: `${lot.nome} — próximo sorteio ${dataLonga(r.proximo.data)} (${nomeO})`,
          descricao: `Concurso ${r.proximo.concurso ?? ''}. Estimativa informada pela CAIXA.`, tipo: 'image', aspecto, mime: 'image/jpeg', ...prox });
      }
    }
  }
  await navegador.close();

  for (const [conteudo, lista] of Object.entries(itens)) {
    if (!lista.length) continue;
    const resp = await fetch(funcao, { method: 'POST', headers: { Authorization: `Bearer ${segredo}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conteudo, itens: lista }) });
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`publicar ${conteudo}: HTTP ${resp.status} ${JSON.stringify(corpo)}`);
    console.log(`${conteudo}: ${JSON.stringify({ ...corpo, substituidos: corpo.substituidos?.length ?? 0 })}`);
    for (const velho of corpo.substituidos ?? []) {
      if (typeof velho === 'string' && velho.startsWith('conteudo/')) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: velho })).catch((e) => console.log(`  não apagou ${velho}: ${e.message}`));
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

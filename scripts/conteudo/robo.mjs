/**
 * Robô de conteúdo automático das pastas da Biblioteca (F-94/F-95) — GitHub Actions (conteudo-automatico.yml).
 * Para cada pasta automática: gera os itens (produtores/*), desenha as artes 16:9 e 9:16, envia ao R2 e publica pela
 * Edge Function conteudo-automatico (regra no banco). Arte que não mudou (mesmo HTML) não é desenhada nem enviada de
 * novo — as telas não baixam nada à toa. Falha de uma pasta não derruba as outras e não apaga o que já está nela.
 */
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { produzirLoterias } from './produtores/loterias.mjs';
import { produzirNoticias } from './produtores/noticias.mjs';
import { produzirCampeonatos } from './produtores/campeonatos.mjs';
import { produzirDatas } from './produtores/datas.mjs';
import { produzirTextos } from './produtores/textos.mjs';
import { produzirVideos, PASTAS_VIDEO } from './produtores/videos.mjs';

const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`variável ausente: ${k}`); return v; };
const PUBLICO = 'https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev/';
const ORIENTACOES = [['h', 1920, 1080, '16x9', 'horizontal'], ['v', 1080, 1920, '9x16', 'vertical']];
/** Mudou o desenho? Suba a versão para as telas receberem as artes novas. Loterias mantêm a versão da 1ª publicação. */
const VERSAO = (conteudo) => (conteudo === 'loterias' || conteudo === 'sorteios' ? 'loterias-v1' : 'conteudo-v1');
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const seguro = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

async function main() {
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') } });
  const bucket = env('R2_BUCKET');
  const funcao = `${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/conteudo-automatico`;
  const segredo = env('CONTENT_FACTORY_SECRET');
  const chamar = async (corpo) => {
    const r = await fetch(funcao, { method: 'POST', headers: { Authorization: `Bearer ${segredo}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  };
  const hoje = hojeBrasilia();
  const somente = (process.env.SOMENTE ?? '').split(',').map((x) => x.trim()).filter(Boolean);

  // ---- 1. produtores (cada um isolado)
  const pastas = {};
  const rodar = async (nome, fn) => {
    try { Object.assign(pastas, await fn()); console.log(`[${nome}] ok`); }
    catch (e) { console.log(`[${nome}] FALHOU: ${e.message} — pastas dele ficam como estão`); }
  };
  await rodar('loterias', () => produzirLoterias(hoje));
  await rodar('noticias', async () => produzirNoticias({ esportesNews: await chamar({ dados: 'esportes-news' }) }));
  await rodar('campeonatos', async () => produzirCampeonatos(await chamar({ dados: 'esportes' })));
  await rodar('datas', async () => produzirDatas(hoje));
  await rodar('textos', async () => produzirTextos());
  // Vídeos (Pexels): Vídeos Esporte só de vídeo; Turismo, Curiosidades e Humor juntam vídeos às artes. Se a busca de vídeo
  // falhar, essas pastas mistas não são publicadas nesta rodada (senão os vídeos que já estão nelas sairiam).
  let videoFalhou = !process.env.PEXELS_API_KEY;
  if (process.env.PEXELS_API_KEY) {
    try {
      const vids = await produzirVideos(process.env.PEXELS_API_KEY);
      for (const [conteudo, itens] of Object.entries(vids)) {
        if (conteudo === 'videos-esporte') pastas[conteudo] = itens;
        else if (pastas[conteudo]) pastas[conteudo] = [...pastas[conteudo], ...itens];
      }
      console.log('[videos] ok');
    } catch (e) { videoFalhou = true; console.log(`[videos] FALHOU: ${e.message} — pastas de vídeo ficam como estão`); }
  }

  // ---- 2. desenho + envio + publicação
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  async function foto(html, w, h) {
    await pagina.setViewportSize({ width: w, height: h });
    await pagina.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });
    await pagina.evaluate(() => document.fonts.ready);
    const imagensOk = await pagina.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    if (!imagensOk) return null; // foto/escudo que não carregou: a arte não sai incompleta
    return pagina.screenshot({ type: 'jpeg', quality: 86, fullPage: false });
  }

  const resumo = {};
  for (const [conteudo, itens] of Object.entries(pastas)) {
    if (somente.length && !somente.includes(conteudo)) continue;
    if (videoFalhou && PASTAS_VIDEO[conteudo]) { console.log(`${conteudo}: vídeos indisponíveis — pasta mantida`); continue; }
    if (!itens.length) { console.log(`${conteudo}: nada novo para publicar — pasta mantida`); continue; }
    let estado = {};
    try { estado = await chamar({ dados: 'estado', conteudo }); } catch (e) { console.log(`${conteudo}: estado indisponível (${e.message})`); }
    const lista = []; let desenhadas = 0; let reaproveitadas = 0; let falhas = 0;
    for (const it of itens) {
      for (const [o, w, h, aspecto, nomeO] of ORIENTACOES) {
        if (it.orientacoes && !it.orientacoes.includes(o)) continue;
        const chave = `${it.chave}:${o}`;
        if (it.tipo === 'video') {
          // vídeo: identidade = id + arquivo do Pexels; não mudou -> nada é baixado de novo
          const hashV = crypto.createHash('md5').update(`video|${it.video.id}|${it.video.link}`).digest('hex');
          const baseV = { chave, nome: `${it.nome} (${nomeO})`, descricao: it.descricao ?? null, tipo: 'video', aspecto, mime: 'video/mp4',
            hash: hashV, duracao_ms: it.video.duracaoMs, thumb: it.video.thumb };
          const atualV = estado[chave];
          if (atualV?.hash === hashV && atualV.url && atualV.path) { lista.push({ ...baseV, url: atualV.url, path: atualV.path, bytes: 0 }); reaproveitadas++; continue; }
          try {
            const resp = await fetch(it.video.link, { signal: AbortSignal.timeout(120000) });
            const buf = resp.ok ? Buffer.from(await resp.arrayBuffer()) : null;
            if (!buf || buf.length > MAX_VIDEO_BYTES || buf.length < 50000) { falhas++; continue; }
            const pathV = `conteudo/${conteudo}/${seguro(it.chave)}-${o}-${hashV.slice(0, 10)}.mp4`;
            await s3.send(new PutObjectCommand({ Bucket: bucket, Key: pathV, Body: buf, ContentType: 'video/mp4', CacheControl: 'public, max-age=31536000, immutable' }));
            lista.push({ ...baseV, url: PUBLICO + pathV, path: pathV, bytes: buf.length });
            desenhadas++;
          } catch { falhas++; }
          continue;
        }
        const html = it.html(w, h);
        const hash = crypto.createHash('md5').update(`${VERSAO(conteudo)}|${w}x${h}|${html}`).digest('hex');
        const base = { chave, nome: `${it.nome} (${nomeO})`, descricao: it.descricao ?? null, tipo: 'image', aspecto, mime: 'image/jpeg', hash };
        const atual = estado[chave];
        if (atual?.hash === hash && atual.url && atual.path) { lista.push({ ...base, url: atual.url, path: atual.path, bytes: 0 }); reaproveitadas++; continue; }
        const buf = await foto(html, w, h).catch(() => null);
        if (!buf) { falhas++; continue; }
        const path = `conteudo/${conteudo}/${seguro(it.chave)}-${o}-${hash.slice(0, 10)}.jpg`;
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: path, Body: buf, ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000, immutable' }));
        lista.push({ ...base, url: PUBLICO + path, path, bytes: buf.length });
        desenhadas++;
      }
    }
    if (!lista.length) { console.log(`${conteudo}: nenhuma arte pronta — pasta mantida`); continue; }
    try {
      const r = await chamar({ conteudo, itens: lista });
      for (const velho of r.substituidos ?? []) {
        if (typeof velho === 'string' && velho.startsWith('conteudo/')) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: velho })).catch(() => {});
      }
      resumo[conteudo] = { itens: lista.length, desenhadas, reaproveitadas, falhas, novos: r.novos, atualizados: r.atualizados, iguais: r.iguais, removidos: r.removidos };
    } catch (e) { resumo[conteudo] = { erro: e.message }; }
    console.log(`${conteudo}: ${JSON.stringify(resumo[conteudo])}`);
  }
  await navegador.close();
  if (Object.values(resumo).some((r) => r.erro)) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });

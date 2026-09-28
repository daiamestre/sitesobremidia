// SOBRE MÍDIA — analisador próprio: IMAGEM e QUADROS DO VÍDEO (F-111).
// POST { url, tipo: 'imagem'|'video' } com cabeçalho x-analise-segredo.
// Devolve a duração real, a nota de nudez de cada quadro (NSFWJS, modelo aberto) e os textos lidos (Tesseract).
// Quem decide é a política em supabase/functions/_shared/politicaConteudo.ts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { autorizado, baixar, ffmpeg, infoMidia, lerCorpo, responder, urlPermitida } from './_midia.js';

const LADO = 224;
let modeloNudez = null;
let leitorTexto = null;

async function carregarNudez() {
  if (modeloNudez) return modeloNudez;
  const tf = await import('@tensorflow/tfjs');
  await tf.setBackend('cpu');
  const nsfwjs = await import('nsfwjs');
  modeloNudez = { tf, modelo: await nsfwjs.load('MobileNetV2') };
  return modeloNudez;
}

async function carregarLeitor() {
  if (leitorTexto) return leitorTexto;
  const { createWorker } = await import('tesseract.js');
  leitorTexto = await createWorker('por', 1, { cachePath: path.join(os.tmpdir(), 'tesseract') });
  return leitorTexto;
}

async function notasDeNudez(arq, tipo, duracao) {
  // Vídeo: um quadro a cada 2 s (máx. 15). Imagem: o próprio quadro.
  const filtro = tipo === 'video' ? `fps=1/2,scale=${LADO}:${LADO}` : `scale=${LADO}:${LADO}`;
  const { stdout } = await ffmpeg(['-i', arq, '-vf', filtro, '-frames:v', tipo === 'video' ? '15' : '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const tam = LADO * LADO * 3;
  const n = Math.floor(stdout.length / tam);
  const { tf, modelo } = await carregarNudez();
  const quadros = [];
  for (let i = 0; i < n; i++) {
    const t = tf.tensor3d(new Uint8Array(stdout.subarray(i * tam, (i + 1) * tam)), [LADO, LADO, 3], 'int32');
    const r = await modelo.classify(t, 5);
    t.dispose();
    const nota = Object.fromEntries(r.map((x) => [x.className.toLowerCase(), Number(x.probability.toFixed(4))]));
    quadros.push({ t: tipo === 'video' ? Math.min(i * 2, duracao ?? i * 2) : 0, porn: nota.porn ?? 0, hentai: nota.hentai ?? 0, sexy: nota.sexy ?? 0, neutral: nota.neutral ?? 0, drawing: nota.drawing ?? 0 });
  }
  return quadros;
}

async function textosDaImagem(arq, tipo, dir) {
  // Vídeo: um quadro a cada 4 s (máx. 6). Imagem: ela inteira em boa resolução.
  const saida = path.join(dir, 'texto-%02d.png');
  const filtro = tipo === 'video' ? 'fps=1/4,scale=1280:-2' : "scale='min(1600,iw)':-2";
  await ffmpeg(['-i', arq, '-vf', filtro, '-frames:v', tipo === 'video' ? '6' : '1', saida]);
  const leitor = await carregarLeitor();
  const textos = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('texto-')).sort()) {
    const { data } = await leitor.recognize(path.join(dir, f));
    const limpo = String(data.text || '').replace(/\s+/g, ' ').trim();
    if (limpo) textos.push(limpo);
  }
  return textos;
}

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false, erro: 'use POST' });
  if (!autorizado(req)) return responder(res, 401, { ok: false, erro: 'não autorizado' });
  const corpo = await lerCorpo(req);
  const tipo = corpo.tipo === 'video' ? 'video' : 'imagem';
  if (!urlPermitida(corpo.url)) return responder(res, 400, { ok: false, erro: 'endereço da mídia não permitido' });

  const inicio = Date.now();
  let midia;
  try {
    midia = await baixar(corpo.url);
    const info = await infoMidia(midia.arq);
    if (!info.tem_video) return responder(res, 200, { ok: true, ...info, quadros: [], textos: [], ms: Date.now() - inicio });
    const [quadros, textos] = await Promise.all([
      notasDeNudez(midia.arq, tipo, info.duracao),
      textosDaImagem(midia.arq, tipo, midia.dir).catch((e) => { console.error('[analise-visao] texto', e); return null; }),
    ]);
    return responder(res, 200, {
      ok: true, duracao: tipo === 'video' ? info.duracao : null, tem_audio: info.tem_audio, quadros,
      textos: textos ?? [], texto_ok: textos !== null, ms: Date.now() - inicio,
    });
  } catch (e) {
    console.error('[analise-visao]', e);
    return responder(res, 200, { ok: false, erro: String(e?.message ?? e).slice(0, 200), ms: Date.now() - inicio });
  } finally {
    midia?.limpar();
  }
}

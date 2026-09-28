// SOBRE MÍDIA — analisador próprio: ÁUDIO (F-111).
// POST { url } com cabeçalho x-analise-segredo. Transcreve a fala em português com o Whisper (modelo aberto,
// roda aqui mesmo, sem serviço externo). Quem decide é a política em supabase/functions/_shared/politicaConteudo.ts.
import os from 'node:os';
import path from 'node:path';
import { autorizado, baixar, ffmpeg, infoMidia, lerCorpo, responder, urlPermitida } from './_midia.js';

const MODELO = process.env.ANALISE_MODELO_FALA || 'onnx-community/whisper-base';
let ouvinte = null;

async function carregarOuvinte() {
  if (ouvinte) return ouvinte;
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = path.join(os.tmpdir(), 'modelos-ia');
  env.allowLocalModels = false;
  ouvinte = await pipeline('automatic-speech-recognition', MODELO, { dtype: 'q8' });
  return ouvinte;
}

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false, erro: 'use POST' });
  if (!autorizado(req)) return responder(res, 401, { ok: false, erro: 'não autorizado' });
  const corpo = await lerCorpo(req);
  if (!urlPermitida(corpo.url)) return responder(res, 400, { ok: false, erro: 'endereço da mídia não permitido' });

  const inicio = Date.now();
  let midia;
  try {
    midia = await baixar(corpo.url);
    const info = await infoMidia(midia.arq);
    if (!info.tem_audio) return responder(res, 200, { ok: true, sem_audio: true, texto: '', ms: Date.now() - inicio });
    // Até 60 s de áudio, mono, 16 kHz (formato do Whisper)
    const { stdout } = await ffmpeg(['-i', midia.arq, '-vn', '-t', '60', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1']);
    const pcm = new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.length - (stdout.length % 4)));
    if (!pcm.length) return responder(res, 200, { ok: true, sem_audio: true, texto: '', ms: Date.now() - inicio });
    const ouvir = await carregarOuvinte();
    const r = await ouvir(pcm, { language: 'portuguese', task: 'transcribe', chunk_length_s: 30 });
    return responder(res, 200, { ok: true, texto: String(r?.text ?? '').trim(), segundos_audio: pcm.length / 16000, modelo: MODELO, ms: Date.now() - inicio });
  } catch (e) {
    console.error('[analise-audio]', e);
    return responder(res, 200, { ok: false, erro: String(e?.message ?? e).slice(0, 200), ms: Date.now() - inicio });
  } finally {
    midia?.limpar();
  }
}

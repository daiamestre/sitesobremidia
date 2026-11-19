/**
 * F-346/F-348 — REGRA ABSOLUTA DO DONO: toda voz é TRATADA antes de ser copiada/convertida, com EDIÇÃO PROFISSIONAL.
 *   node scripts/studio/tratar-voz.mjs <gravacao> <saida.mp3> [--sem-converter] [--ja-convertido]
 * F-348 (o dono reprovou a v1 acelerada, com palavras cortadas e frases atropeladas):
 *   1) limpeza suave: passa-alta 70 Hz, redução de ruído moderada e de-click;
 *   2) NÃO acelera e NÃO corta palavra: só as PAUSAS longas (>= 0,22 s) são editadas — o respiro/ruído dentro delas vira
 *      silêncio e elas ficam com tamanho natural (fim de frase 0,30 s, vírgula 0,20 s, meio 0,18 s);
 *   3) conversão para o timbre do locutor (clone B 0H07ueWLEXSuNIPyW7Y0) com a limpeza da ElevenLabs. --sem-converter pula;
 *      --ja-convertido = o arquivo já é a voz convertida: só limpa e edita as pausas (NÃO gasta conversão);
 *   4) acabamento: compressão suave e -16 LUFS.
 * A mesma edição roda no botão "Clonar voz" do Editor de Áudio (src/lib/studio/audio/clonarVoz.ts).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const FF = createRequire(import.meta.url)('@ffmpeg-installer/ffmpeg').path;
const args = process.argv.slice(2), [entrada, saida] = args.filter((a) => !a.startsWith('--'));
if (!entrada || !saida) { console.error('uso: node scripts/studio/tratar-voz.mjs <gravacao> <saida.mp3> [--sem-converter] [--ja-convertido]'); process.exit(2); }
const converter = !args.includes('--sem-converter') && !args.includes('--ja-convertido');
const env = Object.fromEntries(fs.readFileSync(path.join(os.homedir(), '.sobremidia-secrets', 'tokens.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
const H = { 'xi-api-key': env.ELEVENLABS_API_KEY }, sr = 44100;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tratar-voz-'));
const ff = (...a) => execFileSync(FF, ['-y', '-v', 'error', ...a], { maxBuffer: 1 << 29 });
function editarPausas(x, sr, palavras, o = {}) {
  const Q = Math.round(sr * 0.01), nq = Math.floor(x.length / Q), e = new Float32Array(nq);
  for (let q = 0; q < nq; q++) { let s = 0; for (let i = q * Q; i < (q + 1) * Q; i++) s += x[i] * x[i]; e[q] = Math.sqrt(s / Q); }
  const ordenado = [...e].sort((a, b) => a - b), fala = ordenado[Math.floor(nq * 0.9)] || 1e-6;
  const limiar = fala * Math.pow(10, -26 / 20);                 // o que está 26 dB abaixo da fala não é palavra
  const energia = (t) => e[Math.min(nq - 1, Math.max(0, Math.floor(t * sr / Q)))];
  const pausaAlvo = (txt) => (/[.!?]$/.test(txt) ? 0.30 : /[,;:]$/.test(txt) ? 0.20 : 0.18);
  const MIN_MEXER = o.minMexer ?? 0.22, CAUDA = 0.20, ANTES = 0.08, FOLGA_FIM = 0.05, FOLGA_INI = 0.04;
  const pedacos = []; // [a, b) em segundos, e o silêncio que vem depois
  let a = Math.max(0, palavras[0].ini - 0.06);
  for (let i = 0; i < palavras.length - 1; i++) {
    const w = palavras[i], prox = palavras[i + 1], gap = prox.ini - w.fim;
    if (gap < MIN_MEXER) continue;
    let fimFala = w.fim; while (fimFala - w.fim < CAUDA && fimFala < prox.ini && energia(fimFala) > limiar) fimFala += 0.01;
    let iniFala = prox.ini; while (prox.ini - iniFala < ANTES && iniFala > fimFala && energia(iniFala - 0.01) > limiar) iniFala -= 0.01;
    const A = Math.min(fimFala + FOLGA_FIM, prox.ini), B = Math.max(iniFala - FOLGA_INI, A);
    const mantido = (A - w.fim) + (prox.ini - B), novoGap = Math.max(Math.min(gap, pausaAlvo(w.texto)), mantido);
    if (B - A < 0.03) continue;
    pedacos.push({ a, b: A, silencio: novoGap - mantido });
    a = B;
  }
  const ultima = palavras[palavras.length - 1];
  let fimUlt = ultima.fim; while (fimUlt - ultima.fim < 0.3 && energia(fimUlt) > limiar) fimUlt += 0.01;
  pedacos.push({ a, b: Math.min(x.length / sr, fimUlt + 0.1), silencio: 0 });
  const fade = Math.round(sr * 0.02);
  const total = pedacos.reduce((t, p) => t + Math.round((p.b - p.a) * sr) + Math.round(p.silencio * sr), 0);
  const y = new Float32Array(total); let pos = 0;
  for (const p of pedacos) {
    const i0 = Math.round(p.a * sr), n = Math.round((p.b - p.a) * sr);
    for (let i = 0; i < n; i++) { const g = Math.min(1, i / fade, (n - 1 - i) / fade); y[pos + i] = x[i0 + i] * g; }
    pos += n + Math.round(p.silencio * sr);
  }
  return { y, cortes: pedacos.length - 1 };
}

const limpo = path.join(tmp, 'limpo.wav');
ff('-i', entrada, '-ac', '1', '-ar', String(sr), '-af', 'highpass=f=70,afftdn=nf=-25:tn=1,adeclick', limpo);
const fd = new FormData();
fd.append('model_id', 'scribe_v1'); fd.append('language_code', 'por'); fd.append('tag_audio_events', 'false'); fd.append('timestamps_granularity', 'word');
fd.append('file', new Blob([fs.readFileSync(limpo)], { type: 'audio/wav' }), 'a.wav');
const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: H, body: fd });
if (!r.ok) { console.error('transcrição recusada', r.status); process.exit(1); }
const tr = await r.json(); console.log('texto:', tr.text);
const palavras = tr.words.filter((w) => w.type === 'word').map((w) => ({ texto: w.text, ini: w.start, fim: w.end }));
const raw = execFileSync(FF, ['-v', 'error', '-i', limpo, '-f', 'f32le', '-'], { maxBuffer: 1 << 29 });
const { y, cortes } = editarPausas(new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), sr, palavras);
const pcm = path.join(tmp, 'pausas.f32'); fs.writeFileSync(pcm, Buffer.from(y.buffer));
const acabamento = 'acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=1.5,loudnorm=I=-16:TP=-1.5:LRA=8';
const tratada = converter ? saida.replace(/\.mp3$/i, '') + '-tratada.mp3' : saida;
ff('-f', 'f32le', '-ar', String(sr), '-ac', '1', '-i', pcm, '-af', acabamento, '-b:a', '192k', tratada);
console.log(`${cortes} pausas limpas e encurtadas, sem acelerar: ${(raw.length / 4 / sr).toFixed(1)} s → ${(y.length / sr).toFixed(1)} s`);
if (!converter) { console.log('pronto (sem conversão):', tratada); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0); }
const fc = new FormData();
fc.append('model_id', 'eleven_multilingual_sts_v2'); fc.append('remove_background_noise', 'true');
fc.append('voice_settings', JSON.stringify({ stability: 0.4, similarity_boost: 1, style: 0, use_speaker_boost: true }));
fc.append('audio', new Blob([fs.readFileSync(tratada)], { type: 'audio/mpeg' }), 'a.mp3');
const c = await fetch('https://api.elevenlabs.io/v1/speech-to-speech/0H07ueWLEXSuNIPyW7Y0?output_format=mp3_44100_128', { method: 'POST', headers: H, body: fc });
if (!c.ok) { console.error('conversão recusada', c.status); process.exit(1); }
const conv = path.join(tmp, 'conv.mp3'); fs.writeFileSync(conv, Buffer.from(await c.arrayBuffer()));
ff('-i', conv, '-af', 'highpass=f=70,adeclick,' + acabamento, '-b:a', '192k', saida);
console.log('pronto:', saida);
fs.rmSync(tmp, { recursive: true, force: true });

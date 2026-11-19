/**
 * F-346 — REGRA ABSOLUTA DO DONO (19/11/2026): toda voz é TRATADA antes de ser copiada/convertida.
 *   node scripts/studio/tratar-voz.mjs <gravacao.mp3> <saida.mp3> [--sem-converter] [--silabas=7.6]
 *
 * 1) LIMPEZA: tira grave de vento/batida (passa-alta), chiado (redução de ruído), estalos (de-click).
 * 2) SEM RESPIRO E SEM ESPAÇO: transcreve com o tempo de cada palavra (ElevenLabs Scribe) e monta só as palavras,
 *    colando umas nas outras. Tudo o que fica entre elas (respiração, estalo de boca, silêncio, barulho) sai.
 * 3) RITMO DO LOCUTOR DO OUTRO PROJETO: mede as sílabas por segundo e acelera sem mudar o tom até ~7,6 sílabas/s
 *    (o locutor do outro projeto fala a 7,97 sílabas/s enquanto fala; a gravação do dono, 5,3).
 * 4) CONVERSÃO para o timbre do locutor escolhido (clone B 0H07ueWLEXSuNIPyW7Y0), com a limpeza da ElevenLabs ligada.
 * 5) ACABAMENTO DE RÁDIO: compressão e volume padrão (-14 LUFS).
 * Grava também <saida>-tratada.mp3 (a sua voz já tratada, antes da conversão) para conferir.
 * Chaves só do cofre ~/.sobremidia-secrets/tokens.env (nunca impressas).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const FF = req('@ffmpeg-installer/ffmpeg').path;
const args = process.argv.slice(2);
const [entrada, saida] = args.filter((a) => !a.startsWith('--'));
if (!entrada || !saida) { console.error('uso: node scripts/studio/tratar-voz.mjs <gravacao> <saida.mp3> [--sem-converter] [--silabas=7.6]'); process.exit(2); }
const opc = (n, p) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : p; };
const ALVO_SILABAS = opc('silabas', 7.6);
const VOZ = '0H07ueWLEXSuNIPyW7Y0';

const cofre = path.join(os.homedir(), '.sobremidia-secrets', 'tokens.env');
const env = Object.fromEntries(fs.readFileSync(cofre, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
const H = { 'xi-api-key': env.ELEVENLABS_API_KEY };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tratar-voz-'));
const ff = (...a) => execFileSync(FF, ['-y', '-v', 'error', ...a], { maxBuffer: 1 << 28 });

// 1) limpeza
const limpo = path.join(tmp, '1-limpo.wav');
ff('-i', entrada, '-ac', '1', '-ar', '44100', '-af', 'highpass=f=75,lowpass=f=12000,adeclick=w=20:o=75,afftdn=nf=-28:tn=1,adeclick', limpo);

// 2) palavras com o tempo de cada uma
const fd = new FormData();
fd.append('model_id', 'scribe_v1'); fd.append('language_code', 'por'); fd.append('tag_audio_events', 'true'); fd.append('timestamps_granularity', 'word');
fd.append('file', new Blob([fs.readFileSync(limpo)], { type: 'audio/wav' }), 'a.wav');
const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: H, body: fd });
if (!r.ok) { console.error('transcrição recusada', r.status, (await r.text()).slice(0, 200)); process.exit(1); }
const tr = await r.json();
const palavras = tr.words.filter((w) => w.type === 'word' && w.end > w.start);
console.log('texto:', tr.text);

// blocos de fala: palavras coladas (quase sem espaço) viram um bloco; o espaço entre blocos sai
const PAD = 0.015, blocos = [];
for (const w of palavras) {
  const b = blocos[blocos.length - 1];
  if (b && w.start - b.fim < 0.05) { b.fim = w.end; b.texto += ' ' + w.text; } else blocos.push({ ini: w.start, fim: w.end, texto: w.text });
}
// pausa que fica entre um bloco e outro: mínima (fim de frase um pouco mais, para não embolar)
const pausaDepois = (t) => (/[.!?]$/.test(t.trim()) ? 0.11 : /[,;:]$/.test(t.trim()) ? 0.06 : 0.03);
const partes = []; let filtro = '';
blocos.forEach((b, i) => {
  const ini = Math.max(0, b.ini - PAD), fim = b.fim + PAD, d = fim - ini;
  filtro += `[0:a]atrim=start=${ini.toFixed(3)}:end=${fim.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st=${Math.max(0, d - 0.008).toFixed(3)}:d=0.008[b${i}];`;
  partes.push(`[b${i}]`);
  if (i < blocos.length - 1) { filtro += `aevalsrc=0:d=${pausaDepois(b.texto)}:s=44100[g${i}];`; partes.push(`[g${i}]`); }
});
const colado = path.join(tmp, '2-sem-respiro.wav');
const roteiro = path.join(tmp, 'filtro.txt');
fs.writeFileSync(roteiro, `${filtro}${partes.join('')}concat=n=${partes.length}:v=0:a=1[s]`);
ff('-i', limpo, '-filter_complex_script', roteiro, '-map', '[s]', colado);

// 3) ritmo: sílabas por segundo do áudio colado → acelera até o alvo (sem mudar o tom)
const silabas = palavras.reduce((a, w) => a + (w.text.toLowerCase().match(/[aeiouáéíóúâêôãõà]+/g) ?? []).length, 0);
const durColado = blocos.reduce((s, b, i) => s + (b.fim - b.ini) + 2 * PAD + (i < blocos.length - 1 ? pausaDepois(b.texto) : 0), 0);
const ritmoAntes = silabas / durColado;
const fator = Math.min(1.5, Math.max(1, ALVO_SILABAS / ritmoAntes));
const tratada = saida.replace(/\.mp3$/i, '') + '-tratada.mp3';
ff('-i', colado, '-af', `atempo=${fator.toFixed(3)},acompressor=threshold=-20dB:ratio=3:attack=4:release=60:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=7`, '-ar', '44100', '-b:a', '192k', tratada);
console.log(`ritmo: ${ritmoAntes.toFixed(2)} → ${(ritmoAntes * fator).toFixed(2)} sílabas/s (×${fator.toFixed(2)}); ${blocos.length} blocos de fala, pausas e respiros cortados`);

if (args.includes('--sem-converter')) { console.log('voz tratada:', tratada); process.exit(0); }

// 4) conversão para o timbre do locutor (limpeza da ElevenLabs ligada)
const antes = (await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: H })).json()).character_count;
const fc = new FormData();
fc.append('model_id', 'eleven_multilingual_sts_v2'); fc.append('remove_background_noise', 'true');
fc.append('voice_settings', JSON.stringify({ stability: 0.4, similarity_boost: 1, style: 0, use_speaker_boost: true }));
fc.append('audio', new Blob([fs.readFileSync(tratada)], { type: 'audio/mpeg' }), 'a.mp3');
const c = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${VOZ}?output_format=mp3_44100_128`, { method: 'POST', headers: H, body: fc });
if (!c.ok) { console.error('conversão recusada', c.status, (await c.text()).slice(0, 200)); process.exit(1); }
const conv = path.join(tmp, '4-convertido.mp3');
fs.writeFileSync(conv, Buffer.from(await c.arrayBuffer()));

// 5) acabamento de rádio (e tira de novo qualquer estalo que a conversão tenha criado)
ff('-i', conv, '-af', 'highpass=f=70,adeclick,acompressor=threshold=-18dB:ratio=3.5:attack=3:release=50:makeup=2,loudnorm=I=-14:TP=-1:LRA=6', '-ar', '44100', '-b:a', '192k', saida);
const s = await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: H })).json();
console.log('pronto:', saida, `| créditos: ${s.character_count - antes} agora (o contador pode atrasar), restam ${s.character_limit - s.character_count}`);
fs.rmSync(tmp, { recursive: true, force: true });

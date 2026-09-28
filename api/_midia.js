// SOBRE MÍDIA — utilitários do analisador próprio de mídia (F-111). Arquivo com "_" não vira rota na Vercel.
// Baixa a mídia (só dos nossos armazenamentos), roda o ffmpeg e confere o segredo compartilhado com o Supabase.
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LIMITE_BYTES = 120 * 1024 * 1024;
const HOSTS = ['.r2.dev', '.supabase.co', '.r2.cloudflarestorage.com'];

export function autorizado(req) {
  const esperado = process.env.ANALISE_MIDIA_SEGREDO || '';
  const recebido = String(req.headers['x-analise-segredo'] || '');
  if (!esperado || recebido.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

export async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const partes = [];
  for await (const p of req) partes.push(p);
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch { return {}; }
}

export function urlPermitida(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS.some((h) => u.hostname.endsWith(h));
  } catch { return false; }
}

/** Baixa para um arquivo temporário (a mídia é lida várias vezes pelo ffmpeg). */
export async function baixar(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const tamanho = Number(res.headers.get('content-length') || 0);
  if (tamanho > LIMITE_BYTES) throw new Error('arquivo acima de 120 MB');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > LIMITE_BYTES) throw new Error('arquivo acima de 120 MB');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'midia-'));
  const arq = path.join(dir, 'entrada');
  fs.writeFileSync(arq, buf);
  return { arq, dir, limpar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// A Vercel instala sem rodar o "chmod" do pacote: sem permissão de execução, o ffmpeg é copiado para /tmp e liberado lá.
let caminhoFfmpeg = null;
function ffmpegExecutavel() {
  if (caminhoFfmpeg) return caminhoFfmpeg;
  const origem = ffmpegInstaller.path;
  if (process.platform === 'win32') return (caminhoFfmpeg = origem);
  try {
    fs.accessSync(origem, fs.constants.X_OK);
    return (caminhoFfmpeg = origem);
  } catch {
    const destino = path.join(os.tmpdir(), 'ffmpeg-sobremidia');
    if (!fs.existsSync(destino)) fs.copyFileSync(origem, destino);
    fs.chmodSync(destino, 0o755);
    return (caminhoFfmpeg = destino);
  }
}

export function ffmpeg(args, { timeoutMs = 90_000 } = {}) {
  return new Promise((ok, erro) => {
    const p = spawn(ffmpegExecutavel(), ['-hide_banner', '-nostdin', ...args]);
    const out = []; let err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); erro(new Error('ffmpeg: tempo esgotado')); }, timeoutMs);
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { if (err.length < 200_000) err += d; });
    p.on('error', (e) => { clearTimeout(t); erro(e); });
    p.on('close', (code) => { clearTimeout(t); ok({ code, stdout: Buffer.concat(out), stderr: err }); });
  });
}

/** Duração (s), se tem áudio e se tem imagem, lidos do cabeçalho do arquivo. */
export async function infoMidia(arq) {
  const { stderr } = await ffmpeg(['-i', arq]);
  const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const duracao = m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
  return { duracao, tem_audio: /Stream #[^\n]*Audio:/.test(stderr), tem_video: /Stream #[^\n]*Video:/.test(stderr) };
}

export function responder(res, status, corpo) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(corpo));
}

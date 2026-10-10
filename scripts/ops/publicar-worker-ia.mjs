/**
 * Publica o Worker `sobremidia-tabloide-ia` (cloudflare/tabloide-ia/worker.js) na conta Cloudflare do dono.
 *   node scripts/ops/publicar-worker-ia.mjs
 * Lê CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID do arquivo de segredos. Cria (uma vez) o segredo TABLOIDE_IA_SEGREDO,
 * grava no arquivo de segredos junto com TABLOIDE_IA_URL e nunca imprime os valores.
 * Depois é preciso gravar os dois nos segredos da função do Supabase (produto-imagem).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { exigir } from './segredos.mjs';

exigir('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID');
const NOME = 'sobremidia-tabloide-ia';
const conta = process.env.CLOUDFLARE_ACCOUNT_ID;
const base = `https://api.cloudflare.com/client/v4/accounts/${conta}`;
const H = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` };
// O token pode ter filtro de endereço IP e a internet do escritório sai por mais de um endereço:
// quando a Cloudflare recusa por endereço (401/403), tenta de novo algumas vezes antes de desistir.
const cf = async (caminho, init = {}) => {
  let ultimo = '';
  for (let tentativa = 1; tentativa <= 12; tentativa++) {
    const r = await fetch(base + caminho, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.success) return j.result;
    ultimo = `${init.method ?? 'GET'} ${caminho} -> HTTP ${r.status} ${JSON.stringify(j?.errors ?? []).slice(0, 300)}`;
    if (r.status !== 401 && r.status !== 403) break;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  throw new Error(ultimo);
};

const arqSegredos = path.join(os.homedir(), '.sobremidia-secrets', 'tokens.env');
function gravarSegredo(nome, valor) {
  let t = fs.readFileSync(arqSegredos, 'utf8');
  const linhas = t.split(/\r?\n/);
  const i = linhas.findIndex((l) => l.startsWith(nome + '='));
  if (i >= 0) linhas[i] = `${nome}=${valor}`; else linhas.push(`${nome}=${valor}`);
  fs.writeFileSync(arqSegredos, linhas.join('\n').replace(/\n*$/, '\n'));
}

const segredo = process.env.TABLOIDE_IA_SEGREDO || crypto.randomBytes(32).toString('hex');
if (!process.env.TABLOIDE_IA_SEGREDO) gravarSegredo('TABLOIDE_IA_SEGREDO', segredo);

const codigo = fs.readFileSync(new URL('../../cloudflare/tabloide-ia/worker.js', import.meta.url), 'utf8');
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify({
  main_module: 'worker.js',
  compatibility_date: '2025-01-01',
  bindings: [{ type: 'ai', name: 'AI' }, { type: 'secret_text', name: 'SEGREDO', text: segredo }],
})], { type: 'application/json' }));
form.append('worker.js', new Blob([codigo], { type: 'application/javascript+module' }), 'worker.js');
await cf(`/workers/scripts/${NOME}`, { method: 'PUT', body: form });
console.log('worker publicado:', NOME);

// a conta precisa ter o endereço padrão de Workers (*.workers.dev); na primeira vez ele ainda não existe
let sub = await cf('/workers/subdomain').catch(() => null);
if (!sub?.subdomain) {
  for (const nome of ['sobremidia', 'sobremidia-app', `sobremidia-${conta.slice(0, 6)}`]) {
    sub = await cf('/workers/subdomain', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subdomain: nome }) }).catch(() => null);
    if (sub?.subdomain) { console.log('endereço de Workers criado na conta:', `${sub.subdomain}.workers.dev`); break; }
  }
  if (!sub?.subdomain) throw new Error('não foi possível criar o endereço workers.dev da conta');
}
await cf(`/workers/scripts/${NOME}/subdomain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, previews_enabled: false }) });
const url = `https://${NOME}.${sub.subdomain}.workers.dev`;
gravarSegredo('TABLOIDE_IA_URL', url);
console.log('endereço gravado no arquivo de segredos (TABLOIDE_IA_URL).');

// prova: sem segredo é negado; com segredo gera.
// Na primeira publicação o endereço novo pode demorar a resolver neste computador: isso não desfaz a publicação.
const semSegredo = await fetch(url, { method: 'POST', body: '{}' }).catch(() => null);
if (!semSegredo) { console.log('publicado, mas o endereço ainda não resolve neste computador (normal nos primeiros minutos).'); process.exit(0); }
console.log('sem segredo ->', semSegredo.status, '(esperado 401)');
if (process.argv.includes('--testar')) {
  const t0 = Date.now();
  const r = await fetch(url, { method: 'POST', headers: { 'x-segredo': segredo, 'Content-Type': 'application/json' }, body: JSON.stringify({ produto: 'Vassoura' }) });
  const j = await r.json().catch(() => null);
  console.log('com segredo ->', r.status, `${Date.now() - t0} ms`, 'traduzido:', j?.nome ?? '-', j?.image ? `imagem com ${j.image.length} caracteres` : JSON.stringify(j).slice(0, 200));
}

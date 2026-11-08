// Roda uma Edge Function NESTE computador (Deno), ligada ao banco de produção, SEM publicar — para provar uma mudança
// antes do deploy (MG-AUT, F-266). As chaves vão só para a memória do processo (nunca impressas nem gravadas):
//   - URL e chave pública: do .env do site; chave de serviço: lida na hora pela API de gestão do Supabase;
//   - chaves das IAs grátis e do Studio: do cofre ~/.sobremidia-secrets/tokens.env.
//   node scripts/ops/funcao-local.mjs agente-ia      (escuta em http://127.0.0.1:8000/)
// Depois chame http://127.0.0.1:<porta>/ com o login da conta de teste (scripts/ops/sessao-teste.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const [nome = 'agente-ia'] = process.argv.slice(2);
const porta = '8000'; // o serve() do Deno std usado pelas funções escuta na 8000
const arq = path.join(RAIZ, 'supabase/functions', nome, 'index.ts');
if (!fs.existsSync(arq)) { console.error(`função não encontrada: ${nome}`); process.exit(1); }

const ler = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const valores = (texto) => Object.fromEntries(texto.split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const cofre = valores(ler(path.join(os.homedir(), '.sobremidia-secrets/tokens.env')));
const site = valores(ler(path.join(RAIZ, '.env')));

const ref = cofre.SUPABASE_PROJECT_REF;
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${cofre.SUPABASE_ACCESS_TOKEN}` } });
if (!r.ok) { console.error(`não consegui ler a chave de serviço (${r.status})`); process.exit(1); }
const chaves = await r.json();
const servico = chaves.find((k) => k.name === 'service_role')?.api_key;
const anon = site.VITE_SUPABASE_PUBLISHABLE_KEY || chaves.find((k) => k.name === 'anon')?.api_key;
if (!servico || !anon) { console.error('faltou chave de serviço ou pública'); process.exit(1); }

const env = { ...process.env, SUPABASE_URL: site.VITE_SUPABASE_URL || `https://${ref}.supabase.co`, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: servico,
  ...Object.fromEntries(['GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'TABLOIDE_IA_URL', 'TABLOIDE_IA_SEGREDO', 'STUDIO_SEGREDO'].filter((k) => cofre[k]).map((k) => [k, cofre[k]])),
  PORT: porta, DENO_NO_UPDATE_CHECK: '1' };
console.log(`função ${nome} local em http://127.0.0.1:${porta}/ (banco de produção; nada publicado)`);
const deno = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--no-install', 'deno', 'run', '--node-modules-dir=none', '--allow-net', '--allow-env', '--allow-read', `${nome}/index.ts`],
  { env, stdio: 'inherit', cwd: path.join(RAIZ, 'supabase/functions'), shell: process.platform === 'win32' });
deno.on('exit', (c) => process.exit(c ?? 0));

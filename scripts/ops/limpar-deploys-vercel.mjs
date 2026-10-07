// SOBRE MÍDIA — liberar espaço na Vercel apagando publicações ANTIGAS (F-160). Só roda com uma chave VÁLIDA da Vercel
// (VERCEL_TOKEN em ~/.sobremidia-secrets/tokens.env). Por padrão só MOSTRA o que apagaria; para apagar de verdade:
//   node scripts/ops/limpar-deploys-vercel.mjs --executar
//
// Nunca apaga: a publicação que está no ar em produção, as N mais recentes de produção (padrão 5), nem nada com menos de
// 7 dias. Tudo o mais (prévias antigas, produções antigas) libera o armazenamento das funções.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIAS_MINIMOS = 7;
export const PRODUCOES_RECENTES = 5;

/**
 * @param {Array<{ uid: string, created: number, target?: string | null }>} deploys
 * @param {{ agora?: number, atual?: string | null, manterProducao?: number, dias?: number }} o
 * @returns {{ apagar: string[], manter: string[] }}
 */
export function escolherParaApagar(deploys, { agora = Date.now(), atual = null, manterProducao = PRODUCOES_RECENTES, dias = DIAS_MINIMOS } = {}) {
  const corte = agora - dias * 86_400_000;
  const producoes = deploys.filter((d) => d.target === 'production').sort((a, b) => b.created - a.created);
  const protegidos = new Set(producoes.slice(0, manterProducao).map((d) => d.uid));
  if (atual) protegidos.add(atual);
  const apagar = []; const manter = [];
  for (const d of deploys) (protegidos.has(d.uid) || d.created > corte ? manter : apagar).push(d.uid);
  return { apagar, manter };
}

function lerChave() {
  if (process.env.VERCEL_TOKEN && process.argv.includes('--usar-ambiente')) return process.env.VERCEL_TOKEN;
  try {
    const t = fs.readFileSync(path.join(os.homedir(), '.sobremidia-secrets', 'tokens.env'), 'utf8');
    return /^VERCEL_TOKEN=(.+)$/m.exec(t)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? null;
  } catch { return null; }
}

async function api(chave, caminho, init = {}) {
  const r = await fetch(`https://api.vercel.com${caminho}`, { ...init, headers: { Authorization: `Bearer ${chave}`, ...(init.headers ?? {}) } });
  const corpo = await r.json().catch(() => ({}));
  return { status: r.status, corpo };
}

async function principal() {
  const executar = process.argv.includes('--executar');
  const chave = lerChave();
  if (!chave) { console.error('Sem VERCEL_TOKEN no cofre. Crie uma chave em vercel.com/account/tokens e grave em ~/.sobremidia-secrets/tokens.env.'); process.exit(2); }
  const eu = await api(chave, '/v2/user');
  if (eu.status !== 200) { console.error(`Chave da Vercel recusada (HTTP ${eu.status}). Crie outra e grave no cofre.`); process.exit(2); }

  const projetos = await api(chave, '/v9/projects?limit=100');
  const projeto = (projetos.corpo.projects ?? []).find((p) => /sitesobremidia/i.test(p.name)) ?? (projetos.corpo.projects ?? [])[0];
  if (!projeto) { console.error('Projeto da Vercel não encontrado.'); process.exit(2); }
  const atual = projeto.targets?.production?.id ?? null;

  const deploys = []; let ate = '';
  for (let i = 0; i < 40; i++) {
    const r = await api(chave, `/v6/deployments?projectId=${projeto.id}&limit=100${ate}`);
    for (const d of r.corpo.deployments ?? []) deploys.push({ uid: d.uid, created: d.created, target: d.target ?? null });
    if (!r.corpo.pagination?.next) break;
    ate = `&until=${r.corpo.pagination.next}`;
  }
  const { apagar, manter } = escolherParaApagar(deploys, { atual });
  console.log(`Projeto ${projeto.name}: ${deploys.length} publicações; manter ${manter.length}; ${executar ? 'apagando' : 'APAGARIA'} ${apagar.length}.`);
  if (!executar) { console.log('Nada foi apagado. Para apagar: --executar'); return; }
  let ok = 0;
  for (const uid of apagar) {
    const r = await api(chave, `/v13/deployments/${uid}`, { method: 'DELETE' });
    if (r.status === 200) ok++; else console.warn(`falhou ${uid}: HTTP ${r.status}`);
  }
  console.log(`Apagadas ${ok} de ${apagar.length}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal().catch((e) => { console.error(e.message); process.exit(1); });

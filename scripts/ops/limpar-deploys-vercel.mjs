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

/** Lê VERCEL_TOKEN, VERCEL_TEAM_ID e VERCEL_PROJECT_ID do cofre (nunca imprime a chave). */
function lerCofre() {
  const pegar = (t, k) => new RegExp(`^${k}=(.+)$`, 'm').exec(t)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? null;
  try {
    const t = fs.readFileSync(path.join(os.homedir(), '.sobremidia-secrets', 'tokens.env'), 'utf8');
    return { chave: pegar(t, 'VERCEL_TOKEN'), equipe: pegar(t, 'VERCEL_TEAM_ID'), projeto: pegar(t, 'VERCEL_PROJECT_ID') };
  } catch { return { chave: null, equipe: null, projeto: null }; }
}

async function api(chave, equipe, caminho, init = {}) {
  const sep = caminho.includes('?') ? '&' : '?';
  const r = await fetch(`https://api.vercel.com${caminho}${equipe ? `${sep}teamId=${equipe}` : ''}`, { ...init, headers: { Authorization: `Bearer ${chave}`, ...(init.headers ?? {}) } });
  const corpo = await r.json().catch(() => ({}));
  return { status: r.status, corpo };
}

async function principal() {
  const executar = process.argv.includes('--executar');
  const { chave, equipe, projeto: projetoId } = lerCofre();
  if (!chave) { console.error('Sem VERCEL_TOKEN no cofre. Crie uma chave em vercel.com/account/tokens e grave em ~/.sobremidia-secrets/tokens.env.'); process.exit(2); }
  const eu = await api(chave, null, '/v2/user');
  if (eu.status !== 200) { console.error(`Chave da Vercel recusada (HTTP ${eu.status}). Crie outra e grave no cofre.`); process.exit(2); }

  const pr = await api(chave, equipe, `/v9/projects/${projetoId}`);
  const projeto = pr.corpo;
  if (pr.status !== 200 || !projeto?.id) { console.error(`Projeto da Vercel não encontrado (HTTP ${pr.status}). Confira VERCEL_PROJECT_ID e VERCEL_TEAM_ID no cofre.`); process.exit(2); }
  const atual = projeto.targets?.production?.id ?? null;
  if (!atual) { console.error('Não consegui descobrir a publicação que está no ar; por segurança, nada será apagado.'); process.exit(2); }

  const deploys = []; let ate = '';
  for (let i = 0; i < 60; i++) {
    const r = await api(chave, equipe, `/v6/deployments?projectId=${projeto.id}&limit=100${ate}`);
    for (const d of r.corpo.deployments ?? []) deploys.push({ uid: d.uid, created: d.created, target: d.target ?? null });
    if (!r.corpo.pagination?.next) break;
    ate = `&until=${r.corpo.pagination.next}`;
  }
  const { apagar, manter } = escolherParaApagar(deploys, { atual });
  console.log(`Projeto ${projeto.name}: ${deploys.length} publicações; no ar: ${atual}; manter ${manter.length}; ${executar ? 'apagando' : 'APAGARIA'} ${apagar.length}.`);
  if (!executar) { console.log('Nada foi apagado. Para apagar: --executar'); return; }
  let ok = 0;
  for (const uid of apagar) {
    if (uid === atual) continue; // nunca a que está no ar
    // a API limita a velocidade (HTTP 429): espera e tenta de novo, com pausa curta entre uma e outra
    let r = await api(chave, equipe, `/v13/deployments/${uid}`, { method: 'DELETE' });
    for (let t = 1; r.status === 429 && t <= 6; t++) { await new Promise((f) => setTimeout(f, 1500 * t)); r = await api(chave, equipe, `/v13/deployments/${uid}`, { method: 'DELETE' }); }
    if (r.status === 200) ok++; else console.warn(`falhou ${uid}: HTTP ${r.status}`);
    await new Promise((f) => setTimeout(f, 300));
  }
  console.log(`Apagadas ${ok} de ${apagar.length}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal().catch((e) => { console.error(e.message); process.exit(1); });

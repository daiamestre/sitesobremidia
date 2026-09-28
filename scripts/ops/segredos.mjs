/**
 * Carrega as chaves de ~/.sobremidia-secrets/tokens.env (FORA do repositório) para process.env.
 * Nunca imprime valores. Usado por todos os scripts de scripts/ops/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function carregarSegredos() {
  const arq = path.join(os.homedir(), '.sobremidia-secrets', 'tokens.env');
  if (!fs.existsSync(arq)) throw new Error(`arquivo de segredos não encontrado: ${arq}`);
  for (const linha of fs.readFileSync(arq, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function exigir(...nomes) {
  carregarSegredos();
  const faltam = nomes.filter((n) => !process.env[n]);
  if (faltam.length) throw new Error(`faltam no arquivo de segredos: ${faltam.join(', ')}`);
}

export const REF = () => process.env.SUPABASE_PROJECT_REF ?? 'bhwsybgsyvvhqtkdqozb';
export const R2_PUBLICO = 'https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev/';

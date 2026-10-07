// SOBRE MÍDIA — TRAVA DA VERCEL (F-160). A Vercel executa este arquivo ANTES de cada publicação (vercel.json →
// "ignoreCommand"). Código de saída 0 = NÃO publicar (pula); 1 = publicar.
//
// Por quê: o plano grátis tem 10 GB de "Armazenamento de Funções". Cada publicação guarda de novo as funções pesadas do
// analisador de mídia (ffmpeg + modelos), e a Vercel avisou que já usamos 75%. Publicação só vale a pena quando muda
// o que o site ou as funções realmente usam.
//
// Regras (qualquer dúvida = publica, para nunca deixar o site desatualizado):
//  1. só o ramo "main" publica (os outros ramos geravam "prévias" que também gastam espaço);
//  2. se tudo o que mudou desde a última publicação feita é documentação, teste, Android, banco/Supabase, scripts ou
//     automações, não publica — nada disso entra no site;
//  3. sem como comparar (primeira publicação, histórico indisponível) = publica.
// Para forçar mesmo assim: variável VERCEL_FORCAR_BUILD=1 (publicar) ou VERCEL_PERMITIR_PREVIA=1 (prévia de outro ramo).
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Pastas inteiras que nunca entram no site nem nas funções. */
export const PASTAS_SEM_EFEITO = [
  'docs/', 'native-android-player/', 'android/', 'supabase/', 'scripts/', '.github/', '.agents/', 'brain/', 'audit/',
  'src/tests/', 'tests/', 'e2e/', 'test-results/', 'test-results-me/', 'playwright-report/', 'coverage/', 'screenshots/', 'scratch/',
];

/** Arquivos soltos que nunca entram no site (documentos, anotações, bancos de exemplo, testes ao lado do código). */
const ARQUIVO_SEM_EFEITO = [/\.md$/i, /\.txt$/i, /\.sql$/i, /\.log$/i, /\.test\.(ts|tsx|js|mjs)$/i, /\.spec\.(ts|tsx|js|mjs)$/i];

export function semEfeitoNoSite(arquivo) {
  const a = String(arquivo).replace(/\\/g, '/').replace(/^\.\//, '');
  // o que o navegador e as funções carregam sempre conta (public/robots.txt, api/*.js, qualquer arquivo de src/ que não seja teste)
  if (a.startsWith('public/') || a.startsWith('api/')) return false;
  if (a.startsWith('src/')) return a.startsWith('src/tests/') || /\.(test|spec)\.(ts|tsx|js|mjs)$/i.test(a);
  if (PASTAS_SEM_EFEITO.some((p) => a.startsWith(p))) return true;
  return ARQUIVO_SEM_EFEITO.some((r) => r.test(a));
}

/**
 * @param {{ ref?: string, anterior?: string, arquivos?: string[] | null, forcar?: boolean, permitirPrevia?: boolean }} e
 * @returns {{ construir: boolean, motivo: string }}
 */
export function decidirBuild({ ref, anterior, arquivos, forcar = false, permitirPrevia = false }) {
  if (forcar) return { construir: true, motivo: 'forçado (VERCEL_FORCAR_BUILD)' };
  if (ref && ref !== 'main' && !permitirPrevia) return { construir: false, motivo: `ramo "${ref}": só o ramo main publica (sem prévias, para poupar o armazenamento de funções)` };
  if (!anterior) return { construir: true, motivo: 'sem publicação anterior para comparar' };
  if (!Array.isArray(arquivos)) return { construir: true, motivo: 'não foi possível comparar com a publicação anterior' };
  if (arquivos.length === 0) return { construir: false, motivo: 'nada mudou desde a última publicação' };
  const relevantes = arquivos.filter((a) => !semEfeitoNoSite(a));
  if (relevantes.length === 0) return { construir: false, motivo: `só mudou o que não entra no site (${arquivos.length} arquivo(s): documentação, testes, Android, banco, scripts)` };
  return { construir: true, motivo: `mudou o que entra no site: ${relevantes.slice(0, 5).join(', ')}${relevantes.length > 5 ? ` e mais ${relevantes.length - 5}` : ''}` };
}

function arquivosAlteradosDesde(anterior, atual) {
  try {
    const saida = execFileSync('git', ['diff', '--name-only', anterior, atual], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return saida.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return null; // histórico raso ou commit ausente: na dúvida, publica
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const e = process.env;
  const atual = e.VERCEL_GIT_COMMIT_SHA || 'HEAD';
  const anterior = e.VERCEL_GIT_PREVIOUS_SHA || '';
  const decisao = decidirBuild({
    ref: e.VERCEL_GIT_COMMIT_REF,
    anterior,
    arquivos: anterior ? arquivosAlteradosDesde(anterior, atual) : null,
    forcar: e.VERCEL_FORCAR_BUILD === '1',
    permitirPrevia: e.VERCEL_PERMITIR_PREVIA === '1',
  });
  console.log(`[trava-vercel] ${decisao.construir ? 'PUBLICAR' : 'PULAR'} — ${decisao.motivo}`);
  process.exit(decisao.construir ? 1 : 0);
}

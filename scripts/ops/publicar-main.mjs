// SOBRE MÍDIA — publicar no site com TRAVA de uso da Vercel (F-160).
//   node scripts/ops/publicar-main.mjs          → envia o ramo atual e o main (a Vercel publica a partir do main)
//   node scripts/ops/publicar-main.mjs --ver    → só mostra quantas publicações já houve (não envia nada)
//   node scripts/ops/publicar-main.mjs --forcar → ignora o teto diário (use só para correção urgente)
//
// Por quê: o plano grátis da Vercel tem 10 GB de "Armazenamento de Funções" e cada publicação guarda de novo as funções
// do analisador de mídia. Juntar várias correções num envio só gasta uma vez em vez de várias.
// Conta como "publicação" só o commit que muda algo que entra no site (mesma regra de scripts/vercel-ignore-build.mjs):
// documentação, testes, Android, banco e scripts não publicam e não contam.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { semEfeitoNoSite } from '../vercel-ignore-build.mjs';

/** Teto de publicações por 24 h. O limite da Vercel é 100/dia; o nosso é bem menor por causa do armazenamento de funções. */
export const LIMITE_POR_DIA = 12;
export const AVISO_POR_DIA = 8;

/** Quantos dos commits (cada um com a lista de arquivos) mudam algo que entra no site. */
export function contarPublicacoes(commits) {
  return commits.filter((c) => c.arquivos.some((a) => !semEfeitoNoSite(a))).length;
}

/**
 * @param {{ ultimas24h: number, novas: number, limite?: number, aviso?: number, forcar?: boolean }} e
 * @returns {{ liberar: boolean, nivel: 'ok' | 'aviso' | 'bloqueio', mensagem: string }}
 */
export function avaliarTeto({ ultimas24h, novas, limite = LIMITE_POR_DIA, aviso = AVISO_POR_DIA, forcar = false }) {
  if (novas <= 0) return { liberar: true, nivel: 'ok', mensagem: 'Nada que entre no site neste envio: a Vercel vai pular a publicação (não gasta espaço).' };
  const depois = ultimas24h + 1; // várias mudanças enviadas juntas viram UMA publicação
  if (depois > limite) {
    return forcar
      ? { liberar: true, nivel: 'aviso', mensagem: `Teto de ${limite} publicações em 24 h passou (${depois}), liberado por --forcar.` }
      : { liberar: false, nivel: 'bloqueio', mensagem: `Teto de ${limite} publicações em 24 h atingido (${ultimas24h} já feitas). Junte mais correções e envie depois, ou use --forcar se for urgente.` };
  }
  if (depois > aviso) return { liberar: true, nivel: 'aviso', mensagem: `Atenção: esta será a publicação ${depois} de ${limite} permitidas em 24 h.` };
  return { liberar: true, nivel: 'ok', mensagem: `Publicação ${depois} de ${limite} permitidas em 24 h.` };
}

/**
 * F-350 (pedido do dono: "blinde o sistema de vídeo contra falhas e regressão"): envio que mexe no Studio (vídeo, palco,
 * encartes, efeitos) só sai depois que os testes do vídeo passarem. Falhou = não publica.
 */
export const TESTES_DO_VIDEO = [
  'src/tests/unit/blindagemFundoDoVideo350.test.ts',
  'src/tests/unit/produtoSemFundo351.test.ts',
  'src/tests/unit/videoSemCenaVazia352.test.ts',
  'src/tests/unit/padraoDeVideo353.test.ts',
  'src/tests/unit/logosDePromocao355.test.ts', // F-355: logo do dono publicada idêntica ao arquivo dele
  'src/tests/unit/assistenteDeCriacao306.test.ts',
  'src/tests/unit/videoPassoAPasso349.test.ts',
  'src/tests/unit/videoComImpacto34.test.ts',
  'src/tests/unit/efeitosReais319.test.ts',
  'src/tests/unit/impactoIgualConcorrente320.test.ts',
  'src/tests/unit/studioEditorVideo227.test.ts',
  'src/tests/unit/studioVideosEPalco234.test.ts',
  'src/tests/unit/regraBaloesCentralizados.test.ts',
  'src/tests/unit/studioEdicaoCompleta249.test.ts',
];
export const mexeNoStudio = (arquivos) => arquivos.some((a) => /^(src\/lib\/studio\/|src\/components\/studio\/|src\/pages\/studioai\/|public\/studio\/|index\.html$)/.test(a));

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });

function commitsComArquivos(intervalo, extra = []) {
  const hashes = git('log', ...extra, '--format=%H', intervalo).split('\n').filter(Boolean);
  return hashes.map((h) => ({ hash: h, arquivos: git('show', '--name-only', '--format=', h).split('\n').filter(Boolean) }));
}

function principal() {
  const args = new Set(process.argv.slice(2));
  git('fetch', '-q', 'origin', 'main');
  const ultimas24h = contarPublicacoes(commitsComArquivos('origin/main', ['--since=24.hours.ago']));
  const ultimos7d = contarPublicacoes(commitsComArquivos('origin/main', ['--since=7.days.ago']));
  const pendentes = commitsComArquivos('origin/main..HEAD');
  const novas = contarPublicacoes(pendentes);
  const teto = avaliarTeto({ ultimas24h, novas, forcar: args.has('--forcar') });

  console.log(`Publicações que mudaram o site: ${ultimas24h} nas últimas 24 h, ${ultimos7d} nos últimos 7 dias.`);
  console.log(`Neste envio: ${pendentes.length} commit(s), ${novas} com mudança que entra no site.`);
  console.log(teto.mensagem);
  if (args.has('--ver')) return;
  if (!teto.liberar) process.exit(1);

  if (mexeNoStudio(pendentes.flatMap((c) => c.arquivos))) {
    console.log('Este envio mexe no Studio: rodando a blindagem do vídeo antes de publicar…');
    try {
      execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', 'run', ...TESTES_DO_VIDEO], { stdio: 'inherit', shell: process.platform === 'win32' });
    } catch {
      console.error('BLOQUEADO: a blindagem do vídeo falhou. Nada foi publicado. Corrija e envie de novo.');
      process.exit(1);
    }
  }

  const ramo = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  git('push', '-q', 'origin', ramo);
  git('push', '-q', 'origin', `${ramo}:main`);
  console.log(`Enviado: ${ramo} e main. ${novas > 0 ? 'Confira em ~5 min com: node scripts/ops/conferir-site.mjs "texto novo"' : 'Sem mudança no site: nada será publicado.'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();

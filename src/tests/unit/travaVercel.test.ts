/**
 * F-160 — Trava dos limites do plano grátis da Vercel (Armazenamento de Funções: 10 GB; a Vercel avisou 75%).
 * Cada publicação guarda de novo as funções do analisador de mídia; por isso só publica quando muda algo que o site usa.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PASTAS_SEM_EFEITO, decidirBuild, semEfeitoNoSite } from '../../../scripts/vercel-ignore-build.mjs';
import { AVISO_POR_DIA, LIMITE_POR_DIA, avaliarTeto, contarPublicacoes } from '../../../scripts/ops/publicar-main.mjs';
import { escolherParaApagar } from '../../../scripts/ops/limpar-deploys-vercel.mjs';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('o que conta como mudança do site', () => {
  it('documentação, testes, Android, banco, scripts e automações NÃO entram no site', () => {
    for (const a of ['docs/engineering/FINDINGS_LEDGER.md', 'README.md', 'CLAUDE.md', 'native-android-player/app/src/main/java/A.kt', 'supabase/migrations/20261308_x.sql',
      'supabase/functions/analisar-midia/index.ts', 'scripts/ops/sql.mjs', '.github/workflows/ci.yml', 'src/tests/unit/a.test.ts', 'src/lib/x.test.ts', 'query.sql', 'vitest_full.log', 'notas.txt']) {
      expect(semEfeitoNoSite(a), a).toBe(true);
    }
  });

  it('tudo o que o navegador ou as funções carregam entra no site (nunca deixa o site desatualizado)', () => {
    for (const a of ['src/pages/Index.tsx', 'src/components/x.tsx', 'src/lib/layoutZonas.ts', 'src/index.css', 'public/robots.txt', 'public/geo/brasil-ufs.json', 'public/logo-3d.png',
      'api/analise-visao.js', 'api/_midia.js', 'index.html', 'package.json', 'package-lock.json', 'vercel.json', 'vite.config.ts', 'tailwind.config.ts', 'postcss.config.js',
      'tsconfig.app.json', '.vercelignore', '.env.production', 'src/notes.md']) {
      expect(semEfeitoNoSite(a), a).toBe(false);
    }
    expect(semEfeitoNoSite('.\\docs\\x.md')).toBe(true); // separador do Windows
  });

  it('as pastas "sem efeito" nunca incluem o que o site usa', () => {
    for (const p of PASTAS_SEM_EFEITO) expect(['src/', 'public/', 'api/']).not.toContain(p);
  });
});

describe('decisão de publicar ou pular', () => {
  const ant = 'a'.repeat(40);
  it('só o main publica; outros ramos não geram prévia (a menos que se peça)', () => {
    expect(decidirBuild({ ref: 'release/player-5.2.4', anterior: ant, arquivos: ['src/a.ts'] }).construir).toBe(false);
    expect(decidirBuild({ ref: 'release/player-5.2.4', anterior: ant, arquivos: ['src/a.ts'], permitirPrevia: true }).construir).toBe(true);
    expect(decidirBuild({ ref: 'main', anterior: ant, arquivos: ['src/a.ts'] }).construir).toBe(true);
  });
  it('main com só documentação/Android/banco/testes pula; com qualquer arquivo do site publica', () => {
    const so = decidirBuild({ ref: 'main', anterior: ant, arquivos: ['docs/a.md', 'native-android-player/x.kt', 'supabase/migrations/1.sql', 'src/tests/a.test.ts'] });
    expect(so.construir).toBe(false);
    expect(so.motivo).toContain('não entra no site');
    const misto = decidirBuild({ ref: 'main', anterior: ant, arquivos: ['docs/a.md', 'src/pages/Index.tsx'] });
    expect(misto.construir).toBe(true);
    expect(misto.motivo).toContain('src/pages/Index.tsx');
    expect(decidirBuild({ ref: 'main', anterior: ant, arquivos: [] }).construir).toBe(false);
  });
  it('na dúvida (sem anterior, sem como comparar, forçado) publica', () => {
    expect(decidirBuild({ ref: 'main', anterior: '', arquivos: null }).construir).toBe(true);
    expect(decidirBuild({ ref: 'main', anterior: ant, arquivos: null }).construir).toBe(true);
    expect(decidirBuild({ ref: 'main', anterior: ant, arquivos: ['docs/a.md'], forcar: true }).construir).toBe(true);
  });
  it('a Vercel está ligada à trava', () => {
    const v = JSON.parse(ler('vercel.json'));
    expect(v.ignoreCommand).toBe('node scripts/vercel-ignore-build.mjs');
    expect(v.functions['api/analise-visao.js']).toBeTruthy(); // as funções continuam como estavam
  });
});

describe('teto de publicações por dia', () => {
  it('conta só commits que mudam o site', () => {
    expect(contarPublicacoes([{ arquivos: ['docs/a.md'] }, { arquivos: ['src/a.ts', 'docs/b.md'] }, { arquivos: ['supabase/x.sql'] }, { arquivos: ['api/a.js'] }])).toBe(2);
  });
  it('libera, avisa perto do teto, bloqueia no teto e aceita --forcar', () => {
    expect(avaliarTeto({ ultimas24h: 2, novas: 1 })).toMatchObject({ liberar: true, nivel: 'ok' });
    expect(avaliarTeto({ ultimas24h: AVISO_POR_DIA, novas: 1 })).toMatchObject({ liberar: true, nivel: 'aviso' });
    expect(avaliarTeto({ ultimas24h: LIMITE_POR_DIA, novas: 1 })).toMatchObject({ liberar: false, nivel: 'bloqueio' });
    expect(avaliarTeto({ ultimas24h: LIMITE_POR_DIA, novas: 1, forcar: true })).toMatchObject({ liberar: true, nivel: 'aviso' });
    expect(avaliarTeto({ ultimas24h: LIMITE_POR_DIA + 5, novas: 0 })).toMatchObject({ liberar: true, nivel: 'ok' }); // nada do site: não gasta
    expect(LIMITE_POR_DIA).toBeLessThan(100); // o limite da Vercel é 100 por dia
  });
});

describe('limpeza de publicações antigas', () => {
  const dia = 86_400_000; const agora = 1_800_000_000_000;
  const d = (uid: string, idade: number, target: string | null) => ({ uid, created: agora - idade * dia, target });
  it('nunca apaga a que está no ar, as mais recentes de produção nem nada com menos de 7 dias', () => {
    const lista = [d('atual-antiga', 90, 'production'), ...Array.from({ length: 8 }, (_, i) => d(`p${i}`, 10 + i, 'production')), d('previa-velha', 30, null), d('previa-nova', 2, null)];
    const { apagar, manter } = escolherParaApagar(lista, { agora, atual: 'atual-antiga' });
    expect(manter).toContain('atual-antiga');
    expect(manter).toContain('previa-nova');
    for (const k of ['p0', 'p1', 'p2', 'p3', 'p4']) expect(manter).toContain(k);
    expect(apagar.sort()).toEqual(['p5', 'p6', 'p7', 'previa-velha']);
  });
  it('é só simulação sem --executar', () => {
    const src = ler('scripts/ops/limpar-deploys-vercel.mjs');
    expect(src).toContain("const executar = process.argv.includes('--executar');");
    expect(src).toContain("if (!executar) { console.log('Nada foi apagado.");
  });
});

describe('proteções que impedem o espaço de crescer sem querer', () => {
  it('só as 4 funções conhecidas existem em api/ (função nova gasta espaço em TODA publicação: mude aqui de propósito)', () => {
    expect(readdirSync('api').sort()).toEqual(['_midia.js', 'analise-audio.js', 'analise-visao.js', 'cobranca-og.js']);
  });
  it('nenhum arquivo de public/ passa de 2 MB (cada visita baixa; vídeo e APK não ficam na Vercel)', () => {
    const grandes: string[] = [];
    const varrer = (dir: string) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); const s = statSync(p); if (s.isDirectory()) varrer(p); else if (s.size > 2 * 1024 * 1024) grandes.push(`${p} (${(s.size / 1048576).toFixed(1)} MB)`); } };
    varrer('public');
    expect(grandes).toEqual([]);
    expect(readdirSync('public').filter((f) => /\.(apk|aab|mp4|mov|zip)$/i.test(f))).toEqual([]);
  });
  it('o build da Vercel continua podando binários de outros sistemas das funções', () => {
    expect(ler('package.json')).toContain('"vercel-build": "node scripts/ops/podar-analisadores.mjs && vite build"');
  });
  it('as funções da Vercel só aceitam quem tem o segredo (nenhum acesso público gasta invocações)', () => {
    expect(ler('api/_midia.js')).toContain('timingSafeEqual');
    for (const f of ['api/analise-visao.js', 'api/analise-audio.js']) expect(ler(f)).toContain('if (!autorizado(req))');
  });
});

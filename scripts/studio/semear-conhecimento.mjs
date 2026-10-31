// SOBRE MÍDIA CREATIVE CORE — semente da memória criativa GLOBAL (MG-STUDIO-02).
// Lê o DNA e a taxonomia do Git (supabase/functions/_shared/studio/core/*.ts) e grava em studio_conhecimento, escopo
// global, como VERSÃO NOVA só quando o conteúdo mudou (impressão md5). A versão anterior fica guardada e inativa.
//   node scripts/studio/semear-conhecimento.mjs            → gera o SQL e aplica (scripts/ops/sql.mjs)
//   node scripts/studio/semear-conhecimento.mjs --sql      → só imprime o SQL (para ensaio/revisão)
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const RAIZ = resolve(import.meta.dirname, '../..');
const dna = await import(pathToFileURL(join(RAIZ, 'supabase/functions/_shared/studio/core/dna.ts')).href);
const { SEGMENTOS_DE_FABRICA } = await import(pathToFileURL(join(RAIZ, 'supabase/functions/_shared/studio/core/segmentos.ts')).href);

const linhas = [
  { tipo: 'dna', chave: 'dna', conteudo: { versao: dna.VERSAO_DNA, base: dna.BASE, identidade: dna.IDENTIDADE_DO_STUDIO, autoridade: dna.AUTORIDADE, proibido: dna.PROIBIDO, principios: dna.PRINCIPIOS } },
  { tipo: 'manual', chave: 'direcao-de-arte', conteudo: { versao: dna.VERSAO_DNA, ...dna.MANUAL, portoes_de_qualidade: dna.PORTOES_DE_QUALIDADE } },
  { tipo: 'regra', chave: 'modalidades', conteudo: { versao: dna.VERSAO_DNA, regras: dna.REGRAS, roteiros: dna.ROTEIROS, formatos: dna.FORMATOS_IMAGEM } },
  ...SEGMENTOS_DE_FABRICA.map((s) => ({ tipo: 'segmento', chave: s.id, conteudo: s })),
];

const q = (t) => `'${String(t).replace(/'/g, "''")}'`;
const md5 = (o) => createHash('md5').update(JSON.stringify(o)).digest('hex');
const motivo = `semente do Git ${dna.VERSAO_DNA} (aprovada pelo dono em 31/10/2026: MG-STUDIO-02)`;

export function sqlDaSemente() {
  return linhas.map(({ tipo, chave, conteudo }) => {
    const json = q(JSON.stringify(conteudo));
    const imp = md5(conteudo);
    return `with atual as (select versao, impressao from public.studio_conhecimento where escopo = 'global' and tipo = ${q(tipo)} and chave = ${q(chave)} and ativo),
  desliga as (update public.studio_conhecimento set ativo = false where escopo = 'global' and tipo = ${q(tipo)} and chave = ${q(chave)} and ativo
                and not exists (select 1 from atual where impressao = ${q(imp)}) returning 1)
insert into public.studio_conhecimento (escopo, tipo, chave, versao, conteudo, impressao, ativo, motivo)
select 'global', ${q(tipo)}, ${q(chave)}, coalesce((select max(versao) from public.studio_conhecimento where escopo = 'global' and tipo = ${q(tipo)} and chave = ${q(chave)}), 0) + 1,
       ${json}::jsonb, ${q(imp)}, true, ${q(motivo)}
 where not exists (select 1 from atual where impressao = ${q(imp)});`;
  }).join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sql = sqlDaSemente();
  if (process.argv.includes('--sql')) { process.stdout.write(sql); process.exit(0); }
  const arq = join(tmpdir(), `semente-conhecimento-${Date.now()}.sql`);
  writeFileSync(arq, sql);
  console.log(execFileSync('node', [join(RAIZ, 'scripts/ops/sql.mjs'), `@${arq}`], { encoding: 'utf8' }).trim().slice(0, 400));
  console.log(`semente: ${linhas.length} conhecimentos (${dna.VERSAO_DNA}) — só os que mudaram ganharam versão nova`);
}

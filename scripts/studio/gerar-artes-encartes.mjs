/**
 * F-231 — cria a ARTE DA FAIXA dos encartes de mercado do Studio (src/lib/tabloide/encartes.ts).
 * 1) Os agentes do SOBRE MÍDIA CREATIVE CORE planejam cada arte (segmento, direção de arte, prompt FLUX e conferência de
 *    qualidade: sem texto, logo ou preço). Só segue o plano APROVADO.
 * 2) A imagem sai da IA da Cloudflare da SOBRE MÍDIA (Worker sobremidia-tabloide-ia): Leonardo Lucid Origin em
 *    1536 × 512 (faixa larga) e, se ele falhar, FLUX schnell (quadrado recortado na faixa).
 * 3) Cota do dia acabou → para e o encarte continua com a faixa nas cores do tema; o robô (studio-fotos.yml) tenta de
 *    novo a cada 3 h. Não há outra IA de imagem grátis que preste (Gemini sem cota de imagem; Pollinations com marca
 *    d'água e letras falsas): a 2ª opção é a faixa desenhada pelo próprio sistema, sem IA.
 * Salva public/studio/encartes/<id>.webp (1536 × 512) e atualiza src/lib/tabloide/encartes-artes.ts.
 *   node scripts/studio/gerar-artes-encartes.mjs [--max 12] [--refazer id]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { register } from 'node:module';
import sharp from 'sharp';
import { carregarSegredos, exigir } from '../ops/segredos.mjs';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (e) { if (spec.startsWith('.') && !/\\.[mc]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx); throw e; }
}`));
const { ENCARTES } = await import('../../src/lib/tabloide/encartes.ts');
const { planejarComCore } = await import('../../supabase/functions/_shared/studio/core/core.ts');

try { carregarSegredos(); } catch { /* sem cofre (GitHub): usa as variáveis de ambiente */ }
const PELO_WORKER = !!(process.env.TABLOIDE_IA_URL && process.env.TABLOIDE_IA_SEGREDO);
if (!PELO_WORKER) exigir('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN');
const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : p; };
const MAX = Number(arg('--max', 99));
const REFAZER = arg('--refazer', null);
const PASTA = 'public/studio/encartes';
const LARG = 1536, ALT = 512;

async function rodar(modelo, entrada) {
  if (PELO_WORKER) {
    const w = await fetch(process.env.TABLOIDE_IA_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-segredo': process.env.TABLOIDE_IA_SEGREDO },
      body: JSON.stringify({ acao: 'studio-modelo', modelo, entrada }), signal: AbortSignal.timeout(150_000) });
    const j = await w.json().catch(() => ({}));
    if (j?.image) return Buffer.from(j.image, 'base64');
    if (w.status === 429 || /neuron|quota|allocation|4006/i.test(JSON.stringify(j))) throw Object.assign(new Error('cota'), { cota: true });
    throw new Error(`${w.status} ${JSON.stringify(j).slice(0, 200)}`);
  }
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${modelo}`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(entrada), signal: AbortSignal.timeout(150_000),
  });
  const ct = r.headers.get('content-type') ?? '';
  if (r.ok && ct.startsWith('image/')) return Buffer.from(await r.arrayBuffer());
  const j = await r.json().catch(() => ({}));
  if (j?.result?.image) return Buffer.from(j.result.image, 'base64');
  const msg = JSON.stringify(j?.errors ?? j).slice(0, 200);
  if (r.status === 429 || /neuron|quota|allocation|limit|4006/i.test(msg)) throw Object.assign(new Error('cota'), { cota: true });
  throw new Error(`${r.status} ${msg}`);
}

/** Faixa larga: Lucid Origin já no tamanho; se falhar, FLUX quadrado recortado no meio. */
async function gerarFaixa(prompt) {
  try {
    return await sharp(await rodar('@cf/leonardo/lucid-origin', { prompt, width: LARG, height: ALT, steps: 20 })).resize(LARG, ALT, { fit: 'cover' }).webp({ quality: 84 }).toBuffer();
  } catch (e) {
    if (e.cota) throw e;
    console.log('  lucid-origin falhou, vai o FLUX:', e.message);
    return await sharp(await rodar('@cf/black-forest-labs/flux-1-schnell', { prompt, steps: 8 })).resize(LARG, ALT, { fit: 'cover', position: 'centre' }).webp({ quality: 84 }).toBuffer();
  }
}

fs.mkdirSync(PASTA, { recursive: true });
const faltam = ENCARTES.filter((e) => e.id === REFAZER || !fs.existsSync(path.join(PASTA, e.id + '.webp')));
console.log(`encartes: ${ENCARTES.length}; artes faltando: ${faltam.length}`);
let feitas = 0, parouPorCota = false;
const planos = [];
for (const e of faltam.slice(0, MAX)) {
  // os agentes do Creative Core planejam a arte (segmento, direção, prompt FLUX) e conferem a qualidade
  const plano = await planejarComCore({ texto: `Arte de fundo da faixa do topo de um encarte de ${e.segmento === 'acougue' ? 'açougue' : e.segmento === 'hortifruti' ? 'hortifruti' : 'supermercado'}: ${e.titulo.toLowerCase()} — ${e.frase}`, tipo: 'imagem', formato: '16:9', dica_segmento: e.segmento === 'mercado' ? 'varejo' : 'alimentacao' }, { disponiveis: new Set(['cloudflare-flux', 'interno']) });
  const aprovado = plano.qualidade?.aprovado !== false;
  const direcao = plano.direcao?.ambiente_en || '';
  const prompt = `${e.arte}${direcao ? `. Art direction: ${direcao}` : ''}. ${plano.prompts?.flux ? 'Style: ' + String(plano.prompts.flux).split('.').slice(-3).join('.').slice(0, 220) : ''}`.replace(/\s+/g, ' ').trim();
  planos.push({ id: e.id, segmento: plano.segmento?.nome, modo: plano.roteamento?.modo, qualidade: aprovado ? 'APROVADO' : 'REPROVADO', erros: plano.qualidade?.erros ?? [] });
  if (!aprovado) { console.log('REPROVADO pelo Core', e.id, plano.qualidade?.erros); continue; }
  try {
    const webp = await gerarFaixa(prompt);
    fs.writeFileSync(path.join(PASTA, e.id + '.webp'), webp);
    feitas++; console.log('ok', e.id, `(${plano.segmento?.nome}; ${plano.roteamento?.modo})`);
  } catch (err) {
    if (err.cota) { parouPorCota = true; console.log('COTA da Cloudflare acabou — o encarte segue com a faixa nas cores do tema; o robô tenta de novo em 3 h'); break; }
    console.log('FALHOU', e.id, err.message);
  }
}
fs.mkdirSync('docs/studio/creative-core', { recursive: true });
if (planos.length) fs.writeFileSync('docs/studio/creative-core/encartes-planos.json', JSON.stringify(planos, null, 1)); // o que os agentes do Core decidiram em cada arte
const prontas = ENCARTES.filter((e) => fs.existsSync(path.join(PASTA, e.id + '.webp'))).map((e) => {
  const buf = fs.readFileSync(path.join(PASTA, e.id + '.webp'));
  return `  '${e.id}': { largura: ${LARG}, altura: ${ALT}, v: '${crypto.createHash('md5').update(buf).digest('hex').slice(0, 8)}' },`;
});
fs.writeFileSync('src/lib/tabloide/encartes-artes.ts', `// Gerado por scripts/studio/gerar-artes-encartes.mjs: artes da faixa dos encartes que já existem em public/studio/encartes.
// Encarte sem arte pronta usa a faixa nas cores do tema (funciona igual).
export const ARTES_PRONTAS: Record<string, { largura: number; altura: number; v: string }> = {
${prontas.join('\n')}
};
`);
console.log(`artes geradas agora: ${feitas}; prontas: ${prontas.length}/${ENCARTES.length}${parouPorCota ? ' (parou pela cota)' : ''}`);
process.exitCode = prontas.length === ENCARTES.length ? 0 : 3;

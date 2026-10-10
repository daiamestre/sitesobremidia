/**
 * Cadastra uma logo do CABEÇALHO do Tabloide Digital no catálogo (F-178). Serve para a primeira logo e para as próximas 10:
 *   node scripts/ops/cadastrar-logo-cabecalho.mjs <arquivo.png> <identificador> "<Nome de exibição>" [--ordem N] [--ver]
 *   exemplo: node scripts/ops/cadastrar-logo-cabecalho.mjs ofertas-da-semana.png logo-ofertas-da-semana "Ofertas da Semana" --ordem 1
 * O que faz: confere que é PNG com transparência de verdade (canto 100% transparente + área vazia + área opaca), gera uma
 * miniatura leve só para a galeria (o arquivo original NUNCA é alterado), grava os dois no R2 (bucket público de mídias) e registra
 * a logo no catálogo (tabela tabloide_selos, tipo LOGO_CABECALHO) de todas as empresas. Rodar de novo com o mesmo identificador
 * troca o arquivo e sobe a versão. --ver só confere e mostra, sem gravar. Chaves: arquivo de segredos; nunca imprime valores.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { exigir, REF, R2_PUBLICO } from './segredos.mjs';

exigir('SUPABASE_ACCESS_TOKEN', 'CF_R2_ACCESS_KEY_ID', 'CF_R2_SECRET_ACCESS_KEY', 'CF_R2_S3_ENDPOINT');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--') || a === '--ver');
const flag = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const VER = process.argv.includes('--ver');
const [arquivo, slug, nome] = args.filter((a) => a !== '--ver' && a !== flag('--ordem'));
if (!arquivo || !slug || !nome) { console.error('uso: cadastrar-logo-cabecalho.mjs <arquivo.png> <identificador> "<Nome>" [--ordem N] [--ver]'); process.exit(2); }
if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) { console.error('o identificador só pode ter letras minúsculas, números e hífen (ex.: logo-ofertas-da-semana)'); process.exit(2); }
const ORDEM = Number(flag('--ordem') ?? 0) || 0;
const EMPRESAS = (process.env.TABLOIDE_EMPRESAS ?? '7d62aaec-e24d-4273-b257-867183cf658c,22345678-1234-1234-1234-123456789012').split(',');
const BUCKET = process.env.TABLOIDE_R2_BUCKET ?? 'sobremidia-storage';

// ---------- 1) o arquivo é mesmo um PNG transparente? ----------
const original = fs.readFileSync(arquivo);
if (original.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') { console.error('não é um PNG.'); process.exit(1); }
if (original.length > 12 * 1024 * 1024) { console.error('arquivo maior que 12 MB.'); process.exit(1); }
const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
let vazio = 0; let opaco = 0;
for (let i = 3; i < data.length; i += 4) { if (data[i] < 8) vazio++; else if (data[i] >= 250) opaco++; }
const bloco = Math.max(2, Math.min(12, Math.floor(Math.min(w, h) / 8)));
const canto = (x0, y0) => { for (let y = y0; y < y0 + bloco; y++) for (let x = x0; x < x0 + bloco; x++) if (data[(y * w + x) * 4 + 3] >= 8) return false; return true; };
const cantosLivres = canto(0, 0) && canto(w - bloco, 0) && canto(0, h - bloco) && canto(w - bloco, h - bloco);
const transparente = cantosLivres && vazio / (w * h) >= 0.01 && opaco / (w * h) >= 0.1;
console.log(`arquivo: ${path.basename(arquivo)} · ${w}×${h} · ${(original.length / 1024).toFixed(0)} KB`);
console.log(`transparência: cantos livres=${cantosLivres} · vazio=${(100 * vazio / (w * h)).toFixed(1)}% · opaco=${(100 * opaco / (w * h)).toFixed(1)}% → ${transparente ? 'VÁLIDA' : 'NÃO VALIDADA'}`);
if (!transparente) { console.error('Esta imagem não tem fundo transparente de verdade (o quadriculado pode fazer parte da imagem). Cadastro cancelado.'); process.exit(1); }

const miniatura = await sharp(original).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
const mi = await sharp(miniatura).metadata();
console.log(`miniatura da galeria: ${mi.width}×${mi.height} · ${(miniatura.length / 1024).toFixed(0)} KB`);
if (VER) { console.log('(--ver: nada foi gravado)'); process.exit(0); }

// ---------- 2) envia para o R2 (S3, assinatura v4) ----------
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const host = new URL(process.env.CF_R2_S3_ENDPOINT).host;
async function enviar(chave, corpo, tipo) {
  const agora = new Date();
  const amz = agora.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dia = amz.slice(0, 8);
  const hashCorpo = sha(corpo);
  const cabecalhos = { 'content-type': tipo, host, 'x-amz-content-sha256': hashCorpo, 'x-amz-date': amz };
  const nomes = Object.keys(cabecalhos).sort();
  const canonico = ['PUT', `/${BUCKET}/${chave}`, '', nomes.map((n) => `${n}:${cabecalhos[n]}\n`).join(''), nomes.join(';'), hashCorpo].join('\n');
  const escopo = `${dia}/auto/s3/aws4_request`;
  const aAssinar = ['AWS4-HMAC-SHA256', amz, escopo, sha(canonico)].join('\n');
  const chaveAss = hmac(hmac(hmac(hmac(`AWS4${process.env.CF_R2_SECRET_ACCESS_KEY}`, dia), 'auto'), 's3'), 'aws4_request');
  const assinatura = crypto.createHmac('sha256', chaveAss).update(aAssinar).digest('hex');
  const r = await fetch(`https://${host}/${BUCKET}/${chave}`, {
    method: 'PUT',
    headers: { 'Content-Type': tipo, 'x-amz-content-sha256': hashCorpo, 'x-amz-date': amz, 'Cache-Control': 'public, max-age=31536000, immutable',
      Authorization: `AWS4-HMAC-SHA256 Credential=${process.env.CF_R2_ACCESS_KEY_ID}/${escopo}, SignedHeaders=${nomes.join(';')}, Signature=${assinatura}` },
    body: corpo,
  });
  if (!r.ok) throw new Error(`falha ao enviar ${chave}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  return `${R2_PUBLICO}${chave}`;
}

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF()}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`banco: HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};
const esc = (s) => String(s).replace(/'/g, "''");

const existente = await sql(`select coalesce(max(versao), 0) v from tabloide_selos where slug = '${esc(slug)}' and tipo = 'LOGO_CABECALHO'`);
const versao = Number(existente?.[0]?.v ?? 0) + 1;
const marca = sha(original).slice(0, 10);
const urlOriginal = await enviar(`tabloide-logos/${slug}-v${versao}-${marca}.png`, original, 'image/png');
const urlMini = await enviar(`tabloide-logos/${slug}-v${versao}-${marca}-mini.png`, miniatura, 'image/png');
for (const [alvo, tam] of [[urlOriginal, original.length], [urlMini, miniatura.length]]) {
  const r = await fetch(alvo, { headers: { Origin: 'https://sitesobremidia.vercel.app' } });
  const bytes = (await r.arrayBuffer()).byteLength;
  console.log(`no ar: ${alvo.split('/').slice(-1)[0]} → HTTP ${r.status} · ${bytes === tam ? 'bytes idênticos' : `DIFERENTE (${bytes} ≠ ${tam})`} · CORS=${r.headers.get('access-control-allow-origin')}`);
  if (!r.ok || bytes !== tam) throw new Error('o arquivo gravado não confere com o original');
}

// ---------- 3) registra no catálogo das empresas ----------
const origem = 'Arquivo fornecido pelo proprietário da SOBRE MÍDIA (logo do cabeçalho)';
const licenca = 'Fornecida pelo proprietário; os direitos de uso não são verificados pelo sistema.';
for (const empresa of EMPRESAS) {
  await sql(`update tabloide_selos set nome='${esc(nome)}', titulo='${esc(nome)}', imagem_url='${esc(urlOriginal)}', miniatura_url='${esc(urlMini)}', largura=${w}, altura=${h}, transparente=true, versao=${versao}, estado='APROVADO', origem='${esc(origem)}', licenca='${esc(licenca)}', ordem=${ORDEM}, updated_at=now()
    where empresa_operadora_id='${empresa}' and cliente_id is null and dono_id is null and slug='${esc(slug)}' and tipo='LOGO_CABECALHO'`);
  await sql(`insert into tabloide_selos (empresa_operadora_id, cliente_id, slug, nome, categoria, titulo, imagem_url, miniatura_url, mime, largura, altura, transparente, versao, estado, origem, licenca, tipo, ordem)
    select '${empresa}', null, '${esc(slug)}', '${esc(nome)}', 'Logo do Cabeçalho', '${esc(nome)}', '${esc(urlOriginal)}', '${esc(urlMini)}', 'image/png', ${w}, ${h}, true, ${versao}, 'APROVADO', '${esc(origem)}', '${esc(licenca)}', 'LOGO_CABECALHO', ${ORDEM}
    where not exists (select 1 from tabloide_selos where empresa_operadora_id='${empresa}' and cliente_id is null and slug='${esc(slug)}')`);
}
const total = await sql(`select empresa_operadora_id e, count(*) n from tabloide_selos where tipo='LOGO_CABECALHO' and cliente_id is null and dono_id is null group by 1 order by 1`);
console.log(`cadastrada: "${nome}" (${slug}) versão ${versao}. Logos do cabeçalho por empresa:`, total.map((t) => `${t.e.slice(0, 8)}…=${t.n}`).join(' · '));

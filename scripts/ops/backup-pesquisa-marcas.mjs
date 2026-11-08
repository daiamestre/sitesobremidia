// F-264 (MG-AUT-09a, R-2) — CÓPIA DA PESQUISA DE MARCAS para o R2 PRIVADO (bucket `sobremidia-assets`: sem r2.dev e
// sem domínio). Nada é apagado nem movido na origem. Segredos lidos do cofre (~/.sobremidia-secrets/tokens.env).
//   node scripts/ops/backup-pesquisa-marcas.mjs inventario   → lista todos os arquivos com tamanho, SHA-256 e MD5
//   node scripts/ops/backup-pesquisa-marcas.mjs enviar       → envia só o que falta (retoma após falha), 8 por vez
//   … enviar --somente-dados / verificar --somente-dados → só listas e índices (sem imagens; cabe na cota grátis)
//   node scripts/ops/backup-pesquisa-marcas.mjs verificar    → compara origem × destino (quantidade, tamanho, MD5/ETag
//                                                              e SHA-256 gravado no metadado) e grava o relatório
// Origem: ../marcas e ../marcas-v2 (ao lado do repositório). Destino: s3://sobremidia-assets/backups/pesquisa-marcas/<pasta>/<caminho>
// Inventário e relatório ficam em ../backup-pesquisa-marcas/ (fora do Git: contêm nomes de arquivos de terceiros) e
// também são enviados ao destino (`_inventario.jsonl`, `_verificacao.json`).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const ACIMA = path.resolve(RAIZ, '..');
const PASTAS = ['marcas', 'marcas-v2'];
const BUCKET = 'sobremidia-assets';
const PREFIXO = 'backups/pesquisa-marcas/';
const SAIDA = path.join(ACIMA, 'backup-pesquisa-marcas');
const INVENTARIO = path.join(SAIDA, 'inventario.jsonl');
const RELATORIO = path.join(SAIDA, 'verificacao.json');

const require = createRequire(path.join(RAIZ, 'package.json'));
for (const l of fs.readFileSync(path.join(os.homedir(), '.sobremidia-secrets/tokens.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
for (const k of ['CF_R2_ACCESS_KEY_ID', 'CF_R2_SECRET_ACCESS_KEY', 'CF_R2_S3_ENDPOINT']) {
  if (!process.env[k]) { console.error(`Falta ${k} no cofre — cópia BLOQUEADA (nada foi enviado).`); process.exit(2); }
}
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
// requestChecksumCalculation WHEN_REQUIRED: o SDK novo junta um CRC32 automático ao Content-MD5 e o R2 recusa os dois
// juntos. Fica só o MD5 (o R2 rejeita o arquivo se o corpo chegar diferente).
const s3 = new S3Client({ region: 'auto', endpoint: process.env.CF_R2_S3_ENDPOINT, maxAttempts: 5,
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: { accessKeyId: process.env.CF_R2_ACCESS_KEY_ID, secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY } });

const TIPOS = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json',
  '.jsonl': 'application/x-ndjson', '.txt': 'text/plain', '.log': 'text/plain', '.csv': 'text/csv', '.html': 'text/html', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

function* arquivos(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* arquivos(p);
    else if (e.isFile()) yield p;
  }
}
const chaveDe = (abs) => PREFIXO + path.relative(ACIMA, abs).split(path.sep).join('/');

async function inventario() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const linhas = [];
  let bytes = 0;
  for (const pasta of PASTAS) {
    const base = path.join(ACIMA, pasta);
    if (!fs.existsSync(base)) { console.error(`Origem ausente: ${base}`); process.exit(2); }
    for (const abs of arquivos(base)) {
      const corpo = fs.readFileSync(abs);
      linhas.push({ chave: chaveDe(abs), tamanho: corpo.length,
        sha256: crypto.createHash('sha256').update(corpo).digest('hex'), md5: crypto.createHash('md5').update(corpo).digest('hex') });
      bytes += corpo.length;
      if (linhas.length % 2000 === 0) console.log(`  ${linhas.length} arquivos lidos…`);
    }
  }
  fs.writeFileSync(INVENTARIO, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const por = Object.fromEntries(PASTAS.map((p) => [p, linhas.filter((l) => l.chave.startsWith(PREFIXO + p + '/')).length]));
  const imagens = linhas.filter((l) => /\.(jpe?g|png|webp|gif)$/i.test(l.chave)).length;
  console.log(`INVENTÁRIO: ${linhas.length} arquivos (${imagens} imagens), ${(bytes / 1e9).toFixed(2)} GB — ${JSON.stringify(por)}`);
  console.log(`gravado em ${INVENTARIO}`);
  return linhas;
}

async function listarDestino() {
  const mapa = new Map();
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIXO, ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of r.Contents ?? []) mapa.set(o.Key, { tamanho: o.Size, etag: String(o.ETag ?? '').replace(/"/g, '') });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return mapa;
}

// --somente-dados: só listas, índices e relatórios (sem imagens) — cabe na cota grátis do R2 (F-264)
const SO_DADOS = process.argv.includes('--somente-dados');
const eImagem = (k) => /\.(jpe?g|png|webp|gif)$/i.test(k);
const lerInventario = () => {
  if (!fs.existsSync(INVENTARIO)) { console.error('Rode antes: inventario'); process.exit(2); }
  const todos = fs.readFileSync(INVENTARIO, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return SO_DADOS ? todos.filter((l) => !eImagem(l.chave)) : todos;
};

async function enviar() {
  const lista = lerInventario();
  const destino = await listarDestino();
  const faltam = lista.filter((l) => { const d = destino.get(l.chave); return !d || d.tamanho !== l.tamanho || d.etag !== l.md5; });
  console.log(`destino já tem ${lista.length - faltam.length}; enviando ${faltam.length}…`);
  let feitos = 0, falhas = 0;
  const erros = [];
  const fila = [...faltam];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let item = fila.shift(); item; item = fila.shift()) {
      const abs = path.join(ACIMA, item.chave.slice(PREFIXO.length));
      try {
        const corpo = fs.readFileSync(abs);
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: item.chave, Body: corpo, ContentMD5: Buffer.from(item.md5, 'hex').toString('base64'),
          ContentType: TIPOS[path.extname(abs).toLowerCase()] ?? 'application/octet-stream', Metadata: { sha256: item.sha256 } }));
        feitos++;
      } catch (e) { falhas++; erros.push({ chave: item.chave, erro: String(e?.message ?? e).slice(0, 200) }); }
      if ((feitos + falhas) % 500 === 0) console.log(`  ${feitos + falhas}/${faltam.length} (falhas ${falhas})`);
    }
  }));
  const corpoInv = fs.readFileSync(INVENTARIO);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: PREFIXO + '_inventario.jsonl', Body: corpoInv, ContentType: 'application/x-ndjson' }));
  console.log(`ENVIO: ${feitos} enviados, ${falhas} falhas${falhas ? ' — rode "enviar" de novo para retomar' : ''}`);
  if (erros.length) fs.writeFileSync(path.join(SAIDA, 'falhas-envio.json'), JSON.stringify(erros, null, 1));
}

async function verificar() {
  const lista = lerInventario();
  const destino = await listarDestino();
  const ausentes = [], divergentes = [];
  for (const l of lista) {
    const d = destino.get(l.chave);
    if (!d) ausentes.push(l.chave);
    else if (d.tamanho !== l.tamanho || d.etag !== l.md5) divergentes.push({ chave: l.chave, origem: [l.tamanho, l.md5], destino: [d.tamanho, d.etag] });
  }
  const naLista = new Set(lista.map((l) => l.chave));
  const extras = [...destino.keys()].filter((k) => !k.startsWith(PREFIXO + '_') && !naLista.has(k));
  const bytes = lista.reduce((a, l) => a + l.tamanho, 0);
  const relatorio = {
    data: new Date().toISOString(), bucket: BUCKET, prefixo: PREFIXO, privado: 'sem r2.dev e sem domínio (conferido pela API Cloudflare)',
    escopo: SO_DADOS ? 'somente dados (listas, índices, relatórios); imagens BLOQUEADAS por orçamento' : 'tudo', origem: { arquivos: lista.length, bytes }, destino: { arquivos: [...destino.keys()].filter((k) => !k.startsWith(PREFIXO + '_')).length },
    ausentes: ausentes.length, divergentes: divergentes.length, extras: extras.length,
    integridade: 'tamanho + MD5 (ETag do R2) de cada arquivo; SHA-256 de cada arquivo no inventário e no metadado x-amz-meta-sha256',
    resultado: ausentes.length === 0 && divergentes.length === 0 ? 'ÍNTEGRO' : 'INCOMPLETO',
    amostras: { ausentes: ausentes.slice(0, 20), divergentes: divergentes.slice(0, 20) },
  };
  fs.writeFileSync(RELATORIO, JSON.stringify(relatorio, null, 1));
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: PREFIXO + '_verificacao.json', Body: JSON.stringify(relatorio, null, 1), ContentType: 'application/json' }));
  console.log(`VERIFICAÇÃO: origem ${lista.length} · destino ${relatorio.destino.arquivos} · ausentes ${ausentes.length} · divergentes ${divergentes.length} → ${relatorio.resultado}`);
  process.exit(relatorio.resultado === 'ÍNTEGRO' ? 0 : 1);
}

const modo = process.argv[2];
if (modo === 'inventario') await inventario();
else if (modo === 'enviar') await enviar();
else if (modo === 'verificar') await verificar();
else { console.log('uso: node scripts/ops/backup-pesquisa-marcas.mjs inventario|enviar|verificar'); process.exit(1); }

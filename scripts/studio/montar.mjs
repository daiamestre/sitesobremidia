/**
 * SOBRE MÍDIA Studio — montagem no GitHub Actions (.github/workflows/studio-montar.yml).
 * 1) pede ao orquestrador os dados da produção (segredo STUDIO_SEGREDO);
 * 2) monta e confere com montagem.mjs (mesmo código do ensaio local);
 * 3) envia os arquivos finais ao R2 (tenants/{empresa}/studio/{producao}/final-…);
 * 4) devolve o resultado e o relatório de qualidade ao orquestrador, que aprova ou reprova a produção.
 * Variáveis: SUPABASE_URL, STUDIO_SEGREDO, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, PRODUCAO_ID, CHAVE.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { RESOLUCAO } from '../../supabase/functions/_shared/studio/contrato.ts';
import { montar } from './montagem.mjs';

const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`falta a variável ${k}`); return v; };
const funcao = `${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/studio-orquestrador`;
const chamar = async (corpo) => {
  const r = await fetch(funcao, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-studio-segredo': env('STUDIO_SEGREDO') }, body: JSON.stringify(corpo) });
  const t = await r.text();
  if (!r.ok) throw new Error(`orquestrador ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
};
const base = { producao_id: env('PRODUCAO_ID'), chave: env('CHAVE') };

try {
  const d = await chamar({ acao: 'dados_montagem', ...base });
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
  const video = d.tipo === 'video_montado';
  const res = await montar({ pedido: d.pedido, plano: d.plano, edicoes: d.edicoes, fundos: d.fundos, rotulo: d.rotulo, saida, ffmpeg: process.env.FFMPEG ?? 'ffmpeg', gerarVideo: video });

  const s3 = new S3Client({ region: 'auto', endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') } });
  const enviar = async (arquivo, chave, tipo) => {
    await s3.send(new PutObjectCommand({ Bucket: env('R2_BUCKET'), Key: chave, Body: fs.readFileSync(arquivo), ContentType: tipo, CacheControl: 'public, max-age=31536000, immutable' }));
    return { url: `${d.publico}/${chave}`, path: chave };
  };
  const imagens = [];
  for (const [i, img] of res.imagens.entries()) imagens.push((await enviar(img, `${d.destino_prefixo}-cena-${i + 1}.png`, 'image/png')).url);
  const quadros = [];
  for (const [i, q] of res.quadros.entries()) quadros.push((await enviar(q, `${d.destino_prefixo}-quadro${i + 1}.jpg`, 'image/jpeg')).url);
  const mini = await enviar(res.miniatura, `${d.destino_prefixo}-miniatura.png`, 'image/png');
  const { w, h } = RESOLUCAO[d.pedido.formato];
  const resultado = { imagens, quadros, miniatura_url: mini.url, largura: w, altura: h, qc: res.qc, rotulo: d.rotulo };
  if (video) {
    const v = await enviar(res.video, `${d.destino_prefixo}.mp4`, 'video/mp4');
    Object.assign(resultado, { video_url: v.url, video_path: v.path, tamanho: fs.statSync(res.video).size, duracao: res.qc.video?.duracao ?? null });
  } else {
    // arte única: a cena principal (a primeira com produto) é o arquivo entregue; as demais ficam para download
    const principal = res.imagens.indexOf(res.miniatura);
    const p = await enviar(res.miniatura, `${d.destino_prefixo}-arte.png`, 'image/png');
    Object.assign(resultado, { imagem_url: p.url, imagem_path: p.path, tamanho: fs.statSync(res.miniatura).size, cena_principal: principal + 1 });
  }
  console.log('[studio] qualidade:', res.qc.aprovado ? 'APROVADA' : 'REPROVADA');
  for (const v of res.qc.verificacoes) console.log(`  ${v.ok ? '✔' : '✘'}${v.bloqueia === false ? ' (informativo)' : ''} ${v.nome}: ${v.detalhe}`);
  await chamar({ acao: 'montagem_concluida', ...base, resultado });
} catch (e) {
  console.error('[studio] falhou:', e);
  try { await chamar({ acao: 'montagem_falhou', ...base, erro: String(e?.message ?? e).slice(0, 300) }); } catch { /* o orquestrador marca erro após 40 min */ }
  process.exit(1);
}

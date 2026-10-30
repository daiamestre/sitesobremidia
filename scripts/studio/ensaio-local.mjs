/**
 * SOBRE MÍDIA Studio — ensaio LOCAL de ponta a ponta (evidência dos agentes, imagens, montagem e conferência),
 * com os modelos reais da Cloudflare (cota grátis da conta do dono, chave do cofre local; nada vai para produção).
 *
 *   node scripts/studio/ensaio-local.mjs <pasta-de-saida> [16:9|9:16|1:1]
 *
 * As fotos de produto do ensaio são GERADAS (garrafa e saco de gelo genéricos, sem marca) — nunca usa referências de terceiros.
 */
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { chromium } from 'playwright';
// (OCR pela mesma função da montagem)
import { carregarSegredos } from '../ops/segredos.mjs';
import { executorCloudflare, gerarCenario } from '../../supabase/functions/_shared/studio/provedores.ts';
import { planejarProducao } from '../../supabase/functions/_shared/studio/pipeline.ts';
import { edicaoInicial, ROTULO, validarPedido, formatarPreco } from '../../supabase/functions/_shared/studio/contrato.ts';
import { montar, criarLeitor, conferirPreco, semelhancaDoPreco, SSIM_MINIMO } from './montagem.mjs';

carregarSegredos();
const saida = path.resolve(process.argv[2] ?? 'ensaio-studio');
const formato = process.argv[3] ?? '16:9';
fs.mkdirSync(saida, { recursive: true });
const exec = executorCloudflare({ via: 'rest', accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN });
const dataUrl = (arq, mime = 'image/jpeg') => `data:${mime};base64,${fs.readFileSync(arq).toString('base64')}`;
let neurons = 0;

// 1) fotos de produto do ensaio (genéricas) + recorte com o MESMO código do Cartaz Digital (src/lib/tabloide/recorte.ts)
async function fotoDeEnsaio(nome, prompt) {
  const jpg = path.join(saida, `produto-${nome}.jpg`);
  if (!fs.existsSync(jpg)) { const r = await gerarCenario(exec, prompt); neurons += r.neurons; fs.writeFileSync(jpg, r.bytes); }
  return jpg;
}
async function recortar(arquivos) {
  const js = stripTypeScriptTypes(fs.readFileSync('src/lib/tabloide/recorte.ts', 'utf8'));
  const nav = await chromium.launch(process.env.STUDIO_CHROMIUM ? { executablePath: process.env.STUDIO_CHROMIUM } : {});
  const pg = await nav.newPage();
  await pg.setContent('<html><body></body></html>');
  await pg.addScriptTag({ type: 'module', content: js.replace(/export /g, '') + '\nwindow.recortarImagem = recortarImagem;' });
  await pg.waitForFunction(() => typeof window.recortarImagem === 'function');
  const saidas = [];
  for (const a of arquivos) {
    const png = a.replace(/\.jpg$/, '-recorte.png');
    const b64 = await pg.evaluate(async (u) => { const blob = await window.recortarImagem(u, 900); if (!blob) return null; const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s); }, dataUrl(a));
    if (b64) fs.writeFileSync(png, Buffer.from(b64, 'base64'));
    saidas.push(b64 ? png : null);
    console.log(`[recorte] ${path.basename(a)} → ${b64 ? 'fundo removido' : 'fundo não é liso: usa a foto inteira'}`);
  }
  await nav.close();
  return saidas;
}

const f1 = await fotoDeEnsaio('cerveja', 'Professional studio product photograph of a single generic unbranded amber glass long neck beer bottle with blank label, cold condensation droplets, centered, isolated on a plain pure white background, soft even lighting, sharp focus. No text, no logo, no letters.');
const f2 = await fotoDeEnsaio('gelo', 'Professional studio product photograph of a single generic transparent plastic bag full of ice cubes, blank, centered, isolated on a plain pure white background, soft even lighting, sharp focus. No text, no logo, no letters.');
const [r1, r2] = await recortar([f1, f2]);

const pedido = {
  briefing: {
    titulo: 'Fim de semana gelado', objetivo: 'Divulgar ofertas', categoria: 'Bebidas e adega', segmento: 'Adega',
    estabelecimento: 'Adega Exemplo', marca: null, condicoes: 'Enquanto durarem os estoques', periodo: 'Sexta a domingo',
    texto_publicitario: null, publico: 'Adultos que compram para o fim de semana', tom: 'Impactante',
    ideia: 'Vídeo para a TV da adega chamando para levar cerveja gelada e gelo para o fim de semana, com clima de bar à noite.',
  },
  produtos: [
    { id: 'p1', nome: 'Cerveja long neck 330 ml', marca: null, preco_centavos: 849, preco_promo_centavos: 699, unidade: 'cada', fotos: [{ url: 'https://ensaio.local/p1.jpg', recorte_url: r1 ? 'https://ensaio.local/p1.png' : null, path: 'ensaio/p1.jpg' }] },
    { id: 'p2', nome: 'Gelo em cubos 5 kg', marca: null, preco_centavos: 1290, preco_promo_centavos: null, unidade: 'pacote', fotos: [{ url: 'https://ensaio.local/p2.jpg', recorte_url: r2 ? 'https://ensaio.local/p2.png' : null, path: 'ensaio/p2.jpg' }] },
  ],
  formato, duracao_s: 15, cenas: 4, tipo: 'video_montado',
};
const erros = validarPedido(pedido);
if (erros.length) throw new Error('pedido inválido: ' + erros.join(' '));

// 2) agentes (retomável: memoria.json guarda o que já rodou)
const arqMem = path.join(saida, 'memoria-agentes.json');
const feitas = fs.existsSync(arqMem) ? JSON.parse(fs.readFileSync(arqMem, 'utf8')) : {};
const registros = [];
const local = { 'https://ensaio.local/p1.jpg': f1, 'https://ensaio.local/p2.jpg': f2, 'https://ensaio.local/p1.png': r1, 'https://ensaio.local/p2.png': r2 };
const t0 = Date.now();
const { plano, erros: errosPlano } = await planejarProducao(exec, pedido, {
  feitas,
  imagem: async (u) => (local[u] ? dataUrl(local[u], local[u].endsWith('.png') ? 'image/png' : 'image/jpeg') : null),
  gravar: async (chave, r) => { neurons += r.neurons; registros.push({ chave, agente: r.agente, modelo: r.modelo, versao: r.versao, neurons: r.neurons, tentativas: r.tentativas }); feitas[chave] = r.saida; fs.writeFileSync(arqMem, JSON.stringify(feitas, null, 2)); },
});
console.log(`[agentes] ${registros.length} etapas novas em ${((Date.now() - t0) / 1000).toFixed(1)} s`, registros);
fs.writeFileSync(path.join(saida, 'plano.json'), JSON.stringify(plano, null, 2));
console.log('[plano] erros de validação:', errosPlano.length ? errosPlano : 'nenhum');
if (errosPlano.length) process.exit(1);

// 3) cenários por cena (FLUX, sem produto e sem texto)
const fundos = {};
for (const c of plano.cenas) {
  const arq = path.join(saida, `fundo-${c.numero}.jpg`);
  if (!fs.existsSync(arq)) { const r = await gerarCenario(exec, c.prompt_cenario); neurons += r.neurons; fs.writeFileSync(arq, r.bytes); }
  fundos[c.numero] = dataUrl(arq);
}
// as fotos do produto entram por data URL no ensaio (no Actions são os endereços públicos do R2)
for (const pr of pedido.produtos) for (const f of pr.fotos) { f.url = dataUrl(local[f.url]); if (f.recorte_url) f.recorte_url = dataUrl(local[f.recorte_url], 'image/png'); }

// 4) montagem + conferência
const edicoes = Object.fromEntries(plano.cenas.map((c) => [c.numero, edicaoInicial(c, formato)]));
const t1 = Date.now();
const res = await montar({ pedido, plano, edicoes, fundos, rotulo: `${ROTULO.video_montado} · cenário criado por IA`, saida: path.join(saida, formato.replace(':', 'x')), ffmpeg: ffmpegInstaller.path });
console.log(`[montagem] ${((Date.now() - t1) / 1000).toFixed(1)} s →`, res.video);
console.log('[qualidade]', res.qc.aprovado ? 'APROVADO' : 'REPROVADO');
for (const v of res.qc.verificacoes) console.log(`  ${v.ok ? '✔' : '✘'} ${v.nome}: ${v.detalhe}`);

// 5) prova da reprovação: se o preço GRAVADO fosse outro (ex.: o cliente corrigiu para 19,90 e a tela ainda mostra o antigo),
//    a conferência por pixels e o OCR do mesmo quadro do vídeo têm de reprovar.
const cenaPreco = plano.cenas.find((c) => res.caixas[c.numero]);
if (cenaPreco && res.video) {
  const pasta = path.join(saida, formato.replace(':', 'x'));
  const quadro = path.join(pasta, `ocr-${cenaPreco.numero}.png`);
  const prOriginal = pedido.produtos.find((p) => p.id === cenaPreco.produto_id);
  const gravadoErrado = { ...pedido, produtos: pedido.produtos.map((p) => (p.id === prOriginal.id ? { ...p, preco_centavos: 2490, preco_promo_centavos: 1990 } : p)) };
  const ref = await montar({ pedido: gravadoErrado, plano, edicoes, fundos, rotulo: `${ROTULO.video_montado} · cenário criado por IA`, saida: path.join(pasta, 'referencia-errada'), ffmpeg: ffmpegInstaller.path, gerarVideo: false, log: () => {} });
  const ssim = await semelhancaDoPreco(ffmpegInstaller.path, path.join(pasta, 'referencia-errada', `cena-${cenaPreco.numero}.png`), quadro, ref.caixas[cenaPreco.numero]);
  const ocr = await criarLeitor();
  const errado = formatarPreco(1990);
  const r = await conferirPreco(ocr, ffmpegInstaller.path, quadro, res.caixas[cenaPreco.numero], errado, path.join(pasta, 'ocr-teste'));
  await ocr.terminate();
  const reprovou = ssim < SSIM_MINIMO && !r.ok;
  console.log(`[teste de reprovação] preço gravado 19,90 x tela 6,99 → pixels SSIM ${ssim.toFixed(3)} (mínimo ${SSIM_MINIMO}), OCR leu "${r.inteiro},${r.centavos}": ${reprovou ? 'REPROVADO como esperado' : 'NÃO reprovou (falha do teste!)'}`);
  if (!reprovou) process.exitCode = 1;
}
console.log(`[custo] ≈ ${neurons} neurons (cota grátis diária: 10.000)`);
fs.writeFileSync(path.join(saida, `relatorio-${formato.replace(':', 'x')}.json`), JSON.stringify({ registros, neurons, qc: res.qc }, null, 2));

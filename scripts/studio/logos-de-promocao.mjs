// F-355 — LOGOS DE PROMOÇÃO enviadas pelo dono: entram na galeria de logos do Studio (o "Trocar logo" da criação de vídeo,
// dos palcos e dos encartes) para TODOS os usuários.
// Tira o fundo (qualquer fundo: brilho, degradê, cor) com a IA de recorte BiRefNet_lite 1024 (MIT), a mesma família do
// Removedor de Fundo do site, rodando no PC, sem custo e sem cota. Corta as sobras, grava a logo em alta e a miniatura e
// atualiza a lista em src/lib/studio/logosDePromocao.ts.
// Uso: node scripts/studio/logos-de-promocao.mjs <imagem> <id-em-minusculas> "<Nome da logo>"
//      node scripts/studio/logos-de-promocao.mjs --lista   (só refaz a lista a partir das logos já gravadas)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const RAIZ = process.cwd();
const PASTA = 'public/studio/logos/promocao';
const MANIFESTO = `${PASTA}/lista.json`;
const LISTA_TS = 'src/lib/studio/logosDePromocao.ts';
const ORIGINAIS = path.resolve(RAIZ, '..', 'logos-de-promocao-originais');
fs.mkdirSync(PASTA, { recursive: true });

const lerManifesto = () => (fs.existsSync(MANIFESTO) ? JSON.parse(fs.readFileSync(MANIFESTO, 'utf8')) : []);

function escreverLista(itens) {
  fs.writeFileSync(MANIFESTO, `${JSON.stringify(itens, null, 2)}\n`);
  const linhas = itens.map((l) => `  { id: 'promocao-${l.id}', nome: ${JSON.stringify(l.nome)}, url: '/studio/logos/promocao/${l.id}.webp', miniatura: '/studio/logos/promocao/${l.id}-mini.webp', largura: ${l.largura}, altura: ${l.altura}, oficial: true },`);
  fs.writeFileSync(LISTA_TS, `// F-355 — logos de promoção enviadas pelo dono (as mais novas primeiro). ARQUIVO GERADO por
// scripts/studio/logos-de-promocao.mjs: para pôr uma logo nova, rode o script (não edite à mão).
import type { LogoDaPasta } from './logos';

export const LOGOS_DE_PROMOCAO: LogoDaPasta[] = [
${linhas.join('\n')}
];
`);
}

async function mascaraDaIA(rgb, w, h) {
  const t = await import(pathToFileURL(path.join(RAIZ, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs')).href);
  t.env.cacheDir = path.resolve(RAIZ, '..', 'modelos-ia');
  t.env.allowRemoteModels = false; // só o modelo já guardado no PC
  const MODELO = 'onnx-community/BiRefNet_lite-ONNX';
  const modelo = await t.AutoModel.from_pretrained(MODELO, { dtype: 'fp32' });
  const processador = await t.AutoProcessor.from_pretrained(MODELO);
  const { pixel_values } = await processador(new t.RawImage(new Uint8ClampedArray(rgb), w, h, 3));
  const saida = await modelo({ input_image: pixel_values });
  const m = await t.RawImage.fromTensor((saida.logits ?? saida.output_image)[0].sigmoid().mul(255).to('uint8')).resize(w, h);
  return m.data;
}

async function prepararLogo(arquivo, id, nome) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('id só com letras minúsculas, números e hífen');
  const { data: rgb, info } = await sharp(arquivo).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const mascara = await mascaraDaIA(rgb, W, H);
  // borda suave e limpa: sombra quase invisível some, miolo quase cheio fica cheio
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const m = mascara[i];
    rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = m < 24 ? 0 : m > 232 ? 255 : Math.round(((m - 24) / 208) * 255);
  }
  const png = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const cortado = await sharp(png).trim({ threshold: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const saida = `${PASTA}/${id}.webp`;
  await sharp(cortado).webp({ quality: 92, alphaQuality: 100 }).toFile(saida);
  await sharp(cortado).resize(480, 320, { fit: 'inside' }).webp({ quality: 85, alphaQuality: 90 }).toFile(`${PASTA}/${id}-mini.webp`);
  const m = await sharp(saida).metadata();
  fs.mkdirSync(ORIGINAIS, { recursive: true });
  fs.copyFileSync(arquivo, path.join(ORIGINAIS, `${id}${path.extname(arquivo) || '.png'}`));
  const itens = lerManifesto().filter((l) => l.id !== id);
  itens.unshift({ id, nome, largura: m.width, altura: m.height });
  escreverLista(itens);
  console.log(`ok ${id} ${m.width}x${m.height} alfa=${m.hasAlpha} → ${saida}`);
}

const [a, b, c] = process.argv.slice(2);
if (a === '--lista') escreverLista(lerManifesto());
else if (a && b && c) await prepararLogo(a, b, c);
else { console.error('Uso: node scripts/studio/logos-de-promocao.mjs <imagem> <id> "<Nome>"'); process.exit(1); }

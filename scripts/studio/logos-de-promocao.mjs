// F-355 — LOGOS DE PROMOÇÃO enviadas pelo dono: entram na galeria de logos do Studio (o "Trocar logo" da criação de vídeo,
// dos palcos e dos encartes) para TODOS os usuários.
// REGRA DO DONO (20/11/2026, repetida 3 vezes): a logo entra EXATAMENTE como ele mandou. Nada de recorte, de tirar fundo, de
// mexer em cor ou de cortar, nem por fora nem por dentro, em NENHUMA logo. O arquivo publicado é o mesmo arquivo, byte por byte.
// O nome leva a marca do conteúdo (<id>-<hash>): o aplicativo guarda imagens no aparelho por 30 dias, e um nome novo garante que
// ninguém veja uma versão antiga. A miniatura (só para a lista da galeria) e a lista em src/lib/studio/logosDePromocao.ts são
// geradas aqui.
// EXCEÇÃO PEDIDA PELO DONO (22/11/2026): logo com dizeres de modelo ("YOUR LOGO HERE", "ALPHA BACKGROUND", xadrez pintado)
// publica a versão em que SÓ esses dizeres saíram (scripts/studio/espaco-da-logo.mjs, conferida pixel a pixel no teste);
// as faixas e espaços que o usuário personaliza ficam em scripts/studio/espacos-das-logos.json.
// Uso: node scripts/studio/logos-de-promocao.mjs <imagem> <id-em-minusculas> "<Nome da logo>"
//      node scripts/studio/logos-de-promocao.mjs --lista   (só refaz a lista a partir das logos já gravadas)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { gravarCores, lerCores, medirCores } from './cores-das-logos.mjs';

const RAIZ = process.cwd();
const PASTA = 'public/studio/logos/promocao';
const MANIFESTO = `${PASTA}/lista.json`;
const LISTA_TS = 'src/lib/studio/logosDePromocao.ts';
const ORIGINAIS = path.resolve(RAIZ, '..', 'logos-de-promocao-originais');
fs.mkdirSync(PASTA, { recursive: true });

const ESPACOS = JSON.parse(fs.readFileSync('scripts/studio/espacos-das-logos.json', 'utf8'));
const PASTAS = JSON.parse(fs.readFileSync('scripts/studio/pastas-das-logos.json', 'utf8'));
const pastaDa = (id) => Object.entries(PASTAS).find(([p, ids]) => !p.startsWith('_') && ids.includes(id))?.[0] ?? null;
const lerManifesto = () => (fs.existsSync(MANIFESTO) ? JSON.parse(fs.readFileSync(MANIFESTO, 'utf8')) : []);

function escreverLista(itens) {
  const CORES = lerCores(); // só as genéricas têm cores (pasta "mercado")
  fs.writeFileSync(MANIFESTO, `${JSON.stringify(itens, null, 2)}\n`);
  const espacos = (l) => (ESPACOS[l.id] ? `, espacos: ${JSON.stringify({ ...ESPACOS[l.id], ...(l.vaga ? { vaga: `/studio/logos/promocao/${l.vaga}` } : {}) })}` : '');
  const linhas = itens.map((l) => `  { id: 'promocao-${l.id}', nome: ${JSON.stringify(l.nome)}, url: '/studio/logos/promocao/${l.arquivo}', miniatura: '/studio/logos/promocao/${l.mini}', largura: ${l.largura}, altura: ${l.altura}, oficial: true${pastaDa(l.id) ? `, pasta: '${pastaDa(l.id)}'` : ''}${CORES[l.id] ? `, cores: ${JSON.stringify(CORES[l.id])}` : ''}${espacos(l)} },`);
  fs.writeFileSync(LISTA_TS, `// F-355 — logos de promoção enviadas pelo dono (as mais novas primeiro). ARQUIVO GERADO por
// scripts/studio/logos-de-promocao.mjs: para pôr uma logo nova, rode o script (não edite à mão).
import type { LogoDaPasta } from './logos';

export const LOGOS_DE_PROMOCAO: LogoDaPasta[] = [
${linhas.join('\n')}
];
`);
}

async function porLogo(arquivo, id, nome) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('id só com letras minúsculas, números e hífen');
  const doDono = fs.readFileSync(arquivo);
  fs.mkdirSync(ORIGINAIS, { recursive: true });
  fs.copyFileSync(arquivo, path.join(ORIGINAIS, `${id}${path.extname(arquivo).toLowerCase() || '.png'}`));
  // a versão só sem os dizeres de modelo (feita por espaco-da-logo.mjs a partir DESTE arquivo do dono), quando houver
  const marcaDoDono = crypto.createHash('sha256').update(doDono).digest('hex').slice(0, 8);
  const limpa = path.join(ORIGINAIS, `${id}-limpa-${marcaDoDono}.png`);
  const vagaOrig = path.join(ORIGINAIS, `${id}-vaga-${marcaDoDono}.png`);
  const original = fs.existsSync(limpa) ? fs.readFileSync(limpa) : doDono;
  const marca = crypto.createHash('sha256').update(original).digest('hex').slice(0, 8);
  for (const x of fs.readdirSync(PASTA)) if (new RegExp(`^${id}(-[0-9a-f]{8})?(-mini|-frente|-vaga)?\.`).test(x)) fs.rmSync(`${PASTA}/${x}`);
  const nomeArq = `${id}-${marca}${(path.extname(arquivo) || '.png').toLowerCase()}`;
  const mini = `${id}-${marca}-mini.webp`;
  fs.writeFileSync(`${PASTA}/${nomeArq}`, original); // o MESMO arquivo, sem nenhuma mudança
  const vaga = fs.existsSync(limpa) && fs.existsSync(vagaOrig) ? `${id}-${marca}-vaga.png` : null; // onde a logo do usuário aparece
  if (vaga) fs.copyFileSync(vagaOrig, `${PASTA}/${vaga}`);
  await sharp(original).resize(480, 320, { fit: 'inside' }).webp({ quality: 90, alphaQuality: 100 }).toFile(`${PASTA}/${mini}`);
  const m = await sharp(original).metadata();
  const itens = lerManifesto();
  const lugar = itens.findIndex((l) => l.id === id); // logo que já existe fica no mesmo lugar da galeria
  itens.splice(lugar >= 0 ? lugar : 0, lugar >= 0 ? 1 : 0, { id, nome, arquivo: nomeArq, mini, largura: m.width, altura: m.height, ...(fs.existsSync(limpa) ? { limpa: true } : {}), ...(vaga ? { vaga } : {}) });
  if (pastaDa(id) === 'mercado') { const c = lerCores(); c[id] = await medirCores(`${PASTA}/${nomeArq}`); gravarCores(c); } // genérica: vai também às pastas da cor dela
  escreverLista(itens);
  console.log(`ok ${id} ${m.width}x${m.height} — ${fs.existsSync(limpa) ? "o arquivo do dono só sem os dizeres de modelo" : "o mesmo arquivo que o dono mandou"} → ${PASTA}/${nomeArq}`);
}

const [a, b, c] = process.argv.slice(2);
if (a === '--lista') escreverLista(lerManifesto());
else if (a && b && c) await porLogo(a, b, c);
else { console.error('Uso: node scripts/studio/logos-de-promocao.mjs <imagem> <id> "<Nome>"'); process.exit(1); }

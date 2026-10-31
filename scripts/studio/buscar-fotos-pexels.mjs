/**
 * SOBRE MÍDIA Studio — fotos REAIS (ultra-realistas) das variações SEM PESSOAS, do Pexels (licença gratuita para uso
 * comercial, a mesma fonte do robô de conteúdo). Fotos com pessoas e as de Black Friday continuam pela IA da
 * Cloudflare (gerar-fotos-pastas.mjs), sem pessoas reais. Recorte quadrado 1080×1080 no ponto de interesse.
 *   node scripts/studio/buscar-fotos-pexels.mjs [--refazer foto:indice,foto:indice]
 * Os créditos (fotógrafo e link) ficam em public/studio/fotos/creditos-pexels.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { carregarSegredos, exigir } from '../ops/segredos.mjs';

carregarSegredos();
exigir('PEXELS_API_KEY');
const PASTA = 'public/studio/fotos';
const CREDITOS = path.join(PASTA, 'creditos-pexels.json');

/** foto → busca (em inglês) e, opcional, qual resultado usar (0 = primeiro) */
export const BUSCAS = {
  'mercado-bebidas': 'cold drinks bottles ice bucket', 'mercado-limpeza': 'cleaning products bottles sponges', 'mercado-cesta-basica': 'rice beans pasta groceries',
  'mercado-frios': 'cheese ham charcuterie board', 'mercado-padaria': 'fresh bread rolls basket', 'horti-frutas': 'tropical fruits mango papaya pineapple',
  'horti-verduras': 'fresh lettuce kale broccoli', 'horti-sucos': 'fresh fruit juices glasses', 'horti-organicos': 'fresh vegetables basket farm',
  'horti-feira': 'vegetable market stall', 'acougue-picanha': 'raw beef steak board', 'acougue-costela': 'raw beef ribs',
 'acougue-kit': 'barbecue raw meat sausages', 'acougue-linguica': 'raw sausages wooden board',
  'burger-duplo': 'double cheeseburger bacon', 'burger-combo': 'burger fries meal', 'burger-smash': 'smash burger cheese',
  'burger-frango': 'crispy chicken burger', 'burger-batata': 'loaded fries cheddar bacon', 'pizza-calabresa': 'pepperoni pizza onion wooden board',
  'pizza-doce': 'chocolate strawberry dessert pizza', 'pizza-familia': 'two pizzas table', 'pizza-borda': 'pizza slice cheese pull',
  'pizza-rodizio': 'pizza slices restaurant table', 'cafe-bolos': 'chocolate cake slice coffee', 'cafe-salgados': 'fried savory snacks',
  'cafe-cappuccino': 'cappuccino latte art', 'cafe-festa': 'party table cake sweets', 'cafe-pao-de-queijo': 'cheese bread balls brazilian',
  'odonto-urgencia': 'dental clinic chair', 'barba-produtos': 'beard care products comb scissors', 'oficina-freio': 'car brake disc',
  'oficina-pneus': 'stack of tires', 'lavanderia-edredom': 'white duvet pillows bed', 'lavanderia-ternos': 'suits hanging rack',
  'lavanderia-tenis': 'white sneakers clean', 'lavanderia-delivery': 'folded clothes laundry', 'lavanderia-plano': 'laundromat washing machines',
  'moda-jeans': 'folded jeans stack', 'liquida-calcados': 'shoes store shelves', 'liquida-bolsas': 'leather handbags boutique',
  'liquida-queima': 'clothes on hangers rack', 'liquida-acessorios': 'wristwatch sunglasses leather wallet', 'escola-material': 'school supplies colorful flat lay',
  'imovel-apartamento': 'modern apartment living room city view', 'imovel-aluguel': 'house front door plants', 'imovel-terreno': 'residential neighborhood aerial',
  'imovel-luxo': 'luxury house pool dusk', 'lancamento-studio': 'small studio apartment interior', 'lancamento-lazer': 'rooftop pool building',
  'lancamento-obras': 'building construction crane', 'lancamento-casas': 'modern houses row', 'lancamento-vista': 'balcony ocean view apartment',
  'academia-equipamentos': 'gym interior equipment', 'pet-gato': 'cat towel', 'pet-hotel': 'dogs playing grass',
  'pet-acessorios': 'dog toys collar leash', 'racao-gatos': 'cat eating bowl', 'racao-filhotes': 'puppies bowl',
  'racao-petiscos': 'dog treats biscuits', 'racao-premium': 'golden retriever dog food bowl', 'racao-entrega': 'dog front door box',

  'tec-fones': 'wireless headphones',
};

const indices = {};
const ref = process.argv.indexOf('--refazer');
if (ref > 0) for (const par of process.argv[ref + 1].split(',')) { const [f, i] = par.split(':'); indices[f] = Number(i); }
const creditos = fs.existsSync(CREDITOS) ? JSON.parse(fs.readFileSync(CREDITOS, 'utf8')) : {};

async function buscar(q) {
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=15&size=large`, { headers: { Authorization: process.env.PEXELS_API_KEY } });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  return (await r.json()).photos ?? [];
}

let feitas = 0;
for (const [foto, q] of Object.entries(BUSCAS)) {
  const arq = path.join(PASTA, foto + '.webp');
  if (fs.existsSync(arq) && !(foto in indices)) continue;
  try {
    const fotos = (await buscar(q)).filter((p) => p.width >= 1200 && p.height >= 1080);
    const p = fotos[indices[foto] ?? 0];
    if (!p) { console.log('SEM RESULTADO', foto); continue; }
    const img = Buffer.from(await (await fetch(`${p.src.original}?auto=compress&cs=tinysrgb&w=2000`)).arrayBuffer());
    await sharp(img).resize(1080, 1080, { fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 84 }).toFile(arq);
    creditos[foto] = { fotografo: p.photographer, url: p.url, pexels_id: p.id };
    feitas++; console.log('ok', foto, '←', p.photographer);
  } catch (e) { console.log('FALHOU', foto, e.message); }
}
fs.writeFileSync(CREDITOS, JSON.stringify(creditos, null, 1));
console.log(`baixadas agora: ${feitas}`);

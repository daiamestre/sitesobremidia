/**
 * Preenche o catálogo compartilhado do Tabloide Digital com produtos populares (F-177), para a foto já estar pronta
 * na primeira vez que alguém digitar. Usa só o catálogo aberto Open Food Facts (e irmãos), que traz foto real da embalagem,
 * e só aceita a foto quando o nome, a marca e a medida combinam com o que foi pedido.
 *   node scripts/ops/semear-catalogo-tabloide.mjs --ver      → só mostra o que seria guardado
 *   node scripts/ops/semear-catalogo-tabloide.mjs --gravar   → grava no banco (origem SEMENTE; não troca foto que já existe)
 * Chaves: arquivo de segredos (SUPABASE_ACCESS_TOKEN). Nunca imprime valores.
 */
import { exigir, REF } from './segredos.mjs';
import { chaveCanonica } from '../../src/lib/tabloide/chave.ts';

exigir('SUPABASE_ACCESS_TOKEN');
const GRAVAR = process.argv.includes('--gravar');
// a foto semeada vale para TODAS as empresas já cadastradas (os dados continuam isolados por empresa)
const EMPRESAS = (process.env.TABLOIDE_EMPRESAS ?? '7d62aaec-e24d-4273-b257-867183cf658c,22345678-1234-1234-1234-123456789012').split(',');

const LISTA = `
Arroz Tipo 1 5kg|Arroz Camil 5kg|Arroz Tio João 5kg|Arroz Prato Fino 5kg|Arroz Camil 1kg|Arroz Integral 1kg
Feijão Carioca 1kg|Feijão Carioca Camil 1kg|Feijão Preto 1kg|Feijão Preto Camil 1kg|Feijão Kicaldo 1kg
Açúcar Refinado União 1kg|Açúcar Cristal 5kg|Açúcar Refinado Caravelas 1kg|Açúcar Demerara 1kg
Sal Refinado Cisne 1kg|Sal Grosso 1kg|Óleo de Soja Liza 900ml|Óleo de Soja Soya 900ml|Óleo de Soja Concordia 900ml|Azeite de Oliva Gallo 500ml|Azeite de Oliva Andorinha 500ml
Farinha de Trigo Dona Benta 1kg|Farinha de Trigo Renata 1kg|Farinha de Mandioca 500g|Fubá Mimoso 500g|Farinha de Rosca 500g|Amido de Milho Maizena 200g
Macarrão Espaguete Renata 500g|Macarrão Espaguete Adria 500g|Macarrão Parafuso Renata 500g|Macarrão Penne Adria 500g|Macarrão Instantâneo Nissin Miojo 85g|Lasanha Renata 500g
Molho de Tomate Pomarola 340g|Molho de Tomate Heinz 340g|Extrato de Tomate Elefante 340g|Extrato de Tomate Quero 340g|Ketchup Heinz 397g|Maionese Hellmann's 500g|Mostarda Hemmer 200g
Milho Verde Quero 170g|Ervilha Quero 170g|Sardinha Coqueiro 125g|Atum Gomes da Costa 170g|Atum Coqueiro 170g|Palmito Pupunha|Azeitona Verde Oderich 200g
Café Pilão 500g|Café 3 Corações 500g|Café Melitta 500g|Café Caboclo 500g|Café Santa Clara 500g|Café Solúvel Nescafé 160g
Achocolatado Nescau 400g|Achocolatado Toddy 400g|Chocolate em Pó Nestlé 200g|Leite Condensado Moça 395g|Creme de Leite Nestlé 200g|Leite em Pó Ninho 400g|Leite Integral Italac 1L|Leite Integral Piracanjuba 1L|Leite Integral Parmalat 1L|Leite Integral Itambé 1L
Margarina Qualy 500g|Margarina Doriana 500g|Manteiga Aviação 200g|Requeijão Catupiry 200g|Requeijão Itambé 200g|Cream Cheese Philadelphia 150g|Iogurte Danone 170g|Iogurte Nestlé 170g
Biscoito Recheado Oreo 90g|Biscoito Trakinas 126g|Biscoito Cream Cracker Vitarella 400g|Biscoito Maria Vitarella 400g|Biscoito Maizena Piraquê 200g|Biscoito Passatempo 130g|Bolacha Club Social
Salgadinho Ruffles 96g|Salgadinho Doritos 96g|Salgadinho Cheetos 96g|Batata Pringles 114g|Amendoim Dori 150g|Pipoca Yoki 100g
Chocolate Garoto 90g|Chocolate Lacta Ao Leite 90g|Chocolate Nestlé Classic 90g|Bombom Sonho de Valsa|Bombom Ferrero Rocher|Chocolate Bis Lacta|Kinder Ovo
Coca-Cola 2L|Coca-Cola 350ml|Coca-Cola 600ml|Coca-Cola Zero 2L|Pepsi 2L|Guaraná Antarctica 2L|Guaraná Antarctica 350ml|Fanta Laranja 2L|Sprite 2L|Kuat 2L|Schweppes Citrus 350ml
Água Mineral Crystal 1,5L|Água Mineral Bonafont 1,5L|Água Mineral Indaiá 1,5L|Água de Coco Kero Coco 1L|Suco de Uva Aurora 1,5L|Suco Del Valle Laranja 1L|Suco Tang Laranja|Energético Red Bull 250ml|Gatorade 500ml
Cerveja Skol Lata 350ml|Cerveja Brahma Lata 350ml|Cerveja Antarctica Lata 350ml|Cerveja Heineken Long Neck 330ml|Cerveja Budweiser Long Neck 330ml|Cerveja Itaipava Lata 350ml|Cerveja Amstel Lata 350ml|Cerveja Stella Artois Long Neck 330ml|Cerveja Corona Extra 330ml
Vinho Tinto Casillero del Diablo 750ml|Vinho Tinto Miolo 750ml|Espumante Chandon 750ml|Cachaça 51 965ml|Vodka Smirnoff 998ml|Whisky Johnnie Walker Red Label 1L
Detergente Ypê 500ml|Detergente Limpol 500ml|Detergente Minuano 500ml|Sabão em Pó Omo 1,6kg|Sabão em Pó Ariel 1,6kg|Sabão em Pó Brilhante 1kg|Sabão em Pó Tixan Ypê 1kg|Sabão Líquido Omo 3L
Amaciante Comfort 2L|Amaciante Downy 1L|Amaciante Ypê 2L|Água Sanitária Qboa 2L|Água Sanitária Candida 2L|Desinfetante Pinho Sol 500ml|Desinfetante Veja 500ml|Limpador Multiuso Veja 500ml|Lava Louças Ypê|Esponja de Aço Bombril|Esponja Scotch-Brite|Sabão em Barra Ypê 5 unidades|Cloro Gel Veja 500ml|Limpa Vidros Veja 500ml
Papel Higiênico Neve 12 rolos|Papel Higiênico Personal 12 rolos|Papel Higiênico Scott 12 rolos|Papel Toalha Snob|Guardanapo Snob|Saco de Lixo 100L|Inseticida Baygon 300ml|Inseticida Raid 300ml
Creme Dental Colgate 90g|Creme Dental Oral-B 70g|Creme Dental Sorriso 90g|Escova Dental Colgate|Escova Dental Oral-B|Enxaguante Bucal Listerine 500ml|Fio Dental Colgate
Sabonete Dove 90g|Sabonete Lux 85g|Sabonete Protex 85g|Sabonete Nivea 85g|Sabonete Palmolive 85g|Sabonete Rexona 84g
Shampoo Seda 325ml|Shampoo Pantene 400ml|Shampoo Head & Shoulders 400ml|Shampoo Elseve 400ml|Condicionador Seda 325ml|Condicionador Pantene 400ml|Shampoo Johnson's Baby 200ml|Creme para Pentear Salon Line
Desodorante Rexona Aerosol 150ml|Desodorante Dove Aerosol 150ml|Desodorante Nivea Roll-on 50ml|Desodorante Axe Aerosol 150ml|Creme Hidratante Nivea 200ml|Protetor Solar Nenê FPS 30|Protetor Solar Sundown FPS 30
Absorvente Always|Absorvente Intimus|Fralda Pampers|Fralda Huggies|Lenço Umedecido Huggies|Algodão Cremer|Cotonete Cremer|Barbeador Gillette Prestobarba|Aparelho de Barbear Bic
Dipirona 500mg|Paracetamol 750mg|Ibuprofeno 400mg|Dorflex|Neosaldina|Buscopan|Tylenol 750mg|Cataflam|Vitamina C Cewin|Engov|Sal de Fruta Eno|Estomazil|Dramin|Benegrip
Ração Pedigree Adulto 10kg|Ração Whiskas Adulto 10kg|Ração Golden Adulto 15kg|Ração Premier Pet 15kg|Ração Dog Chow 15kg|Areia Higiênica para Gatos 4kg|Petisco Pedigree Dentastix
Pilha Duracell AA|Pilha Rayovac AA|Lâmpada LED Philips 9W|Fósforo Fiat Lux|Isqueiro Bic|Vela Branca|Carvão Vegetal 3kg|Álcool 70% 1L|Álcool Gel 500ml|Máscara Descartável
Presunto Sadia 200g|Mortadela Sadia 200g|Salsicha Sadia 500g|Linguiça Toscana Sadia 500g|Hambúrguer Sadia 672g|Nuggets Sadia 300g|Peito de Frango Sadia 1kg|Frango Inteiro Sadia 2,4kg|Pizza Sadia Calabresa|Lasanha Sadia Bolonhesa
Queijo Mussarela Fatiado 200g|Queijo Prato Fatiado 200g|Queijo Parmesão Ralado Qualy 50g|Ovos Brancos 12 unidades|Ovos Vermelhos 12 unidades|Pão de Forma Wickbold 500g|Pão de Forma Pullman 500g|Pão de Forma Seven Boys 500g|Bisnaguinha Pullman 300g
Sorvete Kibon 1,5L|Sorvete Nestlé 1,5L|Picolé Kibon|Gelatina Royal|Pudim Royal|Maisena Fácil|Gelatina Sol|Fermento Royal 100g|Tempero Sazón|Caldo Knorr Galinha|Caldo Maggi Carne|Tempero Arisco|Tempero Kitano Alho 50g|Tempero Pimenta do Reino 50g
`;

const nomes = [...new Set(LISTA.split(/\n|\|/).map((s) => s.trim()).filter(Boolean))];
const UA = { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)' };
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const texto = (v) => (Array.isArray(v) ? v.join(' ') : String(v ?? ''));

function medidas(termo) {
  return [...norm(termo).replace(/(\d),(\d)/g, '$1.$2').matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|l|lt|mg)\b/g)].map((m) => m[1] + (m[2] === 'lt' ? 'l' : m[2] === 'gr' ? 'g' : m[2]));
}
function palavras(termo) {
  return norm(termo).replace(/(\d),(\d)/g, '$1.$2').replace(/\b\d+(\.\d+)?\s*(kg|g|gr|ml|l|lt|un|und|mg)\b/g, ' ').replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter((p) => p.length >= 2 && !/^\d+$/.test(p) && !['com', 'sem', 'para', 'por', 'dos', 'das', 'tipo', 'de', 'da', 'do', 'em'].includes(p));
}
/** Mesma ideia da função produto-imagem: a 1ª palavra manda, as outras e a medida somam; e TUDO que foi pedido precisa aparecer no nome+marca. */
function nota(p, termo, ps, ms) {
  const nomeProduto = norm(texto(p.product_name)).replace(/[^a-z0-9.,\s]/g, ' ').replace(/(\d)\s+(kg|g|ml|l)\b/g, '$1$2').replace(/,/g, '.');
  const completo = `${nomeProduto} ${norm(texto(p.brands)).replace(/[^a-z0-9\s]/g, ' ')}`;
  const pal = nomeProduto.split(/\s+/).filter(Boolean);
  const todas = completo.split(/\s+/).filter(Boolean);
  if (!ps.every((w) => todas.includes(w))) return 0;
  for (const m of ms) if (!new RegExp(`(^|[^0-9.])${m.replace('.', '\\.')}($|[^a-z0-9])`).test(nomeProduto)) return 0;
  let s = 1 + ps.length;
  const pos = pal.indexOf(ps[0]);
  if (pos === 0) s += 4; else if (pos === 1) s += 2; else if (pos < 0) s -= 1;
  if (pal.length > 9) s -= 1;
  return s;
}

async function buscar(nome) {
  const q = `${nome} countries_tags:"en:brazil"`;
  for (const base of ['https://search.openfoodfacts.org/search?q=' + encodeURIComponent(q) + '&page_size=30&langs=pt&fields=product_name,brands,image_front_url,image_front_small_url,code']) {
    for (let t = 0; t < 2; t++) {
      const r = await fetch(base, { headers: UA, signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (r?.ok) { const j = await r.json().catch(() => null); if (j?.hits) return j.hits; }
      await new Promise((ok) => setTimeout(ok, 800));
    }
  }
  return [];
}

const achados = [];
const sem = [];
for (const nome of nomes) {
  const ps = palavras(nome);
  const ms = medidas(nome);
  const hits = await buscar(nome);
  const melhor = hits
    .filter((h) => h.image_front_url)
    .map((h) => ({ h, n: nota(h, nome, ps, ms) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)[0];
  if (!melhor || melhor.n < 4) { sem.push(nome); continue; }
  achados.push({ nome, chave: chaveCanonica(nome), url: melhor.h.image_front_url, legenda: `${texto(melhor.h.product_name)} | ${texto(melhor.h.brands)}`.slice(0, 70) });
  await new Promise((ok) => setTimeout(ok, 120));
}

console.log(`pedidos: ${nomes.length} | com foto real confirmada: ${achados.length} | sem correspondência segura: ${sem.length}`);
for (const a of achados.slice(0, 12)) console.log('  ', a.nome, '→', a.legenda);
console.log('sem foto (amostra):', sem.slice(0, 25).join(' · '));

if (GRAVAR) {
  const esc = (s) => String(s).replace(/'/g, "''");
  const vistos = new Set();
  const linhas = achados.filter((a) => (vistos.has(a.chave) ? false : vistos.add(a.chave) && a.chave.length >= 2 && a.url.startsWith('https://')))
    .flatMap((a) => EMPRESAS.map((e) => `('${e}', NULL, '${esc(a.chave)}', '${esc(a.nome)}', '${esc(a.url)}', 'OPENFOODFACTS', 'Open Food Facts (CC BY-SA)', false, false, 'SEMENTE')`));
  const base = `https://api.supabase.com/v1/projects/${REF()}/database/query`;
  for (let i = 0; i < linhas.length; i += 60) {
    const sql = `INSERT INTO public.tabloide_catalogo (empresa_operadora_id, cliente_id, nome_norm, nome, imagem_url, fonte, credito, recortada, recorte_tentado, origem) VALUES ${linhas.slice(i, i + 60).join(',')} ON CONFLICT DO NOTHING`;
    const r = await fetch(base, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) });
    if (!r.ok) { console.log('erro ao gravar lote', i, r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  }
  console.log(`gravados (ou já existentes): ${linhas.length}`);
}

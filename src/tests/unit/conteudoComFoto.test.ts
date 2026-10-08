/**
 * F-163 — Piadas, charadas, memes, curiosidades, nostalgia e datas comemorativas ganham a FOTO que combina com o texto
 * (como as notícias), com o crédito do autor na arte. Fonte: Pexels e Pixabay (uso comercial gratuito), guardada em cache no R2.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CacheDeFotos, FOTOS_POR_TERMO, VALIDADE_DIAS, buscarFoto, candidatosPexels, candidatosPixabay, chaveDoCache, creditoDaFoto, escolher,
} from '../../../scripts/conteudo/fotos.mjs';
import { cartaoData, cartaoLegenda, cartaoPainel, tamanhoDoTexto } from '../../../scripts/conteudo/arte-foto.mjs';
import { produzirTextos, POR_PERIODO } from '../../../scripts/conteudo/produtores/textos.mjs';
import { FOTO_DA_DATA, datasDoAno, produzirDatas } from '../../../scripts/conteudo/produtores/datas.mjs';
import { CHARADAS, PIADAS, MEMES, CURIOSIDADES, NOSTALGIA } from '../../../scripts/conteudo/bancos.mjs';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const pexels = (n: number, w = 4000, h = 3000) => ({ photos: Array.from({ length: n }, (_, i) => ({
  id: 100 + i, width: w, height: h, photographer: `Autor ${i}`, url: `https://www.pexels.com/photo/${100 + i}/`, src: { original: `https://images.pexels.com/photos/${100 + i}/pexels-photo-${100 + i}.jpeg` } })) });
const pixabay = (n: number, w = 1280, h = 853) => ({ hits: Array.from({ length: n }, (_, i) => ({
  id: 900 + i, imageWidth: w, imageHeight: h, user: `Pix ${i}`, pageURL: `https://pixabay.com/photos/${900 + i}/`, largeImageURL: `https://pixabay.com/get/g${900 + i}_1280.jpg` })) });

describe('candidatos das fontes', () => {
  it('Pexels: só na orientação pedida, no endereço do Pexels e no tamanho certo da arte', () => {
    const h = candidatosPexels(pexels(3), 'landscape');
    expect(h).toHaveLength(3);
    expect(h[0]).toMatchObject({ id: 'pexels-100', autor: 'Autor 0', fonte: 'Pexels' });
    expect(h[0].url).toBe('https://images.pexels.com/photos/100/pexels-photo-100.jpeg?auto=compress&cs=tinysrgb&w=1920');
    expect(candidatosPexels(pexels(2, 3000, 4000), 'portrait')[0].url).toContain('&h=1920');
    expect(candidatosPexels(pexels(3), 'portrait')).toHaveLength(0); // foto deitada não serve para tela em pé
  });
  it('Pexels: endereço de outro site ou resposta torta é ignorado', () => {
    const j = pexels(2); j.photos[0].src.original = 'http://evil.example/x.jpg';
    expect(candidatosPexels(j, 'landscape').map((c: { id: string }) => c.id)).toEqual(['pexels-101']);
    for (const lixo of [null, undefined, {}, { photos: 'x' }]) expect(candidatosPexels(lixo as never, 'landscape')).toEqual([]);
  });
  it('Pixabay: orientação e crédito', () => {
    expect(candidatosPixabay(pixabay(2), 'landscape')[0]).toMatchObject({ id: 'pixabay-900', autor: 'Pix 0', fonte: 'Pixabay' });
    expect(candidatosPixabay(pixabay(2), 'portrait')).toHaveLength(0);
    expect(candidatosPixabay(pixabay(2, 853, 1280), 'portrait')).toHaveLength(2);
  });
  it('crédito no mesmo estilo das notícias', () => {
    expect(creditoDaFoto({ autor: 'Maria', fonte: 'Pexels' })).toBe('Foto: Maria · Pexels');
    expect(creditoDaFoto(null)).toBe('');
  });
  it('escolha estável: o mesmo item cai sempre na mesma foto; itens diferentes se espalham', () => {
    const lista = candidatosPexels(pexels(6), 'landscape');
    expect(escolher(lista, 'item-a')).toBe(escolher(lista, 'item-a'));
    const usadas = new Set(Array.from({ length: 40 }, (_, i) => escolher(lista, `item-${i}`).id));
    expect(usadas.size).toBeGreaterThan(3);
    expect(escolher([], 'x')).toBeNull();
  });
});

describe('cache de fotos por termo', () => {
  const foto = { id: 'pexels-1', url: 'https://images.pexels.com/photos/1/a.jpeg', autor: 'A', pagina: 'https://p', fonte: 'Pexels' };
  it('guarda uma lista por termo e orientação e vale por 60 dias', () => {
    let agora = Date.parse('2026-10-08T12:00:00Z');
    const c = new CacheDeFotos({}, () => agora);
    expect(c.obter('Garlic  Cloves', 'landscape')).toBeNull();
    c.guardar('garlic cloves', 'landscape', [foto]);
    expect(c.sujo).toBe(true);
    expect(c.obter(' GARLIC cloves', 'landscape')).toEqual([foto]); // termo normalizado
    expect(c.obter('garlic cloves', 'portrait')).toBeNull();
    agora += (VALIDADE_DIAS - 1) * 86400e3;
    expect(c.obter('garlic cloves', 'landscape')).toEqual([foto]);
    agora += 2 * 86400e3;
    expect(c.obter('garlic cloves', 'landscape')).toBeNull(); // venceu: busca de novo
    expect(chaveDoCache('A  b', 'portrait')).toBe('a b|v');
  });
  it('lê do arquivo do R2 e ignora arquivo estragado', () => {
    const c = new CacheDeFotos();
    c.guardar('dog', 'landscape', [foto]);
    expect(CacheDeFotos.de(c.json()).obter('dog', 'landscape')).toEqual([foto]);
    for (const lixo of ['', '{quebrado', '[]', 'null', '"x"']) expect(CacheDeFotos.de(lixo).obter('dog', 'landscape')).toBeNull();
    const ruim = new CacheDeFotos({ 'dog|h': { fotos: [{ id: 'x' }], quando: new Date().toISOString() } });
    expect(ruim.obter('dog', 'landscape')).toBeNull(); // foto sem endereço não vale
  });
});

describe('buscarFoto: cache → Pexels → Pixabay, sem gastar a cota à toa', () => {
  const abre = vi.fn(async () => true);
  it('1ª vez busca e guarda até 6 verificadas; as próximas vezes não chamam a fonte', async () => {
    const pedirJson = vi.fn(async (url: string) => (url.includes('pexels') ? pexels(12) : pixabay(5)));
    const cache = new CacheDeFotos();
    const f1 = await buscarFoto({ pexels: 'k', pixabay: 'k' }, cache, 'dog', 'landscape', 'item-1', { pedirJson, abre });
    expect(f1).toBeTruthy();
    expect(pedirJson).toHaveBeenCalledTimes(2);
    expect(cache.obter('dog', 'landscape')).toHaveLength(FOTOS_POR_TERMO);
    const f2 = await buscarFoto({ pexels: 'k', pixabay: 'k' }, cache, 'dog', 'landscape', 'item-2', { pedirJson, abre });
    expect(f2).toBeTruthy();
    expect(pedirJson).toHaveBeenCalledTimes(2); // nada novo na fonte
    expect((await buscarFoto({ pexels: 'k' }, cache, 'dog', 'landscape', 'item-1', { pedirJson, abre }))!.id).toBe(f1!.id); // estável
  });
  it('foto que não abre é pulada; sem nenhuma que abra, devolve null (a arte usa o degradê)', async () => {
    const pedirJson = async () => pexels(4);
    const quebrada = vi.fn(async (u: string) => !u.includes('/100/'));
    const lista = await buscarFoto({ pexels: 'k' }, new CacheDeFotos(), 'x', 'landscape', 's', { pedirJson, abre: quebrada });
    expect(lista).toBeTruthy();
    const c = new CacheDeFotos();
    await buscarFoto({ pexels: 'k' }, c, 'x', 'landscape', 's', { pedirJson, abre: quebrada });
    expect(c.obter('x', 'landscape')!.map((f: { id: string }) => f.id)).not.toContain('pexels-100');
    expect(await buscarFoto({ pexels: 'k' }, new CacheDeFotos(), 'y', 'landscape', 's', { pedirJson, abre: async () => false })).toBeNull();
    expect(await buscarFoto({ pexels: 'k' }, new CacheDeFotos(), 'y', 'landscape', 's', { pedirJson: async () => null, abre })).toBeNull();
  });
  it('sem nenhuma chave de foto não chama nada', async () => {
    const pedirJson = vi.fn();
    expect(await buscarFoto({}, new CacheDeFotos(), 'dog', 'landscape', 's', { pedirJson, abre })).toBeNull();
    expect(pedirJson).not.toHaveBeenCalled();
  });
  it('Pixabay entra quando o Pexels não tem foto', async () => {
    const pedirJson = async (u: string) => (u.includes('pexels') ? { photos: [] } : pixabay(3));
    const f = await buscarFoto({ pexels: 'k', pixabay: 'k' }, new CacheDeFotos(), 'rare', 'landscape', 's', { pedirJson, abre });
    expect(f!.fonte).toBe('Pixabay');
  });
});

describe('as artes', () => {
  const foto = { id: 'pexels-7', url: 'https://images.pexels.com/photos/7/a.jpeg?auto=compress&cs=tinysrgb&w=1920', autor: 'Ana <b>', pagina: 'https://p', fonte: 'Pexels' };
  it('painel (piada/nostalgia): foto em tela cheia, texto e crédito protegido contra HTML', () => {
    const h = cartaoPainel({ selo: 'HUMOR', fundo: '#000', rotulo: 'PIADINHA DO DIA', principal: 'Pergunta <script>?', secundario: 'Resposta', foto }, 1920, 1080);
    expect(h).toContain('<img class="foto-fundo" src="https://images.pexels.com/photos/7/a.jpeg?auto=compress&amp;cs=tinysrgb&amp;w=1920"');
    expect(h).toContain('Foto: Ana &lt;b&gt; · Pexels');
    expect(h).toContain('Pergunta &lt;script&gt;?');
    expect(h).not.toContain('<script>');
  });
  it('pergunta da charada: foto desfocada (não entrega a resposta); resposta: foto nítida', () => {
    const p = cartaoPainel({ selo: 'CHARADA', fundo: '#000', rotulo: 'O QUE É, O QUE É?', principal: 'Pista', foto, desfoque: true, meio: true }, 1080, 1920);
    const r = cartaoPainel({ selo: 'CHARADA', fundo: '#000', rotulo: 'RESPOSTA', principal: 'Pista', secundario: 'A resposta', foto }, 1080, 1920);
    expect(p).toContain('filter:blur(26px)');
    expect(p).toContain('class="interro"');
    expect(r).not.toContain('filter:blur(26px)');
  });
  it('sem foto a arte continua inteira, no degradê, sem imagem e sem crédito', () => {
    for (const html of [
      cartaoPainel({ selo: 'HUMOR', fundo: 'linear-gradient(red,blue)', principal: 'Texto', secundario: 'x', foto: null }, 1920, 1080),
      cartaoLegenda({ selo: 'MEMES', fundo: 'linear-gradient(red,blue)', principal: 'Texto', foto: null }, 1080, 1920),
      cartaoData({ dia: 5, mes: 'abril', semana: 'domingo', nome: 'Páscoa', mensagem: 'Feliz', ehHoje: false, fundo: 'red', foto: null }, 1920, 1080),
    ]) {
      expect(html).not.toContain('<img');
      expect(html).not.toContain('Foto:');
      expect(html).toContain('linear-gradient(red,blue)'.slice(0, 8) === 'linear-g' ? 'SOBRE MÍDIA' : '');
    }
  });
  it('legenda (meme/curiosidade) e data com foto e crédito', () => {
    expect(cartaoLegenda({ selo: 'MEMES', fundo: '#000', principal: 'Quando…', foto }, 1920, 1080)).toContain('Foto: Ana &lt;b&gt; · Pexels');
    const d = cartaoData({ dia: 25, mes: 'dezembro', semana: 'sexta-feira', nome: 'Natal', mensagem: 'Feliz Natal!', ehHoje: true, fundo: '#000', foto }, 1080, 1920);
    expect(d).toContain('É HOJE!');
    expect(d).toContain('Foto: Ana &lt;b&gt; · Pexels');
    expect(d).toContain('DATAS COMEMORATIVAS');
  });
  it('o texto encolhe conforme o tamanho para sempre caber', () => {
    expect(tamanhoDoTexto('curto', false)).toBeGreaterThan(tamanhoDoTexto('x'.repeat(120), false));
    expect(tamanhoDoTexto('x'.repeat(140), true, 'legenda')).toBeLessThan(tamanhoDoTexto('x'.repeat(60), true, 'legenda'));
  });
});

describe('produtores com foto', () => {
  const ctxFalso = (termos: string[]) => {
    const cache = new CacheDeFotos();
    const pedirJson = async (u: string) => { termos.push(decodeURIComponent((/query=([^&]+)/.exec(u) ?? /q=([^&]+)/.exec(u))![1])); return u.includes('pexels') ? (u.includes('orientation=portrait') ? pexels(8, 3000, 4000) : pexels(8)) : { hits: [] }; };
    return { chaves: { pexels: 'k' }, cache, opcoes: { pedirJson, abre: async () => true } };
  };
  it('cada item pede a foto do SEU termo e as duas orientações usam fotos do formato certo', async () => {
    const termos: string[] = [];
    const t = await produzirTextos(ctxFalso(termos), 321);
    const todos = [...t.charadas, ...t.humor, ...t.memes, ...t.curiosidades, ...t.nostalgia];
    expect(t.charadas).toHaveLength(POR_PERIODO.charadas * 2);
    const termoDe = new Set(todos.map((i: { foto: string }) => i.foto.toLowerCase()));
    for (const termo of termoDe) expect(termos.map((x) => x.toLowerCase())).toContain(termo);
    const horizontal = t.humor[0].html(1920, 1080);
    const vertical = t.humor[0].html(1080, 1920);
    expect(horizontal).toContain('<img class="foto-fundo"');
    expect(vertical).toContain('<img class="foto-fundo"');
    expect(horizontal).toContain('&amp;w=1920');
    expect(vertical).toContain('&amp;h=1920');
  });
  it('sem chaves de foto tudo sai no degradê e nada é buscado', async () => {
    const t = await produzirTextos(null, 321);
    expect(t.humor[0].html(1920, 1080)).not.toContain('<img');
    expect(t.charadas[0].html(1920, 1080)).toContain('O QUE É, O QUE É?');
  });
  it('fonte de foto fora do ar: a arte sai no degradê, o robô não cai', async () => {
    const ctx = { chaves: { pexels: 'k' }, cache: new CacheDeFotos(), opcoes: { pedirJson: async () => { throw new Error('fora do ar'); }, abre: async () => true } };
    const t = await produzirTextos(ctx, 321);
    expect(t.memes[0].html(1920, 1080)).not.toContain('<img');
  });
  it('datas comemorativas: toda data tem termo de foto, e a foto vai na arte', async () => {
    for (const d of datasDoAno(2026)) { expect(d.foto, d.nome).toBeTruthy(); expect(FOTO_DA_DATA[d.nome as keyof typeof FOTO_DA_DATA]).toBe(d.foto); }
    const r = await produzirDatas('2026-10-08', ctxFalso([]));
    expect(r.datas).toHaveLength(10);
    expect(r.datas[0].html(1920, 1080)).toContain('<img class="foto-fundo"');
    expect((await produzirDatas('2026-10-08', null)).datas[0].html(1920, 1080)).not.toContain('<img');
  });
});

describe('qualidade dos bancos', () => {
  const todos = [
    ...CHARADAS.map((i: { p: string; r: string; foto: string }) => ({ texto: `${i.p} ${i.r}`, foto: i.foto })),
    ...PIADAS.map((i: { p: string; r: string; foto: string }) => ({ texto: `${i.p} ${i.r}`, foto: i.foto })),
    ...MEMES.map((i: { t: string; foto: string }) => ({ texto: i.t, foto: i.foto })),
    ...CURIOSIDADES.map((i: { t: string; foto: string }) => ({ texto: i.t, foto: i.foto })),
    ...NOSTALGIA.map((i: { t: string; s: string; foto: string }) => ({ texto: `${i.t} ${i.s}`, foto: i.foto })),
  ];
  it('todo item tem um termo de foto em inglês, curto e sem repetir a palavra "foto"', () => {
    expect(todos.length).toBeGreaterThanOrEqual(380);
    for (const i of todos) {
      expect(i.foto, i.texto).toMatch(/^[a-z0-9 -]{3,60}$/);
      expect(i.foto.split(' ').length, i.foto).toBeLessThanOrEqual(6);
    }
  });
  it('charada e piada: pergunta, resposta e termo preenchidos; texto cabe na arte', () => {
    for (const c of [...CHARADAS, ...PIADAS] as Array<{ p: string; r: string; foto: string }>) {
      expect(c.p.trim().length, c.p).toBeGreaterThan(8);
      expect(c.r.trim().length, c.r).toBeGreaterThan(2);
      expect(c.p.length, c.p).toBeLessThanOrEqual(130);
      expect(c.r.length, c.r).toBeLessThanOrEqual(110);
    }
    for (const m of MEMES as Array<{ t: string }>) expect(m.t.length, m.t).toBeLessThanOrEqual(120);
  });
  it('nada impróprio para comércio: sem palavrão, política, religião, bebida, aposta ou preconceito', () => {
    const proibido = /\b(porra|caralh|merda|bosta|puta|foda|cacete|vagabund|idiota|burro|viado|gay|negr[ao]\b|aleijad|retardad|cego|surdo|mudo|deficiente|bolsonaro|lula|pt\b|pl\b|elei[cç][aã]o|pol[ií]tic|deus\b|jesus|cerveja|cachaça|bebid|bêbad|vodka|whisky|aposta|bet\b|cassino|tigrinho|odds|cigarro|droga|maconha)\b/i;
    for (const i of todos) expect(i.texto, i.texto).not.toMatch(proibido);
  });
  it('as charadas de resposta fechada trazem a resposta no termo da foto (a foto mostra o objeto)', () => {
    const fechada = (CHARADAS as Array<{ r: string; foto: string }>).filter((c) => /^(O|A) [a-zçãéíóúâêô-]+$/i.test(c.r) && c.r.split(' ').length === 2);
    expect(fechada.length).toBeGreaterThan(50);
  });
});

describe('o robô usa a foto sem estourar a cota', () => {
  const robo = ler('scripts/conteudo/robo.mjs');
  it('lê o cache do R2 antes, grava depois se mudou, e passa o contexto às datas e aos textos', () => {
    expect(robo).toContain('new GetObjectCommand({ Bucket: bucket, Key: CACHE_CAMINHO })');
    expect(robo).toContain('await rodar(\'datas\', async () => produzirDatas(hoje, ctxFotos));');
    expect(robo).toContain('await rodar(\'textos\', async () => produzirTextos(ctxFotos));');
    expect(robo).toContain('if (cacheFotos.sujo) {');
    expect(robo).toContain("Key: CACHE_CAMINHO, Body: cacheFotos.json(), ContentType: 'application/json'");
  });
  it('sem nenhuma chave de foto o robô segue com o degradê', () => {
    expect(robo).toContain('const ctxFotos = chavesFoto.pexels || chavesFoto.pixabay ? { chaves: chavesFoto, cache: cacheFotos } : null;');
  });
  it('a versão do desenho subiu, para as telas receberem as artes novas', () => {
    expect(robo).toContain("'loterias-v1' : 'conteudo-v2'");
  });
  it('o cache fica na área do robô (nunca vira mídia nem aparece em pasta)', () => {
    expect(ler('scripts/conteudo/fotos.mjs')).toContain("export const CACHE_CAMINHO = 'conteudo/_cache/fotos-v1.json';");
  });
  it('as chaves de foto já são segredos do workflow', () => {
    const wf = ler('.github/workflows/conteudo-automatico.yml');
    expect(wf).toContain('PEXELS_API_KEY: ${{ secrets.PEXELS_API_KEY }}');
    expect(wf).toContain('PIXABAY_API_KEY: ${{ secrets.PIXABAY_API_KEY }}');
  });
});

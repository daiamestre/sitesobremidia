/**
 * SOBRE MÍDIA — Tabloide Digital (F-174): gera a imagem do produto por IA dentro da Cloudflare (Workers AI).
 * Roda na conta Cloudflare do dono; usa a ligação "AI" (não precisa de token de API).
 * Só atende quem manda o segredo combinado (a Edge Function `produto-imagem` do Supabase).
 * Recebe { produto } em português, traduz para inglês (o gerador entende melhor e não escreve o nome na embalagem)
 * e pede o objeto em si: genérico, sem marca, sem texto, em fundo branco.
 * Publicar: node scripts/ops/publicar-worker-ia.mjs
 */
/**
 * Descreve em inglês o objeto físico que o nome em português representa (ex.: "Dipirona" → "box of painkiller tablets").
 * Usa um modelo de linguagem: tradutor palavra-a-palavra errava nomes de produto ("sabonete" virava outra coisa).
 */
async function traduzir(env, texto) {
  try {
    const r = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      max_tokens: 30,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You convert Brazilian Portuguese retail product names into a short English description of the physical object (2 to 7 words), for a product photo. No brand names. For medicines say the form (e.g. "box of painkiller tablets"). Answer with the description only, lowercase, no punctuation.' },
        { role: 'user', content: 'vassoura' }, { role: 'assistant', content: 'household broom with wooden handle' },
        { role: 'user', content: 'sabonete' }, { role: 'assistant', content: 'bar of soap' },
        { role: 'user', content: 'dipirona' }, { role: 'assistant', content: 'box of painkiller tablets' },
        { role: 'user', content: 'detergente' }, { role: 'assistant', content: 'bottle of dishwashing liquid' },
        { role: 'user', content: texto },
      ],
    });
    // a resposta vem em `response` ou no formato de conversa (`choices[0].message.content`), conforme o modelo
    const t = String(r?.response ?? r?.choices?.[0]?.message?.content ?? '').split('\n')[0].replace(/[^a-zA-Z\s-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const palavras = t.split(' ').length;
    return t.length >= 3 && palavras <= 9 ? t : texto;
  } catch {
    return texto;
  }
}

/** Uma pergunta de sim/não sobre a foto. Devolve true/false (null se a IA não respondeu). */
async function perguntar(env, bytes, prompt) {
  const out = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', { image: [...bytes], max_tokens: 6, prompt });
  const resp = String(out?.description ?? out?.response ?? '').trim().toLowerCase();
  if (!resp) return null;
  return /^\W*yes/.test(resp);
}

/**
 * O item principal da foto é mesmo o produto? (uma pergunta só, para ser rápido; foto com pessoa/mão já é descartada
 * pela legenda antes de chegar aqui). Devolve true/false (null se não deu para olhar).
 */
async function conferirFoto(env, nome, url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'SobreMidia-Tabloide/1.0' } });
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length < 500 || bytes.length > 1_500_000) return null;
    return await perguntar(env, bytes, 'Is this a clear close-up product photo of ' + nome + ', with the item large in the frame on a plain or simple background (not a room, not a street, not a crowd of other objects, not a drawing, not a logo)? Answer only yes or no.');
  } catch {
    return null;
  }
}

/**
 * F-272 — PASSA-FOTO: a foto do produto vem do site da própria marca NA HORA, sem ser guardada (nem no R2, nem no SSD).
 *   GET /foto?u=<endereço da foto>[&s=1][&c=esquerda,topo,largura,altura]
 *   s=1 tira o fundo (mesmo recorte da ação 'recortar'); c corta a sobra transparente (caixa medida antes).
 * Só repassa imagem, só de sites da lista (marcas da pesquisa e bancos de imagem que o sistema já usa): não é um repasse aberto.
 * Devolve com permissão de uso (CORS) para o encarte poder ser exportado, e com cache longo no navegador.
 * Se a transformação falhar (ex.: cota de transformações grátis do mês), devolve a foto original: o encarte nunca fica sem foto.
 */
// <<HOSTS (gerado por scripts/ops/catalogo-por-link.mjs hosts — não editar à mão)
const HOSTS = ["agenciacariocadagema.com.br", "anaconda.com.br", "blueray.com.br", "brilux.com.br", "cafebrasileiro.com", "cafepilao.vteximg.com.br", "cajuinasaogeraldo.com.br", "camponesa.com.br", "capricche.com.br", "casadosaborcamil.com.br", "casaperini.com.br", "cdn-images-site-girandosol.bravo.st", "cdn.dooca.store", "cdn.shopify.com", "cdn.vnda.com.br", "ceratti.com.br", "ciamuller.com.br", "cini.com.br", "costasul.com.br", "cristalalimentos.com.br", "dori.com.br", "energizer.com", "eno.com.br", "eu-images.contentstack.com", "euvendo.frimesa.com.br", "excelsior.com.br", "frinense.com.br", "greenpeople.com.br", "harald.com.br", "i-cf65.ch-static.com", "i.imgur.com", "images-1.eucerin.com", "images.prismic.io", "irp.cdn-website.com", "isabela.com.br", "jasminealimentos.com", "jequiti.vteximg.com.br", "jundia.com.br", "lojamaxtitanium.vteximg.com.br", "lojamelitta.vteximg.com.br", "mahogany.vtexassets.com", "mantiqueirabrasil.com.br", "matecouro.com.br", "mauricea.com.br", "mccain.com.br", "mezzani.com.br", "nattoalimentos.com.br", "nobre.coop.br", "noronhaalimentos.com.br", "nutrifysaude.vteximg.com.br", "oetker.widen.net", "ovomaltine.com.br", "peperi.coop.br", "piraque.com.br", "pitu.com.br", "polilac.com.br", "prodcontent.kitano.com.br", "prodcontent.yoki.com.br", "richester.com.br", "riclan.com.br", "salcisne.com.br", "sallebre.com.br", "static.wixstatic.com", "strawplast.com.br", "supleylab.vteximg.com.br", "teixeira.com.br", "tfbrnp.vteximg.com.br", "tiojoao.com.br", "uniao.com.br", "vidaveg.com.br", "vinicolagaribaldi.com.br", "vitafor.vteximg.com.br", "vitarella.com.br", "wickbold.com.br", "www.3coracoes.com.br", "www.adria.com.br", "www.ajinomoto.com.br", "www.alibem.com.br", "www.auroraalimentos.com.br", "www.becel.com.br", "www.bigfral.com.br", "www.bozzano.com.br", "www.cafepele.com.br", "www.cafesantaclara.com.br", "www.camil.com.br", "www.cepera.com.br", "www.chamyto.com.br", "www.ciamuller.com.br", "www.cotidian.com.br", "www.cuidadodacasa.com.br", "www.dolly.com.br", "www.dorflex.com.br", "www.fiatlux.com.br", "www.fiquediva.com.br", "www.fornodeminas.com.br", "www.foxlux.com.br", "www.friboi.com.br", "www.galbani.com.br", "www.grupocopobras.com.br", "www.guabinatural.com.br", "www.harpic.com.br", "www.kisabor.com.br", "www.loreal-paris.com.br", "www.luftal.com.br", "www.lysol.com.br", "www.masterboi.com.br", "www.minuano.com.br", "www.naldecon.com.br", "www.nativealimentos.com.br", "www.novalgina.com.br", "www.nutrella.com.br", "www.ourofinopet.com", "www.perdigao.com.br", "www.pifpaf.com.br", "www.plasutil.com.br", "www.pratofino.com.br", "www.produtosbonare.com.br", "www.protex-soap.com.br", "www.qboa.com.br", "www.refrigerantesconvencao.com.br", "www.risque.com.br", "www.salada.com.br", "www.salton.com.br", "www.saobraz.com.br", "www.sazon.com.br", "www.seara.com.br", "www.sensodyne.com", "www.startquimica.com.br", "www.strepsils.com.br", "www.tirol.com.br", "www.turquesa.com.br", "www.vanish.com.br", "www.verdecampo.com.br", "www.vilma.com.br", "www.wyda.com.br", "www.yakult.com.br"];
// HOSTS>>
const HOSTS_FIXOS = ['images.openfoodfacts.org', 'static.openfoodfacts.org', 'upload.wikimedia.org', 'images.pexels.com', 'cdn.pixabay.com', 'pixabay.com'];
const PERMITIDOS_FOTO = new Set([...HOSTS, ...HOSTS_FIXOS]);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Timing-Allow-Origin': '*' };

function lerPedidoDeFoto(endereco) {
  const q = new URL(endereco).searchParams;
  let u;
  try { u = new URL(q.get('u') ?? ''); } catch { return { erro: 'endereço inválido' }; }
  if (u.protocol !== 'https:' || !PERMITIDOS_FOTO.has(u.hostname)) return { erro: 'site não permitido' };
  const c = (q.get('c') ?? '').split(',').map(Number);
  const caixa = c.length === 4 && c.every((n) => Number.isInteger(n) && n >= 0 && n <= 20000) && c[2] > 0 && c[3] > 0
    ? { left: c[0], top: c[1], width: c[2], height: c[3] } : null;
  return { url: u.href, semFundo: q.get('s') === '1', caixa };
}

async function passaFoto(req, env) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const pedido = lerPedidoDeFoto(req.url);
  if (pedido.erro) return new Response(pedido.erro, { status: 400, headers: CORS });
  const buscar = () => fetch(pedido.url, { headers: { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)', Accept: 'image/*' }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  const origem = await buscar();
  const tipo = origem?.headers.get('content-type') ?? '';
  if (!origem?.ok || !/^image\//.test(tipo)) return new Response('a foto não carregou', { status: 502, headers: CORS });
  if (Number(origem.headers.get('content-length') ?? 0) > 20 * 1024 * 1024) return new Response('foto grande demais', { status: 413, headers: CORS });
  const cabecalhos = { ...CORS, 'Cache-Control': 'public, max-age=2592000, immutable', 'X-Passa-Foto': '1' };
  if ((pedido.semFundo || pedido.caixa) && env.IMAGES) {
    try {
      let t = env.IMAGES.input(origem.body);
      if (pedido.semFundo) t = t.transform({ segment: 'foreground', width: 1400, height: 1400, fit: 'scale-down' });
      if (pedido.caixa) t = t.transform({ trim: pedido.caixa });
      const r = (await t.output({ format: 'image/webp', quality: 90 })).response();
      return new Response(r.body, { status: 200, headers: { ...cabecalhos, 'Content-Type': 'image/webp' } });
    } catch {
      // cota ou falha da transformação: entrega a original (o corpo já foi lido, então busca de novo)
      const de = await buscar();
      if (!de?.ok) return new Response('a foto não carregou', { status: 502, headers: CORS });
      return new Response(de.body, { status: 200, headers: { ...cabecalhos, 'Content-Type': tipo, 'X-Passa-Foto': 'original' } });
    }
  }
  return new Response(origem.body, { status: 200, headers: { ...cabecalhos, 'Content-Type': tipo } });
}

export default {
  async fetch(req, env) {
    if (new URL(req.url).pathname === '/foto') return passaFoto(req, env);
    if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });
    if (!env.SEGREDO || req.headers.get('x-segredo') !== env.SEGREDO) return new Response('negado', { status: 401 });
    let corpo = {};
    try { corpo = await req.json(); } catch { /* corpo inválido */ }
    // Studio de IA: roda UM modelo da lista permitida (a mesma de supabase/functions/_shared/studio/provedores.ts).
    // A lógica dos agentes, as validações e a cota ficam no orquestrador (Supabase); aqui é só a ligação com a Workers AI.
    if (corpo.acao === 'studio-modelo') {
      const PERMITIDOS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/black-forest-labs/flux-1-schnell', '@cf/leonardo/lucid-origin'];
      if (!PERMITIDOS.includes(corpo.modelo)) return Response.json({ erro: 'modelo não permitido' }, { status: 400 });
      // F-220: o lucid-origin (alta resolução) atende o Agente de Referências do Studio, que cobra o cliente por criação.
      // Teto de custo por chamada: até 1536 px de lado e 30 passos.
      if (corpo.modelo === '@cf/leonardo/lucid-origin') {
        const e = corpo.entrada ?? {};
        if (Number(e.width) > 1536 || Number(e.height) > 1536 || Number(e.steps ?? e.num_steps ?? 0) > 30) return Response.json({ erro: 'tamanho ou passos acima do limite' }, { status: 400 });
      }
      try {
        return Response.json(await env.AI.run(corpo.modelo, corpo.entrada ?? {}));
      } catch (e) {
        const msg = String(e?.message ?? e).slice(0, 200);
        return Response.json({ erro: msg }, { status: /quota|limit|allocation|neurons/i.test(msg) ? 429 : 502 });
      }
    }
    // F-252: tira o fundo da foto do produto, com o produto inteiro (Cloudflare Images, modelo BiRefNet). Devolve o PNG transparente.
    if (corpo.acao === 'recortar') {
      const url = String(corpo.url ?? '');
      if (!/^https:\/\//.test(url)) return Response.json({ erro: 'endereço inválido' }, { status: 400 });
      const origem = await fetch(url, { headers: { 'User-Agent': 'SobreMidia-Tabloide/1.0 (contato@sobremidia.com.br)' } }).catch(() => null);
      if (!origem?.ok || !/^image\//.test(origem.headers.get('content-type') ?? '')) return Response.json({ erro: 'a foto não carregou' }, { status: 422 });
      if (Number(origem.headers.get('content-length') ?? 0) > 20 * 1024 * 1024) return Response.json({ erro: 'foto grande demais' }, { status: 413 });
      try {
        const r = await env.IMAGES.input(origem.body).transform({ segment: 'foreground', width: 1400, height: 1400, fit: 'scale-down' }).output({ format: 'image/png' });
        return r.response();
      } catch (e) {
        const msg = String(e?.message ?? e).slice(0, 200);
        return Response.json({ erro: msg }, { status: /9422|limit|quota/i.test(msg) ? 429 : 502 });
      }
    }
    let produto = String(corpo.produto ?? '');
    // só letras, números e espaço; sem medidas ("350ml", "5kg"), que o gerador tentaria escrever na imagem
    produto = produto.replace(/\b\d+([.,]\d+)?\s*(kg|g|gr|ml|l|lt|mg|un|und)\b/gi, ' ').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (produto.length < 2) return Response.json({ erro: 'produto inválido' }, { status: 400 });
    if (corpo.acao === 'conferir') {
      // confere até 10 fotos candidatas de uma vez: { resultados: { [url]: true | false | null } }
      const nome = (await traduzir(env, produto)).replace(/["'.]/g, ' ').trim().toLowerCase();
      const fotos = (Array.isArray(corpo.imagens) ? corpo.imagens : []).map((x) => String(x)).filter((u) => /^https:\/\//.test(u)).slice(0, 10);
      const veredictos = await Promise.all(fotos.map((u) => conferirFoto(env, `a ${nome}`, u)));
      return Response.json({ nome, resultados: Object.fromEntries(fotos.map((u, i) => [u, veredictos[i]])) });
    }
    try {
      const nome = (await traduzir(env, produto)).replace(/["'.]/g, ' ').trim().toLowerCase();
      const prompt =
        `A ${nome}. Professional studio photograph of a single ${nome}, clearly recognizable, generic and unbranded, ` +
        'centered, the whole item visible, isolated on a plain pure white background, soft even lighting, realistic, sharp focus. ' +
        'No words, no letters, no numbers, no logo, no brand name, no watermark anywhere (if the item has a label, the label is blank). No people, no hands.';
      // o filtro de conteúdo da Cloudflare dá falso alarme em objetos comuns (ex.: escova de dentes); tenta pedidos mais simples
      const simples = nome.split(' ').slice(0, 2).join(' ');
      const pedidos = [
        prompt,
        `Product photo of ${simples}, centered, plain white background, studio lighting, no text.`,
        `A household ${simples} on a white table, simple product photo.`,
      ];
      let r = null;
      let ultimoErro = null;
      for (const p of pedidos) {
        try { r = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt: p, steps: 4 }); if (r?.image) break; } catch (e) {
          ultimoErro = e;
          if (!/NSFW|8007/i.test(String(e?.message ?? e))) throw e;
        }
      }
      if (!r?.image && ultimoErro) throw ultimoErro;
      if (!r?.image) return Response.json({ erro: 'a IA não devolveu imagem' }, { status: 502 });
      return Response.json({ image: r.image, nome });
    } catch (e) {
      const msg = String(e?.message ?? e).slice(0, 200);
      // cota diária gratuita esgotada vira 429 para o sistema avisar o cliente
      return Response.json({ erro: msg }, { status: /quota|limit|allocation|neurons/i.test(msg) ? 429 : 502 });
    }
  },
};

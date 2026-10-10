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

export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });
    if (!env.SEGREDO || req.headers.get('x-segredo') !== env.SEGREDO) return new Response('negado', { status: 401 });
    let corpo = {};
    try { corpo = await req.json(); } catch { /* corpo inválido */ }
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

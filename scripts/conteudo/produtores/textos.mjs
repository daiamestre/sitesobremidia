/**
 * Pastas de conteúdo próprio: Charadas, Humor, Memes, Curiosidades (Vídeos Incrível) e Nostalgia.
 * F-163: toda arte leva a FOTO que combina com o texto (como as notícias levam a foto da notícia), com o crédito no pé.
 * Charada: a pergunta sai com a foto da resposta DESFOCADA (sugere sem entregar) e a resposta com a foto nítida.
 * Troca a cada 3 dias: entra outro trecho de cada banco (F-96). Sem foto (fonte fora do ar), a arte volta ao degradê.
 */
import crypto from 'node:crypto';
import { GRADIENTES, daSemana, periodoDe3Dias } from '../arte-base.mjs';
import { CHARADAS, PIADAS, MEMES, CURIOSIDADES, NOSTALGIA } from '../bancos.mjs';
import { cartaoLegenda, cartaoPainel } from '../arte-foto.mjs';
import { buscarFoto } from '../fotos.mjs';

const id = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 10);

/** Por período de 3 dias: 8 charadas (pergunta + resposta), 8 piadas, 10 memes, 10 curiosidades, 10 de nostalgia. */
export const POR_PERIODO = { charadas: 8, humor: 8, memes: 10, curiosidades: 10, nostalgia: 10 };

const ORIENTACAO = (h, w) => (h > w ? 'portrait' : 'landscape');

/**
 * Resolve a foto de um item nas duas orientações (a arte horizontal e a vertical usam fotos do formato certo).
 * Devolve `foto(w, h)` — null quando nenhuma fonte tem foto (a arte usa o degradê).
 */
async function fotosDoItem(ctx, termo, semente) {
  if (!ctx) return () => null;
  const par = { landscape: null, portrait: null };
  for (const o of ['landscape', 'portrait']) {
    try { par[o] = await buscarFoto(ctx.chaves, ctx.cache, termo, o, semente, ctx.opcoes); } catch { par[o] = null; }
  }
  return (w, h) => par[ORIENTACAO(h, w)];
}

/**
 * @param {{ chaves: { pexels?: string, pixabay?: string }, cache: import('../fotos.mjs').CacheDeFotos, opcoes?: object } | null} ctx
 *   `null` = sem fotos (testes e execução sem chaves).
 */
export async function produzirTextos(ctx = null, periodo = periodoDe3Dias()) {
  const semana = periodo;
  const out = { charadas: [], humor: [], memes: [], curiosidades: [], nostalgia: [] };

  for (const c of daSemana(CHARADAS, POR_PERIODO.charadas, semana)) {
    const k = id(c.p);
    const foto = await fotosDoItem(ctx, c.foto, `c-${k}`);
    out.charadas.push({ chave: `c-${k}-p`, nome: `Charada: ${c.p}`, descricao: 'Pergunta', foto: c.foto,
      html: (w, h) => cartaoPainel({ selo: 'CHARADA', fundo: GRADIENTES.roxo, rotulo: 'O QUE É, O QUE É?', principal: c.p, rodape: 'A resposta aparece em seguida!', foto: foto(w, h), desfoque: true, meio: true }, w, h) });
    out.charadas.push({ chave: `c-${k}-r`, nome: `Resposta: ${c.r}`, descricao: c.p, foto: c.foto,
      html: (w, h) => cartaoPainel({ selo: 'CHARADA', fundo: GRADIENTES.turquesa, rotulo: 'RESPOSTA', principal: c.p, secundario: c.r, foto: foto(w, h) }, w, h) });
  }
  for (const j of daSemana(PIADAS, POR_PERIODO.humor, semana)) {
    const foto = await fotosDoItem(ctx, j.foto, `h-${id(j.p)}`);
    out.humor.push({ chave: `h-${id(j.p)}`, nome: `Piada: ${j.p}`, descricao: j.r, foto: j.foto,
      html: (w, h) => cartaoPainel({ selo: 'HUMOR', fundo: GRADIENTES.laranja, rotulo: 'PIADINHA DO DIA', principal: j.p, secundario: j.r, foto: foto(w, h) }, w, h) });
  }
  for (const m of daSemana(MEMES, POR_PERIODO.memes, semana)) {
    const foto = await fotosDoItem(ctx, m.foto, `m-${id(m.t)}`);
    out.memes.push({ chave: `m-${id(m.t)}`, nome: `Meme: ${m.t.slice(0, 60)}`, descricao: m.t, foto: m.foto,
      html: (w, h) => cartaoLegenda({ selo: 'MEMES', fundo: GRADIENTES.rosa, principal: m.t, foto: foto(w, h) }, w, h) });
  }
  for (const c of daSemana(CURIOSIDADES, POR_PERIODO.curiosidades, semana)) {
    const foto = await fotosDoItem(ctx, c.foto, `i-${id(c.t)}`);
    out.curiosidades.push({ chave: `i-${id(c.t)}`, nome: `Você sabia? ${c.t.slice(0, 60)}`, descricao: c.t, foto: c.foto,
      html: (w, h) => cartaoLegenda({ selo: 'VOCÊ SABIA?', fundo: GRADIENTES.azul, rotulo: 'CURIOSIDADE INCRÍVEL', principal: c.t, foto: foto(w, h) }, w, h) });
  }
  for (const n of daSemana(NOSTALGIA, POR_PERIODO.nostalgia, semana)) {
    const foto = await fotosDoItem(ctx, n.foto, `n-${id(n.t)}`);
    out.nostalgia.push({ chave: `n-${id(n.t)}`, nome: `Quem lembra? ${n.t}`, descricao: n.s, foto: n.foto,
      html: (w, h) => cartaoPainel({ selo: 'NOSTALGIA', fundo: GRADIENTES.dourado, rotulo: 'QUEM LEMBRA?', principal: n.t, secundario: n.s, foto: foto(w, h) }, w, h) });
  }
  return out;
}

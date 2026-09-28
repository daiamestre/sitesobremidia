/**
 * Pastas de conteúdo próprio (F-95): Charadas, Humor, Memes, Curiosidades (Vídeos Incrível) e Nostalgia.
 * Artes tipográficas SOBRE MÍDIA (sem imagens de terceiros). Troca a cada 3 dias: entra outro trecho de cada banco (F-96).
 */
import crypto from 'node:crypto';
import { esc, pagina, GRADIENTES, daSemana, periodoDe3Dias } from '../arte-base.mjs';
import { CHARADAS, PIADAS, MEMES, CURIOSIDADES, NOSTALGIA } from '../bancos.mjs';

const id = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 10);

function cartao({ selo, fundo, rotulo, principal, secundario, rodape }, w, h) {
  const v = h > w;
  const tam = principal.length > 90 ? (v ? 70 : 68) : principal.length > 50 ? (v ? 84 : 82) : (v ? 100 : 96);
  const css = `
.meio{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:${v ? 44 : 30}px}
.rotulo{font-weight:900;letter-spacing:.22em;font-size:${v ? 40 : 34}px;color:#FFD400}
.principal{font-weight:900;line-height:1.12;font-size:${tam}px;max-width:${v ? 940 : 1550}px;text-shadow:0 6px 24px rgba(0,0,0,.35)}
.sec{font-weight:800;line-height:1.2;font-size:${v ? 64 : 58}px;max-width:${v ? 940 : 1400}px;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.25);
  border-radius:28px;padding:${v ? '26px 40px' : '20px 44px'}}
.aspas{font-weight:900;font-size:${v ? 220 : 200}px;line-height:.6;color:rgba(255,255,255,.18)}`;
  const corpo = `<div class="meio">${rotulo ? `<div class="rotulo">${esc(rotulo)}</div>` : '<div class="aspas">“</div>'}
  <div class="principal">${esc(principal)}</div>${secundario ? `<div class="sec">${esc(secundario)}</div>` : ''}</div>
  ${rodape ? `<div class="legal" style="text-align:center">${esc(rodape)}</div>` : ''}`;
  return pagina({ w, h, fundo, selo, corpo, css, escuro: 0.05 });
}

/** Por período de 3 dias: 8 charadas (pergunta + resposta), 8 piadas, 10 memes, 10 curiosidades, 10 de nostalgia. */
export const POR_PERIODO = { charadas: 8, humor: 8, memes: 10, curiosidades: 10, nostalgia: 10 };

export function produzirTextos(periodo = periodoDe3Dias()) {
  const semana = periodo;
  const out = { charadas: [], humor: [], memes: [], curiosidades: [], nostalgia: [] };
  for (const [p, r] of daSemana(CHARADAS, POR_PERIODO.charadas, semana)) {
    const k = id(p);
    out.charadas.push({ chave: `c-${k}-p`, nome: `Charada: ${p}`, descricao: 'Pergunta', html: (w, h) => cartao({ selo: 'CHARADA', fundo: GRADIENTES.roxo, rotulo: 'O QUE É, O QUE É?', principal: p, rodape: 'A resposta aparece em seguida!' }, w, h) });
    out.charadas.push({ chave: `c-${k}-r`, nome: `Resposta: ${r}`, descricao: p, html: (w, h) => cartao({ selo: 'CHARADA', fundo: GRADIENTES.turquesa, rotulo: 'RESPOSTA', principal: p, secundario: r }, w, h) });
  }
  for (const [p, r] of daSemana(PIADAS, POR_PERIODO.humor, semana)) {
    out.humor.push({ chave: `h-${id(p)}`, nome: `Piada: ${p}`, descricao: r, html: (w, h) => cartao({ selo: 'HUMOR', fundo: GRADIENTES.laranja, rotulo: 'PIADINHA DO DIA', principal: p, secundario: r }, w, h) });
  }
  for (const m of daSemana(MEMES, POR_PERIODO.memes, semana)) {
    out.memes.push({ chave: `m-${id(m)}`, nome: `Meme: ${m.slice(0, 60)}`, descricao: m, html: (w, h) => cartao({ selo: 'MEMES', fundo: GRADIENTES.rosa, principal: m }, w, h) });
  }
  for (const c of daSemana(CURIOSIDADES, POR_PERIODO.curiosidades, semana)) {
    out.curiosidades.push({ chave: `i-${id(c)}`, nome: `Você sabia? ${c.slice(0, 60)}`, descricao: c, html: (w, h) => cartao({ selo: 'VOCÊ SABIA?', fundo: GRADIENTES.azul, rotulo: 'CURIOSIDADE INCRÍVEL', principal: c }, w, h) });
  }
  for (const [t, s] of daSemana(NOSTALGIA, POR_PERIODO.nostalgia, semana)) {
    out.nostalgia.push({ chave: `n-${id(t)}`, nome: `Quem lembra? ${t}`, descricao: s, html: (w, h) => cartao({ selo: 'NOSTALGIA', fundo: GRADIENTES.dourado, rotulo: 'QUEM LEMBRA?', principal: t, secundario: s }, w, h) });
  }
  return out;
}

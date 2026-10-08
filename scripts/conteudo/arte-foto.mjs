/**
 * Artes com FOTO de apoio (F-163): piadas, charadas, memes, curiosidades, nostalgia e datas comemorativas ganham a foto
 * que combina com o texto, no mesmo estilo das notícias (foto em tela cheia, texto em cima, crédito no pé).
 * Sem foto (fonte fora do ar), a arte volta ao degradê de antes — nunca sai incompleta.
 */
import { esc, cortar, pagina } from './arte-base.mjs';
import { creditoDaFoto } from './fotos.mjs';

/** Foto por baixo de tudo (tela cheia); `desfoque` esconde detalhes (pergunta da charada: sugere sem entregar a resposta). */
function comFoto(html, foto, desfoque = false) {
  if (!foto) return html;
  const estilo = desfoque ? 'filter:blur(26px) brightness(.8) saturate(1.25);transform:scale(1.12)' : '';
  return html.replace('<body>', `<body><img class="foto-fundo" src="${esc(foto.url)}" style="${estilo}">`);
}

const BASE_FOTO = `
.foto-fundo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cred{font-weight:600;opacity:.82;text-shadow:0 2px 8px rgba(0,0,0,.6)}`;

/** Tamanho do texto principal conforme o comprimento (cabe sem cortar). */
export function tamanhoDoTexto(texto, v, base = 'painel') {
  const n = String(texto).length;
  if (base === 'legenda') return n > 130 ? (v ? 64 : 62) : n > 90 ? (v ? 76 : 72) : n > 55 ? (v ? 88 : 84) : (v ? 100 : 96);
  return n > 110 ? (v ? 58 : 56) : n > 75 ? (v ? 68 : 64) : n > 45 ? (v ? 80 : 74) : (v ? 92 : 86);
}

/**
 * Cartão de humor/charada/nostalgia: painel escuro translucente na parte de baixo, foto visível em cima.
 * `meio` centraliza o painel (pergunta de charada, com a foto desfocada).
 */
export function cartaoPainel({ selo, fundo, rotulo, principal, secundario, rodape, foto, desfoque = false, meio = false }, w, h) {
  const v = h > w;
  const css = `${BASE_FOTO}
.meio{flex:1;display:flex;flex-direction:column;justify-content:${meio ? 'center' : 'flex-end'};align-items:center;gap:${v ? 28 : 20}px}
.painel{width:100%;max-width:${v ? 940 : 1640}px;text-align:center;background:rgba(10,6,32,${foto ? 0.62 : 0.0});backdrop-filter:blur(${foto ? 10 : 0}px);
  border:${foto ? '2px solid rgba(255,255,255,.18)' : '0'};border-radius:40px;padding:${v ? '48px 44px' : '38px 56px'};display:flex;flex-direction:column;align-items:center;gap:${v ? 30 : 22}px}
.rotulo{font-weight:900;letter-spacing:.2em;font-size:${v ? 38 : 32}px;color:#FFD400}
.principal{font-weight:900;line-height:1.12;font-size:${tamanhoDoTexto(principal, v)}px;text-shadow:0 4px 18px rgba(0,0,0,.45)}
.sec{font-weight:800;line-height:1.2;font-size:${v ? 62 : 54}px;background:rgba(255,212,0,.16);border:2px solid rgba(255,212,0,.5);border-radius:26px;padding:${v ? '22px 36px' : '16px 40px'}}
.interro{font-weight:900;font-size:${v ? 300 : 240}px;line-height:.7;color:rgba(255,212,0,.9);text-shadow:0 8px 30px rgba(0,0,0,.5)}`;
  const corpo = `<div class="meio">${meio && desfoque ? '<div class="interro">?</div>' : ''}<div class="painel">${rotulo ? `<div class="rotulo">${esc(rotulo)}</div>` : ''}
  <div class="principal">${esc(principal)}</div>${secundario ? `<div class="sec">${esc(secundario)}</div>` : ''}</div></div>
  <div class="cred" style="display:flex;justify-content:space-between;gap:20px;font-size:${v ? 24 : 22}px"><span>${esc(rodape ?? '')}</span><span>${esc(creditoDaFoto(foto))}</span></div>`;
  return comFoto(pagina({ w, h, fundo, selo, corpo, css, escuro: foto ? 0.5 : 0.05 }), foto, desfoque);
}

/** Cartão de meme/curiosidade: a foto aparece inteira e o texto grande fica sobre ela, na parte de baixo (estilo legenda). */
export function cartaoLegenda({ selo, fundo, rotulo, principal, foto }, w, h) {
  const v = h > w;
  const css = `${BASE_FOTO}
.meio{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:${v ? 26 : 18}px}
.rotulo{font-weight:900;letter-spacing:.2em;font-size:${v ? 36 : 30}px;color:#FFD400;text-shadow:0 3px 12px rgba(0,0,0,.7)}
.legenda{font-weight:900;line-height:1.1;font-size:${tamanhoDoTexto(principal, v, 'legenda')}px;text-shadow:0 5px 22px rgba(0,0,0,.85),0 0 4px rgba(0,0,0,.8);${v ? '' : 'max-width:1560px'}}`;
  const corpo = `<div class="meio">${rotulo ? `<div class="rotulo">${esc(rotulo)}</div>` : ''}<div class="legenda">${esc(principal)}</div></div>
  <div class="cred" style="text-align:right;margin-top:${v ? 22 : 16}px;font-size:${v ? 24 : 22}px">${esc(creditoDaFoto(foto))}</div>`;
  return comFoto(pagina({ w, h, fundo, selo, corpo, css, escuro: foto ? 0.7 : 0.05 }), foto);
}

/** Data comemorativa com a foto da data ao fundo (Natal, Dia das Mães, Carnaval…). */
export function cartaoData({ dia, mes, semana, nome, mensagem, ehHoje, fundo, foto }, w, h) {
  const v = h > w;
  const css = `${BASE_FOTO}
.marca{white-space:nowrap}
.selo{font-size:${v ? 24 : 26}px;padding:12px 26px}
.meio{flex:1;display:flex;align-items:${v ? 'flex-end' : 'center'};justify-content:${v ? 'center' : 'flex-start'}}
.painel{background:rgba(10,6,32,${foto ? 0.6 : 0});backdrop-filter:blur(${foto ? 10 : 0}px);border:${foto ? '2px solid rgba(255,255,255,.18)' : '0'};border-radius:40px;
  padding:${v ? '46px 48px' : '40px 64px'};display:flex;${v ? 'flex-direction:column;align-items:center;text-align:center;width:100%;max-width:960px' : 'flex-direction:row;align-items:center;gap:56px;max-width:1500px'}}
.data{display:flex;flex-direction:column;align-items:center}
.dia{font-weight:900;line-height:.9;font-size:${v ? 240 : 230}px;color:#FFD400;text-shadow:0 12px 40px rgba(0,0,0,.45)}
.mes{font-weight:900;letter-spacing:.14em;font-size:${v ? 58 : 54}px;text-transform:uppercase}
.sem{font-weight:700;font-size:${v ? 36 : 32}px;opacity:.85;margin-top:6px}
.texto{display:flex;flex-direction:column;gap:${v ? 22 : 18}px;${v ? 'margin-top:26px' : ''}}
.nome{font-weight:900;line-height:1.08;font-size:${v ? 76 : 72}px}
.msg{font-weight:600;line-height:1.3;font-size:${v ? 38 : 34}px;opacity:.95}
.hoje{display:inline-block;background:#fff;color:#1a1033;font-weight:900;letter-spacing:.14em;font-size:${v ? 36 : 32}px;padding:10px 30px;border-radius:999px;width:fit-content;${v ? 'align-self:center' : ''}}`;
  const corpo = `<div class="meio"><div class="painel"><div class="data"><div class="dia">${String(dia).padStart(2, '0')}</div><div class="mes">de ${esc(mes)}</div><div class="sem">${esc(semana)}</div></div>
  <div class="texto"><div class="nome">${esc(cortar(nome, 70))}</div><div class="msg">${esc(mensagem)}</div>${ehHoje ? '<span class="hoje">É HOJE!</span>' : ''}</div></div></div>
  <div class="cred" style="text-align:right;margin-top:${v ? 22 : 16}px;font-size:${v ? 24 : 22}px">${esc(creditoDaFoto(foto))}</div>`;
  return comFoto(pagina({ w, h, fundo, selo: 'DATAS COMEMORATIVAS', corpo, css, escuro: foto ? 0.5 : 0.1 }), foto);
}

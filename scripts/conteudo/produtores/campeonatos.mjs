/**
 * Pastas de campeonato (F-95): Brasileirão, Premier League, La Liga, Champions League -> "Últimos resultados" e
 * "Próximos jogos"; Apostas Esportivas -> "Jogos da rodada" de cada campeonato (SEM odds, decisão do proprietário).
 * Dados: jogos PUBLICADOS do Sports Engine (duas fontes), escudos só os conferidos (senão as iniciais), horário de
 * Brasília, fundo = a arte do campeonato (taça + nome).
 */
import { esc, pagina } from '../arte-base.mjs';

const SITE = 'https://sitesobremidia.vercel.app';
const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export const PASTAS_CAMPEONATO = ['brasileirao', 'premier-league', 'la-liga', 'champions-league'];

export function dataCurta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  return `${DIAS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]} ${m[3]}/${m[2]}`;
}
export function iniciais(nome) {
  const p = String(nome).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return !p.length ? '?' : p.length === 1 ? p[0].slice(0, 3).toUpperCase() : p.slice(0, 3).map((x) => x[0]).join('').toUpperCase();
}
const abs = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : SITE + (u.startsWith('/') ? '' : '/') + u);

function linha(j, encerrado, v) {
  const escudo = (url, nome) => url ? `<img class="esc" src="${esc(url)}">` : `<span class="esc ini">${esc(iniciais(nome))}</span>`;
  const centro = encerrado && j.placarMandante != null && j.placarVisitante != null
    ? `<span class="placar">${j.placarMandante} × ${j.placarVisitante}</span>` : `<span class="hora">${esc(j.hora ?? 'a definir')}</span>`;
  return `<div class="jogo"><span class="time d">${esc(j.mandante)}</span>${escudo(j.escudoMandante, j.mandante)}
    <span class="centro">${centro}<span class="dia">${esc(dataCurta(j.data))}</span></span>${escudo(j.escudoVisitante, j.visitante)}<span class="time">${esc(j.visitante)}</span></div>`;
}

export function htmlJogos(comp, jogos, titulo, selo, w, h) {
  const v = h > w;
  const fundoArte = abs(v ? comp.fundoV : comp.fundoH);
  const noArte = !!fundoArte && comp.fundoComTitulo;
  const css = `
.meio{flex:1;display:flex;flex-direction:column;${noArte ? `padding-top:${v ? 440 : 170}px` : 'padding-top:40px'}}
.comp{font-weight:900;font-size:${v ? 80 : 76}px;line-height:1;text-align:center;text-shadow:0 6px 24px rgba(0,0,0,.5)}
.sub{font-weight:900;letter-spacing:.16em;text-align:center;font-size:${v ? 46 : 40}px;margin:${v ? 26 : 14}px 0 ${v ? 34 : 22}px;text-shadow:0 3px 12px rgba(0,0,0,.6)}
.lista{${v ? 'display:flex;flex-direction:column;gap:22px' : 'display:grid;grid-template-columns:1fr 1fr;gap:18px 30px;width:100%'}}${noArte ? '.marca{visibility:hidden}' : ''}
.jogo{display:grid;grid-template-columns:1fr auto auto auto 1fr;align-items:center;gap:${v ? 18 : 22}px;background:rgba(6,10,22,.66);
  border:2px solid rgba(255,255,255,.18);border-radius:22px;padding:${v ? '16px 22px' : '10px 26px'}}
.time{font-weight:800;font-size:${v ? 36 : 29}px;line-height:1.1}.time.d{text-align:right}
.esc{width:${v ? 78 : 60}px;height:${v ? 78 : 60}px;object-fit:contain;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))}
.ini{display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.2);font-weight:900;font-size:${v ? 24 : 20}px}
.centro{display:flex;flex-direction:column;align-items:center;min-width:${v ? 170 : 140}px}
.placar{background:#FFD400;color:#1a1033;font-weight:900;font-size:${v ? 46 : 38}px;padding:4px 20px;border-radius:14px}
.hora{background:rgba(255,255,255,.18);font-weight:900;font-size:${v ? 44 : 36}px;padding:4px 20px;border-radius:14px}
.dia{font-weight:800;font-size:${v ? 22 : 20}px;opacity:.85;margin-top:6px}`;
  const corpo = `<div class="meio">${noArte ? '' : `<div class="comp">${esc(comp.nome)}</div>`}
  <div class="sub">${esc(titulo)}</div>
  <div class="lista">${jogos.map((j) => linha(j, titulo !== 'PRÓXIMOS JOGOS' && titulo !== 'JOGOS DA RODADA', v)).join('')}</div></div>
  <div class="legal" style="text-align:center">Horário de Brasília · Resultados confirmados por duas fontes</div>`;
  const fundo = fundoArte ? `#0b0620 url('${fundoArte}') center/cover no-repeat` : 'radial-gradient(circle at 85% 12%, #1e88e5 0%, #0d47a1 50%, #03102b 100%)';
  return pagina({ w, h, fundo, selo, corpo, css, escuro: 0.15 });
}

/** { 'campeonato-brasileirao': [...], ..., 'jogos-rodada': [...] } */
export function produzirCampeonatos(dados) {
  const out = { 'jogos-rodada': [] };
  const comps = dados?.competicoes ?? [];
  for (const slug of PASTAS_CAMPEONATO) {
    const c = comps.find((x) => x.slug === slug);
    const itens = [];
    if (c?.ultimos?.length) itens.push({ chave: 'resultados', nome: `${c.nome} — últimos resultados`, descricao: 'Resultados confirmados (Sports Engine)', html: (w, h) => htmlJogos(c, c.ultimos, 'ÚLTIMOS RESULTADOS', 'RESULTADOS', w, h) });
    if (c?.proximos?.length) itens.push({ chave: 'proximos', nome: `${c.nome} — próximos jogos`, descricao: 'Jogos confirmados, horário de Brasília', html: (w, h) => htmlJogos(c, c.proximos, 'PRÓXIMOS JOGOS', 'PRÓXIMOS JOGOS', w, h) });
    out[`campeonato-${slug}`] = itens;
  }
  for (const c of comps) {
    if (c.proximos?.length) out['jogos-rodada'].push({ chave: `rodada-${c.slug}`, nome: `${c.nome} — jogos da rodada`, descricao: 'Próximos jogos (sem cotações)', html: (w, h) => htmlJogos(c, c.proximos, 'JOGOS DA RODADA', 'JOGOS DA RODADA', w, h) });
  }
  return out;
}

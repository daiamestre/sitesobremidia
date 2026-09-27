/**
 * Artes das Loterias (F-94) — HTML que o robô fotografa em 1920x1080 (h) e 1080x1920 (v). Identidade SOBRE MÍDIA,
 * cor oficial de cada loteria, sem logotipos da CAIXA (só o nome da modalidade e a fonte dos dados).
 */
import { dataLonga, faixaPrincipal, valorCurto } from './loterias-dados.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pagina({ w, h, cor, cor2, selo, corpo }) {
  const v = h > w;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{font-family:Montserrat,Arial,sans-serif;color:#fff;background:radial-gradient(circle at 85% 12%, ${cor} 0%, ${cor2} 55%, #07060f 100%);position:relative}
.bolhas{position:absolute;inset:0;background:
  radial-gradient(circle at 12% 88%, rgba(255,255,255,.08) 0 ${v ? 260 : 220}px, transparent ${v ? 261 : 221}px),
  radial-gradient(circle at 92% 70%, rgba(255,255,255,.05) 0 ${v ? 180 : 160}px, transparent ${v ? 181 : 161}px)}
.moldura{position:relative;height:100%;display:flex;flex-direction:column;padding:${v ? '80px 70px' : '64px 90px'}}
.topo{display:flex;justify-content:space-between;align-items:center}
.marca{font-weight:800;letter-spacing:.3em;font-size:${v ? 34 : 30}px;opacity:.92}
.selo{background:#FFD400;color:#1a1033;font-weight:900;letter-spacing:.12em;font-size:${v ? 34 : 30}px;padding:14px 34px;border-radius:999px}
.meio{flex:1;display:flex;flex-direction:column;justify-content:center;${v ? 'align-items:center;text-align:center' : ''}}
.nome{font-weight:900;line-height:1;font-size:${v ? 124 : 132}px;text-shadow:0 8px 30px rgba(0,0,0,.35)}
.sub{margin-top:18px;font-weight:700;font-size:${v ? 44 : 40}px;opacity:.9}
.bolas{display:flex;flex-wrap:wrap;gap:var(--gap);margin-top:${v ? 70 : 50}px;${v ? 'justify-content:center' : ''}}
.bola{width:var(--d);height:var(--d);border-radius:50%;background:#fff;color:${cor2};display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:calc(var(--d) * .46);box-shadow:0 10px 26px rgba(0,0,0,.35), inset 0 -8px 0 rgba(0,0,0,.08)}
.duplo{display:flex;flex-direction:${v ? 'column' : 'row'};gap:${v ? 0 : 60}px}.duplo .bolas{margin-top:22px}
.rotulo{font-weight:800;font-size:${v ? 34 : 30}px;letter-spacing:.14em;opacity:.85;margin-top:${v ? 46 : 34}px}
.chips{display:flex;flex-wrap:wrap;gap:20px;margin-top:${v ? 46 : 34}px;${v ? 'justify-content:center' : ''}}
.chip{background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.25);border-radius:999px;padding:14px 30px;font-weight:800;font-size:${v ? 38 : 34}px}
.premio{display:inline-block;margin-top:${v ? 56 : 40}px;font-weight:900;font-size:${v ? 64 : 58}px;padding:16px 38px;border-radius:22px;background:rgba(0,0,0,.28)}
.premio.acum{background:#FFD400;color:#1a1033}
.rodape{display:flex;flex-direction:column;gap:10px;${v ? 'align-items:center;text-align:center' : ''}}
.prox{font-weight:800;font-size:${v ? 38 : 34}px}
.legal{font-weight:600;font-size:${v ? 24 : 22}px;opacity:.72}
.grande{font-weight:900;line-height:1;font-size:${v ? 150 : 150}px;color:#FFD400;text-shadow:0 10px 40px rgba(0,0,0,.4);margin-top:${v ? 30 : 16}px}
.rot2{font-weight:800;letter-spacing:.2em;font-size:${v ? 38 : 34}px;opacity:.85;margin-top:${v ? 70 : 44}px}
.data{font-weight:900;font-size:${v ? 88 : 84}px;margin-top:14px;text-transform:uppercase}
</style></head><body><div class="bolhas"></div><div class="moldura">
<div class="topo"><span class="marca">SOBRE MÍDIA</span><span class="selo">${esc(selo)}</span></div>
${corpo}
</div></body></html>`;
}

const LEGAL = 'Fonte: CAIXA · Confira sempre o resultado oficial · Jogue com responsabilidade · Proibido para menores de 18 anos';

/** Diâmetro e espaço das bolas conforme a quantidade e a orientação. */
function tamanhoBolas(n, v, linhas = 1) {
  const largura = v ? 940 : 1740;
  const porLinha = n <= 7 ? n : n <= 15 ? 5 : 10;
  const gap = v ? 22 : 26;
  let d = Math.floor((largura - gap * (porLinha - 1)) / porLinha);
  d = Math.min(d, v ? (linhas > 1 ? 118 : 132) : linhas > 1 ? 104 : n <= 7 ? 170 : 130);
  return { d, gap, porLinha };
}

function bolas(dezenas, v, linhas = 1) {
  const { d, gap, porLinha } = tamanhoBolas(dezenas.length, v, linhas);
  const larguraMax = porLinha * d + (porLinha - 1) * gap;
  return `<div class="bolas" style="--d:${d}px;--gap:${gap}px;max-width:${larguraMax}px">${dezenas.map((x) => `<span class="bola">${esc(x)}</span>`).join('')}</div>`;
}

export function htmlResultado(lot, r, w, h) {
  const v = h > w;
  const principal = faixaPrincipal(r);
  const extras = [];
  if (r.timeCoracao) extras.push(`Time do Coração: ${r.timeCoracao}`);
  if (r.mesSorte) extras.push(`Mês da Sorte: ${r.mesSorte}`);
  if (r.trevos?.length) extras.push(`Trevos: ${r.trevos.join(' · ')}`);
  const numeros = r.dezenas2?.length
    ? `<div class="duplo"><div><div class="rotulo">1º SORTEIO</div>${bolas(r.dezenas, v, 2)}</div><div><div class="rotulo">2º SORTEIO</div>${bolas(r.dezenas2, v, 2)}</div></div>`
    : bolas(r.dezenas, v);
  const prox = r.proximo?.data ? `Próximo concurso ${r.proximo.concurso ?? ''} · ${dataLonga(r.proximo.data)}${r.proximo.estimativa ? ` · Estimativa ${valorCurto(r.proximo.estimativa)}` : ''}` : '';
  const corpo = `<div class="meio">
  <div class="nome">${esc(lot.nome)}</div>
  <div class="sub">Concurso ${r.concurso} · ${esc(dataLonga(r.data))}</div>
  ${numeros}
  ${extras.length ? `<div class="chips">${extras.map((e) => `<span class="chip">${esc(e)}</span>`).join('')}</div>` : ''}
  <div><span class="premio ${principal.acumulou ? 'acum' : ''}">${esc(principal.texto)}</span></div>
</div>
<div class="rodape">${prox ? `<div class="prox">${esc(prox)}</div>` : ''}<div class="legal">${esc(LEGAL)}</div></div>`;
  return pagina({ w, h, cor: lot.cor, cor2: lot.cor2, selo: 'RESULTADO', corpo });
}

export function htmlProximo(lot, r, w, h) {
  const p = r.proximo ?? {};
  const corpo = `<div class="meio">
  <div class="nome">${esc(lot.nome)}</div>
  <div class="sub">Concurso ${esc(p.concurso ?? '')}${r.acumulou ? ' · ACUMULADA!' : ''}</div>
  <div class="rot2">SORTEIO</div>
  <div class="data">${esc(dataLonga(p.data))}</div>
  ${p.estimativa ? `<div class="rot2">PRÊMIO ESTIMADO</div><div class="grande">${esc(valorCurto(p.estimativa))}</div>` : ''}
</div>
<div class="rodape"><div class="legal">${esc(LEGAL)}</div></div>`;
  return pagina({ w, h, cor: lot.cor, cor2: lot.cor2, selo: 'PRÓXIMO SORTEIO', corpo });
}

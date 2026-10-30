// SOBRE MÍDIA Studio — desenho DETERMINÍSTICO de uma cena (HTML). O mesmo HTML é usado:
//  - na prévia e no editor do navegador (iframe em escala);
//  - na montagem (Playwright no Actions), em tamanho real, para o MP4 e o PNG final.
// Preço, loja e condições são escritos aqui, a partir dos dados do pedido. Nenhuma IA desenha texto.
import { formatarPreco, precoDeVenda, type CenaPlano, type EdicaoCena, type Formato, type PedidoStudio, RESOLUCAO } from './contrato.ts';

export type Camada = 'completa' | 'fundo' | 'frente';

export interface DadosCena {
  formato: Formato;
  edicao: EdicaoCena;
  fundoUrl: string | null;
  produtoUrl: string | null;
  /** true quando a foto NÃO teve o fundo removido: entra numa moldura arredondada em vez de "flutuar" na cena */
  produtoEmMoldura?: boolean;
  produtoNome?: string | null;
  precoCentavos?: number | null;
  precoDeCentavos?: number | null; // "de R$ X" quando há promoção
  unidade?: string | null;
  estabelecimento?: string | null;
  rodape?: string | null; // condições / período
  rotulo?: string | null; // rótulo honesto (ex.: "Cenário criado por IA")
}

/** Dados de desenho de uma cena a partir do pedido (preço SEMPRE do produto gravado), da cena do plano e da edição. */
export function dadosDaCena(pedido: PedidoStudio, cena: Pick<CenaPlano, 'produto_id'>, edicao: EdicaoCena, fundoUrl: string | null, rotulo: string | null): DadosCena {
  const pr = cena.produto_id ? pedido.produtos.find((p) => p.id === cena.produto_id) ?? null : null;
  const foto = pr?.fotos?.[0];
  const recorte = !!(edicao.usar_recorte && foto?.recorte_url);
  return {
    formato: pedido.formato, edicao, fundoUrl,
    produtoUrl: foto ? (recorte ? foto.recorte_url! : foto.url) : null,
    produtoEmMoldura: foto ? !recorte : false,
    produtoNome: pr?.nome ?? null,
    precoCentavos: pr ? precoDeVenda(pr) : null,
    precoDeCentavos: pr?.preco_promo_centavos ? pr.preco_centavos : null,
    unidade: pr?.unidade ?? null,
    estabelecimento: pedido.briefing.estabelecimento ?? null,
    rodape: [pedido.briefing.condicoes, pedido.briefing.periodo].filter(Boolean).join(' · ') || null,
    rotulo,
  };
}

const FONTES: Record<EdicaoCena['fonte'], { familia: string; google: string; peso: number; caixaAlta: boolean }> = {
  anton: { familia: "'Anton', Impact, sans-serif", google: 'Anton', peso: 400, caixaAlta: true },
  bebas: { familia: "'Bebas Neue', Impact, sans-serif", google: 'Bebas+Neue', peso: 400, caixaAlta: true },
  montserrat: { familia: "'Montserrat', Arial, sans-serif", google: 'Montserrat:wght@800;900', peso: 900, caixaAlta: true },
  'fira-condensed': { familia: "'Fira Sans Extra Condensed', Arial Narrow, sans-serif", google: 'Fira+Sans+Extra+Condensed:wght@800;900', peso: 900, caixaAlta: true },
  poppins: { familia: "'Poppins', Arial, sans-serif", google: 'Poppins:wght@700;800', peso: 800, caixaAlta: false },
};

export const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const url = (u: string) => `url("${u.replace(/["\\\n]/g, '')}")`;

/** Endereço do Google Fonts da fonte escolhida (Inter entra sempre para os textos pequenos). */
export const linkDasFontes = (f: EdicaoCena['fonte']) =>
  `https://fonts.googleapis.com/css2?family=${FONTES[f].google}&family=Inter:wght@500;700;800;900&display=block`;

/** Documento HTML completo da cena, no tamanho real do formato (1920×1080, 1080×1920 ou 1080×1080). */
export function htmlDaCena(d: DadosCena, camada: Camada = 'completa'): string {
  const { w, h } = RESOLUCAO[d.formato];
  const e = d.edicao;
  const b = Math.min(w, h); // unidade base
  const vertical = d.formato === '9:16';
  const fonte = FONTES[e.fonte];
  const comFundo = camada !== 'frente';
  const comFrente = camada !== 'fundo';

  const preco = e.mostrar_preco && d.precoCentavos ? formatarPreco(d.precoCentavos) : null;
  const de = preco && d.precoDeCentavos && d.precoDeCentavos > (d.precoCentavos ?? 0) ? formatarPreco(d.precoDeCentavos) : null;

  // bloco de texto: posição por predefinição
  const largTexto = vertical ? 0.86 : e.texto_pos === 'centro' || e.texto_pos === 'topo' || e.texto_pos === 'base' ? 0.8 : 0.46;
  const posTexto: Record<EdicaoCena['texto_pos'], string> = {
    esquerda: `left:${0.06 * w}px; top:50%; transform:translateY(-50%); text-align:left; align-items:flex-start;`,
    direita: `right:${0.06 * w}px; top:50%; transform:translateY(-50%); text-align:right; align-items:flex-end;`,
    centro: `left:50%; top:50%; transform:translate(-50%,-50%); text-align:center; align-items:center;`,
    topo: `left:50%; top:${0.07 * h}px; transform:translateX(-50%); text-align:center; align-items:center;`,
    base: `left:50%; bottom:${0.13 * h}px; transform:translateX(-50%); text-align:center; align-items:center;`,
  };
  const tamTitulo = Math.round(b * (vertical ? 0.13 : 0.12) * (e.titulo.length > 28 ? 0.72 : e.titulo.length > 18 ? 0.86 : 1));
  const tamSub = Math.round(b * 0.045);

  // produto: centro em produto_x/produto_y, altura em % da altura da tela
  const altProd = (e.produto_altura / 100) * h;
  const fotoProd = d.produtoUrl;

  // selo de preço perto do produto (lado de dentro da tela)
  const tamSelo = Math.round(b * (vertical ? 0.3 : 0.27));
  // posição inicial: canto inferior direito do produto; o script "conterPreco" (abaixo) garante que o selo fique inteiro
  // dentro da tela e acima do rodapé — igual na prévia e no vídeo
  const seloX = (e.produto_x / 100) * w + altProd * (vertical ? 0.05 : 0.12);
  const seloY = (e.produto_y / 100) * h + altProd * 0.12;
  const moldura = !!d.produtoEmMoldura;
  const altFoto = moldura ? altProd * 0.82 : altProd;

  const rodape = [d.estabelecimento, d.rodape].filter((x) => x && x.trim()).map((x) => esc(x!.trim())).join('  •  ');

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${linkDasFontes(e.fonte)}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:${camada === 'frente' ? 'transparent' : '#05050a'}}
#cena{position:relative;width:${w}px;height:${h}px;overflow:hidden;font-family:Inter,Arial,sans-serif}
#fundo{position:absolute;inset:0;${d.fundoUrl ? `background-image:${url(d.fundoUrl)};background-size:cover;background-position:${e.fundo_x}% ${e.fundo_y}%;` : 'background:radial-gradient(ellipse at 60% 40%,#3b1d6e 0%,#0b0718 60%,#05050a 100%);'}}
#veu{position:absolute;inset:0;background:
 linear-gradient(${vertical ? '180deg' : e.texto_pos === 'direita' ? '270deg' : '90deg'},rgba(0,0,0,${Math.min(0.92, e.escurecer_fundo + 0.35)}) 0%,rgba(0,0,0,${e.escurecer_fundo}) 45%,rgba(0,0,0,${Math.max(0, e.escurecer_fundo - 0.2)}) 100%),
 radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,.55) 100%)}
#produto{position:absolute;left:${(e.produto_x / 100) * w}px;top:${(e.produto_y / 100) * h}px;height:${altFoto}px;width:${moldura ? altFoto : altProd * 1.2}px;transform:translate(-50%,-50%);
 background-image:${fotoProd ? url(fotoProd) : 'none'};background-repeat:no-repeat;
 ${moldura
    ? `background-size:cover;background-position:center;border-radius:${b * 0.03}px;border:${Math.max(4, b * 0.008)}px solid rgba(255,255,255,.92);box-shadow:0 ${b * 0.03}px ${b * 0.06}px rgba(0,0,0,.7),0 0 ${b * 0.08}px rgba(255,255,255,.12)`
    : `background-size:contain;background-position:center bottom;filter:drop-shadow(0 ${b * 0.03}px ${b * 0.04}px rgba(0,0,0,.65)) drop-shadow(0 0 ${b * 0.05}px rgba(255,255,255,.12))`}}
#chao{position:absolute;left:${(e.produto_x / 100) * w}px;top:${(e.produto_y / 100) * h + altProd * 0.47}px;width:${altProd * 0.9}px;height:${altProd * 0.12}px;transform:translate(-50%,-50%);
 background:radial-gradient(ellipse at center,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 70%)}
#texto{position:absolute;${posTexto[e.texto_pos]}width:${largTexto * w}px;display:flex;flex-direction:column;gap:${b * 0.015}px}
#titulo{font-family:${fonte.familia};font-weight:${fonte.peso};font-size:${tamTitulo}px;line-height:.95;color:${e.cor_texto};
 ${fonte.caixaAlta ? 'text-transform:uppercase;' : ''}letter-spacing:.01em;text-shadow:0 ${b * 0.006}px ${b * 0.02}px rgba(0,0,0,.7)}
#sub{font-weight:800;font-size:${tamSub}px;color:${e.cor_destaque};text-transform:uppercase;letter-spacing:.06em;text-shadow:0 2px 10px rgba(0,0,0,.7)}
#faixa{width:${b * 0.12}px;height:${b * 0.012}px;background:${e.cor_destaque};border-radius:${b}px}
#preco{position:absolute;left:${seloX}px;top:${seloY}px;min-width:${tamSelo * 1.15}px;padding:${tamSelo * 0.09}px ${tamSelo * 0.14}px;border-radius:${tamSelo * 0.12}px;
 background:linear-gradient(160deg,${e.cor_selo} 0%,${e.cor_selo} 60%,rgba(0,0,0,.25) 140%);color:#fff;transform:rotate(-4deg);
 box-shadow:0 ${b * 0.015}px ${b * 0.04}px rgba(0,0,0,.55), inset 0 0 0 ${Math.max(2, b * 0.004)}px rgba(255,255,255,.35);font-family:${fonte.familia};line-height:1}
#de{font-family:Inter,Arial,sans-serif;font-weight:700;font-size:${tamSelo * 0.13}px;opacity:.92;text-decoration:line-through;margin-bottom:${tamSelo * 0.03}px}
#valor{display:flex;align-items:flex-start;gap:${tamSelo * 0.03}px}
#rs{font-size:${tamSelo * 0.18}px;margin-top:${tamSelo * 0.06}px;font-family:Inter,Arial,sans-serif;font-weight:800}
#int{font-family:Inter,Arial,sans-serif;font-size:${tamSelo * 0.5}px;font-weight:900;letter-spacing:-.03em}
#cent{display:flex;flex-direction:column;font-family:Inter,Arial,sans-serif;font-weight:900;font-size:${tamSelo * 0.24}px;margin-top:${tamSelo * 0.04}px}
#un{font-family:Inter,Arial,sans-serif;font-weight:700;font-size:${tamSelo * 0.1}px;margin-top:${tamSelo * 0.02}px;text-transform:lowercase}
#rodape{position:absolute;left:0;right:0;bottom:0;padding:${b * 0.022}px ${b * 0.05}px;background:linear-gradient(0deg,rgba(0,0,0,.85),rgba(0,0,0,0));
 color:#fff;font-weight:700;font-size:${b * 0.03}px;letter-spacing:.03em;text-align:center}
#rotulo{position:absolute;right:${b * 0.015}px;top:${b * 0.015}px;font-size:${b * 0.014}px;font-weight:500;color:rgba(255,255,255,.55);letter-spacing:.04em}
</style></head><body><div id="cena">
${comFundo ? '<div id="fundo"></div><div id="veu"></div>' : ''}
${comFrente && fotoProd ? `${moldura ? '' : '<div id="chao"></div>'}<div id="produto"></div>` : ''}
${comFrente ? `<div id="texto"><div id="faixa"></div><div id="titulo">${esc(e.titulo)}</div>${e.subtitulo ? `<div id="sub">${esc(e.subtitulo)}</div>` : ''}</div>` : ''}
${comFrente && preco ? `<div id="preco" data-preco="${preco.completo}">${de ? `<div id="de">de R$ ${de.completo}</div>` : ''}<div id="valor"><span id="rs">R$</span><span id="int">${preco.inteiro}</span><span id="cent"><span id="cv">,<span id="cd">${preco.centavos}</span></span>${d.unidade ? `<span id="un">${esc(d.unidade)}</span>` : ''}</span></div></div>` : ''}
${comFrente && rodape ? `<div id="rodape">${rodape}</div>` : ''}
${comFrente && d.rotulo ? `<div id="rotulo">${esc(d.rotulo)}</div>` : ''}
</div>
<script>${SCRIPT_DO_QUADRO}</script></body></html>`;
}

/**
 * Animação determinística: a montagem chama window.quadro(t, duracao, camera) para cada quadro (30 por segundo)
 * e fotografa a página. Sem chamar, a cena fica no estado final (prévia, PNG e OCR).
 * Fundo: movimento de câmera lento (Ken Burns). Produto: entra crescendo e flutua. Texto e preço: entram em sequência.
 */
const SCRIPT_DO_QUADRO = `
/* mantém o selo de preço inteiro dentro da tela e acima do rodapé (chamado na prévia, na arte e no 1º quadro) */
window.conterPreco = function () {
  var el = document.getElementById('preco');
  if (!el || el.dataset.contido) return;
  var W = document.getElementById('cena').clientWidth, H = document.getElementById('cena').clientHeight;
  var m = Math.min(W, H) * 0.03;
  var rd = document.getElementById('rodape');
  var limiteBaixo = H - m - (rd ? rd.offsetHeight : 0);
  var r = el.getBoundingClientRect();
  var dx = 0, dy = 0;
  if (r.right > W - m) dx = (W - m) - r.right;
  if (r.left + dx < m) dx = m - r.left;
  if (r.bottom > limiteBaixo) dy = limiteBaixo - r.bottom;
  if (r.top + dy < m) dy = m - r.top;
  el.style.left = (el.offsetLeft + dx) + 'px';
  el.style.top = (el.offsetTop + dy) + 'px';
  el.dataset.contido = '1';
};
if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { window.conterPreco(); });
window.quadro = function (t, dur, camera) {
  window.conterPreco();
  var p = Math.max(0, Math.min(1, t / dur));
  var suave = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); };
  var f = document.getElementById('fundo');
  if (f) {
    var s = 1.06, tx = 0, ty = 0;
    if (camera === 'aproximar') s = 1.04 + 0.12 * p;
    else if (camera === 'afastar') s = 1.16 - 0.12 * p;
    else if (camera === 'deslizar_esquerda') { s = 1.12; tx = 4 - 8 * p; }
    else if (camera === 'deslizar_direita') { s = 1.12; tx = -4 + 8 * p; }
    else if (camera === 'subir') { s = 1.12; ty = 4 - 8 * p; }
    else if (camera === 'descer') { s = 1.12; ty = -4 + 8 * p; }
    else s = 1.04 + 0.03 * p;
    f.style.transform = 'translate(' + tx + '%,' + ty + '%) scale(' + s + ')';
  }
  var pr = document.getElementById('produto');
  if (pr) {
    var e = suave(t / 0.7);
    pr.style.opacity = String(Math.min(1, t / 0.35));
    pr.style.transform = 'translate(-50%,-50%) translateY(' + (Math.sin(t * 1.6) * 0.6) + '%) scale(' + (0.9 + 0.1 * e) + ')';
  }
  var tx2 = document.getElementById('texto');
  if (tx2) { var a = suave((t - 0.15) / 0.6); tx2.style.opacity = String(a); tx2.style.marginTop = ((1 - a) * 40) + 'px'; }
  var pc = document.getElementById('preco');
  if (pc) { var b = suave((t - 0.45) / 0.45); pc.style.opacity = String(b); pc.style.transform = 'rotate(-4deg) scale(' + (0.6 + 0.4 * b) + ')'; }
  var rd = document.getElementById('rodape');
  if (rd) rd.style.opacity = String(suave((t - 0.3) / 0.5));
};`;

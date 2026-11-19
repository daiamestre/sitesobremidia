/**
 * F-332 (pedido do dono, 19/11/2026: "quero que não aconteça mais falhas"): TESTE COMPLETO do Editor de Áudio em tamanho de
 * CELULAR, com a conta de TESTE (nunca conta pessoal). Roda os toques e botões de verdade e para no primeiro que falhar.
 * Rodar ANTES de publicar qualquer mudança no editor:
 *   node scripts/ops/testar-editor-audio.mjs                      → no site local (sobe o vite se precisar)
 *   node scripts/ops/testar-editor-audio.mjs https://sitesobremidia.vercel.app   → no site no ar
 * Sai com código 1 se algum passo falhar. Os salvos/rascunhos criados no teste são apagados no fim.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/** usa o Chromium já baixado no PC (qualquer versão), se o da versão do Playwright não estiver lá */
function chromeNoPc() {
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  try { for (const d of fs.readdirSync(base).filter((x) => /^chromium-[0-9]+$/.test(x)).sort().reverse()) { const exe = path.join(base, d, 'chrome-win64', 'chrome.exe'); if (fs.existsSync(exe)) return exe; } } catch { /* */ }
  return undefined;
}

const URL_BASE = (process.argv[2] ?? 'http://localhost:5199').replace(/\/$/, '');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const filhos = [];
const sair = (c) => { for (const f of filhos) { try { f.kill(); } catch { /* */ } } process.exit(c); };

async function noAr(url) { try { const r = await fetch(url); return r.ok; } catch { return false; } }
if (URL_BASE.includes('localhost') && !(await noAr(URL_BASE))) {
  console.log('… subindo o site local');
  const v = spawn('npx vite --port 5199 --strictPort', { shell: true, stdio: 'ignore' }); filhos.push(v);
  for (let k = 0; k < 90 && !(await noAr(URL_BASE)); k++) await espera(1000);
}
// sessão da conta de teste (entregue uma vez pelo sessao-teste.mjs)
const s = spawn('node', ['scripts/ops/sessao-teste.mjs', 'e2e-owner@sobremidia.com.br', URL_BASE], { stdio: 'ignore' }); filhos.push(s);
let sessao = null;
for (let k = 0; k < 40 && !sessao; k++) { await espera(500); try { sessao = await (await fetch('http://127.0.0.1:8767/')).json(); } catch { /* ainda não */ } }
if (!sessao?.key) { console.error('✗ não consegui a sessão da conta de teste'); sair(1); }

const navegador = await chromium.launch({ executablePath: chromeNoPc(), args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await navegador.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, permissions: ['microphone'] });
const pagina = await ctx.newPage();
const erros = [];
pagina.on('pageerror', (e) => erros.push(String(e)));
await pagina.goto(URL_BASE + '/');
await pagina.evaluate(([k, v]) => localStorage.setItem(k, v), [sessao.key, JSON.stringify(sessao.session)]);
await pagina.evaluate(() => indexedDB.deleteDatabase('sobremidia-editor-de-audio'));
await pagina.goto(URL_BASE + '/studio/editor-de-audio');
await pagina.waitForSelector('[data-testid=editor-audio-arquivo]', { state: 'attached', timeout: 90_000 });

let ok = 0, falhas = 0;
async function passo(nome, fn) {
  try { const r = await fn(); if (r !== true && r !== undefined) throw new Error(typeof r === 'string' ? r : JSON.stringify(r)); console.log(`✓ ${nome}`); ok++; }
  catch (e) { console.log(`✗ ${nome} — ${e instanceof Error ? e.message : e}`); falhas++; }
}
// ajudantes dentro da página: toques sintéticos de dedo na pista
await pagina.addScriptTag({ content: `
  window.__e = (alvo, t, id, x, y) => alvo.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, button: 0, buttons: 1 }));
  window.__pista = (n = 0) => document.querySelectorAll('[data-testid=editor-audio-pista]')[n];
  window.__faixas = () => [...document.querySelectorAll('[data-faixa]')].map((d) => d.dataset.clipes);
  window.__esp = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__toque = async (x, n = 0) => { const c = __pista(n), r = c.getBoundingClientRect(); if (r.left + x > innerWidth - 4) throw new Error('toque fora da tela'); __e(c, 'pointerdown', 901, r.left + x, r.top + 70); await __esp(40); __e(c, 'pointerup', 901, r.left + x, r.top + 70); await __esp(250); };
  window.__arrastar = async (x, dx, n = 0, dy = 0, segurar = 30) => { const c = __pista(n), r = c.getBoundingClientRect(); __e(c, 'pointerdown', 902, r.left + x, r.top + 70); await __esp(segurar);
    for (let k = 1; k <= 8; k++) { __e(c, 'pointermove', 902, r.left + x + dx * k / 8, r.top + 70 + dy * k / 8); await __esp(25); } __e(c, 'pointerup', 902, r.left + x + dx, r.top + 70 + dy); await __esp(300); };
  window.__relogio = () => document.querySelector('[data-testid=editor-audio-relogio]').textContent;
  window.__trecho = () => document.querySelector('.font-mono.text-\\\\[10px\\\\]')?.textContent;
` });

await passo('o editor abre no modo celular, sem a tela vazar para os lados', () => pagina.evaluate(() =>
  document.querySelector('[data-testid=editor-de-audio]')?.dataset.modo === 'celular' && document.documentElement.scrollWidth <= innerWidth + 1 || `largura ${document.documentElement.scrollWidth}`));
await passo('enviar áudio do aparelho abre a faixa', async () => {
  await pagina.evaluate(async () => { const b = await (await fetch('/studio/trilhas/varejo-dinamico.mp3')).blob(); const dt = new DataTransfer(); dt.items.add(new File([b], 'teste.mp3', { type: 'audio/mpeg' }));
    const i = document.querySelector('[data-testid=editor-audio-arquivo]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await pagina.waitForSelector('[data-testid=editor-audio-pista]', { timeout: 20_000 });
  const f = await pagina.evaluate(() => __faixas()); return f.length === 1 && /^0\.00\+117/.test(f[0]) || f;
});
await passo('tocar no clipe põe a linha amarela ali (2 s)', () => pagina.evaluate(async () => { await __toque(160); return __relogio() === '0:02.000' || __relogio(); }));
await passo('Cortar corta o clipe na linha amarela', () => pagina.evaluate(async () => { document.querySelector('button[title^="Cortar:"]').click(); await __esp(300); const f = __faixas(); return f[0] === '0.00+2.00 2.00+115.14' || f; }));
await passo('Voltar e Avançar', () => pagina.evaluate(async () => {
  document.querySelector('button[title="Voltar o que foi feito"]').click(); await __esp(250); const a = __faixas()[0];
  document.querySelector('button[title="Avançar de novo"]').click(); await __esp(250); const b = __faixas()[0];
  return (a === '0.00+117.14' && b === '0.00+2.00 2.00+115.14') || [a, b]; }));
await passo('PASSAR O DEDO no clipe rola a linha do tempo e o clipe NÃO vem junto', () => pagina.evaluate(async () => {
  const el = document.querySelector('.overflow-x-auto'); el.scrollLeft = 300; await __esp(150); const a = JSON.stringify(__faixas()), s0 = el.scrollLeft;
  await __arrastar(120, 60); const r = el.scrollLeft < s0 - 30 && JSON.stringify(__faixas()) === a; el.scrollLeft = 0; await __esp(150); return r || [s0, el.scrollLeft, __faixas()]; }));
await passo('SEGURAR o clipe e arrastar move o clipe', () => pagina.evaluate(async () => { await __arrastar(200, 40, 0, 0, 550); const f = __faixas(); return f[0] === '0.00+2.00 2.50+115.14' || f; }));
await passo('um toque rápido não move o clipe', () => pagina.evaluate(async () => { const a = JSON.stringify(__faixas()); await __toque(40); return JSON.stringify(__faixas()) === a || __faixas(); }));
await passo('deslizar no espaço vazio rola o áudio e não mexe nos clipes', () => pagina.evaluate(async () => {
  const el = document.querySelector('.overflow-x-auto'); const a = JSON.stringify(__faixas()); const s0 = el.scrollLeft; await __arrastar(180, -100);
  const r = el.scrollLeft > s0 + 50 && JSON.stringify(__faixas()) === a; el.scrollLeft = 0; await __esp(150); return r || [s0, el.scrollLeft, __faixas()]; }));
await passo('tocar FORA do clipe (régua ou resto da tela) desmarca o clipe; botões de ação mantêm', () => pagina.evaluate(async () => {
  const raiz = document.querySelector('[data-testid=editor-de-audio]');
  await __toque(60); const escolhido = raiz.dataset.clipeEscolhido;
  document.querySelector('[data-testid=editor-audio-doca]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); await __esp(150); const aposBotao = raiz.dataset.clipeEscolhido;
  const regua = document.querySelector('.overflow-x-auto canvas'), rr = regua.getBoundingClientRect(); __e(regua, 'pointerdown', 905, rr.left + 40, rr.top + 10); __e(regua, 'pointerup', 905, rr.left + 40, rr.top + 10); await __esp(150); const aposRegua = raiz.dataset.clipeEscolhido;
  await __toque(60); document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); await __esp(150); const aposFora = raiz.dataset.clipeEscolhido;
  return (escolhido && aposBotao === escolhido && aposRegua === '' && aposFora === '') || { escolhido, aposBotao, aposRegua, aposFora }; }));
await passo('Marcar trecho marca arrastando, sem mover clipe; Desmarcar limpa', () => pagina.evaluate(async () => {
  const a = JSON.stringify(__faixas());
  document.querySelector('button[title^="Marcar trecho"]').click(); await __esp(150); await __arrastar(20, 100); const marcado = __trecho();
  document.querySelector('button[title^="Desmarcar"]').click(); await __esp(200);
  return (/→/.test(marcado) && JSON.stringify(__faixas()) === a && /sem trecho/.test(__trecho())) || [marcado, __trecho()]; }));
await passo('Apagar tira o clipe escolhido (e Voltar devolve)', () => pagina.evaluate(async () => {
  await __toque(230); document.querySelector('button[title="Apagar o trecho ou o clipe"]').click(); await __esp(250); const a = __faixas()[0];
  document.querySelector('button[title="Voltar o que foi feito"]').click(); await __esp(250); return (a === '0.00+2.00' && __faixas()[0] === '0.00+2.00 2.50+115.14') || [a, __faixas()[0]]; }));
await passo('arrastar a parte para baixo cria faixa nova', () => pagina.evaluate(async () => {
  const c = __pista(0), r = c.getBoundingClientRect(); __e(c, 'pointerdown', 903, r.left + 230, r.top + 70); await __esp(550);
  for (let k = 1; k <= 4; k++) { __e(c, 'pointermove', 903, r.left + 230, r.top + 70 + 10 * k); await __esp(30); }
  await __esp(150); const z = document.querySelector('[data-testid=editor-audio-nova-faixa]')?.getBoundingClientRect(); if (!z) return 'a área de faixa nova não apareceu';
  for (let k = 1; k <= 6; k++) { __e(c, 'pointermove', 903, r.left + 230, z.top + 30); await __esp(40); }
  const sob = document.elementFromPoint(r.left + 230, z.top + 30); const vert = c.closest('.overflow-y-auto')?.getBoundingClientRect(); window.__diag = { z: [Math.round(z.top), Math.round(z.bottom)], vert: vert && [Math.round(vert.top), Math.round(vert.bottom)], sob: sob?.tagName + ' ' + (sob?.dataset?.testid ?? sob?.className?.toString().slice(0, 40)), dedoY: Math.round(z.top + 30), inner: innerHeight };
  __e(c, 'pointerup', 903, r.left + 230, z.top + 30); await __esp(400); const f = __faixas(); return (f.length === 2 && f[1] !== '') || [f, window.__diag]; }));
await passo('Voltar desfaz a faixa nova', () => pagina.evaluate(async () => { for (let k = 0; k < 3 && __faixas().length > 1; k++) { document.querySelector('button[title="Voltar o que foi feito"]').click(); await __esp(250); } return __faixas().length === 1 || __faixas(); }));
await passo('PLAY toca: o relógio anda e a linha amarela fica visível', async () => {
  await pagina.evaluate(async () => { await __toque(20); });
  await pagina.click('button[title="Tocar"]'); await espera(1600);
  const r = await pagina.evaluate(() => ({ t: __relogio(), vis: document.querySelector('.shadow-\\[0_0_8px_\\#FFD400\\]')?.style.visibility }));
  await pagina.click('button[title="Pausar"]').catch(() => {});
  const seg = Number(r.t.split(':')[1]); return (seg >= 0.8 && r.vis !== 'hidden') || r;
});
await passo('a linha amarela (pegando nela) leva o cursor e o áudio acompanha na borda', () => pagina.evaluate(async () => {
  const el = document.querySelector('.overflow-x-auto'); el.scrollLeft = 0; await __esp(200); await __toque(80);
  const lp = document.querySelector('[data-testid=editor-audio-linha-pegar]'), lr = lp.getBoundingClientRect(), rp = __pista().getBoundingClientRect(), x0 = lr.left + lr.width / 2;
  __e(lp, 'pointerdown', 904, x0, rp.top + 70); for (let k = 1; k <= 8; k++) { __e(lp, 'pointermove', 904, x0 + (rp.right - 8 - x0) * k / 8, rp.top + 70); await __esp(30); }
  for (let k = 0; k < 20; k++) { __e(lp, 'pointermove', 904, rp.right - 8 + (k % 2), rp.top + 70); await __esp(80); }
  const s1 = el.scrollLeft; __e(lp, 'pointerup', 904, rp.right - 8, rp.top + 70); await __esp(200); el.scrollLeft = 0; return s1 > 200 || `rolou ${s1}`; }));
await passo('a rolagem da borda é controlada: tirou o dedo da borda ou soltou, PARA na hora', () => pagina.evaluate(async () => {
  const el = document.querySelector('.overflow-x-auto'); el.scrollLeft = 0; await __esp(200); await __toque(80);
  const lp = document.querySelector('[data-testid=editor-audio-linha-pegar]'), lr = lp.getBoundingClientRect(), rp = __pista().getBoundingClientRect(), x0 = lr.left + lr.width / 2;
  __e(lp, 'pointerdown', 906, x0, rp.top + 70); for (let k = 1; k <= 6; k++) { __e(lp, 'pointermove', 906, x0 + (rp.right - 8 - x0) * k / 6, rp.top + 70); await __esp(30); }
  await __esp(1000); const andou1s = el.scrollLeft;
  __e(lp, 'pointermove', 906, rp.left + (rp.width / 2), rp.top + 70); await __esp(100); const aoSair = el.scrollLeft; await __esp(400); const depois = el.scrollLeft;
  __e(lp, 'pointerup', 906, rp.left + (rp.width / 2), rp.top + 70); await __esp(300); const solto = el.scrollLeft; el.scrollLeft = 0;
  // em 1 s na borda anda no máximo ~800 px (antes passava de 3.000) e para quando o dedo sai
  return (andou1s > 50 && andou1s < 900 && depois === aoSair && solto === depois) || { andou1s, aoSair, depois, solto }; }));
await passo('PUXADORES: o clipe escolhido tem uma alça em cada ponta; arrastar apara na hora, com precisão', () => pagina.evaluate(async () => {
  const el = document.querySelector('.overflow-x-auto'); el.scrollLeft = 0; await __esp(150);
  const antes = __faixas()[0];
  await __toque(230); await __esp(150);
  const pi = document.querySelector('[data-testid=editor-audio-puxador-inicio]'), pf = document.querySelector('[data-testid=editor-audio-puxador-fim]');
  if (!pi) return 'sem puxador do começo';
  const r = pi.getBoundingClientRect(), y = r.top + r.height / 2;
  // a alça do começo fica do lado de FORA: a borda do clipe é a direita dela
  const fora = r.right <= __pista().getBoundingClientRect().left + 2.5 * 80 - document.querySelector('.overflow-x-auto').scrollLeft + 1;
  const x0 = r.right - 2; __e(pi, 'pointerdown', 921, x0, y); for (let k = 1; k <= 6; k++) { __e(pi, 'pointermove', 921, x0 + 4 * k, y); await __esp(25); } __e(pi, 'pointerup', 921, x0 + 24, y); await __esp(300);
  if (!fora) return 'a alça do começo não está do lado de fora do clipe';
  const depois = __faixas()[0];
  document.querySelector('button[title="Voltar o que foi feito"]').click(); await __esp(250);
  return (depois !== antes && /2\.(8|7|9)\d\+/.test(depois) && __faixas()[0] === antes) || { antes, depois, voltou: __faixas()[0], pf: !!pf }; }));
await passo('PINÇA: a linha amarela fica parada no mesmo ponto da onda (mesmo com um dedo em cima dela)', () => pagina.evaluate(async () => {
  const el = document.querySelector('.overflow-x-auto'); el.scrollLeft = 0; await __esp(200); await __toque(100);
  const t0 = __relogio(), linha = document.querySelector('[data-testid=editor-audio-linha]'), larg0 = el.firstElementChild.style.width;
  const lp = document.querySelector('[data-testid=editor-audio-linha-pegar]'), lr = lp.getBoundingClientRect(), rp = __pista().getBoundingClientRect(), y = rp.top + 60, xl = lr.left + lr.width / 2;
  __e(lp, 'pointerdown', 911, xl, y); await __esp(40); __e(__pista(), 'pointerdown', 912, xl + 50, y + 10);
  for (let k = 1; k <= 10; k++) { __e(lp, 'pointermove', 911, xl - 6 * k, y); __e(__pista(), 'pointermove', 912, xl + 50 + 6 * k, y + 10); await __esp(25); }
  __e(lp, 'pointerup', 911, xl - 60, y); __e(__pista(), 'pointerup', 912, xl + 110, y + 10); await __esp(400);
  const t1 = __relogio(), larg1 = el.firstElementChild.style.width;
  const zoom = parseFloat(larg1) / parseFloat(larg0) * 80, xLinha = parseFloat(linha.style.transform.slice(11)), esperado = parseFloat(t1.split(':')[1]) * zoom - el.scrollLeft;
  return (t1 === t0 && parseFloat(larg1) > parseFloat(larg0) * 1.5 && Math.abs(xLinha - esperado) < 3) || { t0, t1, larg0, larg1, xLinha, esperado }; }));
await passo('Salvar vai para a Biblioteca (no sistema) e a tela volta do zero, sem zoom', async () => {
  await pagina.click('button[title="Salvar na Biblioteca de Áudios"]');
  const campo = pagina.locator('[data-testid=editor-audio-nome-salvar]'); await campo.fill('TESTE AUTOMÁTICO F-332');
  const fonte = await campo.evaluate((el) => getComputedStyle(el).fontSize);
  if (fonte !== '16px') return `letra do campo ${fonte} (o iPhone dá zoom abaixo de 16px)`;
  await pagina.evaluate(() => { window.__salvo = JSON.stringify(__faixas()); });
  await pagina.click('[data-testid=editor-audio-confirmar-salvar]');
  const limpou = await pagina.waitForFunction(() => !document.querySelector('[data-testid=editor-audio-pista]'), null, { timeout: 90_000 }).then(() => true).catch(() => false);
  if (!limpou) return await pagina.evaluate(() => ({ nao_limpou: true, avisos: [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent), ocupado: document.querySelector('.animate-spin')?.parentElement?.textContent }));
  return true;
});
await passo('a Biblioteca mostra o salvo e ele abre de novo', async () => {
  await pagina.click('button[title="Biblioteca de Áudios"]');
  await pagina.waitForSelector('[data-testid=editor-audio-item-pasta]', { timeout: 20_000 });
  const tem = await pagina.evaluate(() => [...document.querySelectorAll('[data-testid=editor-audio-item-pasta] input')].some((i) => i.value === 'TESTE AUTOMÁTICO F-332'));
  if (!tem) return 'o salvo não apareceu';
  await pagina.evaluate(() => [...document.querySelectorAll('[data-testid=editor-audio-item-pasta]')].find((d) => d.querySelector('input').value === 'TESTE AUTOMÁTICO F-332').querySelector('button').click());
  await pagina.waitForSelector('[data-testid=editor-audio-pista]', { timeout: 60_000 });
  const f = await pagina.evaluate(() => [JSON.stringify(__faixas()), window.__salvo]); return f[0] === f[1] || f;
});
await passo('Nova edição guarda nos rascunhos e "Voltar a editar de onde parei" traz de volta', async () => {
  await pagina.evaluate(async () => { await __toque(40); document.querySelector('button[title="Cortar: corta o clipe na linha amarela (ou tira o trecho marcado)"]').click(); await __esp(200); });
  await pagina.evaluate(() => { [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent === 'Adicionar').click(); });
  await pagina.click('button[title^="Nova edição"]');
  await pagina.waitForSelector('[data-testid=editor-audio-anterior]', { timeout: 60_000 });
  await pagina.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Voltar a editar de onde parei').click());
  await pagina.waitForSelector('[data-testid=editor-audio-pista]', { timeout: 60_000 });
  const f = await pagina.evaluate(() => __faixas()); return f[0]?.split(' ').length === 3 || f;
});
await passo('ESTRESSE: 60 ações seguidas (tocar, cortar, segurar e arrastar, deslizar, alças, voltar) sem lasquinhas e sem travar', () => pagina.evaluate(async () => {
  let semente = 7; const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent === 'Cortes')?.click(); await __esp(150);
  const el = document.querySelector('.overflow-x-auto'); el.scrollLeft = 0; await __esp(150);
  const raiz = document.querySelector('[data-testid=editor-de-audio]');
  const pista = () => __pista(), larg = () => pista().getBoundingClientRect().width;
  const segurarArrastar = async (x, dx, id) => { const c = pista(), r = c.getBoundingClientRect(); __e(c, 'pointerdown', id, r.left + x, r.top + 70); await __esp(480); for (let k = 1; k <= 6; k++) { __e(c, 'pointermove', id, r.left + x + dx * k / 6, r.top + 70); await __esp(20); } __e(c, 'pointerup', id, r.left + x + dx, r.top + 70); await __esp(120); };
  for (let i = 0; i < 60; i++) {
    const x = 20 + rnd() * (larg() - 40), acao = Math.floor(rnd() * 7), id = 1000 + i;
    if (acao === 0) await __toque(x);
    else if (acao === 1) { await __toque(x); document.querySelector('button[title^="Cortar:"]').click(); await __esp(80); }
    else if (acao === 2) await segurarArrastar(x, (rnd() - 0.5) * 120, id);
    else if (acao === 3) { await __arrastar(x, (rnd() - 0.5) * 160); }
    else if (acao === 4) { await __toque(x); const pi = document.querySelector('[data-testid=editor-audio-puxador-fim]'); if (pi) { const r = pi.getBoundingClientRect(); __e(pi, 'pointerdown', id, r.left + 2, r.top + 10); for (let k = 1; k <= 4; k++) { __e(pi, 'pointermove', id, r.left + 2 - 5 * k, r.top + 10); await __esp(20); } __e(pi, 'pointerup', id, r.left - 18, r.top + 10); await __esp(100); } }
    else if (acao === 5) { document.querySelector('button[title="Voltar o que foi feito"]').click(); await __esp(60); }
    else { const c = pista(), r = c.getBoundingClientRect(); __e(c, 'pointerdown', id, r.left + x, r.top + 70); await __esp(30); /* dedo "perdido": o celular não manda o soltar */ }
  }
  el.scrollLeft = 0; await __esp(300);
  // nenhuma lasquinha
  const durs = __faixas().flatMap((f) => f ? f.split(' ').map((p) => Number(p.split('+')[1])) : []);
  const lasca = durs.filter((d) => d < 0.02);
  if (lasca.length) return 'lasquinhas: ' + lasca.join(', ');
  // ainda responde: tocar escolhe e segurar+arrastar move
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 })); await __esp(100);
  // ver o projeto inteiro e pegar o MAIOR clipe pelo meio (sempre dentro da tela)
  document.querySelector('button[title="Ver tudo"]').click(); await __esp(400);
  const partes = __faixas()[0].split(' ').map((p) => p.split('+').map(Number));
  const fimProj = Math.max(...partes.map(([a, b]) => a + b)), zoomReal = parseFloat(el.firstElementChild.style.width) / (fimProj + 10);
  const [ini, dur] = partes.reduce((m, p) => (p[1] > m[1] ? p : m));
  const xMeio = (ini + dur / 2) * zoomReal - el.scrollLeft;
  await __toque(xMeio); const escolhido = raiz.dataset.clipeEscolhido;
  const d0 = window.__editorAudio; window.__diag0 = d0 ? { gesto: d0.gesto.current?.tipo ?? null, dedos: [...d0.dedos.current.keys()] } : null;
  const antes = JSON.stringify(__faixas()); await segurarArrastar(xMeio, 30, 1999); const mudou = JSON.stringify(__faixas()) !== antes;
  const d = window.__editorAudio; const diag = d ? { gesto: d.gesto.current?.tipo ?? null, dedos: [...d.dedos.current.keys()] } : null;
  return (escolhido && mudou) || { escolhido, mudou, faixas: __faixas(), diag, diag0: window.__diag0, xMeio };
}));
await passo('8 ÁUDIOS LONGOS ao mesmo tempo: abrem, o PLAY toca todos (relógio anda e o medidor mexe) e começa rápido', async () => {
  await pagina.evaluate(() => { [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent === 'Adicionar').click(); });
  await pagina.evaluate(() => document.querySelector('button[title^="Nova edição"]').click());
  await pagina.waitForFunction(() => !document.querySelector('[data-testid=editor-audio-pista]'), null, { timeout: 60_000 }).catch(() => { throw new Error('Nova edição não limpou a tela'); });
  await pagina.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Fechar aviso')?.click());
  const t0 = Date.now();
  await pagina.evaluate(async () => {
    const nomes = ['varejo-dinamico', 'ukulele-feliz', 'festa-boa', 'sertanejo-fenix', 'forro-alma-nordestina', 'funk-joga-bonito', 'black-friday', 'mega-promocao'];
    const dt = new DataTransfer();
    for (const n of nomes) dt.items.add(new File([await (await fetch('/studio/trilhas/' + n + '.mp3')).blob()], n + '.mp3', { type: 'audio/mpeg' }));
    const i = document.querySelector('[data-testid=editor-audio-arquivo]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await pagina.waitForFunction(() => document.querySelectorAll('[data-testid=editor-audio-pista]').length === 8, null, { timeout: 120_000 }).catch(async () => { throw new Error('não abriram os 8: ' + await pagina.evaluate(() => document.querySelectorAll('[data-testid=editor-audio-pista]').length)); });
  const abrir = Date.now() - t0;
  await pagina.evaluate(async () => { document.querySelector('.overflow-x-auto').scrollLeft = 0; await __toque(5); });
  const tp = Date.now(); await pagina.click('button[title="Tocar"]', { timeout: 8000 }).catch(async () => { throw new Error('não deu para tocar no PLAY: ' + JSON.stringify(await pagina.evaluate(async () => { const t0 = performance.now(); await new Promise((r) => setTimeout(r, 0)); const atraso = Math.round(performance.now() - t0); const b = document.querySelector('button[title="Tocar"]'); const r = b?.getBoundingClientRect(); const em = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null; const cam = []; for (let n = em; n && cam.length < 8; n = n.parentElement) cam.push(n.tagName + (n.dataset?.testid ? '#' + n.dataset.testid : '') + (n.dataset?.faixa ? '[faixa]' : '') + '.' + (n.className?.toString().slice(0, 40) ?? '')); const doca = document.querySelector('[data-testid=editor-audio-doca]')?.getBoundingClientRect(); return { avisos: [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent.slice(0, 80)), atraso, ret: r && [Math.round(r.top), Math.round(r.bottom), innerHeight], doca: doca && [Math.round(doca.top), Math.round(doca.bottom)], scrollY, cam }; }))); });
  await pagina.waitForFunction(() => Number(document.querySelector('[data-testid=editor-audio-relogio]').textContent.split(':')[1]) > 0.2, null, { timeout: 15_000 }).catch(() => {});
  const comecou = Date.now() - tp; await espera(1200);
  const r = await pagina.evaluate(() => ({ t: document.querySelector('[data-testid=editor-audio-relogio]').textContent, medidor: [...document.querySelectorAll('[data-testid=editor-audio-doca] ~ * , [data-testid=editor-de-audio] .h-2 > div')].map((d) => d.style.width).filter(Boolean) }));
  await pagina.click('button[title="Pausar"]').catch(() => {});
  const seg = Number(r.t.split(':')[1]), medidorMexeu = r.medidor.some((w) => parseFloat(w) > 5);
  return (seg >= 1 && comecou < 2500 && medidorMexeu) || { ...r, abrir, comecou };
});
await passo('recarregar a página com os 8 áudios: a edição volta inteira (salva no aparelho, um som de cada vez)', async () => {
  await espera(4000); // dá tempo do salvamento automático (2,5 s)
  await pagina.reload();
  await pagina.waitForSelector('[data-testid=editor-audio-pista]', { timeout: 90_000 }).catch(() => {});
  await espera(1500);
  const n = await pagina.evaluate(() => document.querySelectorAll('[data-testid=editor-audio-pista]').length);
  await pagina.addScriptTag({ content: 'window.__faixas = () => [...document.querySelectorAll("[data-faixa]")].map((d) => d.dataset.clipes);' });
  return n === 8 || 'voltaram ' + n + ' faixas';
});
const colados = (f) => { const p = f.split(' ').map((x) => x.split('+').map(Number)); return p.every((c, i) => i === 0 || Math.abs(c[0] - (p[i - 1][0] + p[i - 1][1])) < 0.02); };
await passo('EM SEQUÊNCIA: os 8 clipes vão para uma faixa só, um atrás do outro, sem espaço', async () => {
  await pagina.evaluate(() => { [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent === 'Cortes')?.click(); });
  await pagina.evaluate(() => document.querySelector('button[title^="Em sequência"]').click()); await espera(600);
  const f = await pagina.evaluate(() => __faixas());
  return (f.length === 1 && f[0].split(' ').length === 8 && colados(f[0])) || f;
});
await passo('JUNTAR EM 1: a sequência vira UM clipe só (duração = soma) e o PLAY toca', async () => {
  const antes = await pagina.evaluate(() => __faixas()[0].split(' ').reduce((s, x) => s + Number(x.split('+')[1]), 0));
  await pagina.evaluate(() => document.querySelector('button[title^="Juntar em 1"]').click());
  await pagina.waitForFunction(() => __faixas()[0]?.split(' ').length === 1, null, { timeout: 120_000 }).catch(() => {});
  const f = await pagina.evaluate(() => __faixas()); const dur = Number(f[0]?.split('+')[1]);
  await pagina.evaluate(async () => { document.querySelector('.overflow-x-auto').scrollLeft = 0; });
  await pagina.click('button[title="Tocar"]'); await espera(1500);
  const t = await pagina.evaluate(() => Number(document.querySelector('[data-testid=editor-audio-relogio]').textContent.split(':')[1]));
  await pagina.click('button[title="Pausar"]').catch(() => {});
  return (f.length === 1 && f[0].split(' ').length === 1 && Math.abs(dur - antes) < 0.2 && t > 0.8) || { f, antes, dur, t };
});
await passo('ENVIAR EM SEQUÊNCIA: 3 áudios entram um atrás do outro e o 2º toca quando o 1º acaba', async () => {
  await pagina.evaluate(() => { [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent === 'Adicionar').click(); });
  await pagina.evaluate(() => document.querySelector('button[title^="Nova edição"]').click());
  const limpou = await pagina.waitForFunction(() => !document.querySelector('[data-testid=editor-audio-pista]'), null, { timeout: 90_000 }).then(() => true).catch(() => false);
  if (!limpou) return await pagina.evaluate(() => ({ nao_limpou: true, avisos: [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent), ocupado: document.querySelector('.animate-spin')?.parentElement?.textContent }));
  await pagina.evaluate(async () => {
    const dt = new DataTransfer();
    for (const n of ['caixa', 'sirene', 'impacto']) dt.items.add(new File([await (await fetch('/studio/sons/' + n + '.mp3')).blob()], n + '.mp3', { type: 'audio/mpeg' }));
    const i = document.querySelector('[data-testid=editor-audio-arquivo-sequencia]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await pagina.waitForFunction(() => __faixas()[0]?.split(' ').length === 3, null, { timeout: 60_000 }).catch(() => {});
  const f = await pagina.evaluate(() => __faixas());
  if (!(f.length === 1 && f[0].split(' ').length === 3 && colados(f[0]))) return { f };
  const fim1 = (() => { const [i, d] = f[0].split(' ')[0].split('+').map(Number); return i + d; })();
  await pagina.evaluate(() => { const r = document.querySelector('[data-testid=editor-audio-relogio]'); window.__antes = r.textContent; });
  await pagina.click('button[title="Ir ao início"]').catch(async () => { await pagina.click('button[title="Início"]'); });
  await pagina.click('button[title="Tocar"]'); await espera(Math.ceil((fim1 + 0.8) * 1000));
  const r = await pagina.evaluate(() => ({ t: Number(document.querySelector('[data-testid=editor-audio-relogio]').textContent.split(':')[1]), medidor: [...document.querySelectorAll('[data-testid=editor-de-audio] .h-2 > div')].map((d) => parseFloat(d.style.width) || 0) }));
  await pagina.click('button[title="Pausar"]').catch(() => {});
  return (r.t > fim1 + 0.3 && r.medidor.some((w) => w > 5)) || { f, fim1, r };
});
// F-345: microfone
await passo('MICROFONE NEGADO: o aviso aparece NA TELA com o passo a passo para liberar', async () => {
  await pagina.evaluate(() => { [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent === 'Adicionar')?.click(); });
  await pagina.evaluate(() => { window.__gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('negado', 'NotAllowedError')); });
  await pagina.evaluate(() => document.querySelector('button[title="Gravar pelo microfone"]').click());
  await pagina.waitForSelector('[data-testid=editor-audio-aviso-microfone]', { timeout: 5000 }).catch(() => {});
  const r = await pagina.evaluate(() => { const d = document.querySelector('[data-testid=editor-audio-aviso-microfone]'); if (!d) return null; const b = d.getBoundingClientRect(); return { texto: d.textContent, visivel: b.width > 300 && b.height > 300 }; });
  return (r && r.visivel && /Libere o microfone/.test(r.texto) && /Permitir/.test(r.texto)) || r;
});
await passo('TENTAR DE NOVO com o microfone liberado: grava 2 s e a gravação entra numa faixa nova', async () => {
  const antes = await pagina.evaluate(() => __faixas().length), clipesAntes = await pagina.evaluate(() => __faixas().join(' '));
  await pagina.evaluate(() => { navigator.mediaDevices.getUserMedia = window.__gum; document.querySelector('[data-testid=editor-audio-microfone-tentar]').click(); });
  await espera(2200);
  const gravando = await pagina.evaluate(() => ({ aviso: !!document.querySelector('[data-testid=editor-audio-aviso-microfone]'), parar: !!document.querySelector('button[title="Parar a gravação"]') }));
  if (gravando.aviso || !gravando.parar) return gravando;
  await pagina.evaluate(() => document.querySelector('button[title="Parar a gravação"]').click());
  await pagina.waitForFunction((n) => __faixas().length > n, antes, { timeout: 15_000 }).catch(() => {});
  const f = await pagina.evaluate(() => __faixas()); const ult = f[f.length - 1] ?? '';
  const dur = Number(ult.split(' ')[0]?.split('+')[1]);
  return (f.length === antes + 1 && dur > 1.5 && !clipesAntes.includes(ult)) || { antes, f };
});
// F-347: CLONAR VOZ (o servidor é SIMULADO aqui: o teste nunca gasta créditos da ElevenLabs)
const pedidosClonar = [];
await pagina.route('**/functions/v1/studio-locucao', async (rota) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  if (rota.request().method() === 'OPTIONS') return rota.fulfill({ status: 200, headers: cors, body: 'ok' });
  const corpo = JSON.parse(rota.request().postData() ?? '{}'); pedidosClonar.push({ acao: corpo.acao, voz: corpo.voz, segundos: corpo.segundos, bytes: (corpo.audio ?? '').length });
  if (corpo.acao === 'palavras') return rota.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'Atenção! Corre', palavras: [{ texto: 'Atenção!', ini: 0.1, fim: 0.6 }, { texto: 'Corre', ini: 1.2, fim: 1.6 }] }) });
  const mp3 = fs.readFileSync('public/studio/locucao/dono-eletro.mp3').toString('base64');
  return rota.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ audio: mp3, creditos: 20 }) });
});
await passo('CLONAR VOZ: escolhe a voz Sérgio Vaz, a voz vai TRATADA (pausa encurtada, sem acelerar) e volta numa faixa nova embaixo', async () => {
  const antes = await pagina.evaluate(() => __faixas().length);
  await pagina.evaluate(() => document.querySelector('button[title^="Clonar voz"]').click());
  await pagina.waitForSelector('[data-testid=editor-audio-janela-clonar]', { timeout: 5000 });
  const texto = await pagina.evaluate(() => document.querySelector('[data-testid=editor-audio-janela-clonar]').textContent);
  if (!/Sérgio Vaz/.test(texto) || !/Vai clonar o clipe/.test(texto)) return { texto };
  await pagina.evaluate(() => { document.querySelector('[data-testid=editor-audio-voz-sergio-vaz]').click(); document.querySelector('[data-testid=editor-audio-clonar-agora]').click(); });
  await pagina.waitForFunction((n) => __faixas().length > n, antes, { timeout: 60_000 }).catch(() => {});
  const f = await pagina.evaluate(() => ({ faixas: __faixas(), nomes: [...document.querySelectorAll('[data-faixa]')].map((d) => d.textContent?.slice(0, 40)) }));
  const clonar = pedidosClonar.find((p) => p.acao === 'clonar');
  return (f.faixas.length === antes + 1 && pedidosClonar.some((p) => p.acao === 'palavras') && clonar?.voz === 'sergio-vaz' && clonar.segundos > 1.0 && clonar.segundos < 1.95) || { antes, f, pedidosClonar };
});
await pagina.unroute('**/functions/v1/studio-locucao');
await passo('nenhum erro de tela durante o teste', () => (erros.length === 0) || erros.slice(0, 3).join(' | '));

// limpeza: apaga no banco o que o teste criou na conta de teste (funciona no local e no site no ar)
spawnSync('node', ['scripts/ops/sql.mjs', "delete from public.studio_audio_edicoes where usuario_id = (select id from auth.users where email = 'e2e-owner@sobremidia.com.br') and nome ilike '%TESTE AUTOM%'"], { stdio: 'ignore' });
await pagina.evaluate(() => { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); indexedDB.deleteDatabase('sobremidia-editor-de-audio'); }).catch(() => {});
await navegador.close();
console.log(`\n${falhas ? '✗ FALHOU' : '✓ TUDO CERTO'}: ${ok} passos ok, ${falhas} com falha (${URL_BASE})`);
sair(falhas ? 1 : 0);

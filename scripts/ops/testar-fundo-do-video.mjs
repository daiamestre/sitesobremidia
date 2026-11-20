// SOBRE MÍDIA — F-350: PROVA EM NAVEGADOR DE VERDADE de que o vídeo com locução não sai com o FUNDO PRETO.
//   node scripts/ops/testar-fundo-do-video.mjs [url]            (padrão: o site no ar)
//   node scripts/ops/testar-fundo-do-video.mjs http://localhost:5200
// Roda no Chrome e no Safari (WebKit, tamanho de iPhone) com a conta de TESTE (sem senha): passo a passo do Palco de Ofertas,
// troca o fundo, vai até a edição do vídeo, cria o vídeo e mede quanto da prévia ficou preta. Reprova se passar do limite.
// Precisa do WebKit do Playwright: npx playwright install webkit
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path';
const { chromium, webkit, devices } = createRequire(import.meta.url)('playwright');

const URL = (process.argv[2] || 'https://sitesobremidia.vercel.app').replace(/\/$/, '');
// os fundos são vermelhos/verdes/claros. Com o defeito do iPhone a prévia ficava 48–72% preta e o vídeo 37–42%
const LIMITE_DE_PRETO = { previa: 0.2, video: 0.3 };
const CASOS = [
  { pasta: 'palco-de-ofertas', modelo: 'alerta-de-oferta', trocarPara: 3 },
  { pasta: 'palco-de-ofertas-farmacia', modelo: 'saude-em-oferta', trocarPara: 1 },
];

const sessao = spawn('node', ['scripts/ops/sessao-teste.mjs', 'e2e-owner@sobremidia.com.br', URL], { stdio: 'ignore' });
let ses;
for (let k = 0; k < 80 && !ses; k++) { await new Promise((r) => setTimeout(r, 500)); try { ses = await (await fetch('http://127.0.0.1:8767/')).json(); } catch { /* ainda subindo */ } }
if (!ses) { console.error('Não consegui a sessão de teste.'); sessao.kill(); process.exit(1); }

/** fração de pontos quase pretos numa captura (PNG) — decodificada no próprio navegador */
async function fracaoDePreto(p, png) {
  return p.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = document.createElement('canvas'); c.width = 90; c.height = Math.round((bmp.height / bmp.width) * 90);
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data; let preto = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 28 && d[i + 1] < 28 && d[i + 2] < 28) preto++;
    return preto / (d.length / 4);
  }, png.toString('base64'));
}

// o Chrome do Playwright instalado neste PC (qualquer versão), se a versão exata não estiver baixada
function chromeInstalado() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base).filter((x) => /^chromium-[0-9]+$/.test(x)).sort().reverse()) { const e = path.join(base, d, 'chrome-win64', 'chrome.exe'); if (fs.existsSync(e)) return e; }
  return undefined;
}
async function abrir(motor) { try { return await motor.launch(); } catch (e) { if (motor === chromium && chromeInstalado()) return motor.launch({ executablePath: chromeInstalado() }); throw e; } }
const falhas = [];
for (const [nome, motor, aparelho] of [['Chrome', chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ['Safari/iPhone', webkit, devices['iPhone 13']]]) {
  let nav;
  try { nav = await abrir(motor); } catch (e) { falhas.push(`${nome}: navegador não abriu (${String(e.message).split('\n')[0]})`); continue; }
  for (const caso of CASOS) {
    const ctx = await nav.newContext(aparelho);
    // SIMULAR_IPHONE=1: reproduz o defeito do Safari do iPhone (desenhar um <video> no canvas ignora o modo de mistura) — o
    // código tem de continuar com o fundo certo mesmo assim
    if (process.env.SIMULAR_IPHONE) await ctx.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (fonte, ...resto) {
        if (fonte instanceof HTMLVideoElement || (typeof VideoFrame !== 'undefined' && fonte instanceof VideoFrame)) {
          const antes = this.globalCompositeOperation; this.globalCompositeOperation = 'source-over';
          try { return original.call(this, fonte, ...resto); } finally { this.globalCompositeOperation = antes; }
        }
        return original.call(this, fonte, ...resto);
      };
    });
    const p = await ctx.newPage();
    const erros = []; p.on('pageerror', (e) => { if (!/supabase.co|Load failed|Failed to fetch|access control|cancel/i.test(e.message)) erros.push(e.message); });
    const medir = async (rotulo, seletor) => {
      const el = await p.$(seletor);
      if (!el) { falhas.push(`${nome} ${caso.modelo} ${rotulo}: prévia não apareceu`); return; }
      await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
      const f = await fracaoDePreto(p, await el.screenshot());
      const ok = f <= (rotulo.startsWith('vídeo') ? LIMITE_DE_PRETO.video : LIMITE_DE_PRETO.previa);
      console.log(`${ok ? 'OK ' : 'ERRO'} ${nome.padEnd(14)} ${caso.modelo.padEnd(18)} ${rotulo.padEnd(22)} preto ${(f * 100).toFixed(1)}%`);
      if (!ok) falhas.push(`${nome} ${caso.modelo} ${rotulo}: ${(f * 100).toFixed(1)}% preto`);
    };
    try {
      await p.goto(URL + '/'); await p.waitForTimeout(1500);
      await p.evaluate(([k, v]) => localStorage.setItem(k, v), [ses.key, JSON.stringify(ses.session)]);
      await p.goto(`${URL}/studio/pasta/${caso.pasta}?modelo=${caso.modelo}&assistente=1&passo=1`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('[data-testid=fundo-opcao]', { timeout: 90000 }); await p.waitForTimeout(2500);
      await medir('1 · fundo do modelo', '[data-testid=assistente-previa]');
      const ops = await p.$$('[data-testid=fundo-opcao]');
      await ops[caso.trocarPara].scrollIntoViewIfNeeded(); await ops[caso.trocarPara].click(); await p.waitForTimeout(3000);
      await medir('1 · fundo trocado', '[data-testid=assistente-previa]');
      for (let n = 0; n < 3; n++) { await p.click('[data-testid=assistente-avancar]'); await p.waitForTimeout(2500); }
      await p.waitForTimeout(4000); // efeitos (brasas, fogo) já tocando
      await medir('4 · edição do vídeo', '[data-testid=assistente-previa]');
      await p.click('[data-testid=assistente-avancar]'); await p.waitForTimeout(2500);
      await p.click('[data-testid=assistente-concluir]'); await p.waitForTimeout(9000);
      await p.waitForSelector('[data-testid=palco-previa-video] canvas', { timeout: 60000 });
      await medir('vídeo criado', '[data-testid=palco-previa-video]');
    } catch (e) { falhas.push(`${nome} ${caso.modelo}: ${String(e.message).split('\n')[0]}`); }
    if (erros.length) falhas.push(`${nome} ${caso.modelo}: erro na página — ${erros[0].slice(0, 160)}`);
    await ctx.close();
  }
  await nav.close();
}
sessao.kill();
if (falhas.length) { console.error('\nREPROVADO:\n- ' + falhas.join('\n- ')); process.exit(1); }
console.log('\nAPROVADO: o fundo aparece na prévia, na edição e no vídeo criado, no Chrome e no Safari.');

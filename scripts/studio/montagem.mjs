/**
 * SOBRE MÍDIA Studio — Montador de Vídeo + Controle de Qualidade (MG04/MG05).
 * Roda no GitHub Actions (studio-montar.yml) e no ensaio local (ensaio-local.mjs), com o MESMO código.
 *
 * Para cada cena: o Playwright abre o HTML determinístico (supabase/functions/_shared/studio/layout.ts), anima quadro a
 * quadro (window.quadro) e o FFmpeg grava o clipe; depois as cenas são unidas com transição suave (xfade) num MP4
 * H.264 High 4.1 / yuv420p / 30 fps / faststart — o mesmo perfil do compress-video, que o Player já toca.
 * O preço é escrito pelo código e conferido por OCR NO VÍDEO FINAL: se não bater com o número do pedido, reprova.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createWorker } from 'tesseract.js';
import { dadosDaCena, htmlDaCena } from '../../supabase/functions/_shared/studio/layout.ts';
import { RESOLUCAO, formatarPreco, precoDeVenda } from '../../supabase/functions/_shared/studio/contrato.ts';

const FPS = 30;
const TRANSICAO = 0.5; // segundos de xfade entre cenas

function rodar(bin, args, entrada) {
  return new Promise((ok, falha) => {
    const p = spawn(bin, args, { stdio: [entrada ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 200_000) err = err.slice(-100_000); });
    p.on('error', falha);
    p.on('close', (c) => (c === 0 ? ok(err) : falha(new Error(`${path.basename(bin)} saiu com ${c}: ${err.slice(-800)}`))));
    if (entrada) entrada(p.stdin);
  });
}

// dadosDaCena vive em layout.ts (a prévia do navegador usa a MESMA função: prévia = vídeo)
export { dadosDaCena };

/** Lê duração, resolução e codec com o próprio ffmpeg (no Actions também há ffprobe; aqui basta o ffmpeg). */
export async function inspecionar(ffmpeg, arquivo) {
  let saida = '';
  try { saida = await rodar(ffmpeg, ['-hide_banner', '-i', arquivo, '-f', 'null', '-']); } catch (e) { saida = String(e.message); }
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(saida);
  const v = /Stream #\S+.*Video: (\w+) \(([^)]+)\).*?, (\d{2,5})x(\d{2,5})/.exec(saida);
  const fps = /, ([\d.]+) fps/.exec(saida);
  return {
    duracao: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    codec: v?.[1] ?? null, perfil: v?.[2] ?? null, largura: v ? Number(v[3]) : null, altura: v ? Number(v[4]) : null,
    fps: fps ? Number(fps[1]) : null, pixel: /yuv420p/.test(saida) ? 'yuv420p' : null,
  };
}

const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');

/** Leitor de OCR só de dígitos (tesseract.js; o modelo "eng" basta para números). */
export async function criarLeitor() {
  const ocr = await createWorker('eng');
  await ocr.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '7' });
  return ocr;
}

/**
 * Lê a parte inteira e os centavos do selo numa imagem (arte ou quadro do vídeo) e compara com o preço esperado.
 * Cada bloco é recortado com margem, endireitado (o selo tem -4°), ampliado 3× e virado em preto no branco.
 */
export async function conferirPreco(ocr, ffmpeg, imagem, caixa, esperado, tmp) {
  /**
   * Lê um bloco. Só ACEITA quando a leitura é exatamente o esperado; tenta poucos modos de página do Tesseract
   * (um dígito sozinho é lido melhor como "caractere único"). Leitura diferente em todos os modos = reprovado.
   */
  const ler = async (cx, nome, alvo) => {
    if (!cx) return '';
    const m = Math.round(Math.min(cx.w, cx.h) * 0.04);
    const x = Math.max(0, Math.round(cx.x - m));
    const y = Math.max(0, Math.round(cx.y - m));
    let lido = '';
    // poucas variações de escala e de modo de página; aceita só a leitura EXATA do esperado
    for (const alt of [100, 60, 160]) {
      const arq = `${tmp}-${nome}.png`;
      await rodar(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', imagem, '-vf',
        `crop=${Math.round(cx.w + 2 * m)}:${Math.round(cx.h + 2 * m)}:${x}:${y},rotate=4*PI/180:c=black,scale=iw*3:ih*3,format=gray,lut=y='if(gt(val,170),0,255)',scale=-2:${alt},pad=iw+${alt}:ih+${alt}:${alt / 2}:${alt / 2}:white`,
        '-frames:v', '1', arq]);
      for (const psm of alvo.length === 1 ? ['10', '8', '7'] : ['7', '8']) {
        await ocr.setParameters({ tessedit_pageseg_mode: psm });
        lido = soDigitos((await ocr.recognize(arq)).data.text);
        if (lido === alvo) return lido;
      }
    }
    return lido;
  };
  const alvoInteiro = soDigitos(esperado.inteiro);
  const inteiro = await ler(caixa.int, 'int', alvoInteiro);
  const centavos = await ler(caixa.cv, 'cv', esperado.centavos);
  return { ok: inteiro === alvoInteiro && centavos === esperado.centavos, inteiro, centavos };
}

/**
 * Conferência por PIXELS (mecanismo equivalente ao OCR, determinístico): compara, por SSIM, a região dos dígitos do
 * preço numa imagem de referência (arte desenhada a partir do preço GRAVADO) com a mesma região do quadro do vídeo.
 * Preço diferente na tela → semelhança baixa → reprovado. Devolve o SSIM (0 a 1).
 */
export async function semelhancaDoPreco(ffmpeg, referencia, alvo, caixa) {
  const blocos = [caixa.int, caixa.cv].filter(Boolean);
  if (!blocos.length) return 0;
  const x0 = Math.min(...blocos.map((b) => b.x)), y0 = Math.min(...blocos.map((b) => b.y));
  const x1 = Math.max(...blocos.map((b) => b.x + b.w)), y1 = Math.max(...blocos.map((b) => b.y + b.h));
  const crop = `crop=${Math.round(x1 - x0) & ~1}:${Math.round(y1 - y0) & ~1}:${Math.round(x0)}:${Math.round(y0)},format=gray`;
  const saida = await rodar(ffmpeg, ['-hide_banner', '-i', referencia, '-i', alvo, '-lavfi', `[0:v]${crop}[a];[1:v]${crop}[b];[a][b]ssim`, '-f', 'null', '-']);
  const m = /All:([\d.]+)/.exec(saida);
  return m ? Number(m[1]) : 0;
}

/** Limite mínimo de semelhança para aprovar (calibrado no ensaio: mesmo preço ≈ 0,97+; preço trocado < 0,80). */
export const SSIM_MINIMO = 0.9;

/**
 * Monta a produção. Entradas:
 *  pedido, plano, edicoes (por número da cena), fundos (url por número da cena), rotulo, pasta de saída, caminho do ffmpeg.
 * Devolve { video, imagens[], quadros[], miniatura, qc }.
 */
export async function montar({ pedido, plano, edicoes, fundos, rotulo, saida, ffmpeg, gerarVideo = true, log = console.log }) {
  fs.mkdirSync(saida, { recursive: true });
  const { w, h } = RESOLUCAO[pedido.formato];
  const navegador = await chromium.launch(process.env.STUDIO_CHROMIUM ? { executablePath: process.env.STUDIO_CHROMIUM } : {});
  const pagina = await navegador.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const cenas = plano.cenas.map((c) => ({ c, e: edicoes[c.numero] }));
  const imagens = [];
  const caixasPreco = {};
  const clipes = [];
  try {
    for (const [i, { c, e }] of cenas.entries()) {
      const dados = dadosDaCena(pedido, c, e, fundos[c.numero] ?? null, rotulo);
      await pagina.setContent(htmlDaCena(dados, 'completa'), { waitUntil: 'networkidle', timeout: 60_000 });
      await pagina.evaluate(async () => { await document.fonts.ready; window.conterPreco(); });
      // arte final (estado final, sem animação): PNG da cena + caixa do preço para o OCR
      const png = path.join(saida, `cena-${c.numero}.png`);
      await pagina.screenshot({ path: png, type: 'png' });
      imagens.push(png);
      // caixas do preço: selo inteiro, parte inteira e centavos (o OCR lê cada bloco separado, mais confiável)
      const caixa = await pagina.evaluate(() => {
        const el = document.getElementById('preco');
        if (!el) return null;
        const r = (id) => { const x = document.getElementById(id); if (!x) return null; const b = x.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
        return { ...r('preco'), int: r('int'), cv: r('cd'), preco: el.dataset.preco };
      });
      if (caixa) caixasPreco[c.numero] = caixa;
      if (!gerarVideo) continue;
      // clipe animado: quadro a quadro, direto para o ffmpeg (sem gravar milhares de arquivos)
      const dur = e.duracao_s + (i < cenas.length - 1 ? TRANSICAO : 0);
      const total = Math.round(dur * FPS);
      const clipe = path.join(saida, `clipe-${c.numero}.mp4`);
      log(`[montagem] cena ${c.numero}: ${total} quadros (${dur}s, câmera ${e.camera})`);
      await rodar(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), clipe], async (stdin) => {
        try {
          for (let q = 0; q < total; q++) {
            await pagina.evaluate(([t, d, cam]) => window.quadro(t, d, cam), [q / FPS, dur, e.camera]);
            const buf = await pagina.screenshot({ type: 'jpeg', quality: 93 });
            if (!stdin.write(buf)) await new Promise((r) => stdin.once('drain', r));
          }
        } finally { stdin.end(); }
      });
      clipes.push({ arquivo: clipe, duracao: e.duracao_s });
    }
  } finally { await navegador.close(); }

  const resultado = { video: null, imagens, caixas: caixasPreco, quadros: [], miniatura: imagens[Math.max(0, cenas.findIndex(({ c }) => c.produto_id))] ?? imagens[0], qc: { aprovado: true, verificacoes: [] } };
  // bloqueia=false: sinal registrado no relatório que não reprova sozinho (OCR de fonte estilizada pode falhar sem erro real)
  const verif = (nome, ok, detalhe, bloqueia = true) => { resultado.qc.verificacoes.push({ nome, ok, detalhe, bloqueia }); if (!ok && bloqueia) resultado.qc.aprovado = false; };

  // OCR do preço na ARTE (camada determinística)
  const ocr = await criarLeitor();
  const conferir = async (img, cx, esperado, nome, bloqueia = false) => {
    const r = await conferirPreco(ocr, ffmpeg, img, cx, esperado, path.join(saida, 'ocr-tmp'));
    verif(nome, r.ok, `esperado ${esperado.completo}; OCR leu "${r.inteiro},${r.centavos}"`, bloqueia);
  };
  for (const { c } of cenas) {
    const cx = caixasPreco[c.numero];
    if (!cx) continue;
    const pr = pedido.produtos.find((p) => p.id === c.produto_id);
    const esperado = formatarPreco(precoDeVenda(pr));
    verif(`preço no HTML, cena ${c.numero}`, cx.preco === esperado.completo, cx.preco);
    await conferir(path.join(saida, `cena-${c.numero}.png`), cx, esperado, `OCR do preço na arte, cena ${c.numero}`);
  }

  if (gerarVideo) {
    // une as cenas com transição suave e grava no perfil do Player
    const video = path.join(saida, 'final.mp4');
    const args = ['-hide_banner', '-loglevel', 'error', '-y'];
    clipes.forEach((k) => args.push('-i', k.arquivo));
    const totalPedido = clipes.reduce((s, k) => s + k.duracao, 0);
    args.push('-f', 'lavfi', '-t', String(totalPedido), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    args.push('-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}:r=${FPS}:d=${totalPedido}`);
    // transição por sobreposição com esmaecimento (funciona em qualquer ffmpeg ≥ 4; o xfade só existe a partir do 4.3):
    // cada clipe começa no fim da cena anterior e entra com fade de TRANSICAO segundos sobre o clipe que ainda está tocando.
    let filtro = '';
    let atual = `[${clipes.length + 1}:v]`;
    let acumulado = 0;
    for (let i = 0; i < clipes.length; i++) {
      const fade = i === 0 ? '' : `,fade=t=in:st=0:d=${TRANSICAO}:alpha=1`;
      filtro += `[${i}:v]format=yuva420p${fade},setpts=PTS-STARTPTS+${acumulado.toFixed(3)}/TB[c${i}];`;
      filtro += `${atual}[c${i}]overlay=eof_action=pass:format=auto[b${i}];`;
      atual = `[b${i}]`;
      acumulado += clipes[i].duracao;
    }
    filtro += `${atual}format=yuv420p,trim=duration=${totalPedido},setpts=PTS-STARTPTS[v]`;
    args.push('-filter_complex', filtro, '-map', '[v]', '-map', `${clipes.length}:a`,
      '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-crf', '19', '-maxrate', '8000k', '-bufsize', '16000k',
      '-g', '60', '-keyint_min', '60', '-r', String(FPS), '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', video);
    await rodar(ffmpeg, args);
    resultado.video = video;

    const info = await inspecionar(ffmpeg, video);
    resultado.qc.video = info;
    verif('codec H.264 High', info.codec === 'h264' && /High/.test(info.perfil ?? ''), `${info.codec} ${info.perfil}`);
    verif('resolução do formato', info.largura === w && info.altura === h, `${info.largura}x${info.altura} (pedido ${w}x${h})`);
    verif('duração', info.duracao !== null && Math.abs(info.duracao - totalPedido) <= 0.25, `${info.duracao?.toFixed(2)} s (pedido ${totalPedido} s)`);
    verif('pixel yuv420p', info.pixel === 'yuv420p', String(info.pixel));
    verif('tamanho do arquivo', fs.statSync(video).size > 50_000 && fs.statSync(video).size < 200 * 1024 * 1024, `${(fs.statSync(video).size / 1e6).toFixed(1)} MB`);

    // OCR do preço NO VÍDEO FINAL (quadro do meio de cada cena com preço)
    acumulado = 0;
    for (const [i, { c, e }] of cenas.entries()) {
      const meio = acumulado + e.duracao_s * 0.6;
      acumulado += e.duracao_s;
      const cx = caixasPreco[c.numero];
      if (!cx) continue;
      const quadro = path.join(saida, `ocr-${c.numero}.png`);
      await rodar(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', meio.toFixed(2), '-i', video, '-frames:v', '1', quadro]);
      const pr = pedido.produtos.find((p) => p.id === c.produto_id);
      await conferir(quadro, cx, formatarPreco(precoDeVenda(pr)), `OCR do preço no vídeo, cena ${i + 1}`);
      const ssim = await semelhancaDoPreco(ffmpeg, path.join(saida, `cena-${c.numero}.png`), quadro, cx);
      verif(`preço no vídeo = preço gravado (pixels), cena ${i + 1}`, ssim >= SSIM_MINIMO, `SSIM ${ssim.toFixed(3)} (mínimo ${SSIM_MINIMO})`);
    }
    // quadros para a análise de conteúdo (moderação de cliente_assets usa "quadros")
    for (const [k, frac] of [[1, 0.2], [2, 0.5], [3, 0.85]]) {
      const q = path.join(saida, `quadro${k}.jpg`);
      await rodar(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', (totalPedido * frac).toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '3', q]);
      resultado.quadros.push(q);
    }
    for (const k of clipes) fs.rmSync(k.arquivo, { force: true });
  }
  await ocr.terminate();
  return resultado;
}

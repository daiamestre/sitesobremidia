// SOBRE MÍDIA STUDIO — EDITOR DE VÍDEO (F-227): o MOTOR que toca o projeto num canvas e grava o vídeo final.
// - Cada clipe de vídeo tem o seu <video>; fotos viram <img>; artes do Studio são desenhadas quadro a quadro.
// - Som: cada vídeo/música passa por um ganho do Web Audio (volume, entrada/saída suaves) e vai para os alto-falantes
//   E para a mistura que entra na gravação. Exportar = tocar do zero com o gravador ligado (MP4 com áudio quando o
//   navegador sabe; senão WebM), em tamanho real (1920×1080 ou 1080×1920), 30 quadros por segundo.
import { TAMANHO_DOC, type Documento } from '../documento';
import { desenharCamada, desenharDocumento, prepararDocumento, type Imagens } from '../desenhar';
import { formatoDeVideo } from '../video';
import { caixaDaMidia, desenharTransicao, desenharVinheta, filtroDoClipe } from './efeitos';
import { corDoDocumento } from '../corDaArte';
import { duracaoDoClipe, duracaoTotal, inicios, noTempo, tempoNoArquivo, volumeNoTempo, type Clipe, type ProjetoDeVideo, type Quadro } from './linha';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { aparelhoFraco } from '../regente';

/** F-301: exportação QUADRO A QUADRO (TV e painel de LED): tamanho, quadros por segundo e taxa de bits */
export interface OpcoesDeQualidade { fps?: 30 | 60; /** 1 = tamanho do projeto (1920×1080 / 1080×1920); 2 = 4K */ escala?: 1 | 2; bitsPorSegundo?: number }
/** o navegador monta MP4 quadro a quadro? (WebCodecs: Chrome/Edge no computador e no Android) */
export const podeExportarQuadroAQuadro = () => typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;

export interface VideoExportado { video: Blob; mime: string; ext: 'mp4' | 'webm'; largura: number; altura: number; duracaoMs: number; capa: Blob | null; quadros: Blob[] }

// F-302: em aparelho fraco a prévia do editor desenha em resolução menor (o MP4 final sai sempre no tamanho cheio)
const PREVIA = aparelhoFraco() ? 0.34 : 0.5;
/** F-302: intervalo mínimo entre dois desenhos da prévia tocando (aparelho fraco ≈ 30 qps; o som segue sincronizado) */
const INTERVALO_PREVIA = aparelhoFraco() ? 32 : 0;
/** mesma mídia com outro endereço: escapa da cópia guardada sem permissão (CORS) quando a galeria mostrou antes */
const semCache = (u: string) => (/^https?:/.test(u) ? `${u}${u.includes('?') ? '&' : '?'}sm=cors` : u); // a prévia desenha em meia resolução (leve no tablet); a exportação, em tamanho real

export class MotorDeVideo {
  private ctx: CanvasRenderingContext2D;
  private p: ProjetoDeVideo | null = null;
  private escala = PREVIA;
  private videos = new Map<string, HTMLVideoElement>();
  private imagens = new Map<string, HTMLImageElement>();
  private artes = new Map<string, { tela: HTMLCanvasElement; imgs: Imagens | null; doc: Documento }>();
  private imgsSob: Imagens = new Map();
  private chaveSob = '';
  private audios = new Map<string, HTMLAudioElement>();
  private som: AudioContext | null = null;
  private mistura: MediaStreamAudioDestinationNode | null = null;
  private ganhos = new Map<HTMLMediaElement, GainNode>();
  private raf = 0;
  private t0 = 0;
  private exportando = false;
  private ultimoDesenho = 0;
  tempo = 0;
  tocando = false;
  /** texto/elemento escolhido: parado, aparece inteiro para editar (sem a animação de entrada) */
  destaque: string | null = null;
  onTempo?: (t: number) => void;
  onFim?: () => void;
  onMudouMidia?: () => void;
  /** endereço que o motor usa (o arquivo local enquanto o envio ao R2 não termina) */
  resolver: (src: string) => string = (s) => s;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Este navegador não consegue desenhar o vídeo.');
    this.ctx = ctx;
  }

  get total() { return this.p ? duracaoTotal(this.p) : 0; }

  private ajustarTela() {
    if (!this.p) return;
    const { w, h } = TAMANHO_DOC[this.p.formato];
    const cw = Math.round(w * this.escala), ch = Math.round(h * this.escala);
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
  }

  /** Recebe o projeto atualizado (depois de cada edição) e prepara as mídias novas. */
  async definir(p: ProjetoDeVideo) {
    this.p = p;
    this.ajustarTela();
    const ids = new Set(p.clipes.map((c) => c.id));
    for (const [id, v] of this.videos) if (!ids.has(id)) { v.pause(); v.removeAttribute('src'); v.load(); this.videos.delete(id); }
    for (const id of [...this.artes.keys()]) if (!ids.has(id)) this.artes.delete(id);
    const pend: Promise<unknown>[] = [];
    for (const c of p.clipes) {
      if (c.tipo === 'video') this.video(c);
      else if (c.tipo === 'imagem') pend.push(this.imagem(c.src));
      else if (c.documento) {
        const a = this.artes.get(c.id);
        if (!a || a.doc !== c.documento) {
          const tela = a?.tela ?? document.createElement('canvas');
          const nova = { tela, imgs: null as Imagens | null, doc: c.documento };
          this.artes.set(c.id, nova);
          pend.push(prepararDocumento(c.documento).then((m) => { nova.imgs = m; }));
        }
      }
    }
    const aid = new Set(p.audios.map((a) => a.id));
    for (const [id, a] of this.audios) if (!aid.has(id)) { a.pause(); a.removeAttribute('src'); this.audios.delete(id); }
    for (const a of p.audios) this.audio(a.id, a.src);
    const chave = JSON.stringify(p.sobreposicoes.map((s) => (s.tipo === 'imagem' ? s.src : 'fonte' in s ? s.fonte : '')));
    if (chave !== this.chaveSob) {
      this.chaveSob = chave;
      pend.push(prepararDocumento({ versao: 2, formato: p.formato, fundo: 'transparent', camadas: p.sobreposicoes }).then((m) => { this.imgsSob = m; }));
    }
    await Promise.all(pend);
    if (!this.tocando) { this.sincronizar(this.tempo); this.desenhar(this.tempo); }
  }

  private conectar(el: HTMLMediaElement) {
    if (!this.som || this.ganhos.has(el)) return;
    try {
      const fonte = this.som.createMediaElementSource(el);
      const g = this.som.createGain();
      fonte.connect(g); g.connect(this.som.destination); if (this.mistura) g.connect(this.mistura);
      this.ganhos.set(el, g);
    } catch { /* já ligado ou sem permissão do outro site: toca pelo próprio elemento */ }
  }

  /** O som só pode ligar depois de um toque (regra dos navegadores): chamado no Play e no Exportar. */
  private ligarSom() {
    if (!this.som) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.som = new Ctx();
      this.mistura = this.som.createMediaStreamDestination();
    }
    void this.som.resume();
    for (const v of this.videos.values()) this.conectar(v);
    for (const a of this.audios.values()) this.conectar(a);
  }

  private volume(el: HTMLMediaElement, v: number) {
    const g = this.ganhos.get(el);
    if (g) g.gain.value = v; else el.volume = Math.max(0, Math.min(1, v));
  }

  private video(c: Clipe) {
    const src = this.resolver(c.src);
    let v = this.videos.get(c.id);
    if (v && v.dataset.src === src) return v;
    if (v) { v.pause(); this.ganhos.delete(v); }
    v = document.createElement('video');
    if (/^https?:/.test(src)) v.crossOrigin = 'anonymous';
    v.preload = 'auto'; v.playsInline = true; v.muted = false;
    v.dataset.src = src;
    v.src = src;
    const redesenhar = () => { if (!this.tocando) this.desenhar(this.tempo); this.onMudouMidia?.(); };
    v.addEventListener('loadeddata', redesenhar);
    v.addEventListener('seeked', () => { if (!this.tocando) this.desenhar(this.tempo); });
    v.addEventListener('error', () => { if (v && /^https?:/.test(src) && !v.src.includes('sm=cors')) v.src = semCache(src); });
    this.videos.set(c.id, v);
    this.conectar(v);
    return v;
  }

  private imagem(src: string) {
    const real = this.resolver(src);
    const ja = this.imagens.get(real);
    if (ja) return ja.complete ? Promise.resolve() : new Promise<void>((ok) => { ja.addEventListener('load', () => ok(), { once: true }); ja.addEventListener('error', () => ok(), { once: true }); });
    const i = new Image();
    if (/^https?:/.test(real)) i.crossOrigin = 'anonymous';
    i.src = real;
    this.imagens.set(real, i);
    return new Promise<void>((ok) => {
      i.onload = () => ok();
      i.onerror = () => { if (/^https?:/.test(real) && !i.src.includes('sm=cors')) i.src = semCache(real); else ok(); };
    });
  }

  private audio(id: string, src: string) {
    const real = this.resolver(src);
    const a = this.audios.get(id);
    if (a && a.dataset.src === real) return a;
    if (a) a.pause();
    const n = new Audio();
    if (/^https?:/.test(real)) n.crossOrigin = 'anonymous';
    n.preload = 'auto'; n.dataset.src = real; n.src = real;
    this.audios.set(id, n);
    this.conectar(n);
    return n;
  }

  /** Põe cada vídeo/música no ponto certo (tocando ou parado) e com o volume do instante. */
  private sincronizar(t: number) {
    const p = this.p;
    if (!p) return;
    const q = noTempo(p.clipes, t);
    const ativos = new Map<string, Quadro>();
    if (q.atual) ativos.set(q.atual.clipe.id, q.atual);
    if (q.proximo) ativos.set(q.proximo.clipe.id, q.proximo);
    for (const c of p.clipes) {
      if (c.tipo !== 'video') continue;
      const v = this.videos.get(c.id);
      if (!v) continue;
      const qa = ativos.get(c.id);
      if (!qa) { if (!v.paused) v.pause(); continue; }
      const alvo = tempoNoArquivo(c, qa.local);
      v.playbackRate = Math.min(4, Math.max(0.25, c.velocidade));
      this.volume(v, c.mudo ? 0 : volumeNoTempo(c.volume, qa.local, duracaoDoClipe(c), c.somEntra, c.somSai));
      if (this.tocando) {
        if (Math.abs(v.currentTime - alvo) > 0.3) v.currentTime = alvo;
        if (v.paused) void v.play().catch(() => undefined);
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - alvo) > 0.03) v.currentTime = alvo;
      }
    }
    const total = duracaoTotal(p);
    for (const f of p.audios) {
      const a = this.audios.get(f.id);
      if (!a) continue;
      const trecho = Math.max(0.1, f.fim - f.inicio);
      const local = t - f.em;
      const fimNaLinha = f.repetir ? total - f.em : trecho;
      if (local < 0 || local >= fimNaLinha) { if (!a.paused) a.pause(); continue; }
      const alvo = f.inicio + (f.repetir ? local % trecho : local);
      this.volume(a, volumeNoTempo(f.volume, local, fimNaLinha, f.somEntra, f.somSai));
      if (this.tocando) {
        if (Math.abs(a.currentTime - alvo) > 0.3) a.currentTime = alvo;
        if (a.paused) void a.play().catch(() => undefined);
      } else { if (!a.paused) a.pause(); a.currentTime = alvo; }
    }
  }

  private desenharClipe(q: Quadro) {
    const p = this.p!;
    const ctx = this.ctx;
    const c = q.clipe;
    const { w: W, h: H } = TAMANHO_DOC[p.formato];
    let fonte: CanvasImageSource | null = null;
    let mw = 0, mh = 0;
    if (c.tipo === 'video') {
      const v = this.videos.get(c.id);
      if (v && v.readyState >= 2) { fonte = v; mw = v.videoWidth; mh = v.videoHeight; }
    } else if (c.tipo === 'imagem') {
      const i = this.imagens.get(this.resolver(c.src));
      if (i?.complete && i.naturalWidth) { fonte = i; mw = i.naturalWidth; mh = i.naturalHeight; }
    } else {
      const a = this.artes.get(c.id);
      if (a?.imgs) {
        const t = TAMANHO_DOC[a.doc.formato];
        const k = this.escala;
        if (a.tela.width !== Math.round(t.w * k)) { a.tela.width = Math.round(t.w * k); a.tela.height = Math.round(t.h * k); }
        const actx = a.tela.getContext('2d');
        if (actx) { desenharDocumento(actx, a.doc, a.imgs, k, null, q.local); fonte = a.tela; mw = t.w; mh = t.h; }
      }
    }
    ctx.save();
    ctx.fillStyle = p.fundo; ctx.fillRect(0, 0, W, H);
    if (fonte && mw && mh) {
      const zoom = c.zoomDe + (c.zoomPara - c.zoomDe) * Math.min(1, Math.max(0, q.progresso));
      const deitado = c.girar % 180 !== 0;
      const b = caixaDaMidia(deitado ? mh : mw, deitado ? mw : mh, W, H, c, Math.max(0.2, zoom));
      ctx.save();
      ctx.filter = filtroDoClipe(c.filtro, c.ajustes, this.escala);
      ctx.translate(b.dx + b.dw / 2, b.dy + b.dh / 2);
      if (c.girar) ctx.rotate((c.girar * Math.PI) / 180);
      if (c.espelhar) ctx.scale(-1, 1);
      const [iw, ih] = deitado ? [b.dh, b.dw] : [b.dw, b.dh];
      ctx.drawImage(fonte, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
      desenharVinheta(ctx, W, H, c.ajustes.vinheta);
    }
    ctx.restore();
  }

  /** Pinta o quadro do instante t (clipe, transição e sobreposições). */
  desenhar(t: number) {
    const p = this.p;
    if (!p) return;
    const ctx = this.ctx;
    const { w: W, h: H } = TAMANHO_DOC[p.formato];
    ctx.save();
    ctx.setTransform(this.escala, 0, 0, this.escala, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.fundo; ctx.fillRect(0, 0, W, H);
    const q = noTempo(p.clipes, t);
    if (q.atual && q.proximo) {
      const a = q.atual, b = q.proximo;
      // F-296: flash/luz/brilho na cor da arte que está saindo (a do encarte/palco, girada pelo tom); vídeo comum: branco
      desenharTransicao(ctx, a.clipe.transicao.tipo, q.transicao, W, H, () => this.desenharClipe(a), () => this.desenharClipe(b), a.clipe.documento ? corDoDocumento(a.clipe.documento) : '#ffffff');
    } else if (q.atual) this.desenharClipe(q.atual);
    for (const s of p.sobreposicoes) {
      if (t < s.de || t >= s.ate) continue;
      const parado = !this.tocando && !this.exportando && s.id === this.destaque;
      desenharCamada(ctx, s, this.imgsSob, this.escala, parado ? undefined : t - s.de, s.ate - s.de);
    }
    ctx.restore();
  }

  tocar() {
    if (this.tocando || !this.p) return;
    this.ligarSom();
    if (this.tempo >= this.total - 0.05) this.tempo = 0;
    this.tocando = true;
    this.t0 = performance.now() - this.tempo * 1000;
    this.sincronizar(this.tempo);
    const passo = () => {
      if (!this.tocando) return;
      const total = this.total;
      this.tempo = Math.min(total, (performance.now() - this.t0) / 1000);
      this.sincronizar(this.tempo);
      const agora = performance.now();
      if (this.exportando || agora - this.ultimoDesenho >= INTERVALO_PREVIA) { this.ultimoDesenho = agora; this.desenhar(this.tempo); }
      this.onTempo?.(this.tempo);
      if (this.tempo >= total) { this.pausar(); this.onFim?.(); return; }
      // exportando: relógio próprio (não para se o navegador economizar animação); prévia: no ritmo da tela
      if (this.exportando) this.raf = window.setTimeout(passo, 1000 / 30); else this.raf = requestAnimationFrame(passo);
    };
    passo();
  }

  pausar() {
    this.tocando = false;
    cancelAnimationFrame(this.raf); clearTimeout(this.raf);
    this.sincronizar(this.tempo);
    this.desenhar(this.tempo);
  }

  ir(t: number) {
    this.tempo = Math.max(0, Math.min(this.total, t));
    if (this.tocando) { this.t0 = performance.now() - this.tempo * 1000; this.sincronizar(this.tempo); }
    else { this.sincronizar(this.tempo); this.desenhar(this.tempo); }
    this.onTempo?.(this.tempo);
  }

  /** Foto do quadro atual em tamanho real ("Congelar quadro" e capa). */
  async quadroAtual(): Promise<Blob | null> {
    const antes = this.escala;
    this.escala = 1; this.ajustarTela(); this.desenhar(this.tempo);
    const b = await new Promise<Blob | null>((ok) => this.canvas.toBlob(ok, 'image/jpeg', 0.9));
    this.escala = antes; this.ajustarTela(); this.desenhar(this.tempo);
    return b;
  }

  /** Grava o vídeo final (leva o tempo do próprio vídeo). */
  async exportar(aoProgredir?: (f: number) => void): Promise<VideoExportado> {
    if (!this.p) throw new Error('Projeto vazio.');
    this.pausar();
    this.ligarSom();
    const comSom = !!this.mistura && (this.p.audios.length > 0 || this.p.clipes.some((c) => c.tipo === 'video' && !c.mudo));
    const fmt = formatoDeVideo(comSom) ?? formatoDeVideo(false);
    if (!fmt) throw new Error('Este navegador não grava vídeo. Use o Chrome atualizado (computador, tablet ou celular).');
    const total = this.total;
    const { w, h } = TAMANHO_DOC[this.p.formato];
    const quadros: Blob[] = [];
    this.escala = 1; this.ajustarTela();
    for (const t of [total * 0.2, total * 0.55, Math.max(0, total - 0.05)]) {
      this.tempo = t; this.sincronizar(t);
      await new Promise((ok) => setTimeout(ok, 350)); // espera o vídeo chegar no quadro
      this.desenhar(t);
      const b = await new Promise<Blob | null>((ok) => this.canvas.toBlob(ok, 'image/jpeg', 0.85));
      if (b) quadros.push(b);
    }
    this.tempo = 0; this.sincronizar(0);
    await new Promise((ok) => setTimeout(ok, 400));
    this.desenhar(0);
    const fluxo = (this.canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    if (fmt && comSom && this.mistura) for (const tr of this.mistura.stream.getAudioTracks()) fluxo.addTrack(tr);
    const gravador = new MediaRecorder(fluxo, { mimeType: fmt.mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
    const pedacos: Blob[] = [];
    gravador.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
    const parou = new Promise<void>((ok) => { gravador.onstop = () => ok(); });
    const antesTempo = this.onTempo, antesFim = this.onFim;
    const acabou = new Promise<void>((ok) => { this.onFim = () => ok(); });
    this.onTempo = (t) => { aoProgredir?.(Math.min(1, t / total)); antesTempo?.(t); };
    this.exportando = true;
    gravador.start(250);
    try {
      this.tocar();
      await acabou;
      await new Promise((ok) => setTimeout(ok, 200));
    } finally {
      gravador.stop();
      await parou;
      fluxo.getVideoTracks().forEach((t) => t.stop());
      this.exportando = false;
      this.onTempo = antesTempo; this.onFim = antesFim;
      this.escala = PREVIA; this.ajustarTela(); this.desenhar(this.tempo);
    }
    const tipo = fmt.mime.split(';')[0];
    const video = new Blob(pedacos, { type: tipo });
    if (!video.size) throw new Error('A gravação saiu vazia. Mantenha a tela do Studio aberta enquanto o vídeo é criado.');
    return { video, mime: tipo, ext: fmt.ext, largura: w, altura: h, duracaoMs: Math.round(total * 1000), capa: quadros[quadros.length - 1] ?? null, quadros };
  }

  /** F-301: põe cada vídeo do instante t no quadro exato (espera o navegador terminar de buscar). */
  private async posicionarVideos(t: number) {
    const q = noTempo(this.p!.clipes, t);
    await Promise.all([q.atual, q.proximo].map((qa) => {
      if (!qa || qa.clipe.tipo !== 'video') return undefined;
      const v = this.videos.get(qa.clipe.id);
      if (!v) return undefined;
      const alvo = tempoNoArquivo(qa.clipe, qa.local);
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - alvo) < 0.004 && v.readyState >= 2) return undefined;
      return new Promise<void>((ok) => {
        const fim = () => { v.removeEventListener('seeked', fim); clearTimeout(limite); ok(); };
        const limite = setTimeout(fim, 4000);
        v.addEventListener('seeked', fim);
        v.currentTime = alvo;
      });
    }));
  }

  /** F-301: a MISTURA do som inteiro, exata ao milissegundo (locução, músicas e o som dos vídeos), fora do tempo real. */
  private async mixarOffline(total: number): Promise<AudioBuffer | null> {
    const p = this.p!;
    const sr = 48000;
    const ini = inicios(p.clipes);
    const fontes: Array<{ src: string; em: number; inicio: number; fim: number; dur: number; volume: number; entra: number; sai: number; repetir: boolean; ritmo: number }> = [];
    for (const a of p.audios) {
      const trecho = Math.max(0.05, a.fim - a.inicio);
      fontes.push({ src: a.src, em: a.em, inicio: a.inicio, fim: a.fim, dur: a.repetir ? Math.max(0, total - a.em) : trecho, volume: a.volume, entra: a.somEntra, sai: a.somSai, repetir: a.repetir, ritmo: 1 });
    }
    p.clipes.forEach((c, i) => {
      if (c.tipo === 'video' && !c.mudo && c.volume > 0) fontes.push({ src: c.src, em: ini[i], inicio: c.inicio, fim: c.fim, dur: duracaoDoClipe(c), volume: c.volume, entra: c.somEntra, sai: c.somSai, repetir: false, ritmo: c.velocidade });
    });
    if (!fontes.length) return null;
    const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * sr)), sr);
    const cache = new Map<string, Promise<AudioBuffer | null>>();
    const decodificar = (src: string) => {
      const real = this.resolver(src);
      if (!cache.has(real)) cache.set(real, fetch(real).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => null));
      return cache.get(real)!;
    };
    for (const f of fontes) {
      const buf = await decodificar(f.src);
      if (!buf || f.dur <= 0 || f.em >= total) continue;
      const fonte = ctx.createBufferSource();
      fonte.buffer = buf;
      fonte.playbackRate.value = Math.min(4, Math.max(0.25, f.ritmo));
      const g = ctx.createGain();
      const fim = Math.min(total, f.em + f.dur);
      g.gain.setValueAtTime(f.entra > 0 ? 0 : f.volume, f.em);
      if (f.entra > 0) g.gain.linearRampToValueAtTime(f.volume, Math.min(fim, f.em + f.entra));
      if (f.sai > 0 && fim - f.sai > f.em) { g.gain.setValueAtTime(f.volume, fim - f.sai); g.gain.linearRampToValueAtTime(0, fim); }
      fonte.connect(g).connect(ctx.destination);
      if (f.repetir) {
        fonte.loop = true; fonte.loopStart = f.inicio; fonte.loopEnd = Math.min(buf.duration, f.fim || buf.duration);
        fonte.start(f.em, f.inicio); fonte.stop(fim);
      } else fonte.start(f.em, f.inicio, Math.max(0.01, f.dur * fonte.playbackRate.value));
    }
    return ctx.startRendering();
  }

  /**
   * F-301 (pedido do dono): exporta QUADRO A QUADRO em qualidade máxima — para TV e painel de LED.
   * Cada quadro é desenhado no instante exato (nenhum quadro perdido, mesmo em aparelho lento) e comprimido em H.264 de alta
   * taxa (WebCodecs); o som é misturado fora do tempo real e comprimido em AAC; tudo vira um MP4 (H.264 + AAC), que toca em
   * qualquer TV, TV Box, player de LED e no nosso Player.
   */
  async exportarQuadroAQuadro(o: OpcoesDeQualidade = {}, aoProgredir?: (f: number) => void): Promise<VideoExportado> {
    if (!this.p) throw new Error('Projeto vazio.');
    if (!podeExportarQuadroAQuadro()) throw new Error('Este navegador não monta vídeo quadro a quadro. Use o Chrome ou o Edge atualizado.');
    this.pausar();
    const fps = o.fps ?? 30, k = o.escala ?? 1;
    const total = this.total;
    const { w, h } = TAMANHO_DOC[this.p.formato];
    const W = Math.round((w * k) / 2) * 2, H = Math.round((h * k) / 2) * 2;
    const bits = o.bitsPorSegundo ?? (k === 2 ? 40_000_000 : fps === 60 ? 24_000_000 : 16_000_000);
    let codec = '';
    for (const c of ['avc1.640034', 'avc1.640033', 'avc1.640032', 'avc1.640028', 'avc1.4d0028']) {
      const sup = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: bits, framerate: fps }).catch(() => null);
      if (sup?.supported) { codec = c; break; }
    }
    if (!codec) throw new Error(`Este aparelho não grava vídeo H.264 em ${W}×${H}. Tente o tamanho normal ou o Chrome no computador.`);

    aoProgredir?.(0.01);
    const som = await this.mixarOffline(total);
    const aacOk = som ? (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 }).catch(() => null))?.supported : false;
    if (som && !aacOk) throw new Error('Este navegador não grava o som em AAC. Use o Chrome ou o Edge atualizado (ou a exportação rápida).');

    const alvo = new ArrayBufferTarget();
    const muxer = new Muxer({
      target: alvo, fastStart: 'in-memory', firstTimestampBehavior: 'offset',
      video: { codec: 'avc', width: W, height: H, frameRate: fps },
      ...(som ? { audio: { codec: 'aac' as const, numberOfChannels: 2, sampleRate: 48000 } } : {}),
    });
    let falha: Error | null = null;
    const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { falha = e as Error; } });
    enc.configure({ codec, width: W, height: H, bitrate: bits, framerate: fps, bitrateMode: 'variable', latencyMode: 'quality' });

    const quadros: Blob[] = [];
    const n = Math.max(1, Math.ceil(total * fps));
    const capas = new Set([Math.floor(n * 0.2), Math.floor(n * 0.55), n - 1]);
    this.exportando = true;
    this.escala = k; this.ajustarTela();
    try {
      for (let i = 0; i < n; i++) {
        if (falha) throw falha;
        const t = Math.min(total - 0.0005, i / fps);
        this.tempo = t;
        await this.posicionarVideos(t);
        this.desenhar(t);
        const quadro = new VideoFrame(this.canvas, { timestamp: Math.round((i * 1_000_000) / fps), duration: Math.round(1_000_000 / fps) });
        enc.encode(quadro, { keyFrame: i % (fps * 2) === 0 });
        quadro.close();
        if (capas.has(i)) { const b = await new Promise<Blob | null>((ok) => this.canvas.toBlob(ok, 'image/jpeg', 0.85)); if (b) quadros.push(b); }
        while (enc.encodeQueueSize > 6) await new Promise((ok) => setTimeout(ok, 2));
        if (i % 5 === 0) { aoProgredir?.(0.02 + 0.9 * (i / n)); await new Promise((ok) => setTimeout(ok, 0)); }
      }
      await enc.flush();
      if (falha) throw falha;
      if (som) {
        const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { falha = e as Error; } });
        aenc.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 });
        const L = som.getChannelData(0), R = som.numberOfChannels > 1 ? som.getChannelData(1) : som.getChannelData(0);
        const PEDACO = 4096;
        for (let off = 0; off < som.length; off += PEDACO) {
          const m = Math.min(PEDACO, som.length - off);
          const dados = new Float32Array(m * 2);
          dados.set(L.subarray(off, off + m), 0); dados.set(R.subarray(off, off + m), m);
          aenc.encode(new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: m, numberOfChannels: 2, timestamp: Math.round((off / 48000) * 1_000_000), data: dados }));
        }
        await aenc.flush();
        aenc.close();
        if (falha) throw falha;
      }
      muxer.finalize();
      aoProgredir?.(1);
    } finally {
      if (enc.state !== 'closed') enc.close();
      this.exportando = false;
      this.escala = PREVIA; this.ajustarTela();
      this.tempo = 0; this.sincronizar(0); this.desenhar(0);
    }
    const video = new Blob([alvo.buffer], { type: 'video/mp4' });
    return { video, mime: 'video/mp4', ext: 'mp4', largura: W, altura: H, duracaoMs: Math.round(total * 1000), capa: quadros[quadros.length - 1] ?? null, quadros };
  }

  /** Miniatura de um clipe para a linha do tempo. */
  miniatura(c: Clipe): CanvasImageSource | null {
    if (c.tipo === 'video') { const v = this.videos.get(c.id); return v && v.readyState >= 2 ? v : null; }
    if (c.tipo === 'imagem') { const i = this.imagens.get(this.resolver(c.src)); return i?.complete && i.naturalWidth ? i : null; }
    return this.artes.get(c.id)?.tela ?? null;
  }

  /** Duração do arquivo de vídeo/áudio (para cortar). */
  static lerDuracao(src: string, tipo: 'video' | 'audio'): Promise<number> {
    return new Promise((ok) => {
      const el = document.createElement(tipo);
      if (/^https?:/.test(src)) el.crossOrigin = 'anonymous';
      el.preload = 'metadata';
      el.onloadedmetadata = () => ok(Number.isFinite(el.duration) ? el.duration : 0);
      el.onerror = () => ok(0);
      el.src = src;
    });
  }

  destruir() {
    this.pausar();
    for (const v of this.videos.values()) { v.pause(); v.removeAttribute('src'); v.load(); }
    for (const a of this.audios.values()) { a.pause(); a.removeAttribute('src'); }
    void this.som?.close();
    this.videos.clear(); this.audios.clear(); this.ganhos.clear();
  }
}

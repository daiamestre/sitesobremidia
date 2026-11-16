// SOBRE MÍDIA STUDIO — F-319 (pedido do dono, 16/11/2026): EFEITOS REAIS, iguais aos do concorrente e melhores.
// O fogo, as explosões, a fumaça, as brasas, o raio, o vidro estilhaçando e o confete são FILMAGENS de verdade em fundo preto
// (Pixabay, licença de uso comercial gratuito — fichas em docs/licencas/EFEITOS_PIXABAY.md), aplicadas por cima da arte no
// modo "tela" (screen): o preto some e só a luz do fogo fica. Cada efeito é um ELEMENTO da arte (camada "efeito"): o
// cliente toca nele e move, aumenta, gira, troca, muda a hora em que aparece, repete ou apaga.
//
// O mesmo desenho serve à tela do editor, à prévia e ao MP4: na prévia o vídeo do efeito toca acompanhando o relógio; ao
// exportar, cada quadro espera o efeito chegar no instante EXATO (posicionarEfeitos) — o MP4 sai igual ao que se viu.
import type { CamadaEfeito, Documento } from './documento';
import { DecodificadorDeEfeito } from './video/decodificarEfeito';
import { aparelhoFraco } from './regente';

export type GrupoDoEfeito = 'explosao' | 'fogo' | 'fumaca' | 'faiscas' | 'raio' | 'vidro' | 'festa';
export interface EfeitoReal {
  id: string; nome: string; grupo: GrupoDoEfeito;
  /** duração do arquivo (s) */
  dur: number;
  /** filmagem em laço (fogo, brasas, raio): pode repetir sem emenda */
  laco: boolean;
  /** largura ÷ altura do arquivo */
  proporcao: number;
  autor: string; pagina: string;
}
const e = (id: string, nome: string, grupo: GrupoDoEfeito, dur: number, laco: boolean, autor: string, pixabay: number): EfeitoReal =>
  ({ id, nome, grupo, dur, laco, proporcao: 16 / 9, autor, pagina: `https://pixabay.com/videos/id-${pixabay}/` });

/** A galeria de efeitos reais (os arquivos ficam em /studio/efeitos/<id>.mp4 e o pôster em <id>.webp). */
export const EFEITOS_REAIS: EfeitoReal[] = [
  e('explosao-fogo', 'Explosão de fogo', 'explosao', 4.5, false, 'Nico_NCO', 16640),
  e('explosao-cogumelo', 'Explosão gigante', 'explosao', 4, false, 'Nico_NCO', 16642),
  e('explosao-pequena', 'Explosão rápida', 'explosao', 3, false, 'Nico_NCO', 16646),
  e('bola-de-fogo', 'Bola de fogo (tela cheia)', 'explosao', 3.2, false, 'Jacques_Barrette', 9049),
  e('onda-de-energia', 'Onda de energia', 'explosao', 3.5, false, 'olenchic', 212968),
  e('fogo-subindo', 'Fogo subindo', 'fogo', 5, true, 'u_q72e381w5k', 127967),
  e('parede-de-fogo', 'Parede de fogo', 'fogo', 6, true, 'Joe_hackney', 106366),
  e('linha-de-fogo', 'Linha de fogo', 'fogo', 5, true, 'Joe_hackney', 385499),
  e('brasas', 'Brasas subindo', 'faiscas', 6, true, 'osmo_create', 102550),
  e('fumaca-subindo', 'Fumaça / poeira', 'fumaca', 4.2, false, 'Sety_SB_Films', 36098),
  e('raio', 'Raio', 'raio', 4, true, 'uxcsani', 368086),
  e('vidro-rachando', 'Vidro rachando', 'vidro', 3, false, 'iwsky', 273108),
  e('vidro-estilhacos', 'Vidro estilhaçando', 'vidro', 2.2, false, 'MrWashingt0n', 385648),
  e('estilhacos', 'Cacos voando (batida)', 'vidro', 1.8, false, 'MrWashingt0n', 385648),
  e('confete', 'Chuva de confete', 'festa', 3.5, false, 'hirken8', 121983),
];
export const efeitoPorId = (id: string | null | undefined) => EFEITOS_REAIS.find((x) => x.id === id) ?? null;
/** sobe quando os arquivos mudam (o aparelho não fica com a filmagem antiga guardada) */
const VERSAO = 3;
export const arquivoDoEfeito = (id: string) => `/studio/efeitos/${id}.mp4?v=${VERSAO}`;
export const posterDoEfeito = (id: string) => `/studio/efeitos/${id}.webp?v=${VERSAO}`;
export const NOMES_DOS_GRUPOS: Record<GrupoDoEfeito, string> = {
  explosao: 'Explosões', fogo: 'Fogo', fumaca: 'Fumaça', faiscas: 'Brasas', raio: 'Raio', vidro: 'Vidro quebrando', festa: 'Festa',
};

/**
 * O instante dentro da filmagem para o tempo `t` da arte (null = o efeito não aparece agora) e a transparência
 * (entra e sai suave nos efeitos que repetem).
 */
export function instanteNoEfeito(c: Pick<CamadaEfeito, 'efeito' | 'inicio' | 'velocidade' | 'repetir' | 'duracao'>, t: number, totalDaArte = Infinity): { local: number; alfa: number } | null {
  const ef = efeitoPorId(c.efeito);
  if (!ef) return null;
  const v = Math.max(0.1, c.velocidade ?? 1);
  const s = t - (c.inicio ?? 0);
  if (s < 0) return null;
  if (c.repetir) {
    const fim = c.duracao && c.duracao > 0 ? c.duracao : Math.max(0, totalDaArte - (c.inicio ?? 0));
    if (s >= fim) return null;
    const alfa = Math.min(1, s / 0.3, (fim - s) / 0.3);
    return { local: (s * v) % ef.dur, alfa: Math.max(0, alfa) };
  }
  const local = s * v;
  if (local >= ef.dur - 0.02) return null;
  return { local, alfa: 1 };
}

// ───────────────────────────── os vídeos dos efeitos (no máximo 8 tocando ao mesmo tempo; os parados são devolvidos)
interface Tocador { v: HTMLVideoElement; usado: number; ultimo: number | null; pronto: Promise<void> }
const POR_TELA = new WeakMap<object, Map<string, Tocador>>();
const TODOS = new Set<{ dono: object; chave: string; t: Tocador }>();
const LIMITE = 12;
const dono = (ctx: CanvasRenderingContext2D | null | undefined): object => (ctx?.canvas as object) ?? TODOS;

function soltar(item: { dono: object; chave: string; t: Tocador }) {
  const { v } = item.t;
  v.pause(); v.removeAttribute('src'); try { v.load(); } catch { /* sem efeito */ }
  POR_TELA.get(item.dono)?.delete(item.chave);
  TODOS.delete(item);
}

function tocador(donoDaTela: object, c: CamadaEfeito): Tocador | null {
  if (typeof document === 'undefined') return null;
  let mapa = POR_TELA.get(donoDaTela);
  if (!mapa) { mapa = new Map(); POR_TELA.set(donoDaTela, mapa); }
  const chave = `${c.id}|${c.efeito}`;
  const achado = mapa.get(chave);
  if (achado) { achado.usado = performance.now(); return achado; }
  // devolve os que ninguém desenha há 1,5 s; se ainda passar do limite, o mais antigo
  const agora = performance.now();
  for (const it of [...TODOS]) if (agora - it.t.usado > 4000) { soltar(it); }
  if (TODOS.size >= LIMITE) { const velho = [...TODOS].sort((a, b) => a.t.usado - b.t.usado)[0]; if (velho) soltar(velho); }
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.loop = false;
  v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  const pronto = new Promise<void>((ok) => {
    const fim = () => { clearTimeout(limite); ok(); };
    const limite = setTimeout(ok, 6000);
    v.addEventListener('loadeddata', fim, { once: true });
    v.addEventListener('error', fim, { once: true });
  });
  v.addEventListener('loadeddata', () => avisar(), { once: true });
  v.src = arquivoDoEfeito(c.efeito);
  const t: Tocador = { v, usado: agora, ultimo: null, pronto };
  mapa.set(chave, t);
  TODOS.add({ dono: donoDaTela, chave, t });
  return t;
}

// ───────────────────────────── os pôsteres (o efeito na arte parada e enquanto o vídeo ainda carrega)
const POSTERES = new Map<string, HTMLImageElement>();
function poster(id: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let i = POSTERES.get(id);
  if (!i) { i = new Image(); i.src = posterDoEfeito(id); POSTERES.set(id, i); }
  return i.complete && i.naturalWidth ? i : null;
}

/** quem redesenha quando um efeito parado termina de chegar ao ponto (a prévia pausada mostra o quadro certo) */
const OUVINTES = new Set<() => void>();
export function aoEfeitoPronto(f: () => void): () => void { OUVINTES.add(f); return () => { OUVINTES.delete(f); }; }
let avisando = 0;
const avisar = () => { if (avisando) return; avisando = requestAnimationFrame(() => { avisando = 0; OUVINTES.forEach((f) => f()); }); };

/** Ao exportar, o MP4 espera cada efeito chegar ao quadro exato; na prévia ele só acompanha o relógio. */
let EXATO = false;
// na exportação, cada camada de efeito tem o seu decodificador (WebCodecs) e o quadro atual dele
const DECS = new Map<string, Promise<DecodificadorDeEfeito | null>>();
const QUADROS = new Map<string, VideoFrame>();
let idDono = 0;
const IDS = new WeakMap<object, number>();
const chaveExata = (ctx: CanvasRenderingContext2D, c: CamadaEfeito) => { const d = dono(ctx); let n = IDS.get(d); if (n == null) { n = ++idDono; IDS.set(d, n); } return `${n}|${c.id}|${c.efeito}`; };
export function modoExatoDosEfeitos(ligado: boolean) {
  EXATO = ligado;
  if (!ligado) { for (const p of DECS.values()) void p.then((d) => d?.fechar()); DECS.clear(); QUADROS.clear(); }
}

/**
 * A imagem do efeito para desenhar agora (o quadro do vídeo; o pôster na arte parada ou enquanto carrega), já com a
 * transparência das bordas do tempo. null = nada a desenhar.
 */
export function quadroDoEfeito(ctx: CanvasRenderingContext2D, c: CamadaEfeito, tempo: number | undefined, totalDaArte: number): { fonte: CanvasImageSource; w: number; h: number; alfa: number } | null {
  if (tempo === undefined) {
    const p = poster(c.efeito);
    return p ? { fonte: p, w: p.naturalWidth, h: p.naturalHeight, alfa: 1 } : null;
  }
  const no = instanteNoEfeito(c, tempo, totalDaArte);
  if (EXATO && no) {
    const q = QUADROS.get(chaveExata(ctx, c));
    if (q) return { fonte: q, w: q.displayWidth, h: q.displayHeight, alfa: no.alfa };
  }
  const mapa = POR_TELA.get(dono(ctx));
  const existente = mapa?.get(`${c.id}|${c.efeito}`);
  if (!no) {
    if (existente && !existente.v.paused) existente.v.pause();
    return null;
  }
  const t = tocador(dono(ctx), c);
  if (!t) return null;
  const v = t.v;
  if (!EXATO) {
    // a prévia: o relógio andou um pouco desde o último desenho = está tocando; parado ou pulando = vai direto ao ponto
    const andando = t.ultimo != null && no.local > t.ultimo && no.local - t.ultimo < 0.5;
    t.ultimo = no.local;
    if (andando) {
      if (v.paused) { if (!v.seeking) v.currentTime = no.local; void v.play().catch(() => undefined); }
      else if (Math.abs(v.currentTime - no.local) > 0.25 && !v.seeking) v.currentTime = no.local;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - no.local) > 0.04 && !v.seeking) { v.addEventListener('seeked', avisar, { once: true }); v.currentTime = no.local; }
    }
  }
  if (v.readyState >= 2 && v.videoWidth) return { fonte: v, w: v.videoWidth, h: v.videoHeight, alfa: no.alfa };
  const p = poster(c.efeito);
  return p && !EXATO ? { fonte: p, w: p.naturalWidth, h: p.naturalHeight, alfa: no.alfa * 0.6 } : null;
}

// ───────────────────────────── o RECORTE DO PRETO (luma key) feito pela placa de vídeo (WebGL)
// No modo "tela" o fogo sobre um fundo vermelho vira uma névoa clara. O recorte transforma o preto da filmagem em
// transparência (a opacidade de cada ponto = o brilho dele) e mantém a cor: o fogo fica laranja vivo POR CIMA da arte e a
// fumaça fica cinza de verdade — como nos vídeos do concorrente. Sem WebGL, cai no modo "tela".
interface Recorte { tela: HTMLCanvasElement; gl: WebGLRenderingContext; janela: WebGLUniformLocation | null; bordas: WebGLUniformLocation | null; radial: WebGLUniformLocation | null }
let RECORTE: Recorte | null | undefined;
function criarRecorte(): Recorte | null {
  try {
    const tela = document.createElement('canvas');
    const gl = tela.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true, antialias: false }) as WebGLRenderingContext | null;
    if (!gl) return null;
    const sh = (tipo: number, src: string) => { const s = gl.createShader(tipo)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main(){ uv = (p + 1.0) * 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0.0, 1.0); }'));
    // opacidade = o BRILHO do ponto (o miolo claro do fogo fica sólido, as bordas e a fumaça ficam transparentes; o preto quase
    // puro, que é ruído da filmagem, some) e a cor é a do fogo em brilho cheio; tudo pré-multiplicado
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 uv; uniform sampler2D v; uniform vec4 janela; uniform vec4 bordas; uniform float radial;' +
      // as BORDAS da caixa esfumadas (o fogo nunca termina numa linha reta): janela = a parte da filmagem que aparece na caixa
      'float borda(float d, float w){ return w <= 0.0 ? 1.0 : smoothstep(0.0, w, d); }' +
      'void main(){ vec3 c = texture2D(v, uv).rgb; float m = max(c.r, max(c.g, c.b)); float l = dot(c, vec3(0.299, 0.587, 0.114));' +
      ' float a = smoothstep(0.04, 0.8, l) * smoothstep(0.03, 0.1, m);' +
      ' vec2 q = (uv - janela.xy) / max(janela.zw - janela.xy, vec2(0.0001));' +
      ' a *= borda(q.x, bordas.x) * borda(1.0 - q.x, bordas.y) * borda(q.y, bordas.z) * borda(1.0 - q.y, bordas.w);' +
      // explosões: o fogo some em ELIPSE até as bordas da caixa (nunca vira um retângulo de fogo)
      ' if (radial > 0.0) a *= 1.0 - smoothstep(0.55, 1.0, length((q - 0.5) * 2.0));' +
      ' vec3 cor = c / max(m, 0.001); gl_FragColor = vec4(cor * a, a); }'));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { tela, gl, janela: gl.getUniformLocation(prog, 'janela'), bordas: gl.getUniformLocation(prog, 'bordas'), radial: gl.getUniformLocation(prog, 'radial') };
  } catch { return null; }
}
/** o quadro do efeito com o preto já transparente (null = sem WebGL) */
export function recortarPreto(fonte: CanvasImageSource, w: number, h: number, janela: [number, number, number, number] = [0, 0, 1, 1], bordas: [number, number, number, number] = [0, 0, 0, 0], radial = false, limite = 1280): HTMLCanvasElement | null {
  if (RECORTE === undefined) RECORTE = typeof document === 'undefined' ? null : criarRecorte();
  if (!RECORTE) return null;
  const { tela, gl } = RECORTE;
  gl.uniform4f(RECORTE.janela, ...janela); gl.uniform4f(RECORTE.bordas, ...bordas); gl.uniform1f(RECORTE.radial, radial ? 1 : 0);
  const s = Math.min(1, Math.max(256, Math.min(1280, limite)) / w);
  const cw = Math.max(2, Math.round(w * s)), ch = Math.max(2, Math.round(h * s));
  if (tela.width !== cw || tela.height !== ch) { tela.width = cw; tela.height = ch; }
  try {
    gl.viewport(0, 0, cw, ch);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte as TexImageSource);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return tela;
  } catch { return null; }
}

/** Pinta o efeito (a origem já está no centro da camada): cobre a caixa, no modo de mistura escolhido. */
export function desenharEfeito(ctx: CanvasRenderingContext2D, c: CamadaEfeito, tempo: number | undefined, totalDaArte: number) {
  const q = quadroDoEfeito(ctx, c, tempo, totalDaArte);
  if (!q || q.alfa <= 0) return;
  const r = Math.max(c.w / q.w, c.h / q.h);
  const dw = q.w * r, dh = q.h * r;
  // a âncora: o fogo nasce embaixo (a base da filmagem fica na base da caixa); o resto, pelo meio
  const y0 = c.ancora === 'baixo' ? c.h / 2 - dh : c.ancora === 'cima' ? -c.h / 2 : -dh / 2;
  const modo = c.mistura ?? 'chave';
  // a parte da filmagem que cai dentro da caixa (em 0..1) e quanto esfumar cada borda (a da base fica firme no fogo do chão)
  const u0 = (dw - c.w) / 2 / dw, v0 = (-c.h / 2 - y0) / dh;
  const janela: [number, number, number, number] = [u0, v0, 1 - u0, v0 + c.h / dh];
  const f = 0.14;
  // F-320: a base também esfuma (com a base firme, o fogo atrás da logo terminava numa LINHA reta embaixo do nome). O fogo do
  // chão passa da beirada da tela, então o esfumado dele fica fora da tela.
  const bordas: [number, number, number, number] = [f, f, c.ancora === 'cima' ? f * 0.5 : f, f];
  const recortado = modo === 'chave' ? recortarPreto(q.fonte, q.w, q.h, janela, bordas, efeitoPorId(c.efeito)?.grupo === 'explosao', dw * Math.abs(ctx.getTransform().a) * (!EXATO && aparelhoFraco() ? 0.6 : 1)) : null;
  // (o recorte é feito no tamanho em que o efeito APARECE na tela — o efeito pequeno do preço custa pouco no tablet)
  ctx.save();
  ctx.beginPath(); ctx.rect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.clip();
  ctx.globalCompositeOperation = recortado ? 'source-over' : ((modo === 'chave' ? 'screen' : modo) as GlobalCompositeOperation);
  ctx.globalAlpha *= q.alfa;
  if (c.espelhar) ctx.scale(-1, 1);
  ctx.drawImage(recortado ?? q.fonte, -dw / 2, y0, dw, dh);
  ctx.restore();
}

const efeitosDo = (d: Documento) => d.camadas.filter((c): c is CamadaEfeito => c.tipo === 'efeito' && c.visivel);

/** Carrega os pôsteres (a arte parada já sai com o efeito). */
export async function prepararEfeitos(d: Documento): Promise<void> {
  const ids = [...new Set(efeitosDo(d).map((c) => c.efeito))];
  await Promise.all(ids.map((id) => new Promise<void>((ok) => {
    if (typeof Image === 'undefined') return ok();
    const p = poster(id);
    if (p) return ok();
    const i = POSTERES.get(id)!;
    const fim = () => ok();
    i.addEventListener('load', fim, { once: true }); i.addEventListener('error', fim, { once: true });
    setTimeout(fim, 4000);
  })));
}

/** EXPORTAR: leva cada efeito que aparece no instante `tempo` ao quadro exato (e espera), para o desenho ser fiel. */
export async function posicionarEfeitos(ctx: CanvasRenderingContext2D | null, d: Documento, tempo: number, totalDaArte: number): Promise<void> {
  if (!ctx) return;
  await Promise.all(efeitosDo(d).map(async (c) => {
    const no = instanteNoEfeito(c, tempo, totalDaArte);
    if (!no) return;
    // o decodificador em sequência (rápido e exato); sem ele, o vídeo do efeito vai ao ponto
    if (EXATO) {
      const k = chaveExata(ctx, c);
      let p = DECS.get(k);
      if (!p) { p = DecodificadorDeEfeito.abrir(arquivoDoEfeito(c.efeito)); DECS.set(k, p); }
      const dec = await p;
      const q = dec ? await dec.quadroEm(no.local) : null;
      if (q) { QUADROS.set(k, q); return; }
      QUADROS.delete(k);
    }
    const t = tocador(dono(ctx), c);
    if (!t) return;
    await t.pronto;
    const v = t.v;
    if (!v.paused) v.pause();
    t.ultimo = no.local;
    if (Math.abs(v.currentTime - no.local) < 0.004 && v.readyState >= 2) return;
    await new Promise<void>((ok) => {
      const fim = () => { v.removeEventListener('seeked', fim); clearTimeout(limite); ok(); };
      const limite = setTimeout(fim, 3000);
      v.addEventListener('seeked', fim);
      v.currentTime = Math.min(no.local, Math.max(0, (v.duration || 99) - 0.01));
    });
  }));
}

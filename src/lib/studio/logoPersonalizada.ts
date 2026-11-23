/**
 * F-355 (pedido do dono, 22/11/2026) — LOGO PERSONALIZADA: nas logos de promoção com faixa, placa ou espaço vazio o usuário
 * escreve o texto (começa com o nome da empresa) e, se quiser, põe a logo da empresa dele no espaço reservado.
 *  - o texto e a logo do usuário ficam PRESOS na logo: viram uma imagem só, que se move, aumenta e gira inteira;
 *  - a logo do usuário é OPCIONAL: sem ela o espaço não existe (a logo continua completa sozinha);
 *  - a logo do usuário aparece SÓ na "vaga" (o miolo branco que era o xadrez do modelo): carne, garfo, letras e o aro
 *    do dono continuam por cima, como no original;
 *  - o texto segue o FORMATO da faixa (reto, em arco para cima ou para baixo) e o ESTILO de cada logo (fonte, cor ou
 *    degradê, contorno e sombra).
 * Os espaços de cada logo vêm de scripts/studio/espacos-das-logos.json (medidas em pixels do arquivo da logo).
 */
import { carregarFonteStudio, fonteCanvas } from './fontes';

export type Caixa4 = [number, number, number, number];
export interface TextoDaLogo {
  id: string;
  rotulo: string;
  /** x, y, largura, altura (px do arquivo) */
  caixa: Caixa4;
  /** texto em curva: centro, raio do meio das letras e os ângulos (graus) de começo e fim; baixo = curva de sorriso */
  arco?: { cx: number; cy: number; r: number; de: number; ate: number; baixo?: boolean };
  cor: string;
  /** degradê de cima para baixo nas letras (no lugar da cor lisa) */
  degrade?: [string, string];
  contorno?: { cor: string; largura: number };
  sombra?: { cor: string; x: number; y: number; desfoque: number };
  fonte?: string;
  peso?: number;
  /** espaçamento entre letras (em "em") */
  espaco?: number;
  maxTamanho?: number;
  /** o texto dá lugar à logo quando o usuário põe uma (mesmo espaço) */
  somePorLogo?: boolean;
}
export interface EspacoDaLogoDoUsuario {
  rotulo: string;
  circulo?: [number, number, number];
  caixa?: Caixa4;
  /** o círculo desenhado só quando há logo (aro e fundo, como no modelo do dono) */
  anel?: { cor: string; largura: number; fundo: string };
  /** onde a logo do usuário fica dentro do círculo (a parte que aparece; o resto fica atrás dos desenhos da frente) */
  alvo?: Caixa4;
}
export interface EspacosDaLogo { textos: TextoDaLogo[]; logo?: EspacoDaLogoDoUsuario; /** máscara do miolo onde a logo do usuário aparece */ vaga?: string }
export interface ValoresDaLogo { textos: Record<string, string>; logoUrl: string | null }

const FONTE_PADRAO = 'montserrat';
const CHAVE = 'studio-logos-personalizadas';
const CHAVE_LOJA = 'studio-locucao-loja'; // o mesmo nome da empresa do Palco de Ofertas

function lerLembrados(): Record<string, ValoresDaLogo> {
  try { return JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Record<string, ValoresDaLogo>; } catch { return {}; }
}
export function nomeDaEmpresaGuardado(): string {
  try { return localStorage.getItem(CHAVE_LOJA) ?? ''; } catch { return ''; }
}
/** O que aparece ao abrir: o que a pessoa usou da última vez nesta logo; senão, o nome da empresa em toda faixa. */
export function valoresIniciais(logoId: string, espacos: EspacosDaLogo): ValoresDaLogo {
  const antes = lerLembrados()[logoId];
  const loja = nomeDaEmpresaGuardado().trim().toUpperCase();
  const ultimaLogo = Object.values(lerLembrados()).find((v) => v.logoUrl)?.logoUrl ?? null;
  return {
    textos: Object.fromEntries(espacos.textos.map((t) => [t.id, antes?.textos?.[t.id] ?? loja])),
    logoUrl: espacos.logo ? (antes ? antes.logoUrl : ultimaLogo) : null,
  };
}
export function lembrarValores(logoId: string, v: ValoresDaLogo) {
  const t = lerLembrados(); t[logoId] = v;
  try { localStorage.setItem(CHAVE, JSON.stringify(t)); } catch { /* sem armazenamento: vale só agora */ }
  const loja = Object.values(v.textos).find((x) => x.trim());
  try { if (loja && !localStorage.getItem(CHAVE_LOJA)) localStorage.setItem(CHAVE_LOJA, loja); } catch { /* idem */ }
}

/** Maior tamanho de letra (px) em que o texto cabe na largura, até o teto. */
export function tamanhoQueCabe(medir: (tam: number) => number, largura: number, teto: number, piso = 8): number {
  let tam = Math.floor(teto);
  while (tam > piso && medir(tam) > largura) tam -= 1;
  return tam;
}
/** Quebra em duas linhas o mais parecidas possível (no espaço mais perto do meio). */
export function duasLinhas(texto: string): [string, string] | null {
  const meio = texto.length / 2; let melhor = -1;
  for (let i = 0; i < texto.length; i++) if (texto[i] === ' ' && (melhor < 0 || Math.abs(i - meio) < Math.abs(melhor - meio))) melhor = i;
  return melhor > 0 ? [texto.slice(0, melhor).trim(), texto.slice(melhor + 1).trim()] : null;
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => erro(new Error('Não foi possível abrir a imagem.')); i.src = src; });
}

function escrever(ctx: CanvasRenderingContext2D, t: TextoDaLogo, valor: string) {
  const texto = valor.trim();
  if (!texto) return;
  const fonte = t.fonte ?? FONTE_PADRAO, peso = t.peso ?? 900;
  const [x, y, w, h] = t.caixa;
  const pintar = (tam: number) => {
    if (t.degrade) { const g = ctx.createLinearGradient(0, -tam / 2, 0, tam / 2); g.addColorStop(0, t.degrade[0]); g.addColorStop(1, t.degrade[1]); return g; }
    return t.cor;
  };
  const tracar = (s: string, px: number, py: number, tam: number) => {
    ctx.save(); ctx.translate(px, py);
    if (t.sombra) { ctx.save(); ctx.shadowColor = t.sombra.cor; ctx.shadowOffsetX = t.sombra.x; ctx.shadowOffsetY = t.sombra.y; ctx.shadowBlur = t.sombra.desfoque; ctx.fillStyle = t.sombra.cor; ctx.fillText(s, 0, 0); ctx.restore(); }
    if (t.contorno) { ctx.lineJoin = 'round'; ctx.strokeStyle = t.contorno.cor; ctx.lineWidth = t.contorno.largura * 2; ctx.strokeText(s, 0, 0); }
    ctx.fillStyle = pintar(tam); ctx.fillText(s, 0, 0);
    ctx.restore();
  };
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (t.arco) { // letra por letra na curva da faixa, centralizado no meio do arco (uma ou duas linhas, a que ficar maior)
    const { cx, cy, r, de, ate, baixo } = t.arco;
    const graus = (Math.abs(ate - de) * Math.PI) / 180 * 0.94;
    const larg = (s: string, tam: number) => { ctx.font = fonteCanvas(fonte, tam, peso); return [...s].reduce((a, c) => a + ctx.measureText(c).width + tam * (t.espaco ?? 0.04), 0); };
    const teto = t.maxTamanho ?? h * 0.6;
    const naCurva = (linha: string, raio: number, tam: number) => {
      ctx.font = fonteCanvas(fonte, tam, peso);
      const larguras = [...linha].map((c) => ctx.measureText(c).width + tam * (t.espaco ?? 0.04));
      const meio0 = ((de + ate) / 2) * (Math.PI / 180), total = larguras.reduce((a, b) => a + b, 0) / raio;
      // em cima (alça): da esquerda para a direita o ângulo cresce; embaixo (sorriso): diminui
      let ang = baixo ? meio0 + total / 2 : meio0 - total / 2;
      [...linha].forEach((c, i) => {
        const passo = larguras[i] / raio, meio = baixo ? ang - passo / 2 : ang + passo / 2;
        ctx.save(); ctx.translate(cx + raio * Math.cos(meio), cy + raio * Math.sin(meio)); ctx.rotate(baixo ? meio - Math.PI / 2 : meio + Math.PI / 2); tracar(c, 0, 0, tam); ctx.restore();
        ang = baixo ? ang - passo : ang + passo;
      });
    };
    const uma = tamanhoQueCabe((sz) => larg(texto, sz) / r, graus, teto);
    const partes = duasLinhas(texto);
    // duas linhas: a de cima fica mais longe do centro na alça e mais perto no sorriso
    const sobe = baixo ? -1 : 1;
    const duas = partes ? tamanhoQueCabe((sz) => Math.max(larg(partes[0], sz) / (r + sobe * sz * 0.55), larg(partes[1], sz) / (r - sobe * sz * 0.55)), graus, teto * 0.62) : 0;
    if (partes && duas > uma * 1.2) { naCurva(partes[0], r + sobe * duas * 0.55, duas); naCurva(partes[1], r - sobe * duas * 0.55, duas); }
    else naCurva(texto, r, uma);
  } else { // uma linha bem grande; se ficar pequena demais, duas linhas
    const medir = (s: string) => (tam: number) => { ctx.font = fonteCanvas(fonte, tam, peso); return ctx.measureText(s).width + (t.contorno?.largura ?? 0) * 2; };
    const teto = Math.min(t.maxTamanho ?? Infinity, h * 0.72);
    const uma = tamanhoQueCabe(medir(texto), w * 0.94, teto);
    const partes = duasLinhas(texto);
    const duas = partes ? Math.min(tamanhoQueCabe(medir(partes[0]), w * 0.94, h * 0.42), tamanhoQueCabe(medir(partes[1]), w * 0.94, h * 0.42)) : 0;
    if (partes && duas > uma * 1.15) {
      ctx.font = fonteCanvas(fonte, duas, peso);
      tracar(partes[0], x + w / 2, y + h / 2 - duas * 0.55, duas); tracar(partes[1], x + w / 2, y + h / 2 + duas * 0.55, duas);
    } else { ctx.font = fonteCanvas(fonte, uma, peso); tracar(texto, x + w / 2, y + h / 2, uma); }
  }
  ctx.restore();
}

function porLogoDoUsuario(ctx: CanvasRenderingContext2D, e: EspacoDaLogoDoUsuario, img: HTMLImageElement, vaga: HTMLImageElement | null) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const camada = document.createElement('canvas'); camada.width = W; camada.height = H;
  const c = camada.getContext('2d')!;
  let area: Caixa4;
  if (e.circulo) {
    const [cx, cy, r] = e.circulo;
    if (!vaga) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip(); }
    const lado = r * 1.4; area = e.alvo ?? [cx - lado / 2, cy - lado / 2, lado, lado];
  } else area = e.alvo ?? e.caixa ?? [0, 0, 0, 0];
  const [x, y, w, h] = area;
  const esc = Math.min((w * 0.92) / img.naturalWidth, (h * 0.86) / img.naturalHeight);
  const lw = img.naturalWidth * esc, lh = img.naturalHeight * esc;
  c.drawImage(img, x + (w - lw) / 2, y + (h - lh) / 2, lw, lh);
  if (vaga) { c.globalCompositeOperation = 'destination-in'; c.drawImage(vaga, 0, 0, W, H); } // só no miolo branco
  ctx.drawImage(camada, 0, 0);
}

/** Desenha a logo com o texto e a logo do usuário, no tamanho original da logo do dono. */
export async function desenharLogoPersonalizada(logo: { url: string; largura: number; altura: number; espacos?: EspacosDaLogo }, v: ValoresDaLogo): Promise<HTMLCanvasElement> {
  const espacos = logo.espacos ?? { textos: [] };
  const [base, sua, vaga] = await Promise.all([
    carregarImagem(logo.url),
    espacos.logo && v.logoUrl ? carregarImagem(v.logoUrl).catch(() => null) : Promise.resolve(null),
    espacos.vaga && espacos.logo && v.logoUrl ? carregarImagem(espacos.vaga).catch(() => null) : Promise.resolve(null),
    ...new Set(espacos.textos.map((t) => carregarFonteStudio(t.fonte ?? FONTE_PADRAO))),
  ]);
  const c = document.createElement('canvas');
  c.width = logo.largura; c.height = logo.altura;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Este aparelho não conseguiu desenhar a logo.');
  ctx.drawImage(base, 0, 0, c.width, c.height);
  if (sua && espacos.logo) porLogoDoUsuario(ctx, espacos.logo, sua, vaga);
  for (const t of espacos.textos) if (!(t.somePorLogo && sua)) escrever(ctx, t, v.textos[t.id] ?? '');
  return c;
}

export const pngDoCanvas = (c: HTMLCanvasElement) => new Promise<Blob>((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('Não foi possível gerar a logo.'))), 'image/png'));

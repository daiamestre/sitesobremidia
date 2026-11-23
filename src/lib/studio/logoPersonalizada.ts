/**
 * F-355 (pedido do dono, 22/11/2026) — LOGO PERSONALIZADA: nas logos de promoção com faixa, placa ou espaço vazio o usuário
 * escreve o texto (começa com o nome da empresa) e, se quiser, põe a logo da empresa dele no espaço reservado.
 *  - o texto e a logo do usuário ficam PRESOS na logo: viram uma imagem só, que se move, aumenta e gira inteira;
 *  - a logo do usuário é OPCIONAL: sem ela o espaço não existe (a logo continua completa sozinha);
 *  - quando o espaço era um círculo que ficava atrás de outros desenhos (carne, garfo, letras), a "frente" (os pixels do
 *    dono que estavam na frente) volta por cima, como no original.
 * Os espaços de cada logo vêm de scripts/studio/espacos-das-logos.json (medidas em pixels do arquivo da logo).
 */
import { carregarFonteStudio, fonteCanvas } from './fontes';

export type Caixa4 = [number, number, number, number];
export interface TextoDaLogo {
  id: string;
  rotulo: string;
  /** x, y, largura, altura (px do arquivo) */
  caixa: Caixa4;
  /** texto em curva (alça redonda): centro, raio do meio das letras e os ângulos (graus) de começo e fim */
  arco?: { cx: number; cy: number; r: number; de: number; ate: number };
  cor: string;
  contorno?: { cor: string; largura: number };
  fonte?: string;
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
export interface EspacosDaLogo { textos: TextoDaLogo[]; logo?: EspacoDaLogoDoUsuario; frente?: string }
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
  const fonte = t.fonte ?? FONTE_PADRAO;
  const [x, y, w, h] = t.caixa;
  const tracar = (s: string, px: number, py: number) => {
    if (t.contorno) { ctx.lineJoin = 'round'; ctx.strokeStyle = t.contorno.cor; ctx.lineWidth = t.contorno.largura * 2; ctx.strokeText(s, px, py); }
    ctx.fillStyle = t.cor; ctx.fillText(s, px, py);
  };
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (t.arco) { // letra por letra na curva da alça, centralizado no meio do arco
    const { cx, cy, r, de, ate } = t.arco;
    const vao = ((ate - de) * Math.PI) / 180 * 0.94;
    const tam = tamanhoQueCabe((s) => { ctx.font = fonteCanvas(fonte, s, 800); return ctx.measureText(texto).width * 1.08 / r; }, vao, t.maxTamanho ?? h * 0.6);
    ctx.font = fonteCanvas(fonte, tam, 800);
    const larguras = [...texto].map((c) => ctx.measureText(c).width * 1.08);
    let ang = ((de + ate) / 2) * (Math.PI / 180) - larguras.reduce((a, b) => a + b, 0) / r / 2;
    [...texto].forEach((c, i) => {
      const meio = ang + larguras[i] / r / 2;
      ctx.save(); ctx.translate(cx + r * Math.cos(meio), cy + r * Math.sin(meio)); ctx.rotate(meio + Math.PI / 2); tracar(c, 0, 0); ctx.restore();
      ang += larguras[i] / r;
    });
  } else { // uma linha bem grande; se ficar pequena demais, duas linhas
    const medir = (s: string) => (tam: number) => { ctx.font = fonteCanvas(fonte, tam, 900); return ctx.measureText(s).width + (t.contorno?.largura ?? 0) * 2; };
    const teto = Math.min(t.maxTamanho ?? Infinity, h * 0.72);
    const uma = tamanhoQueCabe(medir(texto), w * 0.94, teto);
    const partes = duasLinhas(texto);
    const duas = partes ? Math.min(tamanhoQueCabe(medir(partes[0]), w * 0.94, h * 0.42), tamanhoQueCabe(medir(partes[1]), w * 0.94, h * 0.42)) : 0;
    if (partes && duas > uma * 1.15) {
      ctx.font = fonteCanvas(fonte, duas, 900);
      tracar(partes[0], x + w / 2, y + h / 2 - duas * 0.55); tracar(partes[1], x + w / 2, y + h / 2 + duas * 0.55);
    } else { ctx.font = fonteCanvas(fonte, uma, 900); tracar(texto, x + w / 2, y + h / 2); }
  }
  ctx.restore();
}

function porLogoDoUsuario(ctx: CanvasRenderingContext2D, e: EspacoDaLogoDoUsuario, img: HTMLImageElement) {
  ctx.save();
  let area: Caixa4;
  if (e.circulo) {
    const [cx, cy, r] = e.circulo;
    if (e.anel) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = e.anel.fundo; ctx.fill(); ctx.lineWidth = e.anel.largura; ctx.strokeStyle = e.anel.cor; ctx.stroke(); }
    const dentro = r - (e.anel?.largura ?? 0);
    ctx.beginPath(); ctx.arc(cx, cy, dentro, 0, Math.PI * 2); ctx.clip();
    const lado = dentro * 1.5; area = e.alvo ?? [cx - lado / 2, cy - lado / 2, lado, lado];
  } else area = e.caixa ?? [0, 0, 0, 0];
  const [x, y, w, h] = area;
  const esc = Math.min((w * 0.92) / img.naturalWidth, (h * 0.86) / img.naturalHeight);
  const lw = img.naturalWidth * esc, lh = img.naturalHeight * esc;
  ctx.drawImage(img, x + (w - lw) / 2, y + (h - lh) / 2, lw, lh);
  ctx.restore();
}

/** Desenha a logo com o texto e a logo do usuário, no tamanho original da logo do dono. */
export async function desenharLogoPersonalizada(logo: { url: string; largura: number; altura: number; espacos?: EspacosDaLogo }, v: ValoresDaLogo): Promise<HTMLCanvasElement> {
  const espacos = logo.espacos ?? { textos: [] };
  const [base, sua, frente] = await Promise.all([
    carregarImagem(logo.url),
    espacos.logo && v.logoUrl ? carregarImagem(v.logoUrl).catch(() => null) : Promise.resolve(null),
    espacos.frente && espacos.logo && v.logoUrl ? carregarImagem(espacos.frente).catch(() => null) : Promise.resolve(null),
    ...new Set(espacos.textos.map((t) => carregarFonteStudio(t.fonte ?? FONTE_PADRAO))),
  ]);
  const c = document.createElement('canvas');
  c.width = logo.largura; c.height = logo.altura;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Este aparelho não conseguiu desenhar a logo.');
  ctx.drawImage(base, 0, 0, c.width, c.height);
  if (sua && espacos.logo) porLogoDoUsuario(ctx, espacos.logo, sua);
  if (frente) ctx.drawImage(frente, 0, 0, c.width, c.height);
  for (const t of espacos.textos) if (!(t.somePorLogo && sua)) escrever(ctx, t, v.textos[t.id] ?? '');
  return c;
}

export const pngDoCanvas = (c: HTMLCanvasElement) => new Promise<Blob>((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('Não foi possível gerar a logo.'))), 'image/png'));

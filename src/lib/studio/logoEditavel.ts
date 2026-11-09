// F-286 — LOGO 3D EDITÁVEL dos segmentos (padaria, adega, açougue…): a logo deixa de ser uma imagem só e vira camadas.
//   - "Logo – base": a fita, o aro dourado, o círculo branco e os ícones laterais (public/studio/logos/ofertas-<seg>-base.webp);
//   - "Logo – OFERTAS", "Logo – faixa" e "Logo – frase": textos que o cliente troca (ex.: OFERTAS → PROMOÇÃO);
//   - "Logo no círculo": o emblema do segmento, que o cliente troca pela LOGO DELE (pasta Logos, galeria ou arquivos) e redimensiona.
// As medidas vêm da arte de scripts/studio/gerar-segmentos.mjs (tela de 1500×1050) e são levadas para a caixa do título.
import { imagem, texto, type Camada } from './documento';
import { SEGMENTOS_DE_OFERTA, type SegmentoNovo } from './segmentosDeOferta';

const W = 1500, H = 1050;
/** os textos e as cores de cada segmento (os mesmos da arte gerada) */
const TEXTOS: Record<SegmentoNovo, { fita: string; frase: string; extrusao: string; fita2: string }> = {
  padaria: { fita: 'DA PADARIA', frase: 'FRESQUINHO TODO DIA', extrusao: '#5a2c06', fita2: '#4f0a18' },
  adega: { fita: 'DA ADEGA', frase: 'BEBIDAS GELADAS', extrusao: '#3c0414', fita2: '#050507' },
  acougue: { fita: 'DO AÇOUGUE', frase: 'CARNES SELECIONADAS', extrusao: '#4a050b', fita2: '#0a0a0a' },
  suplementos: { fita: 'SUPLEMENTOS', frase: 'MAIS FORÇA NO TREINO', extrusao: '#5a1d00', fita2: '#050507' },
  hortifruti: { fita: 'HORTIFRÚTI', frase: 'QUITANDA · FRUTAS E LEGUMES', extrusao: '#0f4a0c', fita2: '#b04f00' },
  pet: { fita: 'PET SHOP', frase: 'TUDO PARA O SEU PET', extrusao: '#073f50', fita2: '#3f1491' },
  beleza: { fita: 'DE BELEZA', frase: 'PERFUMARIA E CUIDADOS', extrusao: '#6e0a38', fita2: '#3d0a5c' },
  eletronicos: { fita: 'TECNOLOGIA', frase: 'CONECTADO COM VOCÊ', extrusao: '#061c5e', fita2: '#04060f' },
  moda: { fita: 'DE MODA', frase: 'NOVA COLEÇÃO', extrusao: '#5c0824', fita2: '#000000' },
};

export const ehSegmentoComLogoEditavel = (s: string | undefined | null): s is SegmentoNovo => !!s && SEGMENTOS_DE_OFERTA.some((x) => x.id === s);

/** As camadas da logo do segmento dentro da caixa (a logo cabe inteira, centralizada, sem deformar). */
export function camadasDaLogoDoSegmento(seg: SegmentoNovo, caixa: { x: number; y: number; w: number; h: number }, atraso = 0): Camada[] {
  const t = TEXTOS[seg];
  const k = Math.min(caixa.w / W, caixa.h / H);
  const ox = caixa.x + (caixa.w - W * k) / 2, oy = caixa.y + (caixa.h - H * k) / 2;
  const X = (v: number) => ox + v * k, Y = (v: number) => oy + v * k, S = (v: number) => v * k;
  /** texto com as LETRAS centradas em (cx, cy) da arte */
  const linha = (nome: string, valor: string, cy: number, largura: number, tamanho: number, o: Parameters<typeof texto>[5]) => {
    const c = texto(nome, valor, X(750 - largura / 2), 0, S(largura), { tamanho: S(tamanho), alinhamento: 'center', entrelinha: 1, ...o });
    return { ...c, y: Y(cy) - c.h / 2 };
  };
  const tamFita = Math.min(116, Math.round(900 / (t.fita.length * 0.5 + 0.6)));
  const ani = (tipo: 'zoom' | 'subir', a: number) => ({ tipo, atraso: atraso + a, duracao: 0.6, depois: null });
  return [
    { ...imagem('Logo – base', `/studio/logos/ofertas-${seg}-base.webp`, X(0), Y(0), S(W), S(H), { ajuste: 'conter' }), animacao: ani('zoom', 0) },
    { ...imagem('Logo no círculo', `/studio/logos/ofertas-${seg}-emblema.webp`, X(655), Y(105), S(190), S(190), { ajuste: 'conter' }), animacao: ani('zoom', 0.1) },
    { ...linha('Logo – OFERTAS', 'OFERTAS', 548, 1400, 390, { fonte: 'anton', cor: '#ffffff', degrade: { de: '#ffffff', para: '#efe2c0', angulo: 90 }, contorno: { cor: t.extrusao, largura: S(14) }, sombra: { cor: t.extrusao, desfoque: 0, dx: 0, dy: S(22) }, espacamento: 0.015 }), animacao: ani('zoom', 0.15) },
    { ...linha('Logo – faixa', t.fita, 812, 960, tamFita, { fonte: 'anton', cor: '#ffffff', contorno: { cor: t.fita2, largura: S(5) }, espacamento: 0.07 }), animacao: ani('subir', 0.25) },
    { ...linha('Logo – frase', t.frase, 953, 1460, 62, { fonte: 'poppins', peso: 800, cor: '#ffd21f', contorno: { cor: t.extrusao, largura: S(8) }, espacamento: 0.13 }), animacao: ani('subir', 0.35) },
  ];
}

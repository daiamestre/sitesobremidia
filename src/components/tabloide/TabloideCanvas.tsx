/**
 * Tabloide Digital (F-172/F-173) — o cartaz. Desenhado no tamanho de projeto do formato (ex.: 1920×1080);
 * a tela só o escala com transform, e a exportação usa exatamente este tamanho.
 * Estilo: selo 3D do título, faixa com o nome do produto, produto recortado e selo de preço.
 */
import { useEffect, useRef, useState } from 'react';
import { emojiDoProduto } from '@/lib/tabloide/imagens';
import { formatarPreco, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { medidasDoFormato, type Celula, type PaginaLayout } from '@/lib/tabloide/grade';
import { coresDoSelo, desenharPreco, desenharSelo3D, larguraDoPreco, tom } from '@/lib/tabloide/selo3d';
import type { Formato, Segmento, Tema } from '@/lib/tabloide/temas';

const FONTE = "'Arial Black','Segoe UI Black',Impact,system-ui,sans-serif";

const NOMES_FONTE: Record<string, string> = { OPENFOODFACTS: 'Open Food Facts', PEXELS: 'Pexels', PIXABAY: 'Pixabay' };

/** Selo 3D do título (arte própria, desenhada no canvas). */
function Selo3D({ titulo, tema, largura, altura }: { titulo: string; tema: Tema; largura: number; altura: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const tela = ref.current;
    if (!tela) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = tela.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return;
    desenharSelo3D(ctx, tela.width, tela.height, titulo, coresDoSelo(tema.preco, tema.precoCor));
  }, [titulo, tema, largura, altura]);
  return <canvas ref={ref} role="img" aria-label={titulo} data-testid="tabloide-selo" width={Math.round(largura)} height={Math.round(altura)} style={{ width: largura, height: altura, display: 'block', flexShrink: 0 }} />;
}

function FotoProduto({ produto, segmento, s }: { produto: ProdutoTabloide; segmento: Segmento; s: number }) {
  const [falhou, setFalhou] = useState(false);
  const img = produto.imagem;
  if (img && !falhou) {
    // recortada: produto solto sobre o cartão; embalagem com fundo: moldura branca; foto de cenário: preenche a moldura
    const solta = !!img.recortada;
    const embalagem = solta || img.fonte === 'OPENFOODFACTS' || img.fonte === 'UPLOAD';
    return (
      <div style={{ width: '100%', height: '100%', background: solta ? 'transparent' : '#fff', borderRadius: s * 0.05, overflow: 'hidden' }}>
        <img
          src={img.url}
          alt={produto.nome}
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          onError={() => setFalhou(true)}
          style={{ width: '100%', height: '100%', objectFit: embalagem ? 'contain' : 'cover', display: 'block' }}
        />
      </div>
    );
  }
  return <EmojiProduto emoji={emojiDoProduto(produto.nome, segmento.emojiPadrao)} lado={Math.round(s * 0.5)} />;
}

/** Desenho de reserva (emoji) quando não há foto real do produto. */
function EmojiProduto({ emoji, lado }: { emoji: string; lado: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const tela = ref.current;
    if (!tela) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = tela.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return;
    ctx.clearRect(0, 0, lado, lado);
    ctx.font = `${lado * 0.78}px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, lado / 2, lado * 0.54);
  }, [emoji, lado]);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas ref={ref} role="img" aria-label={emoji} data-testid="tabloide-emoji" width={lado} height={lado} style={{ width: lado, height: lado, maxWidth: '100%', maxHeight: '100%' }} />
    </div>
  );
}

/** Selo de preço desenhado no canvas (sai idêntico na tela e na imagem exportada). */
function Preco({ produto, tema, grande }: { produto: ProdutoTabloide; tema: Tema; grande: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const partes = produto.preco == null ? null : formatarPreco(produto.preco);
  const inteiro = partes?.inteiro ?? null;
  const centavos = partes?.centavos ?? '';
  const unidade = produto.unidade;
  const largura = Math.round(larguraDoPreco({ inteiro, centavos, unidade }, grande));
  const altura = Math.round(grande * 1.28);
  const rotulo = partes ? `R$ ${partes.inteiro},${partes.centavos}${unidade ? ` ${unidade}` : ''}` : 'Consulte o preço';
  useEffect(() => {
    const tela = ref.current;
    if (!tela) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = tela.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return;
    desenharPreco(ctx, tela.width, tela.height, { inteiro, centavos, unidade }, tema.preco, tema.precoCor);
  }, [inteiro, centavos, unidade, tema, largura, altura]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      {produto.precoDe != null && (
        <div style={{ fontSize: grande * 0.3, color: '#3a0a0a', background: 'rgba(255,255,255,.9)', borderRadius: grande * 0.1, padding: `${grande * 0.04}px ${grande * 0.12}px`, textDecoration: 'line-through', fontWeight: 800, lineHeight: 1.25, marginBottom: grande * 0.05, whiteSpace: 'nowrap' }}>
          de R$ {formatarPreco(produto.precoDe).inteiro},{formatarPreco(produto.precoDe).centavos}
        </div>
      )}
      <canvas ref={ref} role="img" aria-label={rotulo} data-testid="tabloide-preco" width={largura} height={altura} style={{ width: largura, height: altura, display: 'block' }} />
    </div>
  );
}

/** "-23%" quando o produto tem preço "de/por". */
export function descontoPct(produto: Pick<ProdutoTabloide, 'preco' | 'precoDe'>): number | null {
  if (produto.preco == null || produto.precoDe == null || produto.precoDe <= produto.preco) return null;
  const pct = Math.round((1 - produto.preco / produto.precoDe) * 100);
  return pct >= 1 ? pct : null;
}

function Cartao({ celula, tema, segmento }: { celula: Celula; tema: Tema; segmento: Segmento }) {
  const { produto, x, y, w, h, destaque } = celula;
  const s = Math.min(w, h);
  const largo = w / h > 1.45;
  const nome = produto.nome.toUpperCase();
  const faixaA = s * (destaque ? 0.15 : 0.17);
  const fonteNome = Math.min(faixaA * 0.62, (w * 0.94) / Math.max(6, nome.length * 0.66));
  const borda = Math.max(3, Math.round(s * 0.014));
  const grande = Math.min(s * (destaque ? 0.22 : 0.25), w * 0.2);
  const pct = descontoPct(produto);
  return (
    <div
      data-testid="tabloide-cartao"
      style={{ position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box', background: tema.cartao, border: `${borda}px solid ${tema.cartaoBorda}`, borderRadius: s * 0.07, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ height: faixaA, flexShrink: 0, background: `linear-gradient(180deg, ${tom(tema.preco, 0.12)}, ${tema.preco})`, color: tema.precoCor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fonteNome, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', letterSpacing: -fonteNome * 0.01, padding: `0 ${s * 0.02}px` }}>
        {nome}
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div style={{ position: 'absolute', left: s * 0.03, top: s * 0.03, bottom: s * 0.03, right: largo ? '42%' : s * 0.03 }}>
          <FotoProduto produto={produto} segmento={segmento} s={s} />
        </div>
        {pct != null && (
          <div style={{ position: 'absolute', left: s * 0.03, top: s * 0.03, background: '#ffd400', color: '#b00014', border: `${Math.max(2, s * 0.008)}px solid #b00014`, borderRadius: s * 0.04, padding: `${s * 0.012}px ${s * 0.03}px`, fontSize: s * 0.075, fontWeight: 900, lineHeight: 1, transform: 'rotate(-6deg)' }}>
            -{pct}%
          </div>
        )}
        {produto.obs && <div style={{ position: 'absolute', left: s * 0.04, bottom: s * 0.03, maxWidth: '50%', color: tema.nomeCor, fontSize: s * 0.05, fontWeight: 800, lineHeight: 1 }}>{produto.obs}</div>}
        <div style={{ position: 'absolute', right: s * 0.03, bottom: s * 0.045 }}>
          <Preco produto={produto} tema={tema} grande={grande} />
        </div>
      </div>
    </div>
  );
}

export interface TabloideCanvasProps {
  formato: Formato;
  tema: Tema;
  segmento: Segmento;
  titulo: string;
  subtitulo: string;
  validade: string;
  empresa: string;
  logoUrl?: string | null;
  /** Selo próprio do cliente (PNG transparente) no lugar do selo 3D automático. */
  seloUrl?: string | null;
  pagina: PaginaLayout;
  numeroPagina: number;
  totalPaginas: number;
}

export function TabloideCanvas({ formato, tema, segmento, titulo, subtitulo, validade, empresa, logoUrl, seloUrl, pagina, numeroPagina, totalPaginas }: TabloideCanvasProps) {
  const m = medidasDoFormato(formato);
  const texto = (titulo || segmento.titulo).toUpperCase();
  const horizontal = m.largura > m.altura * 1.15;
  const logoLado = logoUrl ? m.cabecalho * 0.8 : 0;
  // o selo ocupa a altura do cabeçalho; na horizontal a frase fica ao lado, em pé fica embaixo
  const seloA = m.cabecalho * (horizontal || !subtitulo ? 0.96 : 0.76);
  const seloL = Math.min(seloA * 2.7, m.largura - m.pad * 2 - (logoLado ? logoLado + m.gap : 0) - (horizontal && subtitulo ? m.largura * 0.26 : 0));
  const fonteFrase = horizontal ? Math.min(m.cabecalho * 0.2, (m.largura * 0.24) / Math.max(6, subtitulo.length * 0.32)) : Math.min(m.cabecalho * 0.15, (m.largura * 0.8) / Math.max(8, subtitulo.length * 0.6));
  const creditos = [...new Set(pagina.celulas.map((c) => c.produto.imagem?.fonte).filter((f): f is NonNullable<typeof f> => !!f && f in NOMES_FONTE))].map((f) => NOMES_FONTE[f]);
  const fonteRodape = m.rodape * 0.46;

  const frase = subtitulo ? (
    <div style={{ background: tema.faixa, color: tema.tituloCor, borderRadius: fonteFrase * 0.5, padding: `${fonteFrase * 0.3}px ${fonteFrase * 0.7}px`, fontSize: fonteFrase, fontWeight: 900, lineHeight: 1.1, textAlign: 'center', maxWidth: horizontal ? m.largura * 0.26 : m.largura * 0.9, boxShadow: '0 4px 0 rgba(0,0,0,.2)' }}>
      {subtitulo}
    </div>
  ) : null;

  return (
    <div data-testid="tabloide-canvas" style={{ position: 'relative', width: m.largura, height: m.altura, background: tema.fundo, fontFamily: FONTE, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: m.pad, top: 0, width: m.largura - m.pad * 2, height: m.cabecalho + m.gap * 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: m.gap * 1.5 }}>
        <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: horizontal ? m.gap * 1.5 : m.gap * 0.2, minWidth: 0 }}>
          {seloUrl
            ? <img src={seloUrl} alt={texto} crossOrigin="anonymous" referrerPolicy="no-referrer" data-testid="tabloide-selo" style={{ height: seloA, maxWidth: seloL, objectFit: 'contain', flexShrink: 0 }} />
            : <Selo3D titulo={texto} tema={tema} largura={seloL} altura={seloA} />}
          {frase}
        </div>
        {logoUrl && (
          <div style={{ width: logoLado, height: logoLado, flexShrink: 0, borderRadius: '50%', background: '#fff', border: `${Math.max(3, logoLado * 0.04)}px solid ${tema.cartaoBorda}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 0 rgba(0,0,0,.2)' }}>
            <img src={logoUrl} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" style={{ width: '78%', height: '78%', objectFit: 'contain' }} />
          </div>
        )}
      </div>

      {pagina.celulas.map((c) => <Cartao key={c.produto.id} celula={c} tema={tema} segmento={segmento} />)}

      <div style={{ position: 'absolute', left: 0, bottom: 0, width: m.largura, height: m.rodape, background: tema.rodape, color: tema.rodapeCor, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${m.pad}px`, fontSize: fonteRodape, fontWeight: 800, gap: m.pad }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[empresa, validade].filter(Boolean).join('  •  ')}</span>
        <span style={{ opacity: 0.85, whiteSpace: 'nowrap', fontWeight: 700 }}>
          *Imagens meramente ilustrativas{creditos.length ? ` · Fotos: ${creditos.join(', ')}` : ''}{totalPaginas > 1 ? `  ·  ${numeroPagina}/${totalPaginas}` : ''}
        </span>
      </div>
    </div>
  );
}

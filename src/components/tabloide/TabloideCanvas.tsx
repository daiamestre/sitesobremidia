/**
 * Cartaz Digital (F-172…F-179) — o cartaz. Desenhado no tamanho de projeto do formato (ex.: 1920×1080);
 * a tela só o escala com transform, e a exportação usa exatamente este tamanho.
 * Camadas, de baixo para cima: foto do tema (ou as cores do estilo) → cabeçalho (logo 3D, frase, logo da loja)
 * → cartões dos produtos → rodapé (dados da loja, validade e avisos) → logos soltas.
 */
import { useEffect, useRef, useState } from 'react';
import { formatarPreco, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { medidasDoFormato, type Celula, type PaginaLayout } from '@/lib/tabloide/grade';
import { coresDoSelo, desenharPreco, desenharSelo3D, larguraDoPreco, tom } from '@/lib/tabloide/selo3d';
import { cssDaFonte, fonteDeCanvas } from '@/lib/tabloide/fontes';
import type { Formato, Segmento, Tema } from '@/lib/tabloide/temas';
import type { ElementoLivre } from '@/lib/tabloide/selos';
import type { FontesCartaz, FundoLogo, LinhasDoRodape } from '@/lib/tabloide/cartaz';

const NOMES_FONTE: Record<string, string> = { OPENFOODFACTS: 'Open Food Facts', PEXELS: 'Pexels', PIXABAY: 'Pixabay', WIKIMEDIA: 'Wikimedia Commons', OPENVERSE: 'Openverse', IA: 'criadas por IA' };

/** Título em texto com volume (usado só quando não há logo 3D para o cabeçalho). */
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

/**
 * Logo escolhida no cabeçalho: entra inteira (object-fit contain), sem esticar, cortar nem filtrar, com a transparência original.
 * Se o arquivo não carregar, o cabeçalho volta ao título em texto em vez de ficar vazio.
 */
function LogoDoCabecalho({ url, titulo, tema, largura, altura }: { url: string; titulo: string; tema: Tema; largura: number; altura: number }) {
  const [falhou, setFalhou] = useState<string | null>(null);
  if (falhou === url) return <Selo3D titulo={titulo} tema={tema} largura={largura} altura={altura} />;
  return (
    <img
      src={url}
      alt={titulo}
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      data-testid="tabloide-selo"
      data-logo-cabecalho="true"
      onError={() => setFalhou(url)}
      style={{ height: altura, maxWidth: largura, width: 'auto', objectFit: 'contain', flexShrink: 0, display: 'block' }}
    />
  );
}

function FotoProduto({ produto, s }: { produto: ProdutoTabloide; s: number }) {
  const [falhou, setFalhou] = useState(false);
  const img = produto.imagem;
  if (img && !falhou) {
    // recortada: produto solto sobre o cartão; embalagem com fundo: moldura branca; foto de cenário: preenche a moldura
    const solta = !!img.recortada;
    const embalagem = solta || img.fonte === 'OPENFOODFACTS' || img.fonte === 'UPLOAD' || img.fonte === 'IA';
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
  // sem foto real: nunca desenho/emoji. Espaço neutro; no editor o cliente vê o aviso e escolhe ou envia a foto.
  return (
    <div data-testid="tabloide-sem-foto" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b8b8b8', fontSize: s * 0.09, fontWeight: 800, textAlign: 'center', lineHeight: 1.1, padding: s * 0.05 }}>
      FOTO DO PRODUTO
    </div>
  );
}

/** Selo de preço desenhado no canvas (sai idêntico na tela e na imagem exportada). */
function Preco({ produto, tema, grande, fonte }: { produto: ProdutoTabloide; tema: Tema; grande: number; fonte: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const partes = produto.preco == null ? null : formatarPreco(produto.preco);
  const inteiro = partes?.inteiro ?? null;
  const centavos = partes?.centavos ?? '';
  const unidade = produto.unidade;
  const largura = Math.round(larguraDoPreco({ inteiro, centavos, unidade }, grande));
  const altura = Math.round(grande * 1.28);
  const rotulo = partes ? `R$ ${partes.inteiro},${partes.centavos}${unidade ? ` ${unidade}` : ''}` : 'Consulte o preço';
  useEffect(() => {
    const desenhar = () => {
      const tela = ref.current;
      if (!tela) return;
      let ctx: CanvasRenderingContext2D | null = null;
      try { ctx = tela.getContext('2d'); } catch { ctx = null; }
      if (!ctx) return;
      desenharPreco(ctx, tela.width, tela.height, { inteiro, centavos, unidade }, tema.preco, tema.precoCor, fonte === 'padrao' ? undefined : (t) => fonteDeCanvas(fonte, t));
    };
    desenhar();
    // a fonte escolhida pode terminar de carregar depois do primeiro desenho
    const fontes = typeof document !== 'undefined' ? document.fonts : undefined;
    fontes?.addEventListener?.('loadingdone', desenhar);
    return () => fontes?.removeEventListener?.('loadingdone', desenhar);
  }, [inteiro, centavos, unidade, tema, largura, altura, fonte]);
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

function Cartao({ celula, tema, fontes }: { celula: Celula; tema: Tema; fontes: FontesCartaz }) {
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
      <div data-testid="tabloide-nome" style={{ height: faixaA, flexShrink: 0, background: `linear-gradient(180deg, ${tom(tema.preco, 0.12)}, ${tema.preco})`, color: tema.precoCor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fonteNome, whiteSpace: 'nowrap', overflow: 'hidden', letterSpacing: -fonteNome * 0.01, padding: `0 ${s * 0.02}px`, ...cssDaFonte(fontes.produto) }}>
        {nome}
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div style={{ position: 'absolute', left: s * 0.03, top: s * 0.03, bottom: s * 0.03, right: largo ? '42%' : s * 0.03 }}>
          <FotoProduto produto={produto} s={s} />
        </div>
        {pct != null && (
          <div style={{ position: 'absolute', left: s * 0.03, top: s * 0.03, background: '#ffd400', color: '#b00014', border: `${Math.max(2, s * 0.008)}px solid #b00014`, borderRadius: s * 0.04, padding: `${s * 0.012}px ${s * 0.03}px`, fontSize: s * 0.075, fontWeight: 900, lineHeight: 1, transform: 'rotate(-6deg)' }}>
            -{pct}%
          </div>
        )}
        {produto.obs && <div style={{ position: 'absolute', left: s * 0.04, bottom: s * 0.03, maxWidth: '50%', color: tema.nomeCor, fontSize: s * 0.05, fontWeight: 800, lineHeight: 1 }}>{produto.obs}</div>}
        <div style={{ position: 'absolute', right: s * 0.03, bottom: s * 0.045 }}>
          <Preco produto={produto} tema={tema} grande={grande} fonte={fontes.preco} />
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
  /** Mensagem promocional (vazia = não aparece). */
  subtitulo: string;
  /** Texto simples de validade e nome da loja (usados quando `rodape` não é informado). */
  validade: string;
  empresa: string;
  /** Rodapé já montado: dados da loja, validade e avisos. */
  rodape?: LinhasDoRodape;
  linhasRodape?: number;
  fontes?: FontesCartaz;
  logoUrl?: string | null;
  fundoLogo?: FundoLogo;
  /** Logo 3D do cabeçalho (PNG transparente). */
  seloUrl?: string | null;
  /** Sem logo e sem título em texto (a foto do tema já traz a arte do cabeçalho). */
  semTitulo?: boolean;
  /** Foto do tema: cobre o cartaz inteiro, por baixo de tudo. */
  fundoUrl?: string | null;
  pagina: PaginaLayout;
  numeroPagina: number;
  totalPaginas: number;
  /** Logos da biblioteca colocadas livremente sobre o cartaz (valem em todas as páginas). */
  elementos?: ElementoLivre[];
  /** Só na prévia: realça a camada escolhida e permite arrastar (a exportação não passa isto). */
  selecionadoId?: string | null;
  aoPonteiroElemento?: (id: string, ev: React.PointerEvent) => void;
}

const FONTES_PADRAO: FontesCartaz = { produto: 'padrao', preco: 'padrao', frase: 'padrao', rodape: 'padrao' };

export function TabloideCanvas(p: TabloideCanvasProps) {
  const { formato, tema, segmento, titulo, subtitulo, logoUrl, seloUrl, pagina, numeroPagina, totalPaginas, elementos, selecionadoId, aoPonteiroElemento } = p;
  const fontes = p.fontes ?? FONTES_PADRAO;
  const rodape: LinhasDoRodape = p.rodape ?? { principal: [p.empresa, p.validade].filter(Boolean).join('  •  '), contato: '', avisos: '*Imagens meramente ilustrativas', advertencia: '' };
  const extras = [rodape.contato, rodape.advertencia].filter(Boolean);
  const linhas = p.linhasRodape ?? 1 + extras.length;
  const m = medidasDoFormato(formato, linhas);
  const texto = (titulo || segmento.titulo).toUpperCase();
  const horizontal = m.largura > m.altura * 1.15;
  const logoLado = logoUrl ? m.cabecalho * 0.8 : 0;
  const temCabecalho = !!seloUrl || !p.semTitulo;
  // a logo ocupa a altura do cabeçalho; na horizontal a frase fica ao lado, em pé fica embaixo
  const seloA = m.cabecalho * (horizontal || !subtitulo ? 0.96 : 0.76);
  const seloL = Math.min(seloA * 2.7, m.largura - m.pad * 2 - (logoLado ? logoLado + m.gap : 0) - (horizontal && subtitulo ? m.largura * 0.26 : 0));
  const fonteFrase = horizontal ? Math.min(m.cabecalho * 0.2, (m.largura * 0.24) / Math.max(6, subtitulo.length * 0.32)) : Math.min(m.cabecalho * 0.15, (m.largura * 0.8) / Math.max(8, subtitulo.length * 0.6));
  const creditos = [...new Set(pagina.celulas.map((c) => c.produto.imagem?.fonte).filter((f): f is NonNullable<typeof f> => !!f && f in NOMES_FONTE))].map((f) => NOMES_FONTE[f]);
  const linhaA = m.rodape / linhas;
  const avisos = [rodape.avisos, creditos.length ? `Fotos: ${creditos.join(', ')}` : '', totalPaginas > 1 ? `${numeroPagina}/${totalPaginas}` : ''].filter(Boolean).join(' · ');
  const cabe = (t: string, maximo: number, larguraUtil: number) => Math.min(maximo, (larguraUtil * 1.85) / Math.max(10, t.length));
  const fontePrincipal = cabe(rodape.principal, linhaA * 0.48, m.largura * 0.56);
  const fonteAvisos = cabe(avisos, linhaA * 0.4, m.largura * 0.4);

  const frase = subtitulo ? (
    <div data-testid="tabloide-frase" style={{ background: tema.faixa, color: tema.tituloCor, borderRadius: fonteFrase * 0.5, padding: `${fonteFrase * 0.3}px ${fonteFrase * 0.7}px`, fontSize: fonteFrase, lineHeight: 1.1, textAlign: 'center', maxWidth: horizontal ? m.largura * 0.26 : m.largura * 0.9, boxShadow: '0 4px 0 rgba(0,0,0,.2)', ...cssDaFonte(fontes.frase) }}>
      {subtitulo}
    </div>
  ) : null;

  const fundoDaLogo = p.fundoLogo === 'sem' ? 'transparent' : p.fundoLogo === 'escuro' ? '#111827' : '#fff';

  return (
    <div data-testid="tabloide-canvas" style={{ position: 'relative', width: m.largura, height: m.altura, background: tema.fundo, fontFamily: cssDaFonte('padrao').fontFamily, overflow: 'hidden' }}>
      {p.fundoUrl && (
        <img src={p.fundoUrl} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" data-testid="tabloide-fundo"
          style={{ position: 'absolute', left: 0, top: 0, width: m.largura, height: m.altura, objectFit: 'cover', display: 'block' }} />
      )}

      <div style={{ position: 'absolute', left: m.pad, top: 0, width: m.largura - m.pad * 2, height: m.cabecalho + m.gap * 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: m.gap * 1.5 }}>
        <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: horizontal ? m.gap * 1.5 : m.gap * 0.2, minWidth: 0 }}>
          {seloUrl
            ? <LogoDoCabecalho url={seloUrl} titulo={texto} tema={tema} largura={seloL} altura={seloA} />
            : temCabecalho ? <Selo3D titulo={texto} tema={tema} largura={seloL} altura={seloA} /> : null}
          {frase}
        </div>
        {logoUrl && (
          <div data-testid="tabloide-logo-marca" style={{ width: logoLado, height: logoLado, flexShrink: 0, borderRadius: p.fundoLogo === 'sem' ? 0 : '50%', background: fundoDaLogo, border: p.fundoLogo === 'sem' ? 'none' : `${Math.max(3, logoLado * 0.04)}px solid ${tema.cartaoBorda}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: p.fundoLogo === 'sem' ? 'none' : '0 4px 0 rgba(0,0,0,.2)' }}>
            <img src={logoUrl} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" style={{ width: p.fundoLogo === 'sem' ? '100%' : '78%', height: p.fundoLogo === 'sem' ? '100%' : '78%', objectFit: 'contain' }} />
          </div>
        )}
      </div>

      {pagina.celulas.map((c) => <Cartao key={c.produto.id} celula={c} tema={tema} fontes={fontes} />)}

      <div data-testid="tabloide-rodape" style={{ position: 'absolute', left: 0, bottom: 0, width: m.largura, height: m.rodape, background: tema.rodape, color: tema.rodapeCor, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${m.pad}px`, boxSizing: 'border-box', ...cssDaFonte(fontes.rodape) }}>
        <div style={{ height: linhaA, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: m.pad }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: fontePrincipal }}>{rodape.principal}</span>
          <span style={{ opacity: 0.88, whiteSpace: 'nowrap', fontSize: fonteAvisos }}>{avisos}</span>
        </div>
        {extras.map((linha, i) => (
          <div key={i} data-testid="tabloide-rodape-contato" style={{ height: linhaA, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', overflow: 'hidden', fontSize: cabe(linha, linhaA * 0.44, m.largura - m.pad * 2) }}>
            {linha}
          </div>
        ))}
      </div>

      {(elementos ?? []).map((e) => {
        const w = e.w * m.largura;
        const h = w * e.ar;
        return (
          <img
            key={e.id}
            src={e.url}
            alt={e.nome}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            draggable={false}
            data-testid="tabloide-elemento"
            onPointerDown={aoPonteiroElemento ? (ev) => aoPonteiroElemento(e.id, ev) : undefined}
            style={{
              position: 'absolute', left: e.cx * m.largura - w / 2, top: e.cy * m.altura - h / 2, width: w, height: h,
              transform: `rotate(${e.rot}deg)`, touchAction: 'none', userSelect: 'none',
              cursor: aoPonteiroElemento ? 'grab' : undefined,
              outline: selecionadoId === e.id ? `${Math.max(3, m.largura * 0.003)}px dashed #38bdf8` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

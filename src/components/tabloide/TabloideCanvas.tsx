/**
 * Cartaz Digital (F-172…F-180) — o cartaz. Desenhado no tamanho de projeto do formato (ex.: 1920×1080);
 * a tela só o escala com transform, e a exportação usa exatamente este tamanho.
 * Camadas, de baixo para cima: foto do tema (cartaz inteiro ou só a faixa do cabeçalho) → cabeçalho (logo 3D, frase, logo da loja)
 * → boxes dos produtos → rodapé (dados da loja, validade e avisos) → logos soltas.
 */
import { useEffect, useRef, useState } from 'react';
import { formatarPreco, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { medidasDoFormato, type AjusteDeMedidas, type Celula, type PaginaLayout } from '@/lib/tabloide/grade';
import { coresDoSelo, desenharPreco, desenharSelo3D, larguraDoPreco, tom } from '@/lib/tabloide/selo3d';
import { cssDaFonte, fonteDeCanvas } from '@/lib/tabloide/fontes';
import type { Formato, Segmento, Tema } from '@/lib/tabloide/temas';
import type { ElementoLivre } from '@/lib/tabloide/selos';
import type { EstiloBox, EstiloRodape, FontesCartaz, FundoLogo, LinhasDoRodape, TamanhoTexto } from '@/lib/tabloide/cartaz';

const NOMES_FONTE: Record<string, string> = { OPENFOODFACTS: 'Open Food Facts', PEXELS: 'Pexels', PIXABAY: 'Pixabay', WIKIMEDIA: 'Wikimedia Commons', OPENVERSE: 'Openverse', IA: 'criadas por IA' };
const ESCALA_TEXTO: Record<TamanhoTexto, number> = { pequeno: 0.82, medio: 1, grande: 1.2 };

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
    // recortada: produto solto sobre o box; embalagem com fundo: moldura branca; foto de cenário: preenche a moldura
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

const textoDoPreco = (produto: ProdutoTabloide) => {
  const partes = produto.preco == null ? null : formatarPreco(produto.preco);
  return { inteiro: partes?.inteiro ?? null, centavos: partes?.centavos ?? '', unidade: produto.unidade };
};

/** Maior selo de preço que cabe na largura e na altura dadas. */
export function tamanhoDoPreco(produto: ProdutoTabloide, larguraMax: number, alturaMax: number): number {
  const g = alturaMax / 1.28;
  const l = larguraDoPreco(textoDoPreco(produto), g);
  return l > larguraMax ? g * (larguraMax / l) : g;
}

/** Selo de preço desenhado no canvas (sai idêntico na tela e na imagem exportada). */
function Preco({ produto, tema, grande, fonte, alinhar = 'flex-end' }: { produto: ProdutoTabloide; tema: Tema; grande: number; fonte: string; alinhar?: 'flex-end' | 'center' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { inteiro, centavos, unidade } = textoDoPreco(produto);
  const largura = Math.round(larguraDoPreco({ inteiro, centavos, unidade }, grande));
  const altura = Math.round(grande * 1.28);
  const rotulo = inteiro != null ? `R$ ${inteiro},${centavos}${unidade ? ` ${unidade}` : ''}` : 'Consulte o preço';
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: alinhar }}>
      {produto.precoDe != null && (
        <div data-testid="tabloide-preco-de" style={{ fontSize: grande * 0.3, color: '#3a0a0a', background: 'rgba(255,255,255,.92)', borderRadius: grande * 0.1, padding: `${grande * 0.04}px ${grande * 0.12}px`, textDecoration: 'line-through', fontWeight: 800, lineHeight: 1.25, marginBottom: grande * 0.05, whiteSpace: 'nowrap' }}>
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

/** Qual desenho o box usa: o escolhido, ou — no "inteligente" — o que melhor aproveita o espaço daquele box. */
export function estiloDoBox(boxes: EstiloBox, w: number, h: number): Exclude<EstiloBox, 'inteligente'> {
  if (boxes !== 'inteligente') return boxes;
  const proporcao = w / h;
  return proporcao < 0.95 ? 'coluna' : proporcao > 2.1 ? 'lado' : 'faixa';
}

/**
 * Maior letra com que o nome cabe em até `linhasMax` linhas dentro de largura × altura
 * (estimativa pela largura média da letra maiúscula; a palavra mais comprida nunca é partida).
 */
export function letraQueCabe(nome: string, largura: number, altura: number, linhasMax: number, teto: number): number {
  const palavras = nome.split(/s+/).filter(Boolean);
  const maior = Math.max(1, ...palavras.map((p) => p.length));
  const LARG = 0.76; // largura média de uma letra maiúscula em negrito pesado, em fração do tamanho
  const cabe = (f: number) => {
    const porLinha = Math.floor(largura / (f * LARG));
    if (porLinha < maior) return false;
    let linhas = 1; let usados = 0;
    for (const p of palavras) {
      if (usados && usados + 1 + p.length > porLinha) { linhas++; usados = p.length; } else usados += (usados ? 1 : 0) + p.length;
    }
    return linhas <= linhasMax && linhas * f * 1.08 <= altura;
  };
  if (cabe(teto)) return teto;
  // letra menor sempre cabe melhor: procura a maior que cabe (busca por metades)
  let menor = teto * 0.3; let maiorQueNao = teto;
  if (!cabe(menor)) return menor;
  for (let i = 0; i < 18; i++) {
    const meio = (menor + maiorQueNao) / 2;
    if (cabe(meio)) menor = meio; else maiorQueNao = meio;
  }
  return menor;
}

function Selinho({ pct, s }: { pct: number; s: number }) {
  return (
    <div style={{ position: 'absolute', left: s * 0.03, top: s * 0.03, background: '#ffd400', color: '#b00014', border: `${Math.max(2, s * 0.008)}px solid #b00014`, borderRadius: s * 0.04, padding: `${s * 0.012}px ${s * 0.03}px`, fontSize: s * 0.075, fontWeight: 900, lineHeight: 1, transform: 'rotate(-6deg)', zIndex: 1 }}>
      -{pct}%
    </div>
  );
}

function Cartao({ celula, tema, fontes, boxes, escala }: { celula: Celula; tema: Tema; fontes: FontesCartaz; boxes: EstiloBox; escala: number }) {
  const { produto, x, y, w, h, destaque } = celula;
  const s = Math.min(w, h);
  const nome = produto.nome.toUpperCase();
  const borda = Math.max(3, Math.round(s * 0.014));
  const pct = descontoPct(produto);
  const estilo = estiloDoBox(boxes, w, h);
  const moldura: React.CSSProperties = { position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box', background: tema.cartao, border: `${borda}px solid ${tema.cartaoBorda}`, borderRadius: s * 0.07, overflow: 'hidden', display: 'flex' };
  const lw = w - borda * 2;
  const lh = h - borda * 2;
  const temDe = produto.precoDe != null;

  if (estilo === 'coluna') {
    // como nos encartes: nome em cima, foto no meio e o preço ocupando a base do box
    const nomeA = lh * 0.2 * Math.min(1.15, escala);
    const precoA = Math.min(lh * 0.17, lw * 0.36);
    const grande = tamanhoDoPreco(produto, lw * 0.94, precoA);
    const fonteNome = letraQueCabe(nome, lw * 0.9, nomeA, 3, Math.min(nomeA * 0.5, lw * 0.19) * escala);
    return (
      <div data-testid="tabloide-cartao" data-estilo="coluna" style={{ ...moldura, flexDirection: 'column', alignItems: 'center' }}>
        <div data-testid="tabloide-nome" style={{ height: nomeA, flexShrink: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: tema.nomeCor, fontSize: fonteNome, lineHeight: 1.08, padding: `${lh * 0.015}px ${lw * 0.05}px 0`, boxSizing: 'border-box', ...cssDaFonte(fontes.produto) }}>
          {nome}
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%' }}>
          {/* a foto fica num quadro quase quadrado, centralizado: box muito alto não estica a foto */}
          <div style={{ position: 'absolute', inset: `${lh * 0.015}px ${lw * 0.06}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', height: '100%', maxHeight: lw * 1.2 }}><FotoProduto produto={produto} s={s} /></div>
          </div>
          {pct != null && <Selinho pct={pct} s={s} />}
          {produto.obs && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center', color: tema.nomeCor, fontSize: s * 0.05, fontWeight: 800, lineHeight: 1 }}>{produto.obs}</div>}
        </div>
        <div style={{ flexShrink: 0, padding: `${lh * 0.01}px 0 ${lh * 0.018}px` }}>
          <Preco produto={produto} tema={tema} grande={temDe ? grande * 0.9 : grande} fonte={fontes.preco} alinhar="center" />
        </div>
      </div>
    );
  }

  if (estilo === 'lado') {
    const direitaL = lw * 0.54;
    const nomeA = lh * 0.42 * Math.min(1.15, escala);
    const grande = tamanhoDoPreco(produto, direitaL * 0.94, lh * (temDe ? 0.34 : 0.42));
    const fonteNome = letraQueCabe(nome, direitaL * 0.92, nomeA, 3, Math.min(nomeA * 0.5, direitaL * 0.16) * escala);
    return (
      <div data-testid="tabloide-cartao" data-estilo="lado" style={{ ...moldura, flexDirection: 'row' }}>
        <div style={{ position: 'relative', width: lw - direitaL, flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: s * 0.04 }}><FotoProduto produto={produto} s={s} /></div>
          {pct != null && <Selinho pct={pct} s={s} />}
        </div>
        <div style={{ width: direitaL, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: `${lh * 0.05}px ${lw * 0.02}px ${lh * 0.06}px 0`, boxSizing: 'border-box' }}>
          <div data-testid="tabloide-nome" style={{ height: nomeA, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: tema.nomeCor, fontSize: fonteNome, lineHeight: 1.08, ...cssDaFonte(fontes.produto) }}>{nome}</div>
          {produto.obs && <div style={{ color: tema.nomeCor, fontSize: s * 0.05, fontWeight: 800, lineHeight: 1 }}>{produto.obs}</div>}
          <Preco produto={produto} tema={tema} grande={grande} fonte={fontes.preco} alinhar="center" />
        </div>
      </div>
    );
  }

  // faixa colorida com o nome, foto e preço no canto
  const largo = w / h > 1.45;
  const faixaA = s * (destaque ? 0.15 : 0.17) * Math.min(1.25, Math.max(0.85, escala));
  const fonteNome = Math.min(faixaA * 0.62, (w * 0.94) / Math.max(6, nome.length * 0.66));
  const grande = Math.min(s * (destaque ? 0.22 : 0.25), w * 0.2);
  return (
    <div data-testid="tabloide-cartao" data-estilo="faixa" style={{ ...moldura, flexDirection: 'column' }}>
      <div data-testid="tabloide-nome" style={{ height: faixaA, flexShrink: 0, background: `linear-gradient(180deg, ${tom(tema.preco, 0.12)}, ${tema.preco})`, color: tema.precoCor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fonteNome, whiteSpace: 'nowrap', overflow: 'hidden', letterSpacing: -fonteNome * 0.01, padding: `0 ${s * 0.02}px`, ...cssDaFonte(fontes.produto) }}>
        {nome}
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div style={{ position: 'absolute', left: s * 0.03, top: s * 0.03, bottom: s * 0.03, right: largo ? '42%' : s * 0.03 }}>
          <FotoProduto produto={produto} s={s} />
        </div>
        {pct != null && <Selinho pct={pct} s={s} />}
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
  /** Foto do tema cobrindo o cartaz inteiro, por baixo de tudo. */
  fundoUrl?: string | null;
  /** Foto do tema só na faixa do cabeçalho (de ponta a ponta). */
  faixaUrl?: string | null;
  /** Medidas ajustadas (altura da faixa do tema, estilo do rodapé). */
  ajuste?: AjusteDeMedidas;
  boxes?: EstiloBox;
  tamanhoTexto?: TamanhoTexto;
  rodapeEstilo?: EstiloRodape;
  /** Página de capa: só a arte, o título, a frase, a validade e a loja. */
  capa?: boolean;
  pagina: PaginaLayout;
  numeroPagina: number;
  totalPaginas: number;
  /** Logos da biblioteca colocadas livremente sobre o cartaz (valem em todas as páginas de produtos). */
  elementos?: ElementoLivre[];
  /** Só na prévia: realça a camada escolhida e permite arrastar (a exportação não passa isto). */
  selecionadoId?: string | null;
  aoPonteiroElemento?: (id: string, ev: React.PointerEvent) => void;
}

const FONTES_PADRAO: FontesCartaz = { produto: 'padrao', preco: 'padrao', frase: 'padrao', rodape: 'padrao' };

export function TabloideCanvas(p: TabloideCanvasProps) {
  const { formato, tema, segmento, titulo, subtitulo, logoUrl, seloUrl, pagina, numeroPagina, totalPaginas, elementos, selecionadoId, aoPonteiroElemento } = p;
  const fontes = p.fontes ?? FONTES_PADRAO;
  // sem as opções novas (chamadas antigas), o desenho é o de sempre: box com faixa e rodapé reto
  const boxes = p.boxes ?? 'faixa';
  const escalaTexto = ESCALA_TEXTO[p.tamanhoTexto ?? 'medio'];
  const rodapeEstilo = p.rodapeEstilo ?? 'faixa';
  const rodape: LinhasDoRodape = p.rodape ?? { principal: [p.empresa, p.validade].filter(Boolean).join('  •  '), contato: '', avisos: '*Imagens meramente ilustrativas', advertencia: '' };
  const extras = [rodape.contato, rodape.advertencia].filter(Boolean);
  const linhas = p.linhasRodape ?? 1 + extras.length;
  const m = medidasDoFormato(formato, linhas, { ...p.ajuste, rodape: rodapeEstilo });
  const texto = (titulo || segmento.titulo).toUpperCase();
  const horizontal = m.largura > m.altura * 1.15;
  const logoLado = logoUrl ? Math.min(m.cabecalho * 0.8, m.largura * 0.2) : 0;
  const temCabecalho = !!seloUrl || !p.semTitulo;
  // sobre a faixa do tema a arte já traz o título: a frase só entra quando há logo/título por cima
  const mostrarFrase = !!subtitulo && !(p.faixaUrl && p.semTitulo && !seloUrl);
  // a logo ocupa a altura do cabeçalho; na horizontal a frase fica ao lado, em pé fica embaixo
  const seloA = m.cabecalho * (horizontal || !mostrarFrase ? 0.96 : 0.76);
  const seloL = Math.min(seloA * 2.7, m.largura - m.pad * 2 - (logoLado ? logoLado + m.gap : 0) - (horizontal && mostrarFrase ? m.largura * 0.26 : 0));
  const fonteFrase = horizontal ? Math.min(m.cabecalho * 0.2, (m.largura * 0.24) / Math.max(6, subtitulo.length * 0.32)) : Math.min(m.cabecalho * 0.15, (m.largura * 0.8) / Math.max(8, subtitulo.length * 0.6));
  const creditos = [...new Set(pagina.celulas.map((c) => c.produto.imagem?.fonte).filter((f): f is NonNullable<typeof f> => !!f && f in NOMES_FONTE))].map((f) => NOMES_FONTE[f]);
  const linhaA = linhas ? m.rodape / linhas : 0;
  const avisos = [rodape.avisos, creditos.length ? `Fotos: ${creditos.join(', ')}` : '', totalPaginas > 1 ? `${numeroPagina}/${totalPaginas}` : ''].filter(Boolean).join(' · ');
  const cabe = (t: string, maximo: number, larguraUtil: number) => Math.min(maximo, (larguraUtil * 1.85) / Math.max(10, t.length));
  const redondo = rodapeEstilo === 'redondo' || rodapeEstilo === 'grande';
  const rodapeL = redondo ? m.largura - m.pad * 2 : m.largura;
  const fontePrincipal = cabe(rodape.principal, linhaA * 0.48, rodapeL * 0.56);
  const fonteAvisos = cabe(avisos, linhaA * 0.4, rodapeL * 0.4);

  const frase = mostrarFrase ? (
    <div data-testid="tabloide-frase" style={{ background: tema.faixa, color: tema.tituloCor, borderRadius: fonteFrase * 0.5, padding: `${fonteFrase * 0.3}px ${fonteFrase * 0.7}px`, fontSize: fonteFrase, lineHeight: 1.1, textAlign: 'center', maxWidth: horizontal ? m.largura * 0.26 : m.largura * 0.9, boxShadow: '0 4px 0 rgba(0,0,0,.2)', ...cssDaFonte(fontes.frase) }}>
      {subtitulo}
    </div>
  ) : null;

  const fundoDaLogo = p.fundoLogo === 'sem' ? 'transparent' : p.fundoLogo === 'escuro' ? '#111827' : '#fff';
  const logoDaLoja = (lado: number) => logoUrl ? (
    <div data-testid="tabloide-logo-marca" style={{ width: lado, height: lado, flexShrink: 0, borderRadius: p.fundoLogo === 'sem' ? 0 : '50%', background: fundoDaLogo, border: p.fundoLogo === 'sem' ? 'none' : `${Math.max(3, lado * 0.04)}px solid ${tema.cartaoBorda}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: p.fundoLogo === 'sem' ? 'none' : '0 4px 0 rgba(0,0,0,.2)' }}>
      <img src={logoUrl} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" style={{ width: p.fundoLogo === 'sem' ? '100%' : '78%', height: p.fundoLogo === 'sem' ? '100%' : '78%', objectFit: 'contain' }} />
    </div>
  ) : null;

  const rodapeNo = rodapeEstilo === 'sem' ? null : (
    <div data-testid="tabloide-rodape" data-estilo={rodapeEstilo} style={{ position: 'absolute', left: redondo ? m.pad * 0.5 : 0, bottom: redondo ? m.pad * 0.3 : 0, width: redondo ? m.largura - m.pad : m.largura, height: redondo ? m.rodape - m.pad * 0.3 : m.rodape, background: tema.rodape, color: tema.rodapeCor, borderRadius: redondo ? Math.min(m.rodape * 0.5, m.largura * 0.04) : 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${m.pad}px`, boxSizing: 'border-box', ...cssDaFonte(fontes.rodape) }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: m.pad }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: fontePrincipal }}>{rodape.principal}</span>
        <span style={{ opacity: 0.88, whiteSpace: 'nowrap', fontSize: fonteAvisos }}>{avisos}</span>
      </div>
      {extras.map((linha, i) => (
        <div key={i} data-testid="tabloide-rodape-contato" style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', overflow: 'hidden', fontSize: cabe(linha, linhaA * 0.44, rodapeL - m.pad * 2) }}>
          {linha}
        </div>
      ))}
    </div>
  );

  const raiz: React.CSSProperties = { position: 'relative', width: m.largura, height: m.altura, background: tema.fundo, fontFamily: cssDaFonte('padrao').fontFamily, overflow: 'hidden' };

  if (p.capa) {
    // capa: a arte de cartaz inteiro cobre a página; a arte de faixa entra inteira, de ponta a ponta, sem cortar.
    // Depois vêm a logo 3D (ou o título), a frase, a validade e a loja.
    const arte = p.fundoUrl || p.faixaUrl;
    const faixa = !p.fundoUrl && p.faixaUrl ? p.faixaUrl : null;
    const areaA = m.altura - m.rodape;
    const logoA = Math.min(areaA * 0.46, m.largura * 0.5);
    const fraseCapa = Math.min(areaA * 0.07, (m.largura * 0.86) / Math.max(10, subtitulo.length * 0.6));
    const validadeCapa = Math.min(areaA * 0.05, (m.largura * 0.86) / Math.max(12, rodape.principal.length * 0.55));
    return (
      <div data-testid="tabloide-canvas" data-capa="true" style={raiz}>
        {arte && !faixa && <img src={arte} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" data-testid="tabloide-fundo" style={{ position: 'absolute', left: 0, top: 0, width: m.largura, height: m.altura, objectFit: 'cover', display: 'block' }} />}
        <div style={{ position: 'absolute', left: 0, top: 0, width: m.largura, height: areaA, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: areaA * 0.035 }}>
          {faixa && <img src={faixa} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" data-testid="tabloide-faixa-tema" style={{ width: m.largura, height: m.cabecalho, objectFit: 'cover', display: 'block', flexShrink: 0 }} />}
          {seloUrl
            ? <LogoDoCabecalho url={seloUrl} titulo={texto} tema={tema} largura={m.largura * 0.86} altura={faixa ? logoA * 0.6 : logoA} />
            : !(arte && p.semTitulo) ? <Selo3D titulo={texto} tema={tema} largura={Math.min(m.largura * 0.86, logoA * 2.4)} altura={logoA} /> : null}
          {subtitulo && (
            <div data-testid="tabloide-frase" style={{ background: tema.faixa, color: tema.tituloCor, borderRadius: fraseCapa * 0.5, padding: `${fraseCapa * 0.35}px ${fraseCapa * 0.9}px`, fontSize: fraseCapa, lineHeight: 1.1, textAlign: 'center', maxWidth: m.largura * 0.9, boxShadow: '0 6px 0 rgba(0,0,0,.2)', ...cssDaFonte(fontes.frase) }}>{subtitulo}</div>
          )}
          {rodape.principal && (
            <div data-testid="tabloide-capa-validade" style={{ background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: validadeCapa * 0.5, padding: `${validadeCapa * 0.3}px ${validadeCapa * 0.9}px`, fontSize: validadeCapa, lineHeight: 1.15, textAlign: 'center', maxWidth: m.largura * 0.9, ...cssDaFonte(fontes.rodape) }}>{rodape.principal}</div>
          )}
          {logoDaLoja(Math.min(areaA * 0.2, m.largura * 0.24))}
        </div>
        {rodapeNo}
      </div>
    );
  }

  return (
    <div data-testid="tabloide-canvas" style={raiz}>
      {p.fundoUrl && (
        <img src={p.fundoUrl} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" data-testid="tabloide-fundo"
          style={{ position: 'absolute', left: 0, top: 0, width: m.largura, height: m.altura, objectFit: 'cover', display: 'block' }} />
      )}
      {p.faixaUrl && (
        <img src={p.faixaUrl} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" data-testid="tabloide-faixa-tema"
          style={{ position: 'absolute', left: 0, top: 0, width: m.largura, height: m.cabecalho + m.gap * 0.5, objectFit: 'cover', display: 'block' }} />
      )}

      <div style={{ position: 'absolute', left: m.pad, top: 0, width: m.largura - m.pad * 2, height: m.cabecalho + m.gap * 0.5, display: 'flex', alignItems: 'center', justifyContent: p.faixaUrl && !temCabecalho ? 'flex-end' : 'center', gap: m.gap * 1.5 }}>
        <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: horizontal ? m.gap * 1.5 : m.gap * 0.2, minWidth: 0 }}>
          {seloUrl
            ? <LogoDoCabecalho url={seloUrl} titulo={texto} tema={tema} largura={seloL} altura={seloA} />
            : temCabecalho ? <Selo3D titulo={texto} tema={tema} largura={seloL} altura={seloA} /> : null}
          {frase}
        </div>
        {logoDaLoja(logoLado)}
      </div>

      {pagina.celulas.map((c) => <Cartao key={c.produto.id} celula={c} tema={tema} fontes={fontes} boxes={boxes} escala={escalaTexto} />)}

      {rodapeNo}

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

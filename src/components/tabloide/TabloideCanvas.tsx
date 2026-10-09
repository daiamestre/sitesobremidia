/**
 * Tabloide Digital (F-172) — o cartaz. Desenhado no tamanho de projeto do formato (ex.: 1920×1080);
 * a tela só o escala com transform, e a exportação usa exatamente este tamanho.
 */
import { useState } from 'react';
import { emojiDoProduto } from '@/lib/tabloide/imagens';
import { formatarPreco, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { medidasDoFormato, type Celula, type PaginaLayout } from '@/lib/tabloide/grade';
import type { Formato, Segmento, Tema } from '@/lib/tabloide/temas';

const FONTE = "'Arial Black','Segoe UI Black',Impact,system-ui,sans-serif";

const NOMES_FONTE: Record<string, string> = { OPENFOODFACTS: 'Open Food Facts', PEXELS: 'Pexels', PIXABAY: 'Pixabay' };

function FotoProduto({ produto, segmento, s }: { produto: ProdutoTabloide; segmento: Segmento; s: number }) {
  const [falhou, setFalhou] = useState(false);
  const img = produto.imagem;
  if (img && !falhou) {
    const embalagem = img.fonte === 'OPENFOODFACTS';
    return (
      <img
        src={img.url}
        alt={produto.nome}
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
        onError={() => setFalhou(true)}
        style={{ width: '100%', height: '100%', objectFit: embalagem ? 'contain' : 'cover', padding: embalagem ? s * 0.02 : 0, display: 'block' }}
      />
    );
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: s * 0.34, lineHeight: 1 }}>
      {emojiDoProduto(produto.nome, segmento.emojiPadrao)}
    </div>
  );
}

function Preco({ produto, tema, s, destaque }: { produto: ProdutoTabloide; tema: Tema; s: number; destaque: boolean }) {
  const grande = s * (destaque ? 0.21 : 0.23);
  if (produto.preco == null) {
    return (
      <div style={{ background: tema.preco, color: tema.precoCor, borderRadius: grande, padding: `${grande * 0.12}px ${grande * 0.5}px`, fontSize: grande * 0.55, fontWeight: 900 }}>
        CONSULTE
      </div>
    );
  }
  const { inteiro, centavos } = formatarPreco(produto.preco);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {produto.precoDe != null && (
        <div style={{ fontSize: s * 0.062, color: tema.suave, textDecoration: 'line-through', fontWeight: 800, lineHeight: 1.1 }}>
          de R$ {formatarPreco(produto.precoDe).inteiro},{formatarPreco(produto.precoDe).centavos}
        </div>
      )}
      <div style={{ background: tema.preco, color: tema.precoCor, borderRadius: grande * 0.5, padding: `${grande * 0.04}px ${grande * 0.32}px`, display: 'flex', alignItems: 'flex-start', gap: grande * 0.04, lineHeight: 1, boxShadow: '0 3px 0 rgba(0,0,0,.18)' }}>
        <span style={{ fontSize: grande * 0.3, fontWeight: 900, marginTop: grande * 0.12 }}>R$</span>
        <span style={{ fontSize: grande, fontWeight: 900, letterSpacing: -grande * 0.03 }}>{inteiro}</span>
        <span style={{ fontSize: grande * 0.4, fontWeight: 900, marginTop: grande * 0.1 }}>,{centavos}</span>
        {produto.unidade && <span style={{ fontSize: grande * 0.22, fontWeight: 800, alignSelf: 'flex-end', marginBottom: grande * 0.1, marginLeft: grande * 0.04 }}>/{produto.unidade}</span>}
      </div>
    </div>
  );
}

function Cartao({ celula, tema, segmento }: { celula: Celula; tema: Tema; segmento: Segmento }) {
  const { produto, x, y, w, h, destaque } = celula;
  const s = Math.min(w, h);
  // cartão largo: foto de um lado, nome e preço do outro
  const largo = w / h > 1.45;
  const nome = produto.nome.toUpperCase();
  const fator = nome.length > 30 ? 0.68 : nome.length > 20 ? 0.8 : 1;
  const fonteNome = largo ? Math.min(s * 0.12, w * 0.05) * fator : s * (destaque ? 0.082 : 0.092) * fator;
  const borda = Math.max(3, Math.round(s * 0.014));
  return (
    <div
      data-testid="tabloide-cartao"
      style={{ position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box', background: tema.cartao, border: `${borda}px solid ${tema.cartaoBorda}`, borderRadius: s * 0.07, overflow: 'hidden', display: 'flex', flexDirection: largo ? 'row' : 'column', alignItems: 'center', padding: s * 0.03, gap: s * 0.02 }}
    >
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, width: largo ? undefined : '100%', height: largo ? '100%' : undefined, background: '#fff', borderRadius: s * 0.05, overflow: 'hidden' }}>
        <FotoProduto produto={produto} segmento={segmento} s={s} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: s * 0.02, width: largo ? '48%' : '100%', minWidth: 0 }}>
      <div style={{ color: tema.nomeCor, fontSize: fonteNome, fontWeight: 900, textAlign: 'center', lineHeight: 1.05, width: '100%', maxHeight: fonteNome * 2.15, overflow: 'hidden', letterSpacing: -fonteNome * 0.01 }}>
        {nome}
      </div>
      {produto.obs && <div style={{ color: tema.suave, fontSize: s * 0.05, fontWeight: 700, textAlign: 'center', lineHeight: 1 }}>{produto.obs}</div>}
      <Preco produto={produto} tema={tema} s={s} destaque={destaque} />
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
  pagina: PaginaLayout;
  numeroPagina: number;
  totalPaginas: number;
}

export function TabloideCanvas({ formato, tema, segmento, titulo, subtitulo, validade, empresa, logoUrl, pagina, numeroPagina, totalPaginas }: TabloideCanvasProps) {
  const m = medidasDoFormato(formato);
  const u = Math.min(m.largura, m.altura);
  const logoL = logoUrl ? m.cabecalho * 0.8 : 0;
  const texto = (titulo || segmento.titulo).toUpperCase();
  const areaTitulo = m.largura - m.pad * 2 - logoL * 2 - m.cabecalho * 1.4;
  const fonteTitulo = Math.min(m.cabecalho * (subtitulo ? 0.46 : 0.58), areaTitulo / Math.max(8, texto.length * 0.62));
  const creditos = [...new Set(pagina.celulas.map((c) => c.produto.imagem?.fonte).filter((f): f is NonNullable<typeof f> => !!f && f in NOMES_FONTE))].map((f) => NOMES_FONTE[f]);
  const fonteRodape = m.rodape * 0.46;

  return (
    <div data-testid="tabloide-canvas" style={{ position: 'relative', width: m.largura, height: m.altura, background: tema.fundo, fontFamily: FONTE, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: m.largura, height: m.cabecalho, background: tema.faixa, borderRadius: `0 0 ${u * 0.04}px ${u * 0.04}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 0 rgba(0,0,0,.2)' }}>
        {logoUrl && <img src={logoUrl} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" style={{ position: 'absolute', left: m.pad, height: m.cabecalho * 0.7, maxWidth: logoL * 1.6, objectFit: 'contain' }} />}
        <span style={{ position: 'absolute', left: logoUrl ? m.pad * 2 + logoL * 1.6 : m.pad * 1.5, fontSize: m.cabecalho * 0.5, lineHeight: 1 }}>{tema.enfeite}</span>
        <span style={{ position: 'absolute', right: m.pad * 1.5, fontSize: m.cabecalho * 0.5, lineHeight: 1 }}>{tema.enfeite}</span>
        <div style={{ textAlign: 'center', maxWidth: areaTitulo, lineHeight: 1 }}>
          <div style={{ color: tema.tituloCor, fontSize: fonteTitulo, fontWeight: 900, letterSpacing: -fonteTitulo * 0.015, whiteSpace: 'nowrap' }}>{texto}</div>
          {subtitulo && <div style={{ color: tema.subtituloCor, fontSize: fonteTitulo * 0.38, fontWeight: 800, marginTop: fonteTitulo * 0.12, whiteSpace: 'nowrap' }}>{subtitulo}</div>}
        </div>
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

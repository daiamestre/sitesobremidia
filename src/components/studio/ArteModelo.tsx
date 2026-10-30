/**
 * SOBRE MÍDIA STUDIO — desenha um modelo de arte em qualquer tamanho (miniatura do catálogo, prévia grande ou a arte
 * final 1920×1080 / 1080×1920). Tudo em `cqmin` (proporção igual em qualquer tamanho, regra da prévia = Player).
 * Só usa recursos que o html2canvas fotografa (foto como background-size: cover, skew e degradês; sem clip-path,
 * mask ou object-fit), para a arte exportada na edição rápida sair igual à prévia.
 */
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { carregarFonte, cssDaFonte } from '@/lib/tabloide/fontes';
import type { ModeloDeArte, SeloDaArte } from '@/lib/studio/modelos';

const u = (n: number) => `${n}cqmin`;
const UI = "'Inter','Segoe UI',system-ui,sans-serif";

function Foto({ src, posicao, style }: { src: string; posicao?: string; style?: CSSProperties }) {
  return <div aria-hidden style={{ position: 'absolute', backgroundImage: `url("${src}")`, backgroundSize: 'cover', backgroundPosition: posicao ?? '50% 50%', ...style }} />;
}

function Titulo({ m, tamanho, cor, ultimaCor, maiusculo = true }: { m: ModeloDeArte; tamanho: number; cor: string; ultimaCor?: string; maiusculo?: boolean }) {
  const fonte = cssDaFonte(m.fonte);
  // linha longa (texto do cliente no editor) encolhe o título em vez de quebrar a palavra no meio
  const maior = Math.max(1, ...m.textos.titulo.map((l) => l.trim().length));
  const fator = Math.max(0.5, Math.min(1, 11 / maior));
  return (
    <div style={{ ...fonte, fontSize: u(tamanho * fator), lineHeight: 0.98, overflowWrap: 'normal', wordBreak: 'keep-all', letterSpacing: '0.01em', textTransform: maiusculo ? 'uppercase' : 'none', textShadow: '0 0.6cqmin 1.6cqmin rgba(0,0,0,.35)' }}>
      {m.textos.titulo.map((linha, i) => (
        <div key={i} style={{ color: ultimaCor && i === m.textos.titulo.length - 1 ? ultimaCor : cor }}>{linha}</div>
      ))}
    </div>
  );
}

function Sobretitulo({ texto, fundo, cor }: { texto?: string; fundo: string; cor: string }) {
  if (!texto) return null;
  return (
    <div style={{ display: 'inline-block', alignSelf: 'flex-start', background: fundo, color: cor, fontFamily: UI, fontWeight: 800, fontSize: u(3.4), letterSpacing: '0.12em', textTransform: 'uppercase', padding: `${u(0.9)} ${u(2.2)}`, borderRadius: u(1), marginBottom: u(2.2) }}>
      {texto}
    </div>
  );
}

function Itens({ itens, cor, destaque, vertical = false, tamanho = 3.4 }: { itens?: string[]; cor: string; destaque: string; vertical?: boolean; tamanho?: number }) {
  if (!itens?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: vertical ? u(1.6) : u(3.2), marginTop: u(3) }}>
      {itens.map((t) => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: u(1.2), color: cor, fontFamily: UI, fontWeight: 700, fontSize: u(tamanho) }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: u(tamanho * 1.45), height: u(tamanho * 1.45), borderRadius: '50%', border: `${u(0.45)} solid ${destaque}`, color: destaque, flexShrink: 0 }}>
            <Check style={{ width: '62%', height: '62%' }} strokeWidth={3.5} />
          </span>
          {t}
        </div>
      ))}
    </div>
  );
}

function Cta({ texto, fundo, cor, tamanho = 3.6 }: { texto?: string; fundo: string; cor: string; tamanho?: number }) {
  if (!texto) return null;
  return (
    <div style={{ display: 'inline-block', alignSelf: 'flex-start', marginTop: u(3.2), background: fundo, color: cor, fontFamily: UI, fontWeight: 800, fontSize: u(tamanho), padding: `${u(1.4)} ${u(3.4)}`, borderRadius: u(10), boxShadow: '0 0.8cqmin 2cqmin rgba(0,0,0,.3)' }}>
      {texto}
    </div>
  );
}

function Selo({ selo, fundo, cor, tamanho, style }: { selo?: SeloDaArte; fundo: string; cor: string; tamanho: number; style?: CSSProperties }) {
  if (!selo) return null;
  const longo = selo.valor.length > 3;
  return (
    <div style={{ position: 'absolute', width: u(tamanho), height: u(tamanho), borderRadius: '50%', background: fundo, color: cor, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1cqmin 3cqmin rgba(0,0,0,.35)', border: `${u(0.8)} solid rgba(255,255,255,.85)`, fontFamily: "'Anton','Arial Black',Impact,sans-serif", lineHeight: 0.9, textAlign: 'center', ...style }}>
      {selo.topo && <div style={{ fontFamily: UI, fontWeight: 800, fontSize: u(tamanho * 0.11) }}>{selo.topo}</div>}
      <div style={{ fontSize: u(tamanho * (longo ? 0.24 : 0.4)), display: 'flex', alignItems: 'flex-start' }}>
        {selo.valor}{selo.sufixo && <span style={{ fontSize: '0.5em', marginTop: '0.12em' }}>{selo.sufixo}</span>}
      </div>
      {selo.base && <div style={{ fontFamily: UI, fontWeight: 900, fontSize: u(tamanho * 0.12) }}>{selo.base}</div>}
    </div>
  );
}

function Coluna({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', justifyContent: 'center', ...style }}>{children}</div>;
}

function Faixa({ m }: { m: ModeloDeArte }) {
  const { cores, textos } = m;
  return (
    <>
      <Foto src={m.foto} posicao={m.fotoPosicao} style={{ top: 0, bottom: 0, right: 0, width: '60%' }} />
      {/* painel inclinado (skew em vez de clip-path, que o html2canvas não desenha) */}
      <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: '-12%', width: '60%', background: cores.base, transform: 'skewX(-12deg)', transformOrigin: 'top left' }} />
      <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: '47.2%', width: u(1.6), background: cores.destaque, transform: 'skewX(-12deg)', transformOrigin: 'top left' }} />
      <Coluna style={{ top: 0, bottom: 0, left: u(7), width: '44%' }}>
        <Sobretitulo texto={textos.sobretitulo} fundo={cores.destaque} cor={cores.base} />
        <Titulo m={m} tamanho={textos.titulo.length > 2 ? 14 : 17} cor={cores.texto} ultimaCor={cores.destaque} />
        {textos.subtitulo && <div style={{ fontFamily: UI, fontWeight: 600, color: cores.texto, opacity: 0.92, fontSize: u(4), marginTop: u(2.4) }}>{textos.subtitulo}</div>}
        <Cta texto={textos.cta} fundo={cores.destaque} cor={cores.base} />
      </Coluna>
      <Selo selo={textos.selo} fundo={cores.destaque} cor={cores.base} tamanho={30} style={{ right: u(6), top: u(7) }} />
    </>
  );
}

function Claro({ m }: { m: ModeloDeArte }) {
  const { cores, textos } = m;
  return (
    <>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg,#ffffff 0%,#f1f7ff 45%,#e3efff 100%)' }} />
      <Foto src={m.foto} posicao={m.fotoPosicao} style={{ top: 0, bottom: 0, right: 0, width: '58%' }} />
      <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, right: '30%', width: '30%', background: 'linear-gradient(90deg,#f1f7ff 0%,rgba(241,247,255,.85) 35%,rgba(241,247,255,0) 100%)' }} />
      <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, right: '-6%', width: '10%', background: cores.base, transform: 'skewX(-12deg)' }} />
      <Coluna style={{ top: 0, bottom: 0, left: u(7), width: '46%' }}>
        <Sobretitulo texto={textos.sobretitulo} fundo={cores.base} cor="#ffffff" />
        <Titulo m={m} tamanho={textos.titulo.length > 2 ? 12.5 : 15} cor={cores.texto} ultimaCor={cores.base} />
        <Itens itens={textos.itens} cor={cores.texto} destaque={cores.destaque} />
        <Cta texto={textos.cta} fundo={cores.base} cor="#ffffff" />
      </Coluna>
    </>
  );
}

function Escuro({ m }: { m: ModeloDeArte }) {
  const { cores, textos } = m;
  const maiusculo = m.fonte !== 'montserrat';
  return (
    <>
      <Foto src={m.foto} posicao={m.fotoPosicao} style={{ top: 0, bottom: 0, right: 0, width: '68%' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${cores.base} 0%, ${cores.base} 32%, ${cores.base}cc 44%, ${cores.base}00 72%)` }} />
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%', background: `linear-gradient(0deg, ${cores.base}b3 0%, ${cores.base}00 100%)` }} />
      <Coluna style={{ top: 0, bottom: 0, left: u(7), width: '50%' }}>
        <Sobretitulo texto={textos.sobretitulo} fundo={cores.destaque} cor={cores.base} />
        <Titulo m={m} tamanho={maiusculo ? (textos.titulo.length > 2 ? 12.5 : 15) : 11} cor={cores.texto} ultimaCor={maiusculo ? cores.destaque : undefined} maiusculo={maiusculo} />
        {textos.subtitulo && <div style={{ fontFamily: UI, fontWeight: 700, color: cores.destaque, fontSize: u(4), marginTop: u(2.4), textTransform: 'uppercase', letterSpacing: '0.06em' }}>{textos.subtitulo}</div>}
        <Itens itens={textos.itens} cor={cores.texto} destaque={cores.destaque} />
        <Cta texto={textos.cta} fundo={cores.destaque} cor={cores.base} />
      </Coluna>
    </>
  );
}

function VerticalFoto({ m }: { m: ModeloDeArte }) {
  const { cores, textos } = m;
  return (
    <>
      <Foto src={m.foto} posicao={m.fotoPosicao} style={{ inset: 0 }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${cores.base}00 30%, ${cores.base}d9 58%, ${cores.base} 78%)` }} />
      <Coluna style={{ left: u(8), right: u(8), bottom: u(12), justifyContent: 'flex-end' }}>
        <Sobretitulo texto={textos.sobretitulo} fundo={cores.destaque} cor={cores.base} />
        <Titulo m={m} tamanho={textos.titulo.length > 2 ? 17 : 20} cor={cores.texto} ultimaCor={cores.destaque} />
        {textos.subtitulo && <div style={{ fontFamily: UI, fontWeight: 600, color: cores.texto, fontSize: u(5), marginTop: u(3) }}>{textos.subtitulo}</div>}
        <Itens itens={textos.itens} cor={cores.texto} destaque={cores.destaque} vertical tamanho={5} />
        <Cta texto={textos.cta} fundo={cores.destaque} cor={cores.base} tamanho={5.4} />
      </Coluna>
    </>
  );
}

function VerticalPainel({ m }: { m: ModeloDeArte }) {
  const { cores, textos } = m;
  return (
    <>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: cores.base }} />
      <Foto src={m.foto} posicao={m.fotoPosicao} style={{ top: 0, left: 0, right: 0, height: '56%' }} />
      {/* faixa inclinada que separa a foto do painel */}
      <div aria-hidden style={{ position: 'absolute', left: '-10%', right: '-10%', top: '50%', height: '14%', background: cores.base, transform: 'skewY(-8deg)' }} />
      <div aria-hidden style={{ position: 'absolute', left: '-10%', right: '-10%', top: '49%', height: u(2.2), background: cores.destaque, transform: 'skewY(-8deg)' }} />
      <Coluna style={{ left: u(8), right: u(8), top: '60%', bottom: u(10), justifyContent: 'flex-start' }}>
        <Sobretitulo texto={textos.sobretitulo} fundo={cores.destaque} cor={cores.base} />
        <Titulo m={m} tamanho={20} cor={cores.texto} ultimaCor={cores.destaque} />
        {textos.subtitulo && <div style={{ fontFamily: UI, fontWeight: 600, color: cores.texto, opacity: 0.92, fontSize: u(5), marginTop: u(3) }}>{textos.subtitulo}</div>}
        <Cta texto={textos.cta} fundo={cores.destaque} cor={cores.base} tamanho={5.4} />
      </Coluna>
      <Selo selo={textos.selo} fundo={cores.destaque} cor={cores.base} tamanho={42} style={{ right: u(7), top: '36%' }} />
    </>
  );
}

const LAYOUTS = { faixa: Faixa, claro: Claro, escuro: Escuro, 'vertical-foto': VerticalFoto, 'vertical-painel': VerticalPainel } as const;

export interface ArteModeloProps {
  modelo: ModeloDeArte;
  className?: string;
  style?: CSSProperties;
}

/** A arte ocupa a largura do contenedor na proporção do formato (16:9 ou 9:16). */
export function ArteModelo({ modelo, className, style }: ArteModeloProps) {
  useEffect(() => { void carregarFonte(modelo.fonte); }, [modelo.fonte]);
  const Layout = LAYOUTS[modelo.layout];
  return (
    <div
      className={className}
      data-testid="arte-modelo"
      style={{ position: 'relative', overflow: 'hidden', containerType: 'size', aspectRatio: modelo.formato === '16:9' ? '16 / 9' : '9 / 16', width: '100%', background: modelo.cores.base, ...style }}
    >
      <Layout m={modelo} />
    </div>
  );
}

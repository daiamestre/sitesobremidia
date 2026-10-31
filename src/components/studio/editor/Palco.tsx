/**
 * SOBRE MÍDIA STUDIO — palco do editor de camadas (F-221): a arte desenhada no canvas e, por cima, as caixas de cada
 * camada para clicar, ARRASTAR, REDIMENSIONAR (8 alças) e GIRAR (alça de cima), com guias de centro e bordas.
 * Funciona com mouse e com o dedo (pointer events). Shift mantém a proporção / gira de 15 em 15 graus.
 * F-224 (tablet/celular): o dedo só ARRASTA o elemento já escolhido; tocar num elemento não escolhido apenas o escolhe
 * (e deixa a página rolar), para quem desce a tela não mover a arte sem querer. Lixeira e duplicar ficam junto da seleção.
 */
import { useEffect, useRef, useState, type PointerEvent as PE } from 'react';
import { Copy, RotateCw, Trash2 } from 'lucide-react';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { TAMANHO_DOC, type Camada, type Documento } from '@/lib/studio/documento';

type Alca = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const ALCAS: { a: Alca; sx: -1 | 0 | 1; sy: -1 | 0 | 1; cursor: string }[] = [
  { a: 'nw', sx: -1, sy: -1, cursor: 'nwse-resize' }, { a: 'n', sx: 0, sy: -1, cursor: 'ns-resize' }, { a: 'ne', sx: 1, sy: -1, cursor: 'nesw-resize' },
  { a: 'e', sx: 1, sy: 0, cursor: 'ew-resize' }, { a: 'se', sx: 1, sy: 1, cursor: 'nwse-resize' }, { a: 's', sx: 0, sy: 1, cursor: 'ns-resize' },
  { a: 'sw', sx: -1, sy: 1, cursor: 'nesw-resize' }, { a: 'w', sx: -1, sy: 0, cursor: 'ew-resize' },
];

export interface PalcoProps {
  doc: Documento;
  sel: string | null;
  onSelecionar: (id: string | null) => void;
  /** guarda o estado antes de um arraste (desfazer) */
  onInicio: () => void;
  onMudar: (id: string, patch: Partial<Camada>) => void;
  onEditarTexto?: (id: string) => void;
  onApagar?: (id: string) => void;
  onDuplicar?: (id: string) => void;
  /** F-225: tocando a animação (sem caixas de seleção por cima) */
  animar?: boolean;
  /** F-227: só as caixas de mexer (o desenho fica por conta de quem usa, ex.: o vídeo por baixo) */
  semPrevia?: boolean;
}

/** Caixa que a alça mexe, já considerando a rotação da camada. */
export function redimensionar(c: Pick<Camada, 'x' | 'y' | 'w' | 'h' | 'rot'>, sx: number, sy: number, dx: number, dy: number, manterProporcao: boolean) {
  const a = (c.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
  let w = Math.max(16, c.w + sx * lx), h = Math.max(16, c.h + sy * ly);
  if (manterProporcao && sx && sy) {
    const k = Math.max(w / c.w, h / c.h);
    w = Math.max(16, c.w * k); h = Math.max(16, c.h * k);
  }
  const dcx = sx * (w - c.w) / 2, dcy = sy * (h - c.h) / 2;
  const cx = c.x + c.w / 2 + dcx * cos - dcy * sin, cy = c.y + c.h / 2 + dcx * sin + dcy * cos;
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
}

export function Palco({ doc, sel, onSelecionar, onInicio, onMudar, onEditarTexto, onApagar, onDuplicar, animar = false, semPrevia = false }: PalcoProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [guias, setGuias] = useState<{ x?: number; y?: number }>({});
  const { w: W, h: H } = TAMANHO_DOC[doc.formato];
  const e = largura / W || 0.0001;

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const arrastar = (ev: PE, c: Camada, modo: 'mover' | Alca | 'girar') => {
    ev.stopPropagation();
    // dedo num elemento que ainda não foi escolhido: só escolhe no "toque" (onClick) e deixa a página rolar
    if (modo === 'mover' && ev.pointerType !== 'mouse' && c.id !== sel) return;
    ev.preventDefault();
    onSelecionar(c.id);
    if (c.bloqueada) return;
    onInicio();
    const x0 = ev.clientX, y0 = ev.clientY, inicio = { ...c };
    const r = caixa.current!.getBoundingClientRect();
    const limiar = 7 / e;
    const mover = (m: PointerEvent) => {
      const dx = (m.clientX - x0) / e, dy = (m.clientY - y0) / e;
      if (modo === 'mover') {
        let nx = inicio.x + dx, ny = inicio.y + dy;
        const g: { x?: number; y?: number } = {};
        if (Math.abs(nx + inicio.w / 2 - W / 2) < limiar) { nx = W / 2 - inicio.w / 2; g.x = W / 2; }
        else if (Math.abs(nx) < limiar) { nx = 0; g.x = 0; } else if (Math.abs(nx + inicio.w - W) < limiar) { nx = W - inicio.w; g.x = W; }
        if (Math.abs(ny + inicio.h / 2 - H / 2) < limiar) { ny = H / 2 - inicio.h / 2; g.y = H / 2; }
        else if (Math.abs(ny) < limiar) { ny = 0; g.y = 0; } else if (Math.abs(ny + inicio.h - H) < limiar) { ny = H - inicio.h; g.y = H; }
        setGuias(g);
        onMudar(c.id, { x: Math.round(nx), y: Math.round(ny) });
      } else if (modo === 'girar') {
        const cx = r.left + (inicio.x + inicio.w / 2) * e, cy = r.top + (inicio.y + inicio.h / 2) * e;
        let ang = (Math.atan2(m.clientY - cy, m.clientX - cx) * 180) / Math.PI + 90;
        if (m.shiftKey) ang = Math.round(ang / 15) * 15;
        else { const perto = Math.round(ang / 90) * 90; if (Math.abs(ang - perto) < 4) ang = perto; }
        ang = ((ang + 540) % 360) - 180;
        onMudar(c.id, { rot: Math.round(ang * 10) / 10 });
      } else {
        const alca = ALCAS.find((a) => a.a === modo)!;
        const proporcao = m.shiftKey || inicio.tipo === 'selo' || inicio.tipo === 'texto' || (inicio.tipo === 'imagem' && !!alca.sx && !!alca.sy && !m.altKey);
        const nova = redimensionar(inicio, alca.sx, inicio.tipo === 'texto' || inicio.tipo === 'itens' ? (alca.sx ? alca.sy : 0) : alca.sy, dx, dy, proporcao);
        if (inicio.tipo === 'texto') {
          // canto: a letra cresce junto; lado: só a largura da caixa (o texto quebra de novo)
          if (alca.sx && alca.sy) onMudar(c.id, { ...nova, tamanho: Math.max(8, Math.round(inicio.tamanho * (nova.w / inicio.w))) } as Partial<Camada>);
          else onMudar(c.id, { x: nova.x, w: nova.w } as Partial<Camada>);
        } else if (inicio.tipo === 'itens') {
          if (alca.sx && alca.sy) onMudar(c.id, { ...nova, tamanho: Math.max(8, Math.round(inicio.tamanho * (nova.w / inicio.w))) } as Partial<Camada>);
          else onMudar(c.id, { x: nova.x, w: nova.w } as Partial<Camada>);
        } else onMudar(c.id, nova);
      }
    };
    const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); setGuias({}); };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  const selecionada = doc.camadas.find((c) => c.id === sel && c.visivel);
  const semAlturaLivre = selecionada && (selecionada.tipo === 'texto' || selecionada.tipo === 'itens');

  return (
    <div ref={caixa} className="relative w-full select-none" style={{ aspectRatio: `${W} / ${H}` }} data-testid="studio-palco">
      {!semPrevia && <PreviaDocumento doc={doc} sempre animar={animar} className="rounded-lg shadow-2xl" />}
      <div className="absolute inset-0" style={{ touchAction: 'pan-y' }}
        onPointerDown={(ev) => { if (ev.pointerType === 'mouse' && ev.target === ev.currentTarget) onSelecionar(null); }}
        onClick={(ev) => { if (ev.target === ev.currentTarget) onSelecionar(null); }}>
        {/* camada travada não pega o clique no palco (fundo e esfumados): escolha pela lista de camadas */}
        {doc.camadas.map((c) => c.visivel && !c.bloqueada && (
          <div key={c.id} data-camada={c.id}
            onPointerDown={(ev) => arrastar(ev, c, 'mover')}
            onClick={(ev) => { ev.stopPropagation(); onSelecionar(c.id); }}
            onDoubleClick={() => c.tipo === 'texto' && onEditarTexto?.(c.id)}
            className={c.bloqueada ? 'cursor-default' : 'cursor-move'}
            style={{ position: 'absolute', left: c.x * e, top: c.y * e, width: c.w * e, height: c.h * e, transform: `rotate(${c.rot}deg)`, touchAction: c.id === sel ? 'none' : 'pan-y' }}
            title={c.nome} />
        ))}
        {selecionada && (
          <div className="pointer-events-none absolute" style={{ left: selecionada.x * e, top: selecionada.y * e, width: selecionada.w * e, height: selecionada.h * e, transform: `rotate(${selecionada.rot}deg)` }}>
            <div className="absolute inset-0 rounded-[2px] border-2 border-[#22d3ee] shadow-[0_0_0_1px_rgba(0,0,0,.5)]" />
            {!selecionada.bloqueada && ALCAS.filter((a) => !(semAlturaLivre && a.sx === 0)).map((a) => (
              <span key={a.a} onPointerDown={(ev) => arrastar(ev, selecionada, a.a)} data-alca={a.a}
                className="pointer-events-auto absolute flex h-7 w-7 touch-none items-center justify-center"
                style={{ left: `calc(${(a.sx + 1) * 50}% - 14px)`, top: `calc(${(a.sy + 1) * 50}% - 14px)`, cursor: a.cursor }}>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-[#22d3ee] bg-white shadow" />
              </span>
            ))}
            {!selecionada.bloqueada && (
              <span onPointerDown={(ev) => arrastar(ev, selecionada, 'girar')} data-alca="girar" title="Girar (Shift: de 15 em 15°)"
                className="pointer-events-auto absolute left-1/2 flex h-8 w-8 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-full border-2 border-[#22d3ee] bg-white text-[#0b1324] shadow"
                style={{ top: -42 }}><RotateCw className="h-4 w-4" /></span>
            )}
            {/* atalhos junto da seleção (como no Canva): duplicar e LIXEIRA */}
            <div className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-white/20 bg-[#0b0420]/95 p-1 shadow-lg" style={{ top: 'calc(100% + 16px)', transform: `translateX(-50%) rotate(${-selecionada.rot}deg)` }}>
              {onDuplicar && <button type="button" onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); onDuplicar(selecionada.id); }} aria-label="Duplicar" title="Duplicar" className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/10"><Copy className="h-4 w-4" /></button>}
              {onApagar && !selecionada.bloqueada && <button type="button" onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); onApagar(selecionada.id); }} aria-label="Excluir" title="Excluir" data-testid="studio-lixeira-palco" className="flex h-8 w-8 items-center justify-center rounded-full text-rose-300 hover:bg-rose-500/20"><Trash2 className="h-4 w-4" /></button>}
            </div>
          </div>
        )}
        {guias.x !== undefined && <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-[#ff3df2]" style={{ left: guias.x * e }} />}
        {guias.y !== undefined && <div className="pointer-events-none absolute left-0 right-0 h-px bg-[#ff3df2]" style={{ top: guias.y * e }} />}
      </div>
    </div>
  );
}

/**
 * SOBRE MÍDIA STUDIO — EDITOR DE VÍDEO (F-227): LINHA DO TEMPO como no CapCut/KineMaster.
 * Régua, faixa de vídeo (clipes em sequência), faixa de textos/elementos (empilhados quando se cruzam) e faixa de
 * áudio. Toque escolhe; o escolhido ganha PONTAS para cortar (arrastar) e pode ser arrastado no tempo (textos e áudio).
 * O dedo em área livre rola a linha do tempo de lado; tocar na régua leva o cursor até ali.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react';
import { AudioLines, Film, Image as ImageIcon, Minus, Plus, Sparkles, Type } from 'lucide-react';
import { cortar, duracaoDoClipe, duracaoTotal, formatarTempo, inicios, type Clipe, type FaixaDeAudio, type ProjetoDeVideo, type Sobreposicao } from '@/lib/studio/video/linha';
import type { MotorDeVideo } from '@/lib/studio/video/motor';
import { cn } from '@/lib/utils';

export type Selecao = { tipo: 'clipe' | 'sob' | 'audio'; id: string } | null;

interface Props {
  projeto: ProjetoDeVideo;
  tempo: number;
  sel: Selecao;
  motor: MotorDeVideo | null;
  versaoMidia: number;
  onSelecionar: (s: Selecao) => void;
  onIr: (t: number) => void;
  onInicio: () => void;
  onClipe: (id: string, p: Partial<Clipe>) => void;
  onSob: (id: string, p: Partial<Sobreposicao>) => void;
  onAudio: (id: string, p: Partial<FaixaDeAudio>) => void;
}

const MARGEM = 24;
const ALTURA = { clipe: 56, sob: 30, audio: 34 };

function Miniatura({ motor, c, versao }: { motor: MotorDeVideo | null; c: Clipe; versao: number }) {
  const tela = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const fonte = motor?.miniatura(c);
    const ctx = tela.current?.getContext('2d');
    if (!fonte || !ctx) return;
    try { ctx.drawImage(fonte, 0, 0, 96, 54); } catch { /* quadro ainda não pronto */ }
  }, [motor, c, versao]);
  return <canvas ref={tela} width={96} height={54} className="h-full w-auto shrink-0 rounded-l-md bg-black/40 object-cover" />;
}

/** Arraste genérico: devolve o deslocamento em segundos para cada movimento. */
function arrastar(ev: PE, px: number, onInicio: () => void, mover: (ds: number) => void) {
  ev.stopPropagation();
  ev.preventDefault();
  onInicio();
  const x0 = ev.clientX;
  const mov = (m: PointerEvent) => mover((m.clientX - x0) / px);
  const fim = () => { window.removeEventListener('pointermove', mov); window.removeEventListener('pointerup', fim); window.removeEventListener('pointercancel', fim); };
  window.addEventListener('pointermove', mov);
  window.addEventListener('pointerup', fim);
  window.addEventListener('pointercancel', fim);
}

function Ponta({ lado, onDown }: { lado: 'e' | 'd'; onDown: (ev: PE) => void }) {
  return (
    <span onPointerDown={onDown} className={cn('absolute inset-y-0 z-10 flex w-5 cursor-ew-resize touch-none items-center justify-center bg-[#FFD400]', lado === 'e' ? 'left-0 rounded-l-md' : 'right-0 rounded-r-md')}
      aria-label={lado === 'e' ? 'Cortar o começo' : 'Cortar o fim'} data-ponta={lado}>
      <span className="h-5 w-1 rounded bg-[#22004A]" />
    </span>
  );
}

/** Põe textos/elementos que se cruzam no tempo em linhas diferentes. */
function emLinhas(sob: Sobreposicao[]) {
  const fins: number[] = [];
  const linha = new Map<string, number>();
  for (const s of [...sob].sort((a, b) => a.de - b.de)) {
    let l = fins.findIndex((f) => f <= s.de + 0.01);
    if (l < 0) { l = fins.length; fins.push(0); }
    fins[l] = s.ate;
    linha.set(s.id, l);
  }
  return { linha, n: Math.max(1, fins.length) };
}

export function LinhaDoTempo({ projeto, tempo, sel, motor, versaoMidia, onSelecionar, onIr, onInicio, onClipe, onSob, onAudio }: Props) {
  const [px, setPx] = useState(60); // pixels por segundo
  const rolagem = useRef<HTMLDivElement>(null);
  const total = duracaoTotal(projeto);
  const largura = MARGEM * 2 + Math.max(total + 4, 10) * px;
  const ini = useMemo(() => inicios(projeto.clipes), [projeto.clipes]);
  const { linha, n } = useMemo(() => emLinhas(projeto.sobreposicoes), [projeto.sobreposicoes]);
  const passoRegua = px >= 80 ? 1 : px >= 35 ? 2 : px >= 15 ? 5 : 10;
  const x = (t: number) => MARGEM + t * px;

  // tocando: a linha do tempo acompanha o cursor
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const cx = x(tempo);
    if (cx < el.scrollLeft + 40 || cx > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, cx - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(tempo * 2), px]);

  const irPara = (ev: React.MouseEvent) => {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    onIr(Math.max(0, (ev.clientX - r.left - MARGEM) / px));
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d0424]" data-testid="linha-do-tempo">
      <div className="flex items-center gap-2 border-b border-white/5 px-2 py-1.5 text-xs text-slate-300">
        <span className="font-mono text-white">{formatarTempo(tempo)}</span><span className="text-slate-500">/ {formatarTempo(total)}</span>
        <span className="ml-auto hidden text-[11px] text-slate-500 sm:inline">Zoom da linha do tempo</span>
        <button type="button" onClick={() => setPx((v) => Math.max(8, Math.round(v / 1.5)))} aria-label="Afastar a linha do tempo" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 hover:bg-white/5"><Minus className="h-4 w-4" /></button>
        <button type="button" onClick={() => setPx((v) => Math.min(240, Math.round(v * 1.5)))} aria-label="Aproximar a linha do tempo" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 hover:bg-white/5"><Plus className="h-4 w-4" /></button>
      </div>
      <div ref={rolagem} className="relative overflow-x-auto overflow-y-hidden" style={{ touchAction: 'pan-x' }}>
        <div className="relative select-none pb-2" style={{ width: largura }} onClick={(e) => { if (e.target === e.currentTarget) onSelecionar(null); }}>
          {/* régua */}
          <div className="relative h-6 cursor-pointer border-b border-white/5" onClick={irPara} data-testid="regua">
            {Array.from({ length: Math.ceil((total + 4) / passoRegua) + 1 }, (_, i) => i * passoRegua).map((t) => (
              <span key={t} className="pointer-events-none absolute top-0 h-full border-l border-white/15 pl-1 text-[10px] text-slate-500" style={{ left: x(t) }}>{formatarTempo(t).replace(/\.\d$/, '')}</span>
            ))}
          </div>

          {/* faixa de vídeo */}
          <div className="relative mt-1.5" style={{ height: ALTURA.clipe }} onClick={(e) => { if (e.target === e.currentTarget) irPara(e); }}>
            {projeto.clipes.length === 0 && <p className="pointer-events-none absolute left-6 top-4 text-xs text-slate-500">Toque em <b>Vídeo/Foto</b> para começar</p>}
            {projeto.clipes.map((c, i) => {
              const d = duracaoDoClipe(c);
              const escolhido = sel?.tipo === 'clipe' && sel.id === c.id;
              const I = c.tipo === 'video' ? Film : c.tipo === 'imagem' ? ImageIcon : Sparkles;
              return (
                <div key={c.id} onClick={(e) => { e.stopPropagation(); onSelecionar({ tipo: 'clipe', id: c.id }); }}
                  className={cn('absolute top-0 flex h-full overflow-hidden rounded-md border-2 bg-[#2a1160] text-[10px] text-white', escolhido ? 'z-10 border-[#FFD400]' : 'border-[#5D1BFF]/60')}
                  style={{ left: x(ini[i]) + 1, width: Math.max(14, d * px - 2) }} data-testid="bloco-clipe">
                  <Miniatura motor={motor} c={c} versao={versaoMidia} />
                  <span className="flex min-w-0 flex-col justify-center px-1.5"><span className="flex items-center gap-1 truncate font-semibold"><I className="h-3 w-3 shrink-0" />{c.nome}</span><span className="text-slate-300">{d.toFixed(1)}s{c.velocidade !== 1 ? ` · ${c.velocidade}x` : ''}</span></span>
                  {escolhido && (
                    <>
                      <Ponta lado="e" onDown={(ev) => { const base = { ...c }; arrastar(ev, px, onInicio, (ds) => onClipe(c.id, c.tipo === 'video' ? cortar(base, 'inicio', base.inicio + ds * base.velocidade) : { duracao: Math.max(0.3, base.duracao - ds) })); }} />
                      <Ponta lado="d" onDown={(ev) => { const base = { ...c }; arrastar(ev, px, onInicio, (ds) => onClipe(c.id, c.tipo === 'video' ? cortar(base, 'fim', base.fim + ds * base.velocidade) : cortar(base, 'fim', base.duracao + ds))); }} />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* textos e elementos */}
          <div className="relative mt-1.5" style={{ height: n * (ALTURA.sob + 4) }} onClick={(e) => { if (e.target === e.currentTarget) irPara(e); }}>
            {projeto.sobreposicoes.map((s) => {
              const escolhido = sel?.tipo === 'sob' && sel.id === s.id;
              return (
                <div key={s.id} onClick={(e) => { e.stopPropagation(); onSelecionar({ tipo: 'sob', id: s.id }); }}
                  onPointerDown={escolhido ? (ev) => { const de = s.de, ate = s.ate; arrastar(ev, px, onInicio, (ds) => { const d = Math.max(-de, ds); onSob(s.id, { de: de + d, ate: ate + d }); }); } : undefined}
                  className={cn('absolute flex items-center gap-1 overflow-hidden rounded-md border-2 bg-[#7a1f8f] px-1.5 text-[10px] font-semibold text-white', escolhido ? 'z-10 cursor-grab touch-none border-[#FFD400]' : 'border-[#ff3df2]/40')}
                  style={{ left: x(s.de), width: Math.max(14, (s.ate - s.de) * px), top: (linha.get(s.id) ?? 0) * (ALTURA.sob + 4), height: ALTURA.sob }} data-testid="bloco-sobreposicao">
                  <Type className="h-3 w-3 shrink-0" /><span className="truncate">{s.tipo === 'texto' ? s.texto.split('\n')[0] : s.nome}</span>
                  {escolhido && (
                    <>
                      <Ponta lado="e" onDown={(ev) => { const de = s.de; arrastar(ev, px, onInicio, (ds) => onSob(s.id, { de: Math.max(0, Math.min(s.ate - 0.3, de + ds)) })); }} />
                      <Ponta lado="d" onDown={(ev) => { const ate = s.ate; arrastar(ev, px, onInicio, (ds) => onSob(s.id, { ate: Math.max(s.de + 0.3, ate + ds) })); }} />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* áudio */}
          <div className="relative mt-1.5" style={{ height: Math.max(1, projeto.audios.length) * (ALTURA.audio + 4) }} onClick={(e) => { if (e.target === e.currentTarget) irPara(e); }}>
            {projeto.audios.map((a, i) => {
              const escolhido = sel?.tipo === 'audio' && sel.id === a.id;
              const trecho = a.fim - a.inicio;
              const largura = (a.repetir ? Math.max(trecho, total - a.em) : trecho) * px;
              return (
                <div key={a.id} onClick={(e) => { e.stopPropagation(); onSelecionar({ tipo: 'audio', id: a.id }); }}
                  onPointerDown={escolhido ? (ev) => { const em = a.em; arrastar(ev, px, onInicio, (ds) => onAudio(a.id, { em: Math.max(0, em + ds) })); } : undefined}
                  className={cn('absolute flex items-center gap-1 overflow-hidden rounded-md border-2 bg-[#0f5f4a] px-1.5 text-[10px] font-semibold text-white', escolhido ? 'z-10 cursor-grab touch-none border-[#FFD400]' : 'border-[#25D366]/40')}
                  style={{ left: x(a.em), width: Math.max(14, largura), top: i * (ALTURA.audio + 4), height: ALTURA.audio }} data-testid="bloco-audio">
                  <AudioLines className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{a.nome}{a.repetir ? ' · repetindo' : ''}</span>
                  {escolhido && (
                    <>
                      <Ponta lado="e" onDown={(ev) => { const b = { ...a }; arrastar(ev, px, onInicio, (ds) => { const novo = Math.max(0, Math.min(b.fim - 0.3, b.inicio + ds)); onAudio(a.id, { inicio: novo, em: Math.max(0, b.em + (novo - b.inicio)) }); }); }} />
                      <Ponta lado="d" onDown={(ev) => { const b = { ...a }; arrastar(ev, px, onInicio, (ds) => onAudio(a.id, { fim: Math.min(b.duracaoArquivo || b.fim + ds, Math.max(b.inicio + 0.3, b.fim + ds)) })); }} />
                    </>
                  )}
                </div>
              );
            })}
            {projeto.audios.length === 0 && <p className="pointer-events-none absolute left-6 top-2 text-[11px] text-slate-500">Sem música — toque em <b>Música</b></p>}
          </div>

          {/* cursor do tempo */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,.8)]" style={{ left: x(tempo) }}>
            <span className="absolute -left-1.5 top-0 h-3 w-3.5 rounded-b bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

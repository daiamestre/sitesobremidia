/**
 * SOBRE MÍDIA STUDIO — EDITOR DE VÍDEO: LINHA DO TEMPO no estilo DaVinci Resolve (F-232, sobre a do F-227).
 * - Cabeçalho das faixas à esquerda: V1 (vídeo), T1 (títulos e elementos), A1, A2… (áudios).
 * - Barra de ferramentas: Seleção (A), Lâmina (B), Ímã (N), Dividir no cursor (Ctrl+B), zoom e "Encaixar tudo".
 * - Lâmina: um toque corta o clipe, o texto ou o áudio exatamente ali.
 * - Seleção: toque escolhe; o escolhido ganha PONTAS para aparar; arrastar o clipe de vídeo muda a posição dele na
 *   faixa; textos e áudios andam no tempo. Com o ímã, tudo encaixa nas pontas dos outros e no cursor.
 * - Régua com timecode: tocar ou arrastar leva o cursor (scrub). Áudio mostra a onda do som.
 * - Ctrl + roda do mouse (ou os botões) dão zoom; o dedo em área livre rola a linha do tempo de lado.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react';
import { AudioLines, Film, Image as ImageIcon, Magnet, Maximize2, Minus, MousePointer2, Plus, Scissors, Slice, Sparkles, Type } from 'lucide-react';
import { cortar, duracaoDoClipe, duracaoTotal, inicios, type Clipe, type FaixaDeAudio, type ProjetoDeVideo, type Sobreposicao } from '@/lib/studio/video/linha';
import { duracaoDoAudio, encaixar, ondaDoAudio, pontosDeEncaixe, timecode, type Alvo, type Ferramenta } from '@/lib/studio/video/edicao';
import type { MotorDeVideo } from '@/lib/studio/video/motor';
import { cn } from '@/lib/utils';

export type Selecao = Alvo | null;

interface Props {
  projeto: ProjetoDeVideo;
  tempo: number;
  sel: Selecao;
  motor: MotorDeVideo | null;
  versaoMidia: number;
  ferramenta: Ferramenta;
  ima: boolean;
  onFerramenta: (f: Ferramenta) => void;
  onIma: (v: boolean) => void;
  onDividir: () => void;
  onSelecionar: (s: Selecao) => void;
  onIr: (t: number) => void;
  onInicio: () => void;
  onClipe: (id: string, p: Partial<Clipe>) => void;
  onSob: (id: string, p: Partial<Sobreposicao>) => void;
  onAudio: (id: string, p: Partial<FaixaDeAudio>) => void;
  /** lâmina: cortar o item no instante t */
  onCortarEm: (alvo: Alvo, t: number) => void;
  /** arrastar o clipe de vídeo para outra posição (onde o começo dele foi solto) */
  onMoverClipe: (id: string, inicioNovo: number) => void;
  /** F-292: o "+" entre dois clipes: abre o efeito de saída/entrada daquela troca */
  onTransicao?: (clipeId: string) => void;
}

const MARGEM = 16;
const CABECALHO = 64;
const ALTURA = { regua: 26, clipe: 58, sob: 30, audio: 40 };
const COR = { video: '#2f5fd0', titulo: '#8b3fd9', audio: '#1f8f5f' };

function Miniatura({ motor, c, versao }: { motor: MotorDeVideo | null; c: Clipe; versao: number }) {
  const tela = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const fonte = motor?.miniatura(c);
    const ctx = tela.current?.getContext('2d');
    if (!fonte || !ctx) return;
    try { ctx.drawImage(fonte, 0, 0, 96, 54); } catch { /* quadro ainda não pronto */ }
  }, [motor, c, versao]);
  return <canvas ref={tela} width={96} height={54} className="h-full w-auto shrink-0 bg-black/40 object-cover" />;
}

/** Onda do som do trecho do áudio que está na linha do tempo. */
function Onda({ a, largura, duracao }: { a: FaixaDeAudio; largura: number; duracao: number }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const [picos, setPicos] = useState<Float32Array | null>(null);
  useEffect(() => { let vivo = true; void ondaDoAudio(a.src).then((p) => { if (vivo) setPicos(p); }); return () => { vivo = false; }; }, [a.src]);
  useEffect(() => {
    const c = tela.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !picos || !a.duracaoArquivo) return;
    const w = Math.max(1, Math.min(4000, Math.round(largura)));
    c.width = w; c.height = 32;
    ctx.clearRect(0, 0, w, 32);
    ctx.fillStyle = 'rgba(190,255,220,.75)';
    const trecho = Math.max(0.1, a.fim - a.inicio);
    for (let x = 0; x < w; x += 2) {
      // posição no ARQUIVO do ponto x (o trecho se repete quando o áudio está em "repetir")
      const off = a.inicio + (((x / w) * duracao) % trecho);
      const v = picos[Math.min(picos.length - 1, Math.floor((off / a.duracaoArquivo) * picos.length))] ?? 0;
      const h = Math.max(1, v * 28 * a.volume);
      ctx.fillRect(x, 16 - h / 2, 1.4, h);
    }
  }, [picos, a.inicio, a.fim, a.duracaoArquivo, a.volume, largura, duracao]);
  return <canvas ref={tela} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 w-full opacity-80" />;
}

/** Arraste genérico: devolve o deslocamento em segundos para cada movimento. */
function arrastar(ev: PE, px: number, onInicio: () => void, mover: (ds: number) => void, soltar?: (ds: number) => void) {
  ev.stopPropagation();
  ev.preventDefault();
  onInicio();
  const x0 = ev.clientX;
  let ultimo = 0;
  const mov = (m: PointerEvent) => { ultimo = (m.clientX - x0) / px; mover(ultimo); };
  const fim = () => { window.removeEventListener('pointermove', mov); window.removeEventListener('pointerup', fim); window.removeEventListener('pointercancel', fim); soltar?.(ultimo); };
  window.addEventListener('pointermove', mov);
  window.addEventListener('pointerup', fim);
  window.addEventListener('pointercancel', fim);
}

function Ponta({ lado, onDown }: { lado: 'e' | 'd'; onDown: (ev: PE) => void }) {
  return (
    <span onPointerDown={onDown} className={cn('absolute inset-y-0 z-10 flex w-4 cursor-ew-resize touch-none items-center justify-center bg-[#FFD400]', lado === 'e' ? 'left-0' : 'right-0')}
      aria-label={lado === 'e' ? 'Aparar o começo' : 'Aparar o fim'} data-ponta={lado}>
      <span className="h-5 w-0.5 rounded bg-[#22004A]" />
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

function BotaoFerramenta({ ativo, onClick, rotulo, atalho, children, testid }: { ativo?: boolean; onClick: () => void; rotulo: string; atalho: string; children: React.ReactNode; testid?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} title={`${rotulo} (${atalho})`} aria-label={rotulo} data-testid={testid}
      className={cn('flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold', ativo ? 'border-[#FFD400] bg-[#FFD400]/15 text-[#FFD400]' : 'border-white/10 text-slate-300 hover:bg-white/5')}>
      {children}<span className="hidden md:inline">{rotulo}</span><kbd className="hidden rounded bg-white/10 px-1 text-[9px] font-normal text-slate-400 lg:inline">{atalho}</kbd>
    </button>
  );
}

export function LinhaDoTempo(props: Props) {
  const { projeto, tempo, sel, motor, versaoMidia, ferramenta, ima, onFerramenta, onIma, onDividir, onSelecionar, onIr, onInicio, onClipe, onSob, onAudio, onCortarEm, onMoverClipe } = props;
  const [px, setPx] = useState(60); // pixels por segundo
  const [mira, setMira] = useState<number | null>(null); // lâmina: onde vai cortar
  const [arrastando, setArrastando] = useState<{ id: string; ds: number } | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const total = duracaoTotal(projeto);
  const largura = MARGEM * 2 + Math.max(total + 4, 10) * px;
  const ini = useMemo(() => inicios(projeto.clipes), [projeto.clipes]);
  const { linha, n } = useMemo(() => emLinhas(projeto.sobreposicoes), [projeto.sobreposicoes]);
  const passoRegua = px >= 120 ? 0.5 : px >= 60 ? 1 : px >= 30 ? 2 : px >= 12 ? 5 : 10;
  const x = (t: number) => MARGEM + t * px;
  const tDoEvento = (clientX: number) => {
    const el = rolagem.current;
    if (!el) return 0;
    return Math.max(0, (clientX - el.getBoundingClientRect().left + el.scrollLeft - MARGEM) / px);
  };
  const lamina = ferramenta === 'lamina';
  const ajustar = (t: number, ignorar?: string) => (ima ? encaixar(t, pontosDeEncaixe(projeto, tempo, ignorar), 10 / px) : t);

  // tocando: a linha do tempo acompanha o cursor
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const cx = x(tempo);
    if (cx < el.scrollLeft + 40 || cx > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, cx - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(tempo * 2), px]);

  // Ctrl + roda do mouse = zoom (como no DaVinci)
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const roda = (e: WheelEvent) => { if (!e.ctrlKey) return; e.preventDefault(); setPx((v) => Math.max(6, Math.min(400, Math.round(v * (e.deltaY < 0 ? 1.2 : 1 / 1.2))))); };
    el.addEventListener('wheel', roda, { passive: false });
    return () => el.removeEventListener('wheel', roda);
  }, []);

  /** Régua: tocar leva o cursor; arrastar faz o "scrub". */
  const scrub = (ev: PE) => {
    ev.preventDefault();
    onIr(ajustar(tDoEvento(ev.clientX)));
    const mov = (m: PointerEvent) => onIr(tDoEvento(m.clientX));
    const fim = () => { window.removeEventListener('pointermove', mov); window.removeEventListener('pointerup', fim); };
    window.addEventListener('pointermove', mov);
    window.addEventListener('pointerup', fim);
  };

  /** Toque num bloco: com a lâmina corta ali; com a seleção, escolhe. */
  const tocarBloco = (ev: React.MouseEvent, alvo: Alvo) => {
    ev.stopPropagation();
    if (lamina) { onCortarEm(alvo, ajustar(tDoEvento(ev.clientX), alvo.id)); return; }
    onSelecionar(alvo);
  };
  const moverMira = (ev: React.PointerEvent) => { if (lamina) setMira(ajustar(tDoEvento(ev.clientX))); };
  const encaixarTudo = () => { const el = rolagem.current; if (el) setPx(Math.max(6, Math.min(400, Math.floor((el.clientWidth - MARGEM * 2) / Math.max(1, total + 1))))); };

  const alturaSob = n * (ALTURA.sob + 4);
  const linhasAudio = Math.max(1, projeto.audios.length);
  const faixas = [
    { id: 'V1', nome: 'Vídeo', cor: COR.video, altura: ALTURA.clipe, I: Film },
    { id: 'T1', nome: 'Títulos', cor: COR.titulo, altura: alturaSob, I: Type },
    ...Array.from({ length: linhasAudio }, (_, i) => ({ id: `A${i + 1}`, nome: 'Áudio', cor: COR.audio, altura: ALTURA.audio, I: AudioLines })),
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#161418]" data-testid="linha-do-tempo">
      {/* barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 bg-[#1e1b22] px-2 py-1.5 text-xs text-slate-300">
        <span className="rounded bg-black/50 px-2 py-1 font-mono text-[13px] text-[#ff9a3c]" data-testid="timecode">{timecode(tempo)}</span>
        <span className="hidden font-mono text-[11px] text-slate-500 sm:inline">/ {timecode(total)}</span>
        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
        <BotaoFerramenta ativo={ferramenta === 'selecao'} onClick={() => onFerramenta('selecao')} rotulo="Seleção" atalho="A" testid="ferramenta-selecao"><MousePointer2 className="h-4 w-4" /></BotaoFerramenta>
        <BotaoFerramenta ativo={lamina} onClick={() => onFerramenta('lamina')} rotulo="Lâmina" atalho="B" testid="ferramenta-lamina"><Slice className="h-4 w-4" /></BotaoFerramenta>
        <BotaoFerramenta ativo={ima} onClick={() => onIma(!ima)} rotulo="Ímã" atalho="N" testid="ferramenta-ima"><Magnet className="h-4 w-4" /></BotaoFerramenta>
        <BotaoFerramenta onClick={onDividir} rotulo="Dividir no cursor" atalho="Ctrl+B"><Scissors className="h-4 w-4" /></BotaoFerramenta>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={encaixarTudo} title="Ver o vídeo inteiro" aria-label="Ver o vídeo inteiro na linha do tempo" className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 hover:bg-white/5"><Maximize2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPx((v) => Math.max(6, Math.round(v / 1.5)))} aria-label="Afastar a linha do tempo" className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 hover:bg-white/5"><Minus className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPx((v) => Math.min(400, Math.round(v * 1.5)))} aria-label="Aproximar a linha do tempo" className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 hover:bg-white/5"><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex">
        {/* cabeçalho das faixas */}
        <div className="shrink-0 border-r border-white/10 bg-[#1e1b22]" style={{ width: CABECALHO }}>
          <div style={{ height: ALTURA.regua }} className="border-b border-white/10" />
          {faixas.map((f) => (
            <div key={f.id} className="mt-1.5 flex items-center gap-1 px-1.5 text-[10px] text-slate-300" style={{ height: f.altura }} data-testid={`faixa-${f.id}`}>
              <span className="rounded px-1 font-bold text-white" style={{ background: f.cor }}>{f.id}</span>
              <f.I className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="hidden truncate xl:inline">{f.nome}</span>
            </div>
          ))}
        </div>

        <div ref={rolagem} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden" style={{ touchAction: 'pan-x' }}
          onPointerMove={moverMira} onPointerLeave={() => setMira(null)}>
          <div className={cn('relative select-none pb-2', lamina && 'cursor-crosshair')} style={{ width: largura }} onClick={(e) => { if (e.target === e.currentTarget) onSelecionar(null); }}>
            {/* régua com timecode (tocar ou arrastar = scrub) */}
            <div className="relative cursor-pointer touch-none border-b border-white/10 bg-[#1b181f]" style={{ height: ALTURA.regua }} onPointerDown={scrub} data-testid="regua">
              {Array.from({ length: Math.ceil((total + 4) / passoRegua) + 1 }, (_, i) => i * passoRegua).map((t) => (
                <span key={t} className="pointer-events-none absolute bottom-0 h-3 border-l border-white/25 pl-1 text-[9px] leading-none text-slate-500" style={{ left: x(t) }}>
                  <span className="absolute -top-2.5 left-1 whitespace-nowrap font-mono">{timecode(t).slice(3, 8)}</span>
                </span>
              ))}
            </div>

            {/* V1 — vídeo (clipes em sequência) */}
            <div className="relative mt-1.5 bg-white/[0.02]" style={{ height: ALTURA.clipe }} onClick={(e) => { if (e.target === e.currentTarget && !lamina) onIr(tDoEvento(e.clientX)); }}>
              {projeto.clipes.length === 0 && <p className="pointer-events-none absolute left-4 top-4 text-xs text-slate-500">Toque em <b>Vídeo/Foto</b> para pôr o primeiro clipe</p>}
              {projeto.clipes.map((c, i) => {
                const d = duracaoDoClipe(c);
                const escolhido = sel?.tipo === 'clipe' && sel.id === c.id;
                const I = c.tipo === 'video' ? Film : c.tipo === 'imagem' ? ImageIcon : Sparkles;
                const desloc = arrastando?.id === c.id ? arrastando.ds * px : 0;
                return (
                  <div key={c.id} onClick={(e) => tocarBloco(e, { tipo: 'clipe', id: c.id })}
                    onPointerDown={escolhido && !lamina && projeto.clipes.length > 1 ? (ev) => {
                      const base = ini[i];
                      arrastar(ev, px, () => undefined, (ds) => setArrastando({ id: c.id, ds }), (ds) => { setArrastando(null); if (Math.abs(ds * px) > 6) { onInicio(); onMoverClipe(c.id, Math.max(0, base + ds)); } });
                    } : undefined}
                    className={cn('absolute top-0 flex h-full overflow-hidden rounded border text-[10px] text-white', escolhido ? 'z-10 border-[#FFD400] ring-1 ring-[#FFD400]' : 'border-black/40', escolhido && !lamina && 'cursor-grab touch-none', arrastando?.id === c.id && 'z-30 opacity-80 shadow-2xl')}
                    style={{ left: x(ini[i]) + 1 + desloc, width: Math.max(14, d * px - 2), background: COR.video }} data-testid="bloco-clipe">
                    <Miniatura motor={motor} c={c} versao={versaoMidia} />
                    <span className="flex min-w-0 flex-col justify-center px-1.5"><span className="flex items-center gap-1 truncate font-semibold"><I className="h-3 w-3 shrink-0" />{c.nome}</span><span className="text-white/70">{d.toFixed(1)}s{c.velocidade !== 1 ? ` · ${c.velocidade}x` : ''}</span></span>
                    {escolhido && !lamina && (
                      <>
                        <Ponta lado="e" onDown={(ev) => { const base = { ...c }; arrastar(ev, px, onInicio, (ds) => onClipe(c.id, c.tipo === 'video' ? cortar(base, 'inicio', base.inicio + ds * base.velocidade) : { duracao: Math.max(0.3, base.duracao - ds) })); }} />
                        <Ponta lado="d" onDown={(ev) => { const base = { ...c }; arrastar(ev, px, onInicio, (ds) => onClipe(c.id, c.tipo === 'video' ? cortar(base, 'fim', base.fim + ds * base.velocidade) : cortar(base, 'fim', base.duracao + ds))); }} />
                      </>
                    )}
                  </div>
                );
              })}
              {/* F-292: "+" em cada troca de clipe = efeito de saída e entrada (flash, fade, luz, brilho, girar…) */}
              {props.onTransicao && projeto.clipes.slice(0, -1).map((c, i) => (
                <button key={`t-${c.id}`} type="button" onClick={(e) => { e.stopPropagation(); props.onTransicao!(c.id); }} title={`Efeito na troca: ${c.transicao.tipo === 'corte' ? 'nenhum' : c.transicao.tipo}`} aria-label={`Efeito de saída e entrada depois de ${c.nome}`}
                  className={cn('absolute top-1/2 z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[13px] font-black shadow', c.transicao.tipo === 'corte' ? 'border-white bg-[#5D1BFF] text-white' : 'border-[#FFD400] bg-[#FFD400] text-[#22004A]')}
                  style={{ left: x(ini[i + 1]) }} data-testid="linha-transicao">{c.transicao.tipo === 'corte' ? '+' : '✦'}</button>
              ))}
            </div>

            {/* T1 — títulos, textos e elementos */}
            <div className="relative mt-1.5 bg-white/[0.02]" style={{ height: alturaSob }} onClick={(e) => { if (e.target === e.currentTarget && !lamina) onIr(tDoEvento(e.clientX)); }}>
              {projeto.sobreposicoes.map((s) => {
                const escolhido = sel?.tipo === 'sob' && sel.id === s.id;
                return (
                  <div key={s.id} onClick={(e) => tocarBloco(e, { tipo: 'sob', id: s.id })}
                    onPointerDown={escolhido && !lamina ? (ev) => { const de = s.de, ate = s.ate; arrastar(ev, px, onInicio, (ds) => { const novo = Math.max(0, ajustar(de + ds, s.id)); onSob(s.id, { de: novo, ate: novo + (ate - de) }); }); } : undefined}
                    className={cn('absolute flex items-center gap-1 overflow-hidden rounded border px-1.5 text-[10px] font-semibold text-white', escolhido ? 'z-10 border-[#FFD400] ring-1 ring-[#FFD400]' : 'border-black/40', escolhido && !lamina && 'cursor-grab touch-none')}
                    style={{ left: x(s.de), width: Math.max(14, (s.ate - s.de) * px), top: (linha.get(s.id) ?? 0) * (ALTURA.sob + 4), height: ALTURA.sob, background: COR.titulo }} data-testid="bloco-sobreposicao">
                    <Type className="h-3 w-3 shrink-0" /><span className="truncate">{s.tipo === 'texto' ? s.texto.split('\n')[0] : s.nome}</span>
                    {escolhido && !lamina && (
                      <>
                        <Ponta lado="e" onDown={(ev) => { const de = s.de; arrastar(ev, px, onInicio, (ds) => onSob(s.id, { de: Math.max(0, Math.min(s.ate - 0.3, ajustar(de + ds, s.id))) })); }} />
                        <Ponta lado="d" onDown={(ev) => { const ate = s.ate; arrastar(ev, px, onInicio, (ds) => onSob(s.id, { ate: Math.max(s.de + 0.3, ajustar(ate + ds, s.id)) })); }} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* A1, A2… — áudios com a onda do som */}
            <div className="relative mt-1.5" style={{ height: linhasAudio * (ALTURA.audio + 6) }} onClick={(e) => { if (e.target === e.currentTarget && !lamina) onIr(tDoEvento(e.clientX)); }}>
              {projeto.audios.map((a, i) => {
                const escolhido = sel?.tipo === 'audio' && sel.id === a.id;
                const larg = duracaoDoAudio(a, total) * px;
                return (
                  <div key={a.id} onClick={(e) => tocarBloco(e, { tipo: 'audio', id: a.id })}
                    onPointerDown={escolhido && !lamina ? (ev) => { const em = a.em; arrastar(ev, px, onInicio, (ds) => onAudio(a.id, { em: Math.max(0, ajustar(em + ds, a.id)) })); } : undefined}
                    className={cn('absolute overflow-hidden rounded border text-[10px] font-semibold text-white', escolhido ? 'z-10 border-[#FFD400] ring-1 ring-[#FFD400]' : 'border-black/40', escolhido && !lamina && 'cursor-grab touch-none')}
                    style={{ left: x(a.em), width: Math.max(14, larg), top: i * (ALTURA.audio + 6), height: ALTURA.audio, background: COR.audio }} data-testid="bloco-audio">
                    <span className="relative z-[1] flex items-center gap-1 truncate px-1.5 pt-0.5"><AudioLines className="h-3 w-3 shrink-0" />{a.nome}{a.repetir ? ' · repetindo' : ''}</span>
                    <Onda a={a} largura={larg} duracao={duracaoDoAudio(a, total)} />
                    {escolhido && !lamina && (
                      <>
                        <Ponta lado="e" onDown={(ev) => { const b = { ...a }; arrastar(ev, px, onInicio, (ds) => { const novo = Math.max(0, Math.min(b.fim - 0.3, b.inicio + ds)); onAudio(a.id, { inicio: novo, em: Math.max(0, b.em + (novo - b.inicio)) }); }); }} />
                        <Ponta lado="d" onDown={(ev) => { const b = { ...a }; arrastar(ev, px, onInicio, (ds) => onAudio(a.id, { fim: Math.min(b.duracaoArquivo || b.fim + ds, Math.max(b.inicio + 0.3, b.fim + ds)) })); }} />
                      </>
                    )}
                  </div>
                );
              })}
              {projeto.audios.length === 0 && <p className="pointer-events-none absolute left-4 top-3 text-[11px] text-slate-500">Sem áudio — toque em <b>Música</b> para pôr som</p>}
            </div>

            {/* lâmina: linha vermelha mostrando onde vai cortar */}
            {lamina && mira != null && (
              <div className="pointer-events-none absolute bottom-0 z-20 w-px bg-[#ff3b3b]" style={{ left: x(mira), top: ALTURA.regua }} data-testid="mira-lamina" />
            )}

            {/* cursor do tempo */}
            <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-[#ff4d4d] shadow-[0_0_6px_rgba(255,77,77,.8)]" style={{ left: x(tempo) }}>
              <span className="absolute -left-[5px] top-0 h-3 w-3 rotate-45 bg-[#ff4d4d]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO COMPLETO (pedido do dono, 18/11/2026; só owner/ADM).
 * Várias faixas, cortar/copiar/colar/apagar/dividir/aparar/mover, desfazer e refazer, gravação pelo microfone, sons e trilhas
 * do Studio, 27 efeitos com prévia, volume/posição/mudo/solo por faixa, fades por clipe, medidor, zoom até a amostra e
 * exportação em MP3/WAV do projeto inteiro ou da seleção. Tudo roda no navegador; a edição fica salva no aparelho.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react';
import {
  AudioWaveform, BetweenHorizontalStart, FolderOpen, Save, ClipboardPaste, Copy, CopyPlus, Crop, Download, FilePlus2, Hand, Headphones, Loader2,
  Magnet, Maximize2, Mic, MousePointer2, Music, Pause, Play, Plus, Redo2, Repeat, Rows3, Scissors, SkipBack, SkipForward, Split,
  Square, Trash2, Undo2, Upload, Volume2, VolumeX, ZoomIn, ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SONS, TRILHAS } from '@/lib/studio/impacto';
import {
  acharClipe, apagarIntervalo, apararClipe, abrirEspaco, clipesNoIntervalo, colar, copiarIntervalo, dividirFaixa, fimDaFaixa,
  fimDoClipe, fimDoProjeto, formatarTempo, novaFaixa, novoClipe, novoId, projetoVazio, sonsUsados, trocarClipe, trocarFaixa,
  trocarSomDosClipes, type Clipe, type Faixa, type Projeto,
} from '@/lib/studio/audio/projeto';
import { calcularPicos, duracaoDoSom, gerarTom, juntar, recortar, silenciar, type Picos, type Som } from '@/lib/studio/audio/som';
import { EFEITOS, GRUPOS, efeitoPorId, valoresPadrao, type Efeito, type Valores } from '@/lib/studio/audio/efeitos';
import { agendarProjeto, renderizarProjeto } from '@/lib/studio/audio/mixagem';
import { baixarArquivo, codificar, decodificarArquivo, lerMarcaDoStudio, paraAudioBuffer, type FormatoDeAudio, type MarcaDoStudio } from '@/lib/studio/audio/arquivos';
import { apagarDoAparelho, lerDaPasta, lerDoAparelho, listarPasta, salvarNoAparelho, type AudioNaPasta } from '@/lib/studio/audio/guardar';
import { abrirEdicao, apagarEdicao, duplicarEdicao, guardarEdicao, listarEdicoes, renomearEdicao, type EdicaoNoSistema, type TipoDeEdicao } from '@/lib/studio/audio/sistema';

/** F-328: depois de tanto tempo sem editar, a edição vira rascunho e a tela começa do zero */
export const PARADO_MS = 30 * 60 * 1000;

const CAB = 224, CAB_CELULAR = 76, ALTURA = 112, TITULO = 18, REGUA = 28, BORDA = 7;
type AbaDoCelular = 'cortes' | 'adicionar' | 'efeitos' | 'faixa';
const ZOOM_MIN = 2, ZOOM_MAX = 40000;

interface SomGuardado { nome: string; som: Som; picos: Picos; buffers: WeakMap<BaseAudioContext, AudioBuffer> }
type Gesto =
  | { tipo: 'selecao'; faixaId: string; ancora: number }
  | { tipo: 'mover'; clipeId: string; desvio: number; moveu: boolean; x: number; y: number; raf: number; novaFaixa?: string; origem?: string; x0?: number; y0?: number; bordaDesde?: number; vertDesde?: number }
  | { tipo: 'aparar'; clipeId: string; lado: 'inicio' | 'fim' }
  | { tipo: 'regua' }
  | { tipo: 'pinca'; dist0: number; zoom0: number; tempo0: number; x0: number }
  /** dedo: espera para saber se é toque, rolagem ou (segurando) seleção/arrasto */
  | { tipo: 'espera'; x0: number; y0: number; scroll0: number; scrollY0: number; acao: () => void; toque: () => void; timer: number }
  | { tipo: 'rolar'; x0: number; y0: number; scroll0: number; scrollY0: number }
  /** arrastando o triângulo da linha amarela */
  | { tipo: 'cursor'; tocava: boolean; x: number; raf: number; ultimo: number; cursor0: number };

const cor = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const ehCampo = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/** o passo da régua para caber ~80 px entre as marcas */
function passoDaRegua(zoom: number) {
  for (const p of [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (p * zoom >= 80) return p;
  return 1200;
}

function desenharRegua(c: HTMLCanvasElement, w: number, zoom: number, rolagem: number, sel: { a: number; b: number } | null) {
  const dpr = window.devicePixelRatio || 1; c.width = w * dpr; c.height = REGUA * dpr;
  const g = c.getContext('2d')!; g.scale(dpr, dpr); g.fillStyle = '#12062e'; g.fillRect(0, 0, w, REGUA);
  if (sel) { g.fillStyle = 'rgba(176,77,255,0.35)'; g.fillRect(sel.a * zoom - rolagem, 0, (sel.b - sel.a) * zoom, REGUA); }
  const p = passoDaRegua(zoom), t0 = Math.floor(rolagem / zoom / p) * p;
  g.font = '10px ui-monospace, monospace'; g.textBaseline = 'top';
  for (let t = t0; t * zoom - rolagem < w; t += p) {
    const x = Math.round(t * zoom - rolagem) + 0.5;
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x, REGUA - 10); g.lineTo(x, REGUA); g.stroke();
    for (let k = 1; k < 5; k++) { const xs = Math.round((t + (p * k) / 5) * zoom - rolagem) + 0.5; g.strokeStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.moveTo(xs, REGUA - 5); g.lineTo(xs, REGUA); g.stroke(); }
    g.fillStyle = '#cbd5e1'; g.fillText(p < 1 ? formatarTempo(t) : formatarTempo(t, false), x + 3, 4);
  }
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(0, REGUA - 0.5); g.lineTo(w, REGUA - 0.5); g.stroke();
}

function desenharPista(c: HTMLCanvasElement, w: number, f: Faixa, zoom: number, rolagem: number, sel: { a: number; b: number } | null, clipeSel: string | null, faixaAtiva: boolean, obter: (id: string) => SomGuardado | undefined) {
  const dpr = window.devicePixelRatio || 1; c.width = w * dpr; c.height = ALTURA * dpr;
  const g = c.getContext('2d')!; g.scale(dpr, dpr);
  g.fillStyle = faixaAtiva ? '#1a0b3d' : '#140632'; g.fillRect(0, 0, w, ALTURA);
  // linhas de tempo
  const p = passoDaRegua(zoom); g.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let t = Math.floor(rolagem / zoom / p) * p; t * zoom - rolagem < w; t += p) { const x = Math.round(t * zoom - rolagem) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ALTURA); g.stroke(); }
  for (const cl of f.clipes) {
    const x0 = cl.inicio * zoom - rolagem, x1 = x0 + cl.duracao * zoom;
    if (x1 < 0 || x0 > w) continue;
    const escolhido = cl.id === clipeSel;
    g.fillStyle = cor(f.cor, escolhido ? 0.32 : 0.18); g.fillRect(x0, 1, x1 - x0, ALTURA - 2);
    g.fillStyle = cor(f.cor, escolhido ? 0.95 : 0.6); g.fillRect(x0, 1, x1 - x0, TITULO);
    g.strokeStyle = escolhido ? '#ffffff' : cor(f.cor, 0.8); g.lineWidth = escolhido ? 2 : 1; g.strokeRect(x0 + 0.5, 1.5, x1 - x0 - 1, ALTURA - 3); g.lineWidth = 1;
    g.save(); g.beginPath(); g.rect(Math.max(0, x0), 0, Math.min(w, x1) - Math.max(0, x0), ALTURA); g.clip();
    g.fillStyle = '#0B0420'; g.font = 'bold 10px system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText(`${cl.nome}${cl.ganhoDb ? `  ${cl.ganhoDb > 0 ? '+' : ''}${cl.ganhoDb.toFixed(1)} dB` : ''}`, Math.max(x0, 0) + 5, 1 + TITULO / 2);
    const info = obter(cl.somId);
    if (info) {
      const { som, picos } = info, sr = som.sr, meio = TITULO + (ALTURA - TITULO) / 2, amp = (ALTURA - TITULO) / 2 - 4;
      const base = Math.pow(10, cl.ganhoDb / 20);
      g.strokeStyle = escolhido ? '#ffffff' : cor(f.cor, 1); g.beginPath();
      let antes: number | null = null;
      for (let px = Math.max(0, Math.floor(x0)); px < Math.min(w, Math.ceil(x1)); px++) {
        const tl = (px + rolagem) / zoom, rel = tl - cl.inicio; if (rel < 0 || rel > cl.duracao) continue;
        let k = base; if (cl.fadeEntrada > 0 && rel < cl.fadeEntrada) k *= rel / cl.fadeEntrada; if (cl.fadeSaida > 0 && rel > cl.duracao - cl.fadeSaida) k *= (cl.duracao - rel) / cl.fadeSaida;
        const sA = Math.floor((cl.deslocamento + rel) * sr), sB = Math.floor((cl.deslocamento + rel + 1 / zoom) * sr);
        let lo = 0, hi = 0;
        if (sB - sA >= picos.bloco * 2) {
          for (let b = Math.floor(sA / picos.bloco); b <= Math.min(picos.min.length - 1, Math.floor(sB / picos.bloco)); b++) { if (picos.min[b] < lo) lo = picos.min[b]; if (picos.max[b] > hi) hi = picos.max[b]; }
        } else if (sB - sA >= 2) {
          for (let i = sA; i < sB; i++) for (const ch of som.canais) { const v = ch[i] ?? 0; if (v < lo) lo = v; if (v > hi) hi = v; }
        } else {
          // zoom de amostra: liga os pontos
          let v = 0; for (const ch of som.canais) v += (ch[sA] ?? 0) / som.canais.length;
          const y = meio - Math.max(-1, Math.min(1, v * k)) * amp;
          if (antes == null) g.moveTo(px, y); else g.lineTo(px, y); antes = y; continue;
        }
        g.moveTo(px + 0.5, meio - Math.min(1, hi * k) * amp); g.lineTo(px + 0.5, meio - Math.max(-1, lo * k) * amp + 1);
      }
      g.stroke();
      // fades
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      if (cl.fadeEntrada > 0) { g.beginPath(); g.moveTo(x0, ALTURA - 2); g.lineTo(x0 + cl.fadeEntrada * zoom, TITULO + 2); g.stroke(); }
      if (cl.fadeSaida > 0) { g.beginPath(); g.moveTo(x1 - cl.fadeSaida * zoom, TITULO + 2); g.lineTo(x1, ALTURA - 2); g.stroke(); }
    }
    g.restore();
  }
  if (sel) { g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(sel.a * zoom - rolagem, 0, Math.max(1, (sel.b - sel.a) * zoom), ALTURA); }
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(0, ALTURA - 0.5); g.lineTo(w, ALTURA - 0.5); g.stroke();
}

function Botao({ titulo, onClick, children, ativo, desligado, perigo }: { titulo: string; onClick: () => void; children: React.ReactNode; ativo?: boolean; desligado?: boolean; perigo?: boolean }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick} disabled={desligado}
      className={cn('flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition disabled:opacity-35',
        ativo ? 'border-[#B04DFF] bg-[#8A2EFF]/40 text-white' : perigo ? 'border-rose-500/30 text-rose-200 hover:bg-rose-500/15' : 'border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10')}>
      {children}
    </button>
  );
}

/** segura o toque/clique no elemento (sem quebrar a tela se o navegador recusar) */
/** velocidade da rolagem na borda: começa rápida e acelera enquanto o dedo fica lá (até ~80 px por quadro) */
const bordaDesde = { t: 0 };
function velocidadeNaBorda(v: number): number {
  if (!v) { bordaDesde.t = 0; return 0; }
  const agora = performance.now(); if (!bordaDesde.t) bordaDesde.t = agora;
  // F-336 (pedido do dono): rápido demais ficava descontrolado. Agora: só começa com o dedo parado 0,2 s na borda, anda
  // 3 a 12 px por quadro conforme o quanto o dedo entra na borda, e só acelera (até 1,5x) depois de 3 s segurando.
  const passou = agora - bordaDesde.t;
  if (passou < 200) return 0;
  const k = Math.min(1, Math.max(0, (passou - 3000) / 2000));
  return Math.sign(v) * (3 + 9 * Math.abs(v)) * (1 + 0.5 * k);
}

function capturar(e: { target: EventTarget; pointerId: number }) { try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* toque já solto */ } }

/** botão grande com nome, para o dedo (celular) */
function Grande({ titulo, rotulo, onClick, children, ativo, perigo, desligado }: { titulo: string; rotulo: string; onClick: () => void; children: React.ReactNode; ativo?: boolean; perigo?: boolean; desligado?: boolean }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick} disabled={desligado}
      className={cn('flex h-16 w-[68px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border text-[10px] font-semibold leading-tight disabled:opacity-35',
        ativo ? 'border-[#B04DFF] bg-[#8A2EFF]/45 text-white' : perigo ? 'border-rose-500/30 text-rose-200' : 'border-white/10 bg-white/[0.04] text-slate-200 active:bg-white/15')}>
      {children}<span className="text-center">{rotulo}</span>
    </button>
  );
}

/** celular: tela estreita (até 767 px) */
function useCelular() {
  const consulta = '(max-width: 767px)';
  const [sim, setSim] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches);
  useEffect(() => { const m = window.matchMedia(consulta); const f = () => setSim(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return sim;
}

function CampoDeTempo({ rotulo, valor, onMudar }: { rotulo: string; valor: number | null; onMudar?: (v: number) => void }) {
  const [txt, setTxt] = useState('');
  useEffect(() => setTxt(valor == null ? '' : valor.toFixed(3)), [valor]);
  return (
    <label className="flex flex-col text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {rotulo}
      <input value={txt} disabled={!onMudar || valor == null} onChange={(e) => setTxt(e.target.value)}
        onBlur={() => { const v = Number(txt.replace(',', '.')); if (onMudar && Number.isFinite(v)) onMudar(Math.max(0, v)); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="mt-0.5 w-24 rounded-md border border-white/10 bg-[#0B0420] px-2 py-1 font-mono text-xs text-white disabled:opacity-40" />
    </label>
  );
}

export function EditorDeAudio() {
  const sons = useRef(new Map<string, SomGuardado>());
  const [, setVersaoDosSons] = useState(0);
  const [projeto, setProjeto] = useState<Projeto>(projetoVazio);
  const projetoRef = useRef(projeto);
  const passado = useRef<Projeto[]>([]), futuro = useRef<Projeto[]>([]);
  const ultimaMudanca = useRef<{ chave: string; t: number } | null>(null);
  const [nome, setNome] = useState('Minha edição');
  // Pasta de Áudios: qual áudio da pasta está aberto (para salvar por cima) e a versão dele
  const [pastaId, setPastaId] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [pastaAberta, setPastaAberta] = useState(false);
  const [itensDaPasta, setItensDaPasta] = useState<AudioNaPasta[]>([]);
  const salvoRef = useRef<Projeto | null>(null);
  // F-328: a edição aberta está no sistema como salva ou rascunho; os sons que já estão lá não são enviados de novo
  const [edicaoTipo, setEdicaoTipo] = useState<TipoDeEdicao | null>(null);
  const urls = useRef(new Map<string, string>());
  const [itens, setItens] = useState<EdicaoNoSistema[]>([]);
  const [abaBiblioteca, setAbaBiblioteca] = useState<TipoDeEdicao>('salvo');
  const [carregandoBiblioteca, setCarregandoBiblioteca] = useState(false);
  const [anterior, setAnterior] = useState<null | { id: string; nome: string; motivo: 'tempo' | 'nova'; onde: TipoDeEdicao }>(null);
  const ultimaEdicao = useRef(Date.now());
  const [faixaSel, setFaixaSel] = useState<string | null>(null);
  const [clipeSel, setClipeSel] = useState<string | null>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  const [zoom, setZoom] = useState(80);
  const [rolagem, setRolagem] = useState(0);
  const [largura, setLargura] = useState(800);
  const celular = useCelular();
  const [aba, setAba] = useState<AbaDoCelular>('cortes');
  const [folha, setFolha] = useState<null | 'efeitos' | 'faixa' | 'sons'>(null);
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const [arrastando, setArrastando] = useState(false);
  /** F-331 (celular): só com este botão ligado, arrastar na onda MARCA um trecho; desligado, arrastar o clipe MOVE */
  const [marcandoTrecho, setMarcandoTrecho] = useState(false);
  const [ferramenta, setFerramenta] = useState<'selecao' | 'mover' | 'tesoura'>('selecao');
  const [ima, setIma] = useState(true);
  const [emTodas, setEmTodas] = useState(false);
  const [loop, setLoop] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [gravando, setGravando] = useState<null | { inicio: number; desde: number }>(null);
  const [tocarAoGravar, setTocarAoGravar] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [efeitoId, setEfeitoId] = useState('normalizar');
  const [valores, setValores] = useState<Valores>(() => valoresPadrao(efeitoPorId('normalizar')!));
  const [sonsAbertos, setSonsAbertos] = useState(false);
  const [exportar, setExportar] = useState(false);
  const [silencioSeg, setSilencioSeg] = useState(1);
  const area = useRef<HTMLDivElement>(null), linha = useRef<HTMLDivElement>(null), relogio = useRef<HTMLSpanElement>(null);
  const medidorE = useRef<HTMLDivElement>(null), medidorD = useRef<HTMLDivElement>(null);
  const regua = useRef<HTMLCanvasElement>(null), pistas = useRef(new Map<string, HTMLCanvasElement>());
  const gesto = useRef<Gesto | null>(null);
  const area_transferencia = useRef<Clipe[]>([]);
  const audio = useRef<{ ctx: AudioContext; geral: GainNode; e: AnalyserNode; d: AnalyserNode } | null>(null);
  const reproducao = useRef<{ fontes: AudioScheduledSourceNode[]; t0: number; pos0: number; fim: number; origem: number; raf: number } | null>(null);
  const gravador = useRef<{ rec: MediaRecorder; stream: MediaStream; partes: Blob[] } | null>(null);
  const carregado = useRef(false);

  projetoRef.current = projeto;
  const fim = fimDoProjeto(projeto);
  const larguraTotal = Math.max(largura, (fim + 10) * zoom);
  const faixaAtual = projeto.faixas.find((f) => f.id === faixaSel) ?? null;
  const clipeAtual = acharClipe(projeto, clipeSel);

  // ——— projeto e histórico ———
  const alterar = useCallback((f: (p: Projeto) => Projeto, chave?: string) => {
    const atual = projetoRef.current, novo = f(atual);
    if (novo === atual) return;
    const agora = Date.now(), u = ultimaMudanca.current;
    if (!(chave && u && u.chave === chave && agora - u.t < 900)) { passado.current.push(atual); if (passado.current.length > 150) passado.current.shift(); futuro.current = []; }
    ultimaMudanca.current = chave ? { chave, t: agora } : null;
    projetoRef.current = novo; setProjeto(novo);
  }, []);
  /** durante o arrasto: muda sem guardar (o estado anterior já foi guardado no começo do gesto) */
  const alterarAoVivo = useCallback((f: (p: Projeto) => Projeto) => { const n = f(projetoRef.current); projetoRef.current = n; setProjeto(n); }, []);
  const marcarHistorico = useCallback(() => { passado.current.push(projetoRef.current); futuro.current = []; ultimaMudanca.current = null; }, []);
  const desfazer = useCallback(() => { const p = passado.current.pop(); if (!p) return; futuro.current.push(projetoRef.current); projetoRef.current = p; setProjeto(p); }, []);
  const refazer = useCallback(() => { const p = futuro.current.pop(); if (!p) return; passado.current.push(projetoRef.current); projetoRef.current = p; setProjeto(p); }, []);

  const registrarSom = useCallback((som: Som, nomeDoSom: string, id = novoId('som')) => {
    sons.current.set(id, { nome: nomeDoSom, som, picos: calcularPicos(som), buffers: new WeakMap() });
    setVersaoDosSons((v) => v + 1);
    return id;
  }, []);
  const obterSom = useCallback((id: string) => sons.current.get(id), []);
  const bufferDe = useCallback((ctx: BaseAudioContext, id: string) => {
    const s = sons.current.get(id); if (!s) return null;
    let b = s.buffers.get(ctx); if (!b) { b = paraAudioBuffer(ctx, s.som); s.buffers.set(ctx, b); }
    return b;
  }, []);

  const moverCursor = useCallback((t: number) => { const v = Math.max(0, t); cursorRef.current = v; setCursor(v); }, []);

  // ——— recuperar a edição salva no aparelho ———
  useEffect(() => {
    void lerDoAparelho().then((g) => {
      if (g && g.projeto.faixas.length) {
        for (const [id, s] of Object.entries(g.sons)) registrarSom(s.som, s.nome, id);
        projetoRef.current = g.projeto; setProjeto(g.projeto); setNome(g.nome || 'Minha edição'); setPastaId(g.pastaId ?? null);
        setEdicaoTipo(g.tipo ?? null);
        setFaixaSel(g.projeto.faixas[0]?.id ?? null);
        ultimaEdicao.current = g.salvoEm;
        // espera a tela assumir o nome/versão da edição antes de guardar como rascunho
        if (Date.now() - g.salvoEm > PARADO_MS) setTimeout(() => aoFicarParado.current?.(), 500);
        else toast.success('A sua edição continua de onde você parou.');
      }
      carregado.current = true;
    });
  }, [registrarSom]);
  // salva sozinho, 2,5 s depois da última mudança
  useEffect(() => {
    if (!carregado.current) return;
    const t = setTimeout(() => {
      const usados = sonsUsados(projeto), lista: Record<string, { nome: string; som: Som }> = {};
      for (const id of usados) { const s = sons.current.get(id); if (s) lista[id] = { nome: s.nome, som: s.som }; }
      if (projeto.faixas.length) void salvarNoAparelho({ projeto, sons: lista, nome, salvoEm: ultimaEdicao.current, pastaId, tipo: edicaoTipo }); else void apagarDoAparelho();
    }, 2500);
    return () => clearTimeout(t);
  }, [projeto, nome, pastaId, edicaoTipo]);
  // a última vez que mexeu na edição (para saber quando ficou parado)
  const primeiraVez = useRef(true);
  useEffect(() => { if (primeiraVez.current) { primeiraVez.current = false; return; } ultimaEdicao.current = Date.now(); }, [projeto]);
  const aoFicarParado = useRef<(() => void) | null>(null);

  // F-330: o iPhone dá zoom sozinho ao tocar num campo e não volta (tela grande e cortada depois de salvar).
  // Enquanto o editor está aberto, a página não aumenta sozinha; ao sair, volta como era.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]'); if (!meta) return;
    const antes = meta.content;
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
    return () => { meta.content = antes; };
  }, []);

  // F-334 (pedido do dono): tocou FORA do clipe em qualquer lugar → o clipe é desmarcado na hora.
  // As pistas cuidam do toque nelas; os botões de ação e os painéis/janelas mantêm a escolha (senão não teriam em que agir).
  useEffect(() => {
    const fora = (e: PointerEvent) => {
      const el = e.target as Element | null; if (!el) return;
      if (el.closest('[data-testid=editor-audio-pista], [data-mantem-escolha]')) return;
      setClipeSel(null);
    };
    document.addEventListener('pointerdown', fora, true);
    return () => document.removeEventListener('pointerdown', fora, true);
  }, []);

  // ——— tamanho da área visível ———
  useEffect(() => {
    const el = area.current; if (!el) return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el); setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ——— desenho ———
  useEffect(() => {
    if (regua.current) desenharRegua(regua.current, largura, zoom, rolagem, sel);
    for (const f of projeto.faixas) {
      const c = pistas.current.get(f.id);
      const selDaFaixa = sel && (emTodas || f.id === faixaSel) ? sel : null;
      if (c) desenharPista(c, largura, f, zoom, rolagem, selDaFaixa, clipeSel, f.id === faixaSel, obterSom);
    }
  });
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const posicionarLinha = useCallback((t: number) => {
    const el = area.current, w = el?.clientWidth ?? largura;
    if (linha.current) { const x = t * zoomRef.current - (el?.scrollLeft ?? 0); linha.current.style.transform = `translateX(${x}px)`; linha.current.style.visibility = x < -1 || x > w + 1 ? 'hidden' : 'visible'; /* escondida não pega toque fora da área */ }
    if (relogio.current) relogio.current.textContent = formatarTempo(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, rolagem, largura]);
  useEffect(() => { posicionarLinha(cursorRef.current); }, [posicionarLinha, cursor]);

  // ——— tocar ———
  // F-330: o tocador de som. No iPhone ele pode ser fechado/"adormecido" (tela bloqueada, outra aba): é recriado e acordado
  // dentro do toque do play, com um som mudo de 1 amostra (destrava o áudio no iOS) e a sessão em "playback"
  // (toca mesmo com o iPhone no silencioso).
  const contexto = useCallback(() => {
    try { const sessao = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (sessao) sessao.type = 'playback'; } catch { /* sem suporte */ }
    if (!audio.current || audio.current.ctx.state === 'closed') {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx(), geral = ctx.createGain(), sp = ctx.createChannelSplitter(2), e = ctx.createAnalyser(), d = ctx.createAnalyser();
      e.fftSize = 1024; d.fftSize = 1024; geral.connect(ctx.destination); geral.connect(sp); sp.connect(e, 0); sp.connect(d, 1);
      audio.current = { ctx, geral, e, d };
      for (const s of sons.current.values()) s.buffers = new WeakMap(); // os buffers do tocador antigo não servem no novo
    }
    const ctx = audio.current.ctx;
    if (ctx.state !== 'running') {
      void ctx.resume();
      try { const mudo = ctx.createBufferSource(); mudo.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); mudo.connect(ctx.destination); mudo.start(0); } catch { /* nada */ }
    }
    return audio.current;
  }, []);
  const pararSom = useCallback((voltar: boolean) => {
    const r = reproducao.current; if (!r) return;
    cancelAnimationFrame(r.raf); for (const f of r.fontes) { try { f.stop(); } catch { /* já parou */ } }
    reproducao.current = null; setTocando(false);
    if (medidorE.current) medidorE.current.style.width = '0%'; if (medidorD.current) medidorD.current.style.width = '0%';
    moverCursor(voltar ? r.origem : cursorRef.current);
  }, [moverCursor]);

  const medir = useCallback(() => {
    const a = audio.current; if (!a) return;
    const buf = new Float32Array(a.e.fftSize);
    const pk = (an: AnalyserNode) => { an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v)); return m; };
    const largo = (m: number) => `${Math.max(0, Math.min(100, ((20 * Math.log10(m || 1e-6) + 60) / 60) * 100))}%`;
    const pe = pk(a.e), pd = pk(a.d);
    if (medidorE.current) { medidorE.current.style.width = largo(pe); medidorE.current.style.background = pe > 0.98 ? '#f43f5e' : ''; }
    if (medidorD.current) { medidorD.current.style.width = largo(pd); medidorD.current.style.background = pd > 0.98 ? '#f43f5e' : ''; }
  }, []);

  const tocar = useCallback((de?: number) => {
    pararSom(false);
    const a = contexto(), p = projetoRef.current;
    const ini = loop && sel ? sel.a : (de ?? cursorRef.current), ate = loop && sel ? sel.b : fimDoProjeto(p);
    if (ate - ini < 0.01) { if (!loop) moverCursor(0); return; }
    a.geral.gain.value = Math.pow(10, p.volumeGeralDb / 20);
    const t0 = a.ctx.currentTime + 0.04;
    const fontes = agendarProjeto(a.ctx, p, bufferDe, ini, ate, a.geral, t0);
    const r = { fontes, t0, pos0: ini, fim: ate, origem: de ?? cursorRef.current, raf: 0 };
    reproducao.current = r; setTocando(true);
    const passo = () => {
      if (reproducao.current !== r) return;
      const pos = r.pos0 + Math.max(0, a.ctx.currentTime - r.t0);
      cursorRef.current = pos; posicionarLinha(pos); medir();
      // a tela anda junto com o som (a linha fica sempre à vista)
      const el = area.current, x = pos * zoomRef.current;
      if (el && gesto.current?.tipo !== 'rolar' && (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft)) { el.scrollLeft = Math.max(0, x - 40); setRolagem(el.scrollLeft); posicionarLinha(pos); }
      if (pos >= r.fim) { if (loop && sel) { tocar(sel.a); return; } pararSom(false); moverCursor(r.fim); return; }
      r.raf = requestAnimationFrame(passo);
    };
    r.raf = requestAnimationFrame(passo);
  }, [bufferDe, contexto, loop, medir, moverCursor, pararSom, posicionarLinha, sel]);

  const tocarSom = useCallback((s: Som) => {
    pararSom(false);
    const a = contexto(), src = a.ctx.createBufferSource(); src.buffer = paraAudioBuffer(a.ctx, s); src.connect(a.geral);
    const t0 = a.ctx.currentTime + 0.03; src.start(t0);
    const r = { fontes: [src], t0, pos0: cursorRef.current, fim: cursorRef.current, origem: cursorRef.current, raf: 0 };
    reproducao.current = r; setTocando(true);
    const passo = () => { if (reproducao.current !== r) return; medir(); if (a.ctx.currentTime - t0 >= duracaoDoSom(s)) { pararSom(true); return; } r.raf = requestAnimationFrame(passo); };
    r.raf = requestAnimationFrame(passo);
  }, [contexto, medir, pararSom]);

  const alternarPlay = useCallback(() => { if (reproducao.current) pararSom(false); else tocar(); }, [pararSom, tocar]);

  // ——— adicionar sons ———
  const adicionarSom = useCallback((som: Som, nomeDoSom: string, ondeFaixa: 'nova' | string = 'nova', em = 0) => {
    const id = registrarSom(som, nomeDoSom);
    const clipe = novoClipe(id, nomeDoSom, duracaoDoSom(som), em);
    alterar((p) => {
      if (ondeFaixa !== 'nova' && p.faixas.some((f) => f.id === ondeFaixa)) return trocarFaixa(p, ondeFaixa, (f) => ({ ...f, clipes: [...f.clipes, clipe] }));
      const f = novaFaixa(p, nomeDoSom.replace(/\.[a-z0-9]+$/i, '').slice(0, 40));
      setFaixaSel(f.id);
      return { ...p, faixas: [...p.faixas, { ...f, clipes: [clipe] }] };
    });
    setClipeSel(clipe.id);
    return clipe;
  }, [alterar, registrarSom]);

  const abrirArquivos = useCallback(async (arquivos: FileList | File[], faixaId: 'nova' | string = 'nova', em = 0) => {
    const lista = Array.from(arquivos); if (!lista.length) return;
    setOcupado(`Abrindo ${lista.length} arquivo${lista.length > 1 ? 's' : ''}…`);
    for (const a of lista) {
      try {
        const dados = await a.arrayBuffer(), marca = lerMarcaDoStudio(new Uint8Array(dados));
        adicionarSom(await decodificarArquivo(dados), marca ? marca.nome : a.name, faixaId, em);
        if (marca) toast.success(`"${marca.nome}" foi editado no SOBRE MÍDIA Studio (versão ${marca.versao}, ${new Date(marca.editadoEm).toLocaleDateString('pt-BR')}).`);
      }
      catch { toast.error(`Não consegui abrir "${a.name}". Use MP3, WAV, OGG, M4A, AAC, FLAC, WEBM ou um vídeo MP4.`); }
    }
    setOcupado(null);
  }, [adicionarSom]);

  const adicionarDoStudio = useCallback(async (src: string, nomeDoSom: string) => {
    setSonsAbertos(false); setFolha(null); setOcupado(`Baixando "${nomeDoSom}"…`);
    try {
      const r = await fetch(src); if (!r.ok) throw new Error(String(r.status));
      adicionarSom(await decodificarArquivo(await r.arrayBuffer()), nomeDoSom, faixaSel ?? 'nova', faixaSel ? cursorRef.current : 0);
    } catch { toast.error('Não foi possível baixar esse som.'); }
    setOcupado(null);
  }, [adicionarSom, faixaSel]);

  // ——— gravar ———
  const gravar = useCallback(async () => {
    if (gravador.current) { gravador.current.rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const rec = new MediaRecorder(stream), partes: Blob[] = [], inicio = cursorRef.current;
      rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); gravador.current = null; setGravando(null); pararSom(false);
        try {
          const som = await decodificarArquivo(await new Blob(partes, { type: rec.mimeType }).arrayBuffer());
          adicionarSom(som, `Gravação ${new Date().toLocaleTimeString('pt-BR')}`, 'nova', inicio);
          toast.success('Gravação adicionada numa faixa nova.');
        } catch { toast.error('Não foi possível ler a gravação.'); }
      };
      gravador.current = { rec, stream, partes };
      rec.start(250); setGravando({ inicio, desde: Date.now() });
      if (tocarAoGravar && projetoRef.current.faixas.length) tocar(inicio);
    } catch { toast.error('O navegador não liberou o microfone. Permita o microfone para este site e tente de novo.'); }
  }, [adicionarSom, pararSom, tocar, tocarAoGravar]);
  const [, setTique] = useState(0);
  useEffect(() => { if (!gravando) return; const i = setInterval(() => setTique((x) => x + 1), 250); return () => clearInterval(i); }, [gravando]);

  // ——— edição ———
  const alvos = useCallback((p: Projeto) => (emTodas ? p.faixas : p.faixas.filter((f) => f.id === faixaSel)), [emTodas, faixaSel]);

  const copiar = useCallback(() => {
    if (sel && faixaAtual) { area_transferencia.current = copiarIntervalo(faixaAtual, sel.a, sel.b); toast.success('Trecho copiado.'); return true; }
    if (clipeAtual) { area_transferencia.current = [{ ...clipeAtual.clipe, inicio: 0 }]; toast.success('Clipe copiado.'); return true; }
    toast.message('Marque um trecho ou escolha um clipe para copiar.'); return false;
  }, [clipeAtual, faixaAtual, sel]);
  const apagar = useCallback(() => {
    if (sel && sel.b - sel.a > 0.0005) {
      const ids = new Set(alvos(projetoRef.current).map((f) => f.id));
      alterar((p) => ({ ...p, faixas: p.faixas.map((f) => (ids.has(f.id) ? apagarIntervalo(f, sel.a, sel.b, true) : f)) }));
      moverCursor(sel.a); setSel(null); setClipeSel(null); return;
    }
    if (clipeSel) { alterar((p) => ({ ...p, faixas: p.faixas.map((f) => ({ ...f, clipes: f.clipes.filter((c) => c.id !== clipeSel) })) })); setClipeSel(null); }
  }, [alterar, alvos, clipeSel, moverCursor, sel]);
  const cortar = useCallback(() => {
    if (sel && faixaAtual) { copiar(); apagar(); return; }
    // corta o clipe onde está a linha amarela (na faixa escolhida; senão, em toda faixa que tiver áudio ali)
    const tc = cursorRef.current, p0 = projetoRef.current;
    const temAli = (x: Faixa) => x.clipes.some((c) => tc > c.inicio + 0.001 && tc < fimDoClipe(c) - 0.001);
    let ids = (emTodas ? p0.faixas : p0.faixas.filter((x) => x.id === faixaSel)).filter(temAli).map((x) => x.id);
    if (!ids.length) ids = p0.faixas.filter(temAli).map((x) => x.id);
    if (ids.length) {
      const alvo = new Set(ids);
      alterar((p) => ({ ...p, faixas: p.faixas.map((x) => (alvo.has(x.id) ? dividirFaixa(x, tc) : x)) }));
      setClipeSel(null);
      toast.success(`Cortado em ${formatarTempo(tc)}. Toque numa parte para escolher: arraste para mover ou toque em Apagar.`);
      return;
    }
    if (clipeAtual) { copiar(); apagar(); return; }
    toast.message('Ponha a linha amarela em cima do clipe e toque em Cortar.');
  }, [alterar, apagar, clipeAtual, copiar, emTodas, faixaAtual, faixaSel, sel]);
  const colarAqui = useCallback(() => {
    const cs = area_transferencia.current; if (!cs.length) { toast.message('Nada copiado ainda.'); return; }
    const t = sel ? sel.a : cursorRef.current;
    alterar((p) => {
      if (faixaSel && p.faixas.some((f) => f.id === faixaSel)) {
        const base = sel ? trocarFaixa(p, faixaSel, (f) => apagarIntervalo(f, sel.a, sel.b, true)) : p;
        return trocarFaixa(base, faixaSel, (f) => colar(f, t, cs, true));
      }
      const f = novaFaixa(p); setFaixaSel(f.id);
      return { ...p, faixas: [...p.faixas, colar(f, t, cs, true)] };
    });
    const dur = cs.reduce((m, c) => Math.max(m, fimDoClipe(c)), 0); setSel(null); moverCursor(t + dur);
  }, [alterar, faixaSel, moverCursor, sel]);
  const dividir = useCallback(() => {
    const pontos = sel ? [sel.a, sel.b] : [cursorRef.current];
    const ids = new Set((faixaSel || emTodas ? alvos(projetoRef.current) : projetoRef.current.faixas).map((f) => f.id));
    alterar((p) => ({ ...p, faixas: p.faixas.map((f) => (ids.has(f.id) ? pontos.reduce((g, t) => dividirFaixa(g, t), f) : f)) }));
  }, [alterar, alvos, emTodas, faixaSel, sel]);
  const manterSelecao = useCallback(() => {
    if (!sel || sel.b - sel.a < 0.001) { toast.message('Arraste na faixa para marcar um trecho primeiro.'); return; }
    const ids = new Set(alvos(projetoRef.current).map((f) => f.id));
    alterar((p) => ({ ...p, faixas: p.faixas.map((f) => (ids.has(f.id) ? { ...f, clipes: copiarIntervalo(f, sel.a, sel.b).map((c) => ({ ...c, inicio: c.inicio + sel.a })) } : f)) }));
  }, [alterar, alvos, sel]);
  const duplicar = useCallback(() => {
    if (!clipeAtual) { toast.message('Escolha um clipe para duplicar.'); return; }
    const c = clipeAtual.clipe, novo = { ...c, id: novoId('clipe'), inicio: fimDoClipe(c) };
    alterar((p) => trocarFaixa(p, clipeAtual.faixa.id, (f) => ({ ...f, clipes: [...f.clipes, novo] })));
    setClipeSel(novo.id);
  }, [alterar, clipeAtual]);
  const inserirSilencio = useCallback(() => {
    const t = cursorRef.current, d = Math.max(0.01, silencioSeg);
    const ids = new Set(alvos(projetoRef.current).map((f) => f.id));
    if (!ids.size) { toast.message('Escolha uma faixa (toque no nome dela) ou ligue "Todas as faixas".'); return; }
    alterar((p) => ({ ...p, faixas: p.faixas.map((f) => (ids.has(f.id) ? abrirEspaco(f, t, d) : f)) }));
  }, [alterar, alvos, silencioSeg]);
  const selecionarTudo = useCallback(() => {
    const f = faixaAtual ?? projetoRef.current.faixas[0]; if (!f) return;
    setFaixaSel(f.id); setSel({ a: 0, b: emTodas ? fimDoProjeto(projetoRef.current) : fimDaFaixa(f) });
  }, [emTodas, faixaAtual]);

  /** aplica um processamento no trecho marcado (ou no clipe escolhido / faixa inteira) */
  const processar = useCallback(async (nomeDoProcesso: string, fn: (s: Som) => Promise<Som> | Som, previa = false) => {
    const p = projetoRef.current;
    let faixas: Faixa[] = [], a = 0, b = 0;
    if (sel && sel.b - sel.a > 0.0005) { faixas = alvos(p); a = sel.a; b = sel.b; }
    else if (clipeAtual) { faixas = [clipeAtual.faixa]; a = clipeAtual.clipe.inicio; b = fimDoClipe(clipeAtual.clipe); }
    else if (faixaAtual) { faixas = [faixaAtual]; a = 0; b = fimDaFaixa(faixaAtual); }
    if (!faixas.length || b - a < 0.0005) { toast.message('Marque um trecho, escolha um clipe ou uma faixa.'); return; }
    setOcupado(`${previa ? 'Preparando a prévia' : 'Aplicando'}: ${nomeDoProcesso}…`);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const trocas: Array<{ faixa: Faixa; novos: Array<{ id: string; somId: string; duracao: number }> }> = [];
      const previas: Som[] = [];
      for (const f of faixas) {
        const { faixa, dentro } = clipesNoIntervalo(f, a, b);
        const novos: Array<{ id: string; somId: string; duracao: number }> = [];
        for (const c of dentro) {
          const info = sons.current.get(c.somId); if (!info) continue;
          const saida = await fn(recortar(info.som, c.deslocamento, c.deslocamento + c.duracao));
          if (previa) { previas.push(saida); continue; }
          novos.push({ id: c.id, somId: registrarSom(saida, `${info.nome}`), duracao: duracaoDoSom(saida) });
        }
        trocas.push({ faixa, novos });
      }
      if (previa) { if (previas.length) tocarSom(previas.reduce((x, y) => juntar(x, y))); else toast.message('Não há som nesse trecho.'); }
      else {
        const porId = new Map(trocas.map((t) => [t.faixa.id, t]));
        alterar((q) => ({ ...q, faixas: q.faixas.map((f) => { const t = porId.get(f.id); return t ? trocarSomDosClipes(t.faixa, t.novos) : f; }) }));
        toast.success(`${nomeDoProcesso} aplicado.`);
      }
    } catch (e) { toast.error(`Não foi possível aplicar (${e instanceof Error ? e.message : 'erro'}).`); }
    setOcupado(null);
  }, [alterar, alvos, clipeAtual, faixaAtual, registrarSom, sel, tocarSom]);

  const efeito = efeitoPorId(efeitoId)!;
  const escolherEfeito = (e: Efeito) => { setEfeitoId(e.id); setValores(valoresPadrao(e)); };

  // ——— zoom ———
  const zoomPara = useCallback((z: number, foco?: number) => {
    const el = area.current, novo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const t = foco ?? cursorRef.current, x = t * zoom - (el?.scrollLeft ?? 0);
    setZoom(novo);
    requestAnimationFrame(() => { if (el) { el.scrollLeft = Math.max(0, t * novo - x); setRolagem(el.scrollLeft); } });
  }, [zoom]);
  const ajustar = useCallback(() => { const f = fimDoProjeto(projetoRef.current); if (f > 0) { setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (largura - 20) / f))); requestAnimationFrame(() => { if (area.current) { area.current.scrollLeft = 0; setRolagem(0); } }); } }, [largura]);

  // ——— mouse nas faixas ———
  const tempoDoMouse = (e: { clientX: number }) => { const r = area.current!.getBoundingClientRect(); return Math.max(0, (e.clientX - r.left + area.current!.scrollLeft) / zoom); };
  const imantar = (t: number, ignorar?: string) => {
    if (!ima) return t;
    const tol = 8 / zoom, pontos = [0, cursorRef.current, ...projetoRef.current.faixas.flatMap((f) => f.clipes.filter((c) => c.id !== ignorar).flatMap((c) => [c.inicio, fimDoClipe(c)]))];
    let melhor = t, d = tol; for (const p of pontos) if (Math.abs(p - t) < d) { d = Math.abs(p - t); melhor = p; }
    return melhor;
  };
  const comecarPinca = () => {
    const g = gesto.current;
    if (g?.tipo === 'espera') clearTimeout(g.timer);
    if (g?.tipo === 'selecao') setSel(null);
    if (g && (g.tipo === 'mover' || g.tipo === 'aparar')) { cancelAnimationFrame((g as { raf?: number }).raf ?? 0); setArrastando(false); const antes = passado.current.pop(); if (antes) { projetoRef.current = antes; setProjeto(antes); } }
    // F-337: o 1º dedo caiu na linha amarela: ela volta para onde estava e NÃO segue os dedos da pinça
    if (g?.tipo === 'cursor') { cancelAnimationFrame(g.raf); moverCursor(g.cursor0); }
    const [a, b] = [...dedos.current.values()], el = area.current!, r = el.getBoundingClientRect();
    const xm = (a.x + b.x) / 2 - r.left;
    gesto.current = { tipo: 'pinca', dist0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), zoom0: zoom, tempo0: (xm + el.scrollLeft) / zoom, x0: xm };
    setSel(null);
  };
  const aoApertar = (f: Faixa) => (e: PE<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    capturar(e);
    if (e.pointerType === 'touch' && dedos.current.size > 1) return; // pinça em andamento
    const t = tempoDoMouse(e), y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    const dedo = e.pointerType === 'touch';
    setFaixaSel(f.id);
    if (ferramenta === 'tesoura') {
      const cortarAqui = () => { const tc = imantar(t), ids = new Set(emTodas ? projetoRef.current.faixas.map((x) => x.id) : [f.id]);
        alterar((p) => ({ ...p, faixas: p.faixas.map((x) => (ids.has(x.id) ? dividirFaixa(x, tc) : x)) }));
        moverCursor(tc); setSel(null); };
      if (dedo) { esperarDedo(e, cortarAqui, cortarAqui); return; }
      cortarAqui(); return;
    }
    const borda = dedo ? BORDA * 2 : BORDA; // o dedo é mais grosso que o mouse
    const sob = [...f.clipes].reverse().find((c) => t >= c.inicio - borda / zoom && t <= fimDoClipe(c) + borda / zoom);
    const dentro = !!sob && t >= sob.inicio && t <= fimDoClipe(sob);
    let acao: () => void;
    const xIni = sob ? sob.inicio * zoom : 0, xFim = sob ? fimDoClipe(sob) * zoom : 0, x = t * zoom;
    if (dedo) {
      const ti = imantar(t), cursorAqui = () => { if (reproducao.current) tocar(ti); else moverCursor(ti); };
      if (marcandoTrecho) { setClipeSel(dentro && sob ? sob.id : null); setSel(null); if (reproducao.current) pararSom(false); moverCursor(ti); gesto.current = { tipo: 'selecao', faixaId: f.id, ancora: ti }; return; }
      // F-333 (regra do dono): PASSAR O DEDO no clipe ROLA a linha do tempo (como a régua) — o clipe não vem junto.
      // Só SEGURAR ~0,4 s e arrastar move o clipe (ou apara, na borda). Toque rápido: escolhe o clipe e põe a linha amarela ali.
      const escolher = () => { if (sob && dentro) setClipeSel(sob.id); else setClipeSel(null); setSel(null); cursorAqui(); };
      if (sob && Math.abs(x - xIni) <= borda && sob.duracao * zoom > borda * 3) { esperarDedo(e, () => { marcarHistorico(); gesto.current = { tipo: 'aparar', clipeId: sob.id, lado: 'inicio' }; setClipeSel(sob.id); setSel(null); }, escolher); return; }
      if (sob && Math.abs(x - xFim) <= borda) { esperarDedo(e, () => { marcarHistorico(); gesto.current = { tipo: 'aparar', clipeId: sob.id, lado: 'fim' }; setClipeSel(sob.id); setSel(null); }, escolher); return; }
      if (sob && dentro) {
        esperarDedo(e, () => {
          setClipeSel(sob.id); setSel(null); marcarHistorico();
          const g: Extract<Gesto, { tipo: 'mover' }> = { tipo: 'mover', clipeId: sob.id, desvio: t - sob.inicio, moveu: false, x: e.clientX, y: e.clientY, raf: 0, origem: f.id, x0: e.clientX, y0: e.clientY };
          gesto.current = g; rolarArrastando(g);
        }, escolher);
        return;
      }
      // espaço vazio: deslizar rola o áudio; tocar põe a linha amarela e tira a escolha
      esperarDedo(e, () => {}, () => { setClipeSel(null); setSel(null); cursorAqui(); }); return;
    }
    if (sob && Math.abs(x - xIni) <= borda && sob.duracao * zoom > borda * 3) acao = () => { marcarHistorico(); gesto.current = { tipo: 'aparar', clipeId: sob.id, lado: 'inicio' }; setClipeSel(sob.id); };
    else if (sob && Math.abs(x - xFim) <= borda) acao = () => { marcarHistorico(); gesto.current = { tipo: 'aparar', clipeId: sob.id, lado: 'fim' }; setClipeSel(sob.id); };
    else if (sob && dentro && (y <= TITULO + 2 || ferramenta === 'mover' || e.altKey || (dedo && clipeSel === sob.id))) acao = () => {
      marcarHistorico();
      const g: Extract<Gesto, { tipo: 'mover' }> = { tipo: 'mover', clipeId: sob.id, desvio: t - sob.inicio, moveu: false, x: e.clientX, y: e.clientY, raf: 0, origem: f.id };
      gesto.current = g; setClipeSel(sob.id); setSel(null); setArrastando(true); rolarArrastando(g);
    };
    else acao = () => {
      setClipeSel(dentro && sob ? sob.id : null);
      if (reproducao.current) pararSom(false);
      const ti = imantar(t); moverCursor(ti); setSel(null);
      gesto.current = { tipo: 'selecao', faixaId: f.id, ancora: ti };
    };
    if (dedo && ferramenta !== 'mover') {
      // um toque rápido só põe o cursor (e escolhe o clipe); com o som tocando, pula para lá
      const toque = () => { setClipeSel(dentro && sob ? sob.id : null); setSel(null); const ti = imantar(t); if (reproducao.current) tocar(ti); else moverCursor(ti); };
      esperarDedo(e, acao, toque); return;
    }
    acao();
  };
  /** o dedo encostou: se andar, ROLA; se segurar parado ~0,4 s, liga a seleção/arrasto (vibra); se soltar logo, é um toque */
  const esperarDedo = (e: { clientX: number; clientY: number }, acao: () => void, toque: () => void) => {
    const el = area.current!, vert = el.closest<HTMLElement>('.overflow-y-auto');
    const g: Extract<Gesto, { tipo: 'espera' }> = { tipo: 'espera', x0: e.clientX, y0: e.clientY, scroll0: el.scrollLeft, scrollY0: vert?.scrollTop ?? 0, acao, toque, timer: 0 };
    g.timer = window.setTimeout(() => { if (gesto.current !== g) return; gesto.current = null; acao(); try { navigator.vibrate?.(15); } catch { /* sem vibração */ } }, 380);
    gesto.current = g;
  };
  const aoMover = (e: PE<HTMLElement>) => {
    if (e.pointerType === 'touch' && dedos.current.has(e.pointerId)) dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current; if (!g) return;
    if (g.tipo === 'pinca') {
      if (dedos.current.size < 2) return;
      const [a, b] = [...dedos.current.values()], el = area.current!, r = el.getBoundingClientRect();
      const novo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, g.zoom0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist0)));
      const xm = (a.x + b.x) / 2 - r.left;
      // F-337: a linha amarela fica PARADA no mesmo ponto da onda (o cursor não muda; só é redesenhada no zoom novo)
      zoomRef.current = novo; setZoom(novo);
      el.scrollLeft = Math.max(0, g.tempo0 * novo - xm);
      requestAnimationFrame(() => { el.scrollLeft = Math.max(0, g.tempo0 * novo - xm); setRolagem(el.scrollLeft); posicionarLinha(cursorRef.current); });
      posicionarLinha(cursorRef.current);
      return;
    }
    if (g.tipo === 'espera') {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 9) return;
      clearTimeout(g.timer); gesto.current = { tipo: 'rolar', x0: g.x0, y0: g.y0, scroll0: g.scroll0, scrollY0: g.scrollY0 };
    }
    const gg = gesto.current;
    if (gg?.tipo === 'rolar') {
      const el = area.current!, vert = el.closest<HTMLElement>('.overflow-y-auto');
      el.scrollLeft = Math.max(0, gg.scroll0 - (e.clientX - gg.x0));
      if (vert) vert.scrollTop = Math.max(0, gg.scrollY0 - (e.clientY - gg.y0));
      return;
    }
    if (gg?.tipo === 'cursor') { gg.x = e.clientX; moverCursor(Math.max(0, tempoDoMouse(e))); if (performance.now() - gg.ultimo > 60) passoDaBorda(gg); return; }
    if (!gg) return;
    const t = tempoDoMouse(e);
    if (g.tipo === 'selecao' || g.tipo === 'regua') {
      if (g.tipo === 'regua') { moverCursor(imantar(t)); return; }
      const b = imantar(t); if (Math.abs(b - g.ancora) * zoom < 3) { setSel(null); return; }
      setSel({ a: Math.min(g.ancora, b), b: Math.max(g.ancora, b) });
      const el = area.current!; const x = e.clientX - el.getBoundingClientRect().left;
      if (x > el.clientWidth - 40) el.scrollLeft += 40; else if (x < 40) el.scrollLeft = Math.max(0, el.scrollLeft - 40);
      return;
    }
    if (g.tipo === 'mover') {
      g.x = e.clientX; g.y = e.clientY;
      // no dedo, só começa a mover depois de andar um pouco (um toque não arrasta o clipe sem querer)
      if (!g.moveu && g.x0 != null && g.y0 != null && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 8) return;
      if (!g.moveu) setArrastando(true);
      aplicarMover(g); return;
    }
    if (g.tipo === 'aparar') {
      const achado = acharClipe(projetoRef.current, g.clipeId); const info = achado && sons.current.get(achado.clipe.somId);
      if (!achado || !info) return;
      alterarAoVivo((p) => trocarClipe(p, g.clipeId, (c) => apararClipe(c, g.lado, imantar(t, g.clipeId), duracaoDoSom(info.som))));
    }
  };
  /** o clipe vai para onde o dedo/mouse está: outra faixa, ou a área de baixo cria uma faixa nova */
  const aplicarMover = (g: Extract<Gesto, { tipo: 'mover' }>) => {
    const achado = acharClipe(projetoRef.current, g.clipeId); if (!achado) return;
    const novoInicio = Math.max(0, imantar(tempoDoMouse({ clientX: g.x }) - g.desvio, g.clipeId));
    // F-332: olha ATRAVÉS da linha amarela (que fica embaixo do dedo depois do toque) para achar a faixa ou a área de faixa nova
    const pilha = document.elementsFromPoint(g.x, g.y) as HTMLElement[];
    const alvo = pilha.map((el) => el.closest<HTMLElement>('[data-faixa]')).find(Boolean)?.dataset.faixa, criar = pilha.some((el) => el.closest('[data-nova-faixa]'));
    g.moveu = true;
    alterarAoVivo((p) => {
      const c = { ...achado.clipe, inicio: novoInicio };
      const tirar = (x: Faixa) => ({ ...x, clipes: x.clipes.filter((y) => y.id !== c.id) });
      if (criar && !(g.novaFaixa && achado.faixa.id === g.novaFaixa)) { // cria UMA faixa nova por arrasto
        const nova = { ...novaFaixa(p, `${achado.faixa.nome} (parte)`), clipes: [c] };
        g.novaFaixa = nova.id; setFaixaSel(nova.id);
        return { ...p, faixas: [...p.faixas.map((x) => (x.id === achado.faixa.id ? tirar(x) : x)), nova] };
      }
      if (alvo && alvo !== achado.faixa.id && p.faixas.some((x) => x.id === alvo)) {
        setFaixaSel(alvo);
        return { ...p, faixas: p.faixas.map((x) => (x.id === achado.faixa.id ? tirar(x) : x.id === alvo ? { ...x, clipes: [...x.clipes, c] } : x)) };
      }
      return trocarClipe(p, g.clipeId, () => c);
    });
  };
  /** arrastando um clipe perto da borda: a tela rola sozinha (para levar até o fim do áudio) */
  const rolarArrastando = (g: Extract<Gesto, { tipo: 'mover' }>) => {
    const passo = () => {
      if (gesto.current !== g) return;
      const el = area.current;
      if (el) {
        // F-332: arrastando um CLIPE, só rola com o dedo colado na borda (28 px) e parado ali 0,3 s — antes a faixa larga
        // (18%) pegava o dedo sem querer no celular e o clipe "fugia" para longe de onde o dono soltou
        const r = el.getBoundingClientRect(), x = g.x - r.left, zona = 28;
        let v = 0; if (x > el.clientWidth - zona) v = Math.min(1, (x - (el.clientWidth - zona)) / zona); else if (x < zona && el.scrollLeft > 0) v = -Math.min(1, (zona - x) / zona);
        if (!v) g.bordaDesde = undefined; else if (g.bordaDesde == null) g.bordaDesde = performance.now();
        const parado = g.bordaDesde != null && performance.now() - g.bordaDesde > 300;
        const dv = g.moveu && parado ? velocidadeNaBorda(v) : 0;
        if (dv) { el.scrollLeft = Math.max(0, el.scrollLeft + dv); setRolagem(el.scrollLeft); aplicarMover(g); }
        const vert = el.closest<HTMLElement>('.overflow-y-auto');
        // para cima/baixo: só com o dedo parado na beirada, e nunca em cima da área "faixa nova" (ela fugia do dedo)
        if (vert && parado !== undefined) {
          const rv = vert.getBoundingClientRect(), sobreNova = (document.elementsFromPoint(g.x, g.y) as HTMLElement[]).some((el) => el.closest('[data-nova-faixa]'));
          const vy = sobreNova ? 0 : g.y > rv.bottom - 24 ? 1 : g.y < rv.top + 24 ? -1 : 0;
          if (!vy) g.vertDesde = undefined; else if (g.vertDesde == null) g.vertDesde = performance.now();
          if (vy && g.vertDesde != null && performance.now() - g.vertDesde > 300) vert.scrollTop = Math.max(0, vert.scrollTop + vy * 8);
        }
      }
      g.raf = requestAnimationFrame(passo);
    };
    g.raf = requestAnimationFrame(passo);
  };
  /** soltou o clipe: em cima de outro áudio, ENTRA NO MEIO e empurra o resto para frente */
  const soltarClipe = (g: Extract<Gesto, { tipo: 'mover' }>) => {
    cancelAnimationFrame(g.raf); setArrastando(false);
    if (!g.moveu) { passado.current.pop(); return; } // só um toque: não vira passo do desfazer
    const achado = acharClipe(projetoRef.current, g.clipeId); if (!achado) return;
    const c = achado.clipe, fimC = fimDoClipe(c);
    const outros = achado.faixa.clipes.filter((o) => o.id !== c.id);
    const encosta = outros.some((o) => o.inicio < fimC - 0.005 && fimDoClipe(o) > c.inicio + 0.005);
    if (encosta) {
      alterarAoVivo((p) => trocarFaixa(p, achado.faixa.id, (x) => { const sem = { ...x, clipes: x.clipes.filter((o) => o.id !== c.id) }; const aberta = abrirEspaco(sem, c.inicio, c.duracao); return { ...aberta, clipes: [...aberta.clipes, c].sort((a, b) => a.inicio - b.inicio) }; }));
      toast.success('A parte entrou no meio do áudio: o resto andou para frente.');
    }
    // tira faixas que ficaram vazias por causa deste arrasto (a faixa nova que o clipe deixou)
    if (g.novaFaixa && g.novaFaixa !== achado.faixa.id) alterarAoVivo((p) => ({ ...p, faixas: p.faixas.filter((x) => x.id !== g.novaFaixa || x.clipes.length) }));
    // a faixa "(parte)" de onde o clipe saiu e que ficou vazia também sai
    if (g.origem && g.origem !== achado.faixa.id) alterarAoVivo((p) => ({ ...p, faixas: p.faixas.filter((x) => x.id !== g.origem || x.clipes.length || !x.nome.endsWith('(parte)')) }));
  };
  const aoSoltar = (e?: PE<HTMLElement>) => {
    if (e && e.pointerType === 'touch') dedos.current.delete(e.pointerId);
    if (gesto.current?.tipo === 'pinca') { if (dedos.current.size === 0) gesto.current = null; return; }
    const g = gesto.current; gesto.current = null;
    if (g?.tipo === 'espera') { clearTimeout(g.timer); g.toque(); return; }
    if (g?.tipo === 'cursor') { cancelAnimationFrame(g.raf); if (g.tocava) tocar(cursorRef.current); return; }
    if (g?.tipo === 'mover') soltarClipe(g);
  };

  // ——— teclado ———
  const atalhos = useRef<Record<string, () => void>>({});
  atalhos.current = { alternarPlay, desfazer, refazer, cortar, copiar: () => void copiar(), colar: colarAqui, apagar, dividir, duplicar, selecionarTudo, inicio: () => { pararSom(false); moverCursor(0); }, fim: () => { pararSom(false); moverCursor(fimDoProjeto(projetoRef.current)); }, mais: () => zoomPara(zoom * 1.6), menos: () => zoomPara(zoom / 1.6), loop: () => setLoop((v) => !v), escapar: () => { setSel(null); setClipeSel(null); } };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (ehCampo(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey, a = atalhos.current, t = e.key.toLowerCase();
      const fazer = (f: () => void) => { e.preventDefault(); f(); };
      if (t === ' ') return fazer(a.alternarPlay);
      if (ctrl && t === 'z' && e.shiftKey) return fazer(a.refazer);
      if (ctrl && t === 'z') return fazer(a.desfazer);
      if (ctrl && t === 'y') return fazer(a.refazer);
      if (ctrl && t === 'x') return fazer(a.cortar);
      if (ctrl && t === 'c') return fazer(a.copiar);
      if (ctrl && t === 'v') return fazer(a.colar);
      if (ctrl && t === 'd') return fazer(a.duplicar);
      if (ctrl && t === 'a') return fazer(a.selecionarTudo);
      if (ctrl) return;
      if (t === 'delete' || t === 'backspace') return fazer(a.apagar);
      if (t === 's') return fazer(a.dividir);
      if (t === 'home') return fazer(a.inicio);
      if (t === 'end') return fazer(a.fim);
      if (t === '+' || t === '=') return fazer(a.mais);
      if (t === '-') return fazer(a.menos);
      if (t === 'l') return fazer(a.loop);
      if (t === 'escape') return fazer(a.escapar);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  // aviso antes de sair com edição sem baixar (ela fica salva no aparelho, mas o dono é avisado)
  useEffect(() => () => { pararSom(false); gravador.current?.rec.stop(); void audio.current?.ctx.close(); }, [pararSom]);

  // ——— exportar ———
  const [exp, setExp] = useState<{ formato: FormatoDeAudio; kbps: number; sr: number; canais: 1 | 2; intervalo: 'tudo' | 'selecao'; normalizar: boolean }>({ formato: 'mp3', kbps: 192, sr: 44100, canais: 2, intervalo: 'tudo', normalizar: false });
  const baixar = useCallback(async () => {
    const p = projetoRef.current; if (!p.faixas.some((f) => f.clipes.length)) { toast.message('Não há áudio para baixar.'); return; }
    const de = exp.intervalo === 'selecao' && sel ? sel.a : 0, ate = exp.intervalo === 'selecao' && sel ? sel.b : fimDoProjeto(p);
    setOcupado('Gerando o arquivo…'); await new Promise((r) => setTimeout(r, 30));
    try {
      const som = await renderizarProjeto(p, bufferDe, { de, ate, sr: exp.sr, canais: exp.canais, normalizarDb: exp.normalizar ? -1 : null });
      const marca: MarcaDoStudio = { nome: nome.trim() || 'Áudio', codigo: pastaId ?? novoId('edicao'), versao: versao || 1, editadoEm: new Date().toISOString() };
      const { bytes, tipo, ext } = codificar(som, exp.formato, exp.kbps, marca);
      const arquivo = `${(nome.trim() || 'audio').replace(/[\\/:*?"<>|]+/g, '-')}.${ext}`;
      baixarArquivo(bytes, tipo, arquivo);
      toast.success(`Baixado: ${arquivo} (${(bytes.length / 1048576).toFixed(1)} MB, ${formatarTempo(ate - de)}).`);
      setExportar(false);
    } catch (e) { toast.error(`Não foi possível gerar o arquivo (${e instanceof Error ? e.message : 'erro'}).`); }
    setOcupado(null);
  }, [bufferDe, exp, nome, pastaId, sel, versao]);

  // ——— Biblioteca de Áudios no sistema da SOBRE MÍDIA (F-328) ———
  const temAudio = () => projetoRef.current.faixas.some((x) => x.clipes.length > 0);
  const mudouDesdeQueGuardou = () => salvoRef.current !== projetoRef.current;
  const limparTela = useCallback(() => {
    pararSom(false); passado.current = []; futuro.current = []; sons.current.clear(); urls.current.clear();
    const p = projetoVazio(); projetoRef.current = p; setProjeto(p); setSel(null); setClipeSel(null); setFaixaSel(null); moverCursor(0);
    setNome('Minha edição'); setPastaId(null); setVersao(0); setEdicaoTipo(null); salvoRef.current = null; ultimaEdicao.current = Date.now(); void apagarDoAparelho();
  }, [moverCursor, pararSom]);
  /** guarda a edição da tela no sistema (envia só os sons que ainda não estão lá) */
  const guardarNoSistema = async (tipo: TipoDeEdicao, comoNovo = false): Promise<string> => {
    const mapa = new Map([...sons.current].map(([id, s]) => [id, { nome: s.nome, som: s.som }]));
    const porCima = !comoNovo && !!pastaId;
    const v = tipo === 'salvo' ? (porCima && edicaoTipo === 'salvo' ? (versao || 1) + 1 : 1) : (versao || 1);
    const id = await guardarEdicao({ id: porCima ? pastaId : null, tipo, nome, versao: v, projeto: projetoRef.current, sons: mapa, urls: urls.current,
      aoEnviar: (a, b) => setOcupado(`Enviando os sons para o sistema (${a} de ${b})…`) });
    setPastaId(id); setVersao(v); setEdicaoTipo(tipo); salvoRef.current = projetoRef.current;
    return id;
  };
  const atualizarPasta = useCallback(async () => {
    setCarregandoBiblioteca(true);
    try { setItens(await listarEdicoes()); } catch { toast.error('Não foi possível abrir a Biblioteca de Áudios.'); }
    setItensDaPasta(await listarPasta()); setCarregandoBiblioteca(false);
  }, []);
  /** SALVAR: vai para a Biblioteca (salvos) e a tela volta do zero para uma nova edição */
  const salvarNaPastaAgora = async (comoNovo: boolean) => {
    if (!temAudio()) { toast.message('Não há áudio para salvar.'); return; }
    const nomeLimpo = nome.trim() || 'Áudio sem nome';
    setOcupado('Salvando na Biblioteca de Áudios…');
    try {
      await guardarNoSistema('salvo', comoNovo);
      setSalvarAberto(false); limparTela(); setAnterior(null);
      toast.success(`"${nomeLimpo}" salvo na Biblioteca de Áudios. A tela está pronta para uma nova edição.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    setOcupado(null);
  };
  /** guarda o que está na tela como RASCUNHO (se tiver algo não guardado) e começa do zero */
  const arquivarERecomecar = async (motivo: 'tempo' | 'nova') => {
    if (!temAudio()) { limparTela(); return; }
    const nomeAtual = nome.trim() || 'Áudio sem nome';
    let id = pastaId; const onde: TipoDeEdicao = edicaoTipo === 'salvo' ? 'salvo' : 'rascunho';
    if (mudouDesdeQueGuardou() || !id) {
      setOcupado('Guardando a edição nos rascunhos…');
      try { id = await guardarNoSistema(edicaoTipo === 'salvo' ? 'salvo' : 'rascunho'); }
      catch (e) { setOcupado(null); toast.error(`A edição não foi guardada (${e instanceof Error ? e.message : 'erro'}). Ela continua na tela.`); return; }
      setOcupado(null);
    }
    limparTela();
    if (id) setAnterior({ id, nome: nomeAtual, motivo, onde });
  };
  aoFicarParado.current = () => { void arquivarERecomecar('tempo'); };
  // ficou parado muito tempo com a tela aberta: vira rascunho e começa do zero
  useEffect(() => {
    const ver = () => {
      if (document.visibilityState !== 'visible' || reproducao.current || gravador.current || gesto.current) return;
      if (temAudio() && Date.now() - ultimaEdicao.current > PARADO_MS) aoFicarParado.current?.();
    };
    const i = setInterval(ver, 60_000); document.addEventListener('visibilitychange', ver);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', ver); };
  }, []);
  const abrirDaPasta = async (item: { id: string; nome: string }) => {
    if (temAudio() && mudouDesdeQueGuardou() && item.id !== pastaId) {
      setOcupado('Guardando a edição da tela nos rascunhos…');
      try { await guardarNoSistema(edicaoTipo === 'salvo' ? 'salvo' : 'rascunho'); } catch { setOcupado(null); toast.error('A edição da tela não foi guardada; abra de novo depois.'); return; }
    }
    setOcupado(`Abrindo "${item.nome}"…`);
    try {
      const d = await abrirEdicao(item.id, (a, b) => setOcupado(`Baixando os sons (${a} de ${b})…`));
      pararSom(false); passado.current = []; futuro.current = []; sons.current.clear(); urls.current.clear();
      for (const [id, s] of d.sons) { registrarSom(s.som, s.nome, id); urls.current.set(id, s.url); }
      projetoRef.current = d.projeto; setProjeto(d.projeto); salvoRef.current = d.projeto;
      setNome(d.edicao.nome); setPastaId(d.edicao.id); setVersao(d.edicao.versao); setEdicaoTipo(d.edicao.tipo);
      setSel(null); setClipeSel(null); setFaixaSel(d.projeto.faixas[0]?.id ?? null); moverCursor(0); setPastaAberta(false); setAnterior(null);
      toast.success(d.edicao.tipo === 'rascunho' ? `Voltou para "${d.edicao.nome}" de onde parou.` : `"${d.edicao.nome}" aberto para editar (versão ${d.edicao.versao}).`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível abrir.'); }
    setOcupado(null);
  };
  /** áudios antigos que ficaram só neste aparelho (antes do F-328): abre na tela; ao salvar, vão para o sistema */
  const abrirDoAparelho = async (item: AudioNaPasta) => {
    const d = await lerDaPasta(item.id); if (!d) return;
    pararSom(false); passado.current = []; futuro.current = []; sons.current.clear(); urls.current.clear();
    for (const [id, s] of Object.entries(d.sons)) registrarSom(s.som, s.nome, id);
    projetoRef.current = d.projeto; setProjeto(d.projeto); salvoRef.current = null;
    setNome(item.nome); setPastaId(null); setVersao(0); setEdicaoTipo(null); setFaixaSel(d.projeto.faixas[0]?.id ?? null); moverCursor(0); setPastaAberta(false);
    toast.success(`"${item.nome}" aberto. Toque em Salvar para mandar para a Biblioteca do sistema.`);
  };
  const baixarDaPasta = async (item: EdicaoNoSistema) => {
    setOcupado(`Gerando "${item.nome}"…`);
    try {
      const d = await abrirEdicao(item.id);
      const cache = new Map<string, AudioBuffer>();
      const som = await renderizarProjeto(d.projeto, (ctx, id) => { const s = d.sons.get(id); if (!s) return null; let b = cache.get(id); if (!b) { b = paraAudioBuffer(ctx, s.som); cache.set(id, b); } return b; }, { sr: 44100, canais: 2 });
      const { bytes, tipo, ext } = codificar(som, 'mp3', 192, { nome: item.nome, codigo: item.id, versao: item.versao, editadoEm: item.atualizado_em });
      baixarArquivo(bytes, tipo, `${item.nome.replace(/[\\/:*?"<>|]+/g, '-')}.${ext}`);
    } catch { toast.error('Não foi possível baixar esse áudio.'); }
    setOcupado(null);
  };
  const duplicarNaPasta = async (item: EdicaoNoSistema) => { await duplicarEdicao(item.id); void atualizarPasta(); toast.success('Cópia criada.'); };
  /** NOVA EDIÇÃO: o que está na tela vai para os rascunhos e abre uma tela do zero */
  const novoProjeto = () => { void arquivarERecomecar('nova'); };

  const entrada = useRef<HTMLInputElement>(null);
  const porGrupo = useMemo(() => GRUPOS.map((g) => ({ g, lista: EFEITOS.filter((e) => e.grupo === g) })), []);
  const alvoTexto = sel && sel.b - sel.a > 0.0005
    ? `Trecho ${formatarTempo(sel.a)} → ${formatarTempo(sel.b)} ${emTodas ? '(todas as faixas)' : faixaAtual ? `em "${faixaAtual.nome}"` : ''}`
    : clipeAtual ? `Clipe "${clipeAtual.clipe.nome}" inteiro` : faixaAtual ? `Faixa "${faixaAtual.nome}" inteira` : 'Nada escolhido: marque um trecho ou toque num clipe';
  const segGravando = gravando ? (Date.now() - gravando.desde) / 1000 : 0;
  const cab = celular ? CAB_CELULAR : CAB;

  // ——— pedaços da tela usados no computador E no celular ———
  const listaDeSons = (
    <>
      <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-[#B04DFF]">Efeitos sonoros</p>
      {Object.values(SONS).map((s) => <button key={s.src} type="button" onClick={() => void adicionarDoStudio(s.src, s.nome)} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-white/10">{s.nome}</button>)}
      <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[#B04DFF]">Trilhas (livres para uso comercial)</p>
      {TRILHAS.map((t) => <button key={t.id} type="button" onClick={() => void adicionarDoStudio(t.src, t.nome)} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-white/10">{t.nome} <span className="text-xs text-slate-400">· {t.estilo}</span></button>)}
      <p className="px-2 pt-2 text-[11px] text-slate-400">Entra na faixa escolhida, no cursor (ou numa faixa nova).</p>
    </>
  );
  const painelEfeitos = (
    <section className="rounded-2xl border border-white/10 bg-[#140632] p-3">
      <h2 className="text-sm font-black">Efeitos</h2>
      <p className="mt-0.5 text-[11px] text-[#FFD400]" data-testid="editor-audio-alvo">{alvoTexto}</p>
      <select value={efeitoId} onChange={(e) => escolherEfeito(efeitoPorId(e.target.value)!)} aria-label="Escolher efeito" data-testid="editor-audio-efeito"
        className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B0420] px-2 py-2.5 text-sm">
        {porGrupo.map(({ g, lista }) => <optgroup key={g} label={g}>{lista.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</optgroup>)}
      </select>
      <p className="mt-1.5 text-xs text-slate-400">{efeito.descricao}</p>
      <div className="mt-2 flex flex-col gap-2">
        {efeito.ajustes.map((a) => (
          <label key={a.id} className="flex flex-col gap-0.5 text-[11px] text-slate-300">
            <span className="flex justify-between"><span>{a.nome}</span>{a.tipo === 'numero' && <span className="font-mono text-white">{Number(valores[a.id]).toFixed(a.passo < 1 ? (a.passo < 0.1 ? 2 : 1) : 0)} {a.unidade}</span>}</span>
            {a.tipo === 'numero' && <input type="range" min={a.min} max={a.max} step={a.passo} value={Number(valores[a.id])} onChange={(e) => setValores((v) => ({ ...v, [a.id]: Number(e.target.value) }))} className="h-6 accent-[#8A2EFF]" />}
            {a.tipo === 'opcoes' && <select value={String(valores[a.id])} onChange={(e) => setValores((v) => ({ ...v, [a.id]: e.target.value }))} className="rounded-md border border-white/10 bg-[#0B0420] px-2 py-1.5 text-xs">{a.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.nome}</option>)}</select>}
            {a.tipo === 'sim' && <input type="checkbox" checked={!!valores[a.id]} onChange={(e) => setValores((v) => ({ ...v, [a.id]: e.target.checked }))} />}
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={!!ocupado} onClick={() => void processar(efeito.nome, (s) => efeito.aplicar(s, valores), true)} className="flex-1 rounded-lg border border-[#B04DFF]/60 px-3 py-2.5 text-sm font-semibold hover:bg-[#8A2EFF]/20 disabled:opacity-40">Ouvir prévia</button>
        <button type="button" disabled={!!ocupado} onClick={() => void processar(efeito.nome, (s) => efeito.aplicar(s, valores))} data-testid="editor-audio-aplicar" className="flex-1 rounded-lg bg-[#8A2EFF] px-3 py-2.5 text-sm font-bold hover:bg-[#9b47ff] disabled:opacity-40">Aplicar</button>
      </div>
      <button type="button" onClick={() => setValores(valoresPadrao(efeito))} className="mt-2 text-[11px] text-slate-400 underline">voltar aos valores padrão</button>
    </section>
  );
  const painelClipe = clipeAtual && (
    <section className="rounded-2xl border border-white/10 bg-[#140632] p-3" data-testid="editor-audio-clipe">
      <h2 className="text-sm font-black">Clipe</h2>
      <input value={clipeAtual.clipe.nome} onChange={(e) => { const v = e.target.value; alterar((p) => trocarClipe(p, clipeAtual.clipe.id, (c) => ({ ...c, nome: v })), `cn-${clipeAtual.clipe.id}`); }}
        aria-label="Nome do clipe" className="mt-1 w-full rounded-md border border-white/10 bg-[#0B0420] px-2 py-1.5 text-xs" />
      <p className="mt-1 text-[11px] text-slate-400">Começa em {formatarTempo(clipeAtual.clipe.inicio)} · dura {formatarTempo(clipeAtual.clipe.duracao)}</p>
      {([
        ['ganhoDb', 'Volume do clipe', -40, 24, 0.5, 'dB'],
        ['fadeEntrada', 'Fade de entrada', 0, Math.min(30, clipeAtual.clipe.duracao), 0.01, 's'],
        ['fadeSaida', 'Fade de saída', 0, Math.min(30, clipeAtual.clipe.duracao), 0.01, 's'],
      ] as const).map(([k, rotulo, min, max, passo, un]) => (
        <label key={k} className="mt-2 flex flex-col gap-0.5 text-[11px] text-slate-300">
          <span className="flex justify-between"><span>{rotulo}</span><span className="font-mono text-white">{clipeAtual.clipe[k].toFixed(2)} {un}</span></span>
          <input type="range" min={min} max={max} step={passo} value={clipeAtual.clipe[k]} className="h-6 accent-[#8A2EFF]"
            onChange={(e) => { const v = Number(e.target.value); alterar((p) => trocarClipe(p, clipeAtual.clipe.id, (c) => ({ ...c, [k]: v })), `${k}-${clipeAtual.clipe.id}`); }} />
        </label>
      ))}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={duplicar} className="rounded-lg border border-white/10 px-2 py-2 text-xs hover:bg-white/10">Duplicar</button>
        <button type="button" onClick={() => { setSel({ a: clipeAtual.clipe.inicio, b: fimDoClipe(clipeAtual.clipe) }); }} className="rounded-lg border border-white/10 px-2 py-2 text-xs hover:bg-white/10">Marcar o clipe</button>
        <button type="button" onClick={() => { const info = sons.current.get(clipeAtual.clipe.somId); if (info) tocarSom(recortar(info.som, clipeAtual.clipe.deslocamento, clipeAtual.clipe.deslocamento + clipeAtual.clipe.duracao)); }} className="rounded-lg border border-white/10 px-2 py-2 text-xs hover:bg-white/10">Ouvir só ele</button>
        <button type="button" onClick={() => { alterar((p) => ({ ...p, faixas: p.faixas.map((f) => ({ ...f, clipes: f.clipes.filter((c) => c.id !== clipeAtual.clipe.id) })) })); setClipeSel(null); }} className="rounded-lg border border-rose-500/30 px-2 py-2 text-xs text-rose-200 hover:bg-rose-500/15">Apagar</button>
      </div>
    </section>
  );
  const controlesDaFaixa = (f: Faixa, compacto = false) => (
    <>
      <div className="flex items-center gap-1">
        <span className="h-4 w-1.5 shrink-0 rounded" style={{ background: f.cor }} />
        <input value={f.nome} onChange={(e) => { const v = e.target.value; alterar((p) => trocarFaixa(p, f.id, (x) => ({ ...x, nome: v })), `nome-${f.id}`); }}
          aria-label="Nome da faixa" className={cn('min-w-0 flex-1 bg-transparent font-bold focus:outline-none', compacto ? 'text-xs' : 'text-sm')} />
        <button type="button" title="Mudo" onClick={() => alterar((p) => trocarFaixa(p, f.id, (x) => ({ ...x, mudo: !x.mudo })))}
          className={cn('rounded px-1.5 text-[10px] font-black', compacto ? '' : 'py-1', f.mudo ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-300')}>M</button>
        <button type="button" title="Solo (só esta faixa toca)" onClick={() => alterar((p) => trocarFaixa(p, f.id, (x) => ({ ...x, solo: !x.solo })))}
          className={cn('rounded px-1.5 text-[10px] font-black', compacto ? '' : 'py-1', f.solo ? 'bg-[#FFD400] text-[#0B0420]' : 'bg-white/10 text-slate-300')}><Headphones className="inline h-3 w-3" /></button>
        <button type="button" title="Apagar a faixa" onClick={(e) => { e.stopPropagation(); if (f.clipes.length && !window.confirm(`Apagar a faixa "${f.nome}"?`)) return; alterar((p) => ({ ...p, faixas: p.faixas.filter((x) => x.id !== f.id) })); if (faixaSel === f.id) setFaixaSel(null); }}
          className="rounded p-0.5 text-slate-400 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <label className="flex items-center gap-1 text-[10px] text-slate-400">Vol
        <input type="range" min={-60} max={12} step={0.5} value={f.volumeDb} onChange={(e) => { const v = Number(e.target.value); alterar((p) => trocarFaixa(p, f.id, (x) => ({ ...x, volumeDb: v })), `vol-${f.id}`); }} className="min-w-0 flex-1 accent-[#8A2EFF]" />
        <span className="w-11 text-right font-mono">{f.volumeDb <= -60 ? '-∞' : f.volumeDb.toFixed(1)}</span>
      </label>
      <label className="flex items-center gap-1 text-[10px] text-slate-400">E/D
        <input type="range" min={-1} max={1} step={0.05} value={f.pan} onDoubleClick={() => alterar((p) => trocarFaixa(p, f.id, (x) => ({ ...x, pan: 0 })))} onChange={(e) => { const v = Number(e.target.value); alterar((p) => trocarFaixa(p, f.id, (x) => ({ ...x, pan: v })), `pan-${f.id}`); }} className="min-w-0 flex-1 accent-[#25D366]" />
        <span className="w-11 text-right font-mono">{f.pan === 0 ? 'centro' : `${f.pan < 0 ? 'E' : 'D'}${Math.round(Math.abs(f.pan) * 100)}`}</span>
      </label>
      <span className="text-[10px] text-slate-500">{f.clipes.length} clipe{f.clipes.length === 1 ? '' : 's'} · {formatarTempo(fimDaFaixa(f), false)}</span>
    </>
  );
  /** F-338: puxador do clipe escolhido — arrastar apara na hora (esquerda = começo, direita = fim) */
  const pegarPuxador = (lado: 'inicio' | 'fim') => (e: PE<HTMLDivElement>) => {
    e.stopPropagation(); capturar(e);
    if (!clipeSel) return;
    if (reproducao.current) pararSom(false);
    marcarHistorico(); gesto.current = { tipo: 'aparar', clipeId: clipeSel, lado }; setSel(null);
  };
  const puxadores = (() => {
    if (!clipeAtual) return null;
    const idx = projeto.faixas.findIndex((x) => x.id === clipeAtual.faixa.id); if (idx < 0) return null;
    const c = clipeAtual.clipe, top = REGUA + idx * ALTURA, xi = c.inicio * zoom - rolagem, xf = fimDoClipe(c) * zoom - rolagem, LARG = 22;
    const alca = (lado: 'inicio' | 'fim', x: number, tempo: number) => (x < -LARG || x > largura + LARG) ? null : (
      <div key={lado} data-mantem-escolha role="slider" aria-label={lado === 'inicio' ? 'Puxador do começo do clipe' : 'Puxador do fim do clipe'} aria-valuenow={Math.round(tempo * 1000) / 1000} tabIndex={-1}
        data-testid={`editor-audio-puxador-${lado}`} onPointerDown={pegarPuxador(lado)} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}
        className="absolute z-10 flex cursor-ew-resize items-center justify-center rounded-md border-2 border-[#0B0420] bg-[#FFD400] shadow-[0_0_10px_rgba(255,212,0,0.8)]"
        style={{ top: top + TITULO + 4, height: ALTURA - TITULO - 10, width: LARG, left: lado === 'inicio' ? x : x - LARG, touchAction: 'none' }}>
        <span className="flex gap-[3px]"><span className="h-6 w-[2px] rounded bg-[#0B0420]" /><span className="h-6 w-[2px] rounded bg-[#0B0420]" /></span>
        <span className="pointer-events-none absolute -top-5 whitespace-nowrap rounded bg-[#0B0420]/90 px-1 font-mono text-[10px] font-bold text-[#FFD400]" style={{ [lado === 'inicio' ? 'left' : 'right']: 0 }}>{formatarTempo(tempo)}</span>
      </div>
    );
    return <>{alca('inicio', xi, c.inicio)}{alca('fim', xf, fimDoClipe(c))}</>;
  })();
  const pegarCursor = (e: PE<HTMLDivElement>) => {
    e.stopPropagation(); capturar(e);
    const tocava = !!reproducao.current; if (tocava) pararSom(false);
    const g: Extract<Gesto, { tipo: 'cursor' }> = { tipo: 'cursor', tocava, x: e.clientX, raf: 0, ultimo: 0, cursor0: cursorRef.current };
    gesto.current = g;
    // segurando perto da borda: rola sozinho (mais rápido quanto mais perto) e o cursor vai junto
    const andar = () => {
      if (gesto.current !== g) return;
      passoDaBorda(g);
      g.raf = requestAnimationFrame(andar);
    };
    g.raf = requestAnimationFrame(andar);
  };
  /** um passo da rolagem na borda (pela animação e, se ela atrasar, a cada movimento do dedo) */
  const passoDaBorda = (g: Extract<Gesto, { tipo: 'cursor' }>) => {
    g.ultimo = performance.now();
    {
      const el = area.current; if (el) {
        // F-336: borda de 36 px (o dedo alcança sem pegar sem querer); a velocidade é controlada em velocidadeNaBorda
        const r = el.getBoundingClientRect(), x = g.x - r.left, zona = 36;
        let v = 0; if (x > el.clientWidth - zona) v = Math.min(1, (x - (el.clientWidth - zona)) / zona); else if (x < zona) v = -Math.min(1, (zona - x) / zona);
        const dv = velocidadeNaBorda(v);
        if (dv) { el.scrollLeft = Math.max(0, el.scrollLeft + dv); setRolagem(el.scrollLeft); moverCursor(Math.max(0, (Math.min(Math.max(x, 0), el.clientWidth) + el.scrollLeft) / zoomRef.current)); }
      }
    }
  };
  const novaFaixaVazia = () => { const f = novaFaixa(projetoRef.current); alterar((p) => ({ ...p, faixas: [...p.faixas, f] })); setFaixaSel(f.id); };
  const linhaDoTempo = (
    <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0e0526]">
      <div className="flex overflow-y-auto" style={{ maxHeight: celular ? 'max(220px, calc(100dvh - 400px))' : '62vh' }}>
        <div className="shrink-0 border-r border-white/10" style={{ width: cab }}>
          <div style={{ height: REGUA }} className="flex items-center gap-1 border-b border-white/10 px-2">
            <button type="button" onClick={novaFaixaVazia} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10"><Plus className="h-3.5 w-3.5" />Faixa</button>
          </div>
          {projeto.faixas.map((f) => (
            <div key={f.id} style={{ height: ALTURA }} onClick={() => { if (celular && faixaSel === f.id) setFolha('faixa'); setFaixaSel(f.id); }}
              className={cn('flex flex-col gap-1 border-b border-white/10 p-2', f.id === faixaSel ? 'bg-[#22004A]' : 'bg-[#120530]')}>
              {celular ? (
                <>
                  <span className="h-1.5 w-8 rounded" style={{ background: f.cor }} />
                  <span className="line-clamp-2 text-[11px] font-bold leading-tight">{f.nome}</span>
                  <div className="mt-auto flex gap-1">
                    <button type="button" title="Mudo" onClick={(e) => { e.stopPropagation(); alterar((p) => trocarFaixa(p, f.id, (x) => ({ ...x, mudo: !x.mudo }))); }}
                      className={cn('h-7 flex-1 rounded text-[11px] font-black', f.mudo ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-300')}>M</button>
                    <button type="button" title="Solo" onClick={(e) => { e.stopPropagation(); alterar((p) => trocarFaixa(p, f.id, (x) => ({ ...x, solo: !x.solo }))); }}
                      className={cn('h-7 flex-1 rounded text-[11px] font-black', f.solo ? 'bg-[#FFD400] text-[#0B0420]' : 'bg-white/10 text-slate-300')}>S</button>
                  </div>
                </>
              ) : controlesDaFaixa(f, true)}
            </div>
          ))}
          {arrastando && <div style={{ height: 64 }} className="border-b border-white/10 bg-[#25D366]/10" />}
        </div>
        <div className="relative min-w-0 flex-1"
          onPointerDownCapture={(e) => {
            if (e.pointerType !== 'touch') return;
            // proteção: sem gesto em andamento, nenhum dedo antigo "preso" pode contar (evita pinça e arrasto fantasmas)
            if (!gesto.current) dedos.current.clear();
            dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (dedos.current.size >= 2) { e.stopPropagation(); if (gesto.current?.tipo !== 'pinca' && dedos.current.size === 2) comecarPinca(); }
          }}
          onPointerMoveCapture={(e) => {
            if (e.pointerType !== 'touch' || !dedos.current.has(e.pointerId)) return;
            dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (gesto.current?.tipo === 'pinca') { e.stopPropagation(); aoMover(e); }
          }}
          onPointerUpCapture={(e) => { if (e.pointerType !== 'touch') return; dedos.current.delete(e.pointerId); if (gesto.current?.tipo === 'pinca') { e.stopPropagation(); if (dedos.current.size === 0) gesto.current = null; } }}
          onPointerCancelCapture={(e) => { if (e.pointerType !== 'touch') return; dedos.current.delete(e.pointerId); if (gesto.current?.tipo === 'pinca') { e.stopPropagation(); if (dedos.current.size === 0) gesto.current = null; } }}>
          <div ref={area} className="overflow-x-auto overflow-y-hidden" onScroll={(e) => setRolagem((e.target as HTMLDivElement).scrollLeft)}
            onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomPara(zoom * (e.deltaY < 0 ? 1.25 : 0.8), tempoDoMouse(e)); } }}>
            <div style={{ width: larguraTotal }}>
              <canvas ref={regua} style={{ width: largura, height: REGUA, position: 'sticky', left: 0, display: 'block', cursor: 'text', touchAction: 'pan-x' }}
                onPointerDown={(e) => { capturar(e); if (reproducao.current) pararSom(false); moverCursor(imantar(tempoDoMouse(e))); setSel(null); gesto.current = { tipo: 'regua' }; }}
                onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar} />
              {projeto.faixas.map((f) => (
                <div key={f.id} data-faixa={f.id} data-clipes={f.clipes.map((c) => `${c.inicio.toFixed(2)}+${c.duracao.toFixed(2)}`).join(" ")} style={{ height: ALTURA }}>
                  <canvas ref={(c) => { if (c) pistas.current.set(f.id, c); else pistas.current.delete(f.id); }} data-testid="editor-audio-pista"
                    style={{ width: largura, height: ALTURA, position: 'sticky', left: 0, display: 'block', cursor: ferramenta === 'mover' ? 'grab' : ferramenta === 'tesoura' ? 'crosshair' : 'text', touchAction: 'none' }}
                    onPointerDown={aoApertar(f)} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar} onDoubleClick={(e) => {
                      const t = tempoDoMouse(e), c = f.clipes.find((x) => t >= x.inicio && t <= fimDoClipe(x));
                      if (c) { setSel({ a: c.inicio, b: fimDoClipe(c) }); setClipeSel(c.id); }
                    }} />
                </div>
              ))}
              {arrastando && (
                <div data-nova-faixa="1" data-testid="editor-audio-nova-faixa" style={{ width: largura, height: 64, position: 'sticky', left: 0 }}
                  className="flex items-center justify-center border-2 border-dashed border-[#25D366]/70 bg-[#25D366]/10 text-xs font-bold text-[#25D366]">
                  <Plus className="mr-1 h-4 w-4" />Solte aqui para criar uma faixa nova
                </div>
              )}
              {!projeto.faixas.length && (
                <div style={{ width: largura, position: 'sticky', left: 0 }} className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                  <AudioWaveform className="h-10 w-10 text-[#B04DFF]" />
                  <p className="text-sm font-semibold">Envie um áudio do aparelho, grave pelo microfone ou use um som do Studio.</p>
                  <p className="text-xs text-slate-400">MP3, WAV, OGG, M4A, AAC, FLAC, WEBM ou o áudio de um vídeo MP4.</p>
                  <button type="button" onClick={() => entrada.current?.click()} className="rounded-lg bg-[#8A2EFF] px-4 py-2.5 text-sm font-bold">Enviar áudio do aparelho</button>
                </div>
              )}
            </div>
          </div>
          {puxadores}
          <div ref={linha} data-testid="editor-audio-linha" className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-[#FFD400] shadow-[0_0_8px_#FFD400]" style={{ left: 0 }}>
            {/* a linha amarela INTEIRA e o triângulo do topo pegam o cursor: arraste; na borda da tela o áudio vem acompanhando */}
            <div role="slider" aria-label="Cursor: arraste para mudar a posição" aria-valuenow={Math.round(cursor * 1000) / 1000} tabIndex={-1} data-testid="editor-audio-triangulo"
              onPointerDown={pegarCursor} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}
              className="pointer-events-auto absolute -left-6 -top-1 flex h-11 w-12 cursor-grab items-start justify-center active:cursor-grabbing" style={{ touchAction: 'none' }}>
              <span className="mt-0.5 h-0 w-0 border-x-[13px] border-t-[18px] border-x-transparent border-t-[#FFD400] drop-shadow-[0_0_5px_rgba(255,212,0,0.95)]" />
            </div>
            <div aria-hidden data-testid="editor-audio-linha-pegar" onPointerDown={pegarCursor} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}
              className="pointer-events-auto absolute bottom-0 top-10 -left-3 w-6 cursor-ew-resize" style={{ touchAction: 'none' }} />
          </div>
        </div>
      </div>
      <p className="border-t border-white/10 px-3 py-1.5 text-[11px] text-slate-400">
        {celular
          ? <><b>Passe o dedo</b> (no clipe, na régua ou no vazio): anda pelo áudio · <b>toque</b> num clipe: escolhe · <b>segure o clipe e arraste</b>: move (outra faixa, ou embaixo cria faixa nova) · segure a <b>borda</b>: apara · <b>Marcar trecho</b> ligado: arraste para marcar · <b>▼ amarelo</b>: cursor · <b>dois dedos</b>: zoom</>
          : <>Arraste na onda para marcar um trecho · com a <b>Tesoura</b>, clique para cortar · arraste a <b>barra colorida</b> do clipe para mover (ou outra faixa) · puxe a <b>borda</b> do clipe para aparar · Ctrl+roda = zoom ·
            Espaço tocar · S dividir · Delete apagar · Ctrl+Z/Y · Ctrl+X/C/V · Ctrl+D duplicar · Ctrl+A tudo · L repetir · arraste arquivos para uma faixa</>}
      </p>
    </div>
  );
  const medidor = (
    <div className="flex w-24 flex-col gap-1" title="Medidor (esquerdo/direito)">
      <div className="h-2 overflow-hidden rounded bg-white/10"><div ref={medidorE} className="h-full w-0 bg-gradient-to-r from-[#25D366] via-[#FFD400] to-[#f97316]" /></div>
      <div className="h-2 overflow-hidden rounded bg-white/10"><div ref={medidorD} className="h-full w-0 bg-gradient-to-r from-[#25D366] via-[#FFD400] to-[#f97316]" /></div>
    </div>
  );
  const entradaDeArquivo = (
    <input ref={entrada} type="file" multiple accept="audio/*,video/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm,.opus" className="hidden" data-testid="editor-audio-arquivo"
      onChange={(e) => { if (e.target.files) void abrirArquivos(e.target.files); e.target.value = ''; }} />
  );
  const aoSoltarArquivo = (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer.files.length) { const alvo = (e.target as HTMLElement).closest<HTMLElement>('[data-faixa]')?.dataset.faixa; void abrirArquivos(e.dataTransfer.files, alvo ?? 'nova', alvo && area.current ? tempoDoMouse(e) : 0); } };

  const janelas = (
    <>
      {/* —— salvar na pasta —— */}
      {salvarAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-mantem-escolha role="dialog" aria-modal="true" aria-label="Salvar o áudio">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a0b3d] p-5 shadow-2xl">
            <h2 className="text-lg font-black">Salvar na Biblioteca de Áudios</h2>
            <label className="mt-3 flex flex-col gap-1 text-sm">Nome do áudio
              <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} data-testid="editor-audio-nome-salvar" className="rounded-lg border border-white/10 bg-[#0B0420] px-3 py-2" /></label>
            {projeto.faixas.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-slate-300">Nome das faixas</p>
                <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {projeto.faixas.map((x) => (
                    <input key={x.id} value={x.nome} aria-label="Nome da faixa" onChange={(e) => { const v = e.target.value; alterar((p) => trocarFaixa(p, x.id, (y) => ({ ...y, nome: v })), `nome-${x.id}`); }}
                      className="rounded-md border border-white/10 bg-[#0B0420] px-2 py-1 text-xs" style={{ borderLeft: `4px solid ${x.cor}` }} />
                  ))}
                </div>
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-400">Fica guardado no sistema da SOBRE MÍDIA, na sua conta, com as faixas separadas, para rever, reeditar e salvar uma nova versão em qualquer aparelho. Depois de salvar, a tela volta do zero para uma nova edição.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setSalvarAberto(false)} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/10">Cancelar</button>
              {pastaId && edicaoTipo === 'salvo' && <button type="button" disabled={!!ocupado} onClick={() => void salvarNaPastaAgora(true)} className="rounded-lg border border-[#B04DFF]/60 px-4 py-2 text-sm font-semibold hover:bg-[#8A2EFF]/20">Salvar como novo</button>}
              <button type="button" disabled={!!ocupado} onClick={() => void salvarNaPastaAgora(false)} data-testid="editor-audio-confirmar-salvar" className="flex items-center gap-2 rounded-lg bg-[#8A2EFF] px-4 py-2 text-sm font-bold disabled:opacity-50">
                <Save className="h-4 w-4" />{pastaId && edicaoTipo === 'salvo' ? `Salvar por cima (versão ${(versao || 1) + 1})` : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* —— Biblioteca de Áudios (no sistema): salvos e rascunhos —— */}
      {pastaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-mantem-escolha role="dialog" aria-modal="true" aria-label="Biblioteca de Áudios">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#1a0b3d] p-5 shadow-2xl" data-testid="editor-audio-pasta">
            <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-black"><FolderOpen className="h-5 w-5 text-[#FFD400]" />Biblioteca de Áudios</h2>
              <button type="button" onClick={() => setPastaAberta(false)} className="rounded-lg px-3 py-1 text-sm text-slate-300 hover:bg-white/10">Fechar</button></div>
            <div className="mt-3 flex gap-1" role="tablist">
              {(['salvo', 'rascunho'] as const).map((a) => (
                <button key={a} type="button" role="tab" aria-selected={abaBiblioteca === a} onClick={() => setAbaBiblioteca(a)}
                  className={cn('h-9 flex-1 rounded-lg text-sm font-bold', abaBiblioteca === a ? 'bg-[#8A2EFF] text-white' : 'bg-white/5 text-slate-300')}>
                  {a === 'salvo' ? 'Salvos' : 'Rascunhos'} ({itens.filter((x) => x.tipo === a).length})
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 overflow-y-auto">
              {carregandoBiblioteca && <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Abrindo…</p>}
              {!carregandoBiblioteca && !itens.some((x) => x.tipo === abaBiblioteca) && <p className="py-8 text-center text-sm text-slate-400">{abaBiblioteca === 'salvo' ? <>Nenhum áudio salvo ainda. Edite e toque em <b>Salvar</b>.</> : <>Nenhum rascunho. Ao tocar em <b>Nova edição</b>, o que estava na tela vem para cá.</>}</p>}
              {itens.filter((x) => x.tipo === abaBiblioteca).map((it) => (
                <div key={it.id} className={cn('flex flex-wrap items-center gap-2 rounded-xl border p-3', it.id === pastaId ? 'border-[#25D366]/60 bg-[#25D366]/10' : 'border-white/10 bg-[#140632]')} data-testid="editor-audio-item-pasta">
                  <AudioWaveform className="h-5 w-5 shrink-0 text-[#B04DFF]" />
                  <div className="min-w-0 flex-1">
                    <input defaultValue={it.nome} aria-label="Nome do áudio" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.nome) { void renomearEdicao(it.id, v).then(atualizarPasta); if (it.id === pastaId) setNome(v); } }}
                      className="w-full bg-transparent text-sm font-bold focus:outline-none" />
                    <p className="text-[11px] text-slate-400"><span className="font-bold text-[#B04DFF]">{it.tipo === 'rascunho' ? 'Rascunho' : 'Editado no SOBRE MÍDIA Studio'}</span> · {formatarTempo(it.duracao, false)} · {it.faixas} faixa{it.faixas === 1 ? '' : 's'}{it.tipo === 'salvo' ? ` · versão ${it.versao}` : ''} · {new Date(it.atualizado_em).toLocaleString('pt-BR')}</p>
                  </div>
                  <button type="button" onClick={() => void abrirDaPasta(it)} className="rounded-lg bg-[#8A2EFF] px-3 py-1.5 text-xs font-bold">{it.tipo === 'rascunho' ? 'Continuar editando' : 'Abrir e editar'}</button>
                  <button type="button" onClick={() => void baixarDaPasta(it)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/10"><Download className="inline h-3.5 w-3.5" /> MP3</button>
                  <button type="button" onClick={() => void duplicarNaPasta(it)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/10">Duplicar</button>
                  <button type="button" onClick={() => { if (window.confirm(`Apagar "${it.nome}"? Isso não pode ser desfeito.`)) void apagarEdicao(it.id).then(() => { if (it.id === pastaId) { setPastaId(null); setVersao(0); setEdicaoTipo(null); } void atualizarPasta(); }); }} className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/15">Apagar</button>
                </div>
              ))}
              {itensDaPasta.length > 0 && (
                <div className="mt-2 rounded-xl border border-dashed border-white/15 p-3">
                  <p className="text-xs font-bold text-slate-300">Antigos, só neste aparelho</p>
                  {itensDaPasta.map((it) => (
                    <div key={it.id} className="mt-2 flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{it.nome}</span>
                      <button type="button" onClick={() => void abrirDoAparelho(it)} className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/10">Abrir (e salvar no sistema)</button></div>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">Fica no sistema da SOBRE MÍDIA, na sua conta: abre em qualquer aparelho em que você entrar.</p>
          </div>
        </div>
      )}

      {/* —— baixar —— */}
      {exportar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-mantem-escolha role="dialog" aria-modal="true" aria-label="Baixar a edição">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a0b3d] p-5 shadow-2xl">
            <h2 className="text-lg font-black">Baixar a edição</h2>
            <div className="mt-3 grid gap-3 text-sm">
              <label className="flex flex-col gap-1">Nome do áudio (nome do arquivo)<input value={nome} onChange={(e) => setNome(e.target.value)} className="rounded-lg border border-white/10 bg-[#0B0420] px-3 py-2" /></label>
              <label className="flex flex-col gap-1">Formato
                <select value={`${exp.formato}:${exp.kbps}`} data-testid="editor-audio-formato" onChange={(e) => { const [f, k] = e.target.value.split(':'); setExp((x) => ({ ...x, formato: f as FormatoDeAudio, kbps: Number(k) })); }} className="rounded-lg border border-white/10 bg-[#0B0420] px-3 py-2">
                  <option value="mp3:320">MP3 — 320 kbps (máxima)</option>
                  <option value="mp3:192">MP3 — 192 kbps (recomendado)</option>
                  <option value="mp3:128">MP3 — 128 kbps (menor)</option>
                  <option value="wav16:0">WAV — 16 bits (CD, sem perda)</option>
                  <option value="wav24:0">WAV — 24 bits (estúdio)</option>
                  <option value="wav32:0">WAV — 32 bits real</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">Qualidade<select value={exp.sr} onChange={(e) => setExp((x) => ({ ...x, sr: Number(e.target.value) }))} className="rounded-lg border border-white/10 bg-[#0B0420] px-3 py-2"><option value={44100}>44,1 kHz</option><option value={48000}>48 kHz</option></select></label>
                <label className="flex flex-col gap-1">Canais<select value={exp.canais} onChange={(e) => setExp((x) => ({ ...x, canais: Number(e.target.value) as 1 | 2 }))} className="rounded-lg border border-white/10 bg-[#0B0420] px-3 py-2"><option value={2}>Estéreo</option><option value={1}>Mono</option></select></label>
              </div>
              <label className="flex flex-col gap-1">O que baixar
                <select value={exp.intervalo} onChange={(e) => setExp((x) => ({ ...x, intervalo: e.target.value as 'tudo' | 'selecao' }))} className="rounded-lg border border-white/10 bg-[#0B0420] px-3 py-2">
                  <option value="tudo">O projeto inteiro ({formatarTempo(fim)})</option>
                  <option value="selecao" disabled={!sel}>Só o trecho marcado{sel ? ` (${formatarTempo(sel.b - sel.a)})` : ''}</option>
                </select>
              </label>
              <p className="rounded-lg bg-[#8A2EFF]/15 px-3 py-2 text-[11px] text-slate-300">O arquivo sai marcado como <b>Editado no SOBRE MÍDIA Studio</b> (nome, data, versão e código da edição). Ao abrir de novo no editor, o Studio reconhece.</p>
              <label className="flex items-center gap-2"><input type="checkbox" checked={exp.normalizar} onChange={(e) => setExp((x) => ({ ...x, normalizar: e.target.checked }))} />Normalizar (pico em −1 dB)</label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setExportar(false)} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/10">Cancelar</button>
              <button type="button" disabled={!!ocupado} onClick={() => void baixar()} data-testid="editor-audio-confirmar-baixar" className="flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-bold text-[#0B0420] disabled:opacity-50">
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Baixar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const avisoAnterior = anterior && (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#FFD400]/40 bg-[#FFD400]/10 px-3 py-2 text-xs text-[#FFD400]" data-testid="editor-audio-anterior">
      <span className="min-w-0 flex-1">{anterior.motivo === 'tempo' ? 'Você ficou um tempo sem editar: ' : ''}a edição <b>"{anterior.nome}"</b> ficou guardada {anterior.onde === 'salvo' ? 'nos Salvos' : 'nos Rascunhos'} da Biblioteca.</span>
      <button type="button" onClick={() => void abrirDaPasta({ id: anterior.id, nome: anterior.nome })} className="rounded-lg bg-[#FFD400] px-3 py-1.5 font-bold text-[#0B0420]">Voltar a editar de onde parei</button>
      <button type="button" onClick={() => setAnterior(null)} aria-label="Fechar aviso" className="px-1 text-slate-300">✕</button>
    </div>
  );

  // ——— CELULAR: tela de app de edição (topo enxuto, linha do tempo no meio, controles grandes fixos embaixo) ———
  if (celular) {
    const abas: Array<{ id: AbaDoCelular; nome: string }> = [{ id: 'cortes', nome: 'Cortes' }, { id: 'adicionar', nome: 'Adicionar' }, { id: 'efeitos', nome: 'Efeitos' }, { id: 'faixa', nome: 'Faixa' }];
    return (
      <div className="flex flex-col gap-2 pb-[188px] text-slate-100 [&_input]:![font-size:16px] [&_select]:![font-size:16px] [&_textarea]:![font-size:16px]" data-testid="editor-de-audio" data-modo="celular" data-clipe-escolhido={clipeSel ?? ""} onDragOver={(e) => e.preventDefault()} onDrop={aoSoltarArquivo}>
        {entradaDeArquivo}
        {/* topo */}
        <div className="flex items-center gap-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#B04DFF] to-[#5D1BFF]"><AudioWaveform className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do áudio" className="w-full bg-transparent text-sm font-black focus:outline-none" />
            <p className="truncate text-[10px] text-slate-400">{pastaId ? `na pasta · versão ${versao || 1}` : 'Editor de Áudio'} · {formatarTempo(fim, false)}</p>
          </div>
          <button type="button" title="Salvar na Biblioteca de Áudios" onClick={() => setSalvarAberto(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5"><Save className="h-5 w-5" /></button>
          <button type="button" title="Biblioteca de Áudios" onClick={() => { void atualizarPasta(); setPastaAberta(true); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5"><FolderOpen className="h-5 w-5" /></button>
          <button type="button" title="Baixar áudio editado" onClick={() => setExportar(true)} data-testid="editor-audio-baixar" className="flex h-10 items-center gap-1 rounded-xl bg-[#25D366] px-3 text-xs font-black text-[#0B0420]"><Download className="h-4 w-4" />Baixar</button>
        </div>
        {/* posição, seleção, zoom e medidor */}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#140632] px-2 py-1.5">
          <div className="flex flex-col">
            <span ref={relogio} className="font-mono text-lg font-bold leading-none text-[#FFD400]" data-testid="editor-audio-relogio">0:00.000</span>
            <span className="mt-0.5 font-mono text-[10px] text-slate-400">{sel ? `${formatarTempo(sel.a)} → ${formatarTempo(sel.b)}` : 'sem trecho marcado'}</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {medidor}
            <button type="button" title="Afastar" onClick={() => zoomPara(zoom / 1.6)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5"><ZoomOut className="h-4 w-4" /></button>
            <button type="button" title="Aproximar" onClick={() => zoomPara(zoom * 1.6)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5"><ZoomIn className="h-4 w-4" /></button>
            <button type="button" title="Ver tudo" onClick={ajustar} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5"><Maximize2 className="h-4 w-4" /></button>
          </div>
        </div>
        {ocupado && <p className="flex items-center gap-1.5 text-xs text-[#FFD400]"><Loader2 className="h-4 w-4 animate-spin" />{ocupado}</p>}
        {avisoAnterior}
        {linhaDoTempo}

        {/* controles fixos embaixo */}
        <div data-mantem-escolha className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0e0526]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" data-testid="editor-audio-doca">
          <div className="flex items-center justify-between gap-1 px-2 pt-2">
            <button type="button" title="Voltar o que foi feito" onClick={desfazer} disabled={!passado.current.length} className="flex h-11 items-center gap-1 rounded-xl border border-white/10 px-2.5 text-xs font-bold disabled:opacity-35"><Undo2 className="h-4 w-4" />Voltar</button>
            <div className="flex items-center gap-1">
              <button type="button" title="Início" onClick={() => atalhos.current.inicio()} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5"><SkipBack className="h-5 w-5" /></button>
              <button type="button" title={tocando ? 'Pausar' : 'Tocar'} onClick={alternarPlay} className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#B04DFF] to-[#5D1BFF] shadow-[0_0_20px_rgba(138,46,255,0.6)]">{tocando ? <Pause className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}</button>
              <button type="button" title="Parar e voltar" onClick={() => pararSom(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5"><Square className="h-5 w-5" /></button>
            </div>
            <button type="button" title="Avançar de novo" onClick={refazer} disabled={!futuro.current.length} className="flex h-11 items-center gap-1 rounded-xl border border-white/10 px-2.5 text-xs font-bold disabled:opacity-35">Avançar<Redo2 className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 flex gap-1 px-2" role="tablist">
            {abas.map((a) => (
              <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => { setAba(a.id); setFolha(a.id === 'efeitos' ? 'efeitos' : a.id === 'faixa' ? 'faixa' : null); }}
                className={cn('h-8 flex-1 rounded-lg text-xs font-bold', aba === a.id ? 'bg-[#8A2EFF] text-white' : 'bg-white/5 text-slate-300')}>{a.nome}</button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-2 py-2">
            {aba === 'cortes' && <>
              <Grande titulo="Cortar: corta o clipe na linha amarela (ou tira o trecho marcado)" rotulo="Cortar" onClick={cortar}><Scissors className="h-5 w-5" /></Grande>
              <Grande titulo="Marcar trecho: ligado, arrastar na onda marca um trecho" rotulo={marcandoTrecho ? 'Marcando…' : 'Marcar trecho'} onClick={() => { setMarcandoTrecho((v) => !v); setSel(null); }} ativo={marcandoTrecho}><MousePointer2 className="h-5 w-5" /></Grande>
              <Grande titulo="Desmarcar: tira a escolha do clipe e o trecho marcado" rotulo="Desmarcar" onClick={() => { setSel(null); setClipeSel(null); setMarcandoTrecho(false); }}><Hand className="h-5 w-5" /></Grande>
              <Grande titulo="Apagar o trecho ou o clipe" rotulo="Apagar" onClick={apagar} perigo><Trash2 className="h-5 w-5" /></Grande>
              <Grande titulo="Dividir no cursor" rotulo="Dividir" onClick={dividir}><Split className="h-5 w-5" /></Grande>
              <Grande titulo="Manter só o trecho marcado" rotulo="Manter trecho" onClick={manterSelecao}><Crop className="h-5 w-5" /></Grande>
              <Grande titulo="Copiar" rotulo="Copiar" onClick={() => void copiar()}><Copy className="h-5 w-5" /></Grande>
              <Grande titulo="Colar no cursor" rotulo="Colar" onClick={colarAqui}><ClipboardPaste className="h-5 w-5" /></Grande>
              <Grande titulo="Duplicar o clipe" rotulo="Duplicar" onClick={duplicar}><CopyPlus className="h-5 w-5" /></Grande>
              <Grande titulo="Silenciar o trecho" rotulo="Silenciar" onClick={() => void processar('Silêncio', silenciar)}><VolumeX className="h-5 w-5" /></Grande>
              <Grande titulo={`Inserir ${silencioSeg} s de silêncio no cursor`} rotulo={`+${silencioSeg}s silêncio`} onClick={inserirSilencio}><BetweenHorizontalStart className="h-5 w-5" /></Grande>
              <Grande titulo="Marcar a faixa inteira" rotulo="Marcar tudo" onClick={selecionarTudo}><Rows3 className="h-5 w-5" /></Grande>
              <Grande titulo="Repetir o trecho marcado" rotulo="Repetir" onClick={() => setLoop((v) => !v)} ativo={loop}><Repeat className="h-5 w-5" /></Grande>
              <Grande titulo="Ímã" rotulo="Ímã" onClick={() => setIma((v) => !v)} ativo={ima}><Magnet className="h-5 w-5" /></Grande>
              <Grande titulo="Editar todas as faixas juntas" rotulo="Todas faixas" onClick={() => setEmTodas((v) => !v)} ativo={emTodas}><Rows3 className="h-5 w-5" /></Grande>
            </>}
            {aba === 'adicionar' && <>
              <Grande titulo="Enviar áudio do aparelho" rotulo="Enviar do aparelho" onClick={() => entrada.current?.click()}><Upload className="h-5 w-5" /></Grande>
              <Grande titulo={gravando ? 'Parar a gravação' : 'Gravar pelo microfone'} rotulo={gravando ? `Parar ${segGravando.toFixed(0)}s` : 'Gravar'} onClick={() => void gravar()} ativo={!!gravando}><Mic className={cn('h-5 w-5', gravando && 'animate-pulse text-rose-400')} /></Grande>
              <Grande titulo="Sons e trilhas do Studio" rotulo="Sons do Studio" onClick={() => setFolha('sons')}><Music className="h-5 w-5" /></Grande>
              <Grande titulo="Faixa nova" rotulo="Faixa nova" onClick={novaFaixaVazia}><Plus className="h-5 w-5" /></Grande>
              <Grande titulo="Bipe de 1 kHz no cursor" rotulo="Bipe" onClick={() => adicionarSom(gerarTom(44100, 1, 1000, 'seno', 0.3), 'Bipe 1 kHz', faixaSel ?? 'nova', cursorRef.current)}><AudioWaveform className="h-5 w-5" /></Grande>
              <Grande titulo="Nova edição: a de agora vai para os rascunhos" rotulo="Nova edição" onClick={novoProjeto}><FilePlus2 className="h-5 w-5" /></Grande>
            </>}
            {(aba === 'efeitos' || aba === 'faixa') && (
              <button type="button" onClick={() => setFolha(aba)} className="h-16 flex-1 rounded-xl border border-[#B04DFF]/50 bg-[#8A2EFF]/15 text-sm font-bold">{aba === 'efeitos' ? 'Abrir os efeitos' : 'Abrir os ajustes da faixa e do clipe'}</button>
            )}
          </div>
        </div>

        {/* folhas que sobem de baixo (efeitos, faixa/clipe, sons) */}
        {folha && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={() => setFolha(null)}>
            <div data-mantem-escolha className="max-h-[72dvh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#1a0b3d] p-3 pb-[calc(12px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} data-testid="editor-audio-folha">
              <div className="mb-2 flex items-center justify-between">
                <span className="mx-auto h-1.5 w-12 rounded-full bg-white/20" />
              </div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-black">{folha === 'efeitos' ? 'Efeitos' : folha === 'sons' ? 'Sons e trilhas do Studio' : 'Faixa e clipe'}</h2>
                <button type="button" onClick={() => setFolha(null)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold">Pronto</button>
              </div>
              {folha === 'efeitos' && painelEfeitos}
              {folha === 'sons' && listaDeSons}
              {folha === 'faixa' && (
                <div className="flex flex-col gap-3">
                  {faixaAtual ? <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#140632] p-3">{controlesDaFaixa(faixaAtual)}</section> : <p className="text-sm text-slate-400">Toque numa faixa para ajustar.</p>}
                  {painelClipe}
                  <section className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#140632] p-3 text-xs">
                    <Volume2 className="h-4 w-4 text-slate-400" />Volume geral
                    <input type="range" min={-30} max={12} step={0.5} value={projeto.volumeGeralDb} aria-label="Volume geral" className="min-w-0 flex-1 accent-[#8A2EFF]"
                      onChange={(e) => { const v = Number(e.target.value); alterar((p) => ({ ...p, volumeGeralDb: v }), 'geral'); if (audio.current) audio.current.geral.gain.value = Math.pow(10, v / 20); }} />
                    <span className="w-14 text-right font-mono">{projeto.volumeGeralDb.toFixed(1)} dB</span>
                  </section>
                  <label className="flex items-center gap-2 text-xs text-slate-300">Silêncio a inserir
                    <input type="number" min={0.01} step={0.1} value={silencioSeg} onChange={(e) => setSilencioSeg(Number(e.target.value))} className="w-20 rounded-md border border-white/10 bg-[#0B0420] px-2 py-1" />s</label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={tocarAoGravar} onChange={(e) => setTocarAoGravar(e.target.checked)} />tocar o projeto enquanto grava</label>
                </div>
              )}
            </div>
          </div>
        )}
        {janelas}
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-110px)] flex-col gap-3 text-slate-100" data-testid="editor-de-audio" data-clipe-escolhido={clipeSel ?? ""} onDragOver={(e) => e.preventDefault()} onDrop={aoSoltarArquivo}>
      {entradaDeArquivo}
      {/* —— topo —— */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#B04DFF] to-[#5D1BFF]"><AudioWaveform className="h-5 w-5" /></span>
        <div className="mr-2">
          <h1 className="text-lg font-black leading-tight">Editor de Áudio</h1>
          <span className="flex items-center gap-1"><input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do áudio" className="w-48 bg-transparent text-xs text-slate-400 focus:text-white focus:outline-none" />{pastaId && <span className="rounded bg-[#25D366]/20 px-1.5 text-[10px] font-bold text-[#25D366]">na pasta · v{versao || 1}</span>}</span>
        </div>
        <Botao titulo="Nova edição: a de agora vai para os rascunhos e a tela começa do zero" onClick={novoProjeto}><FilePlus2 className="h-4 w-4" />Nova edição</Botao>
        <Botao titulo="Salvar na Biblioteca de Áudios (com o nome que quiser)" onClick={() => setSalvarAberto(true)}><Save className="h-4 w-4" />Salvar</Botao>
        <Botao titulo="Biblioteca de Áudios: salvos e rascunhos" onClick={() => { void atualizarPasta(); setPastaAberta(true); }}><FolderOpen className="h-4 w-4" />Biblioteca</Botao>
        <Botao titulo="Enviar áudio do aparelho (ou arraste arquivos para cá)" onClick={() => entrada.current?.click()}><Upload className="h-4 w-4" />Enviar áudio do aparelho</Botao>
        <Botao titulo={gravando ? 'Parar a gravação' : 'Gravar pelo microfone (no cursor, numa faixa nova)'} onClick={() => void gravar()} ativo={!!gravando}>
          <Mic className={cn('h-4 w-4', gravando && 'animate-pulse text-rose-400')} />{gravando ? `Parar (${segGravando.toFixed(1)} s)` : 'Gravar'}
        </Botao>
        <label className="flex items-center gap-1 text-[11px] text-slate-400"><input type="checkbox" checked={tocarAoGravar} onChange={(e) => setTocarAoGravar(e.target.checked)} />tocar o projeto enquanto grava</label>
        <div className="relative">
          <Botao titulo="Sons e trilhas do Studio" onClick={() => setSonsAbertos((v) => !v)} ativo={sonsAbertos}><Music className="h-4 w-4" />Sons do Studio</Botao>
          {sonsAbertos && <div className="absolute left-0 z-30 mt-2 max-h-[60vh] w-72 overflow-y-auto rounded-xl border border-white/10 bg-[#1a0b3d] p-2 shadow-2xl">{listaDeSons}</div>}
        </div>
        <Botao titulo="Gerar um bipe (1 kHz) no cursor" onClick={() => adicionarSom(gerarTom(44100, 1, 1000, 'seno', 0.3), 'Bipe 1 kHz', faixaSel ?? 'nova', cursorRef.current)}>Bipe</Botao>
        <div className="ml-auto flex items-center gap-2">
          {ocupado && <span className="flex items-center gap-1.5 text-xs text-[#FFD400]"><Loader2 className="h-4 w-4 animate-spin" />{ocupado}</span>}
          <button type="button" onClick={() => setExportar(true)} data-testid="editor-audio-baixar"
            className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#25D366] to-[#1fa855] px-4 text-sm font-bold text-[#0B0420] shadow-lg"><Download className="h-4 w-4" />Baixar áudio editado</button>
        </div>
      </div>

      {avisoAnterior}
      {/* —— barra de ferramentas —— */}
      <div data-mantem-escolha className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/10 bg-[#140632] p-2">
        <div className="flex items-center gap-1">
          <Botao titulo="Ir ao início (Home)" onClick={() => atalhos.current.inicio()}><SkipBack className="h-4 w-4" /></Botao>
          <Botao titulo={tocando ? 'Pausar (espaço)' : 'Tocar (espaço)'} onClick={alternarPlay} ativo={tocando}>{tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Botao>
          <Botao titulo="Parar e voltar" onClick={() => pararSom(true)}><Square className="h-4 w-4" /></Botao>
          <Botao titulo="Ir ao fim (End)" onClick={() => atalhos.current.fim()}><SkipForward className="h-4 w-4" /></Botao>
          <Botao titulo="Repetir o trecho marcado (L)" onClick={() => setLoop((v) => !v)} ativo={loop}><Repeat className="h-4 w-4" /></Botao>
        </div>
        <div className="flex flex-col rounded-lg bg-[#0B0420] px-3 py-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Posição</span>
          <span ref={relogio} className="font-mono text-lg font-bold leading-tight text-[#FFD400]" data-testid="editor-audio-relogio">0:00.000</span>
        </div>
        <CampoDeTempo rotulo="Início" valor={sel ? sel.a : cursor} onMudar={(v) => (sel ? setSel({ a: Math.min(v, sel.b), b: sel.b }) : moverCursor(v))} />
        <CampoDeTempo rotulo="Fim" valor={sel ? sel.b : null} onMudar={(v) => sel && setSel({ a: sel.a, b: Math.max(v, sel.a) })} />
        <CampoDeTempo rotulo="Duração" valor={sel ? sel.b - sel.a : null} onMudar={(v) => sel && setSel({ a: sel.a, b: sel.a + v })} />
        <span className="mx-1 h-9 w-px bg-white/10" />
        <div className="flex items-center gap-1">
          <Botao titulo="Voltar o que foi feito (Ctrl+Z)" onClick={desfazer} desligado={!passado.current.length}><Undo2 className="h-4 w-4" />Voltar</Botao>
          <Botao titulo="Avançar de novo o que foi voltado (Ctrl+Y)" onClick={refazer} desligado={!futuro.current.length}>Avançar<Redo2 className="h-4 w-4" /></Botao>
        </div>
        <span className="mx-1 h-9 w-px bg-white/10" />
        <span className="self-center text-[10px] font-bold uppercase tracking-wider text-[#B04DFF]">Cortes</span>
        <Botao titulo="Tesoura: clique no áudio para cortar ali" onClick={() => setFerramenta((v) => (v === 'tesoura' ? 'selecao' : 'tesoura'))} ativo={ferramenta === 'tesoura'}><Scissors className="h-4 w-4" />Tesoura</Botao>
        <Botao titulo="Cortar (Ctrl+X): corta o clipe na linha amarela; com um trecho marcado, tira o trecho e guarda para colar" onClick={cortar}><Scissors className="h-4 w-4" />Cortar</Botao>
        <Botao titulo="Copiar (Ctrl+C)" onClick={() => void copiar()}><Copy className="h-4 w-4" /></Botao>
        <Botao titulo="Colar no cursor (Ctrl+V)" onClick={colarAqui}><ClipboardPaste className="h-4 w-4" /></Botao>
        <Botao titulo="Apagar o trecho ou o clipe (Delete)" onClick={apagar} perigo><Trash2 className="h-4 w-4" />Apagar</Botao>
        <Botao titulo="Manter só o trecho marcado (tira o resto)" onClick={manterSelecao}><Crop className="h-4 w-4" />Manter trecho</Botao>
        <Botao titulo="Silenciar o trecho" onClick={() => void processar('Silêncio', silenciar)}><VolumeX className="h-4 w-4" /></Botao>
        <Botao titulo="Dividir no cursor (S)" onClick={dividir}><Split className="h-4 w-4" />Dividir</Botao>
        <Botao titulo="Duplicar o clipe (Ctrl+D)" onClick={duplicar}><CopyPlus className="h-4 w-4" /></Botao>
        <div className="flex items-center gap-1">
          <Botao titulo="Inserir silêncio no cursor" onClick={inserirSilencio}><BetweenHorizontalStart className="h-4 w-4" />Silêncio</Botao>
          <input type="number" min={0.01} step={0.1} value={silencioSeg} onChange={(e) => setSilencioSeg(Number(e.target.value))} aria-label="Segundos de silêncio" className="w-14 rounded-md border border-white/10 bg-[#0B0420] px-1 py-1 text-xs" /><span className="text-[11px] text-slate-400">s</span>
        </div>
        <span className="mx-1 h-9 w-px bg-white/10" />
        <Botao titulo="Ferramenta de seleção (arrastar marca um trecho; a barra do clipe move)" onClick={() => setFerramenta('selecao')} ativo={ferramenta === 'selecao'}><MousePointer2 className="h-4 w-4" /></Botao>
        <Botao titulo="Ferramenta de mover clipes" onClick={() => setFerramenta('mover')} ativo={ferramenta === 'mover'}><Hand className="h-4 w-4" /></Botao>
        <Botao titulo="Ímã: gruda nas pontas dos clipes e no cursor" onClick={() => setIma((v) => !v)} ativo={ima}><Magnet className="h-4 w-4" /></Botao>
        <Botao titulo="Editar todas as faixas juntas" onClick={() => setEmTodas((v) => !v)} ativo={emTodas}><Rows3 className="h-4 w-4" />Todas</Botao>
        <span className="mx-1 h-9 w-px bg-white/10" />
        <Botao titulo="Afastar (−)" onClick={() => zoomPara(zoom / 1.6)}><ZoomOut className="h-4 w-4" /></Botao>
        <Botao titulo="Aproximar (+)" onClick={() => zoomPara(zoom * 1.6)}><ZoomIn className="h-4 w-4" /></Botao>
        <Botao titulo="Ver o projeto inteiro" onClick={ajustar}><Maximize2 className="h-4 w-4" /></Botao>
        <div className="ml-auto flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-slate-400" />
          <input type="range" min={-30} max={12} step={0.5} value={projeto.volumeGeralDb} aria-label="Volume geral"
            onChange={(e) => { const v = Number(e.target.value); alterar((p) => ({ ...p, volumeGeralDb: v }), 'geral'); if (audio.current) audio.current.geral.gain.value = Math.pow(10, v / 20); }} className="w-24 accent-[#8A2EFF]" />
          <span className="w-14 text-right font-mono text-[11px] text-slate-300">{projeto.volumeGeralDb.toFixed(1)} dB</span>
          {medidor}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
        {linhaDoTempo}
        {/* —— lateral direita: efeitos e clipe —— */}
        <aside data-mantem-escolha className="flex w-full shrink-0 flex-col gap-3 xl:w-[340px]">
          {painelEfeitos}
          {painelClipe}
          <section className="rounded-2xl border border-white/10 bg-[#140632] p-3 text-[11px] text-slate-400">
            <h2 className="mb-1 text-sm font-black text-white">Projeto</h2>
            <p>{projeto.faixas.length} faixa{projeto.faixas.length === 1 ? '' : 's'} · duração {formatarTempo(fim)}</p>
            <p className="mt-1">A edição fica salva sozinha neste aparelho. Para levar a outro lugar, use <b>Baixar áudio editado</b>.</p>
          </section>
        </aside>
      </div>
      {janelas}
    </div>
  );
}


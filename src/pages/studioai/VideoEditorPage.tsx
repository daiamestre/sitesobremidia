/**
 * SOBRE MÍDIA STUDIO — EDITOR DE VÍDEO (F-227), no estilo CapCut/KineMaster, feito para o tablet:
 * importar vídeos/fotos (do aparelho ou da galeria) e artes do Studio, cortar, dividir, congelar quadro, velocidade,
 * volume com entrada/saída suaves, 12 filtros, ajustes, zoom lento (Ken Burns), girar/espelhar, 11 transições,
 * textos/legendas/figurinhas/formas/selos/logo com tempo e animação, música com corte e repetição, e exportação em
 * MP4 1080p com som — direto para a galeria (pasta "Vídeos do Studio"), para uma tela/playlist ou para baixar.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as EventoDoMouse } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, AudioLines, Circle, Clapperboard, Copy, Download, Film, FolderOpen, Gauge, Image as ImageIcon, ImagePlus, Layers, List, Loader2, Maximize2, Minus,
  Monitor, Palette, Pause, PenLine, Play, Redo2, Save, Scissors, Send, SkipBack, SkipForward, Smartphone, Smile, SlidersHorizontal, Sparkles, Square, Ticket,
  Timer, Trash2, Type, Undo2, Volume2, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Palco } from '@/components/studio/editor/Palco';
import { CartaoDaAba, Faixa, abasDe, type Aba } from '@/components/studio/editor/Paineis';
import { LinhaDoTempo, type Selecao } from '@/components/studio/video/LinhaDoTempo';
import { CartaoDoAudio, CartaoDoClipe, CartaoDoProjeto, type AbaDoClipe } from '@/components/studio/video/PaineisDoVideo';
import { PublicarDialog } from '@/components/studioai/PublicarDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/lib/r2Upload';
import { TAMANHO_DOC, alturaDoTexto, alturaDosItens, forma, imagem, itens, selo, texto, type Camada, type Documento, type FormatoDoc, telaDoFormato } from '@/lib/studio/documento';
import { duracaoDoVideo } from '@/lib/studio/animacao';
import { MotorDeVideo, podeExportarQuadroAQuadro, type OpcoesDeQualidade, type VideoExportado } from '@/lib/studio/video/motor';

/**
 * F-301 (pedido do dono): QUALIDADE da exportação. "Máxima" monta o MP4 QUADRO A QUADRO (nenhum quadro perdido, H.264 de
 * alta taxa + AAC) — para TV e painel de LED; 60 quadros/s e 4K para painel grande. "Rápida" grava tocando (como antes).
 */
type Qualidade = 'maxima' | 'maxima60' | '4k' | 'rapida';
const QUALIDADES: Array<{ id: Qualidade; nome: string; o?: OpcoesDeQualidade }> = [
  { id: 'maxima', nome: 'Máxima · TV e LED (Full HD)', o: { fps: 30, escala: 1 } },
  { id: 'maxima60', nome: 'Máxima · 60 quadros/s', o: { fps: 60, escala: 1 } },
  { id: '4k', nome: 'Máxima · 4K (painel grande)', o: { fps: 30, escala: 2 } },
  { id: 'rapida', nome: 'Rápida (grava tocando)' },
];
const CHAVE_QUALIDADE = 'studio-video-qualidade';
import {
  CHAVE_ARTE_PARA_VIDEO, dividir, duracaoDoClipe, duracaoTotal, formatarTempo, idNovo, inicios, noTempo, novoClipe, projetoVazio,
  type Clipe, type FaixaDeAudio, type ProjetoDeVideo, type Sobreposicao, type TipoDeTransicao,
} from '@/lib/studio/video/linha';
import { cortarEm, moverClipePara, umQuadro, type Alvo, type Ferramenta } from '@/lib/studio/video/edicao';
import { listarProjetos, meuSaldo, obterProjeto, salvarNasMidias, salvarProjeto } from '@/lib/studioai/api';
import { baixar, nomeDoArquivo } from '@/lib/studioai/exportar';
import type { PastaDaGaleria } from '@/lib/galeria';
import { CHAVE_PROJETO_DO_CORE } from '@/lib/studio/video/doCore';
import { cn } from '@/lib/utils';

const PASTA_VIDEOS: PastaDaGaleria = { chave: 'studio-videos', nome: 'Vídeos do Studio', segmento: null };
const FIGURINHAS = ['🔥', '⭐', '💥', '🎉', '✅', '❤️', '👉', '🛒', '🍔', '🍕', '💪', '⚡', '🎁', '📢', '😍', '🤩', '💰', '🏷️', '🚚', '🆕'];
const MAX_ARQUIVO = 300 * 1024 * 1024;

const ABAS_CLIPE: { id: AbaDoClipe; nome: string; I: typeof Type }[] = [
  { id: 'cortar', nome: 'Cortar', I: Scissors }, { id: 'velocidade', nome: 'Velocidade', I: Gauge }, { id: 'volume', nome: 'Volume', I: Volume2 },
  { id: 'filtros', nome: 'Filtros', I: Wand2 }, { id: 'ajustes', nome: 'Ajustes', I: SlidersHorizontal }, { id: 'enquadrar', nome: 'Enquadrar', I: Maximize2 },
  { id: 'transicao', nome: 'Transição', I: Clapperboard },
];

function normalizar<T extends Camada>(c: T): T {
  if (c.tipo === 'texto') return { ...c, h: Math.round(alturaDoTexto(c)) };
  if (c.tipo === 'itens') return { ...c, h: Math.round(alturaDosItens(c)) };
  return c;
}

export default function VideoEditorPage() {
  return <EditorDeVideo />;
}

/** F-292: o projeto que vem do palco entra no editor sem perder o que a pessoa fez na linha do tempo (música, textos, filtros, tempos) */
/** F-300: faixas de LOCUÇÃO vêm do palco (id "loc-…"); as outras faixas são da pessoa e ficam */
const ehLocucao = (a: { id: string }) => a.id.startsWith('loc-');
function mesclarDoPalco(novo: ProjetoDeVideo, q: ProjetoDeVideo): ProjetoDeVideo {
  // com locução, o tempo de cada produto é o da fala (vem do palco); sem ela, fica o tempo que a pessoa ajustou
  const comLocucao = novo.audios.some(ehLocucao);
  const clipes = novo.clipes.map((c) => {
    const o = q.clipes.find((k) => k.tipo === 'arte' && k.nome === c.nome);
    return o ? { ...c, id: o.id, duracao: comLocucao ? c.duracao : o.duracao, velocidade: o.velocidade, filtro: o.filtro, ajustes: o.ajustes, zoomDe: o.zoomDe, zoomPara: o.zoomPara, transicao: { ...c.transicao, duracao: o.transicao.duracao || c.transicao.duracao } } : c;
  });
  return { ...novo, clipes: [...clipes, ...q.clipes.filter((k) => k.tipo !== 'arte')], sobreposicoes: q.sobreposicoes, audios: [...novo.audios.filter(ehLocucao), ...q.audios.filter((a) => !ehLocucao(a))] };
}

/**
 * F-292 (pedido do dono): o EDITOR DE VÍDEO inteiro (linha do tempo como no CapCut). `embutido` = embaixo da arte do palco de ofertas,
 * já preenchido com os produtos do palco (um clipe por produto) e acompanhando cada mudança feita no palco; a transição escolhida
 * num corte volta para o palco (`aoTransicao`).
 */
/**
 * F-297 (pedido do dono): o editor de vídeo como MESA DE EDIÇÃO de outra tela (o palco de ofertas), como nos aplicativos de
 * edição: UMA visualização só — a prévia do vídeo vai para `previa` (o mesmo lugar da arte animada) e as ferramentas do
 * clipe/texto/música escolhido vão para `ferramentas` (a lateral direita); aqui fica só a mesa: controles, adicionar e a
 * linha do tempo, sempre à vista junto com a arte.
 */
export interface MesaDoVideo {
  previa: HTMLElement | null;
  ferramentas: HTMLElement | null;
  /** a prévia do vídeo está à vista (quando a arte do palco volta, o vídeo pausa) */
  visivel: boolean;
  /** a pessoa mexeu na mesa (tocar, linha do tempo, adicionar): a visualização passa a mostrar o vídeo */
  aoUsar: () => void;
  /** tocou num ponto da prévia parada: o clipe (produto) daquele instante e o documento dele */
  aoTocarNaTela?: (nomeDoClipe: string, ev: EventoDoMouse<HTMLElement>, doc: Documento) => void;
  /** o produto em edição no palco: o cursor da linha do tempo vai para o clipe dele */
  clipeEmFoco?: string | null;
  /** F-306: "Visualizar vídeo e salvar" da tela de fora — cada aumento monta o MP4 (e mostra Salvar/Publicar/Baixar) */
  exportarAgora?: number;
}

export function EditorDeVideo({ embutido = false, projetoInicial = null, nomeInicial, aoTransicao, mesa }: { embutido?: boolean; projetoInicial?: ProjetoDeVideo | null; nomeInicial?: string; aoTransicao?: (nomeDoClipe: string, tipo: TipoDeTransicao) => void; mesa?: MesaDoVideo }) {
  const params = useParams();
  const projetoId = embutido ? undefined : params.projetoId;
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  const clienteId = saldo.data?.cliente ?? null;
  const maxGaleria = clienteId ? 20 : 180; // anunciante: até 20 s (regra das mídias dele)

  const [p, setP] = useState<ProjetoDeVideo>(() => projetoInicial ?? projetoVazio('16:9'));
  const [nome, setNome] = useState(nomeInicial ?? 'Meu vídeo');
  const [idProjeto, setIdProjeto] = useState<string | null>(projetoId ?? null);
  const [sel, setSel] = useState<Selecao>(null);
  const [aba, setAba] = useState<string>('projeto');
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [versaoMidia, setVersaoMidia] = useState(0);
  const [enviando, setEnviando] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [exportando, setExportando] = useState<number | null>(null);
  const [exportado, setExportado] = useState<{ v: VideoExportado; url: string } | null>(null);
  const [qualidade, setQualidade] = useState<Qualidade>(() => { try { const q = localStorage.getItem(CHAVE_QUALIDADE) as Qualidade | null; return q && QUALIDADES.some((x) => x.id === q) ? q : 'maxima'; } catch { return 'maxima'; } });
  useEffect(() => { try { localStorage.setItem(CHAVE_QUALIDADE, qualidade); } catch { /* sem armazenamento */ } }, [qualidade]);
  const [publicando, setPublicando] = useState(false);
  const [escolher, setEscolher] = useState<null | 'galeria' | 'arte' | 'elementos'>(null);
  const [carregado, setCarregado] = useState(!projetoId);
  const tela = useRef<HTMLCanvasElement | null>(null);
  const motor = useRef<MotorDeVideo | null>(null);
  const locais = useRef(new Map<string, string>());
  const passado = useRef<ProjetoDeVideo[]>([]);
  const futuro = useRef<ProjetoDeVideo[]>([]);
  const [, setVersao] = useState(0);
  const arqMidia = useRef<HTMLInputElement>(null);
  const arqAudio = useRef<HTMLInputElement>(null);
  const arqLogo = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const total = duracaoTotal(p);

  // ── motor: cria quando a tela (canvas) aparece — na mesa ela vive dentro da visualização da outra tela; recebe o projeto a cada mudança
  const [telaEl, setTelaEl] = useState<HTMLCanvasElement | null>(null);
  const refTela = useCallback((el: HTMLCanvasElement | null) => { tela.current = el; setTelaEl(el); }, []);
  const pAtual = useRef(p);
  pAtual.current = p;
  useEffect(() => {
    if (!telaEl) return;
    const m = new MotorDeVideo(telaEl);
    m.resolver = (src) => locais.current.get(src) ?? src;
    let ultimo = 0;
    m.onTempo = (t) => { const agora = performance.now(); if (agora - ultimo > 90 || !m.tocando) { ultimo = agora; setTempo(t); } };
    m.onFim = () => { setTocando(false); setTempo(m.tempo); };
    m.onMudouMidia = () => setVersaoMidia((v) => v + 1);
    motor.current = m;
    void m.definir(pAtual.current);
    return () => { m.destruir(); motor.current = null; };
  }, [telaEl]);
  useEffect(() => { void motor.current?.definir(p); }, [p]);

  // F-292: embutido no palco: acompanha o palco
  useEffect(() => { if (embutido && projetoInicial) setP((q) => mesclarDoPalco(projetoInicial, q)); }, [embutido, projetoInicial]);
  // ── abre projeto salvo, ou uma arte vinda do editor de imagens
  useEffect(() => {
    if (embutido) return;
    if (projetoId) {
      void obterProjeto(projetoId).then((pr) => {
        const d = pr?.dados as unknown as ProjetoDeVideo | undefined;
        if (d?.tipo === 'video') { setP(d); setNome(pr!.nome); }
        setCarregado(true);
      });
      return;
    }
    // F-267 (MG-AUT-08): "transforme esta arte em vídeo" vindo da Central de Comando — a arte é uma mídia da PRÓPRIA pessoa
    // (lida com o login dela: a regra de acesso do banco decide). Vira um clipe com movimento de câmera na duração pedida.
    const busca = new URLSearchParams(window.location.search);
    const midiaId = busca.get('midia');
    if (midiaId && /^[0-9a-f-]{36}$/i.test(midiaId)) {
      const duracao = Math.min(60, Math.max(5, Number(busca.get('duracao')) || 15));
      void supabase.from('media').select('id, name, file_url, mime_type, file_type, aspect_ratio').eq('id', midiaId).maybeSingle().then(({ data: m }) => {
        if (!m?.file_url || !/^image/i.test(String(m.mime_type ?? m.file_type ?? ''))) { toast.error('A arte pedida não foi encontrada na sua biblioteca.'); return; }
        const emPe = /9\s*[:/x]\s*16/.test(String(m.aspect_ratio ?? ''));
        setP((x) => ({ ...x, formato: emPe ? '9:16' : '16:9', clipes: [novoClipe('imagem', m.file_url as string, m.name as string, { duracao, zoomDe: 1, zoomPara: 1.12 })] }));
        setNome(`${m.name} (vídeo)`);
        toast.success(`"${m.name}" virou um vídeo de ${duracao} s. Confira e clique em Exportar vídeo.`);
      });
      return;
    }
    try {
      // MG-STUDIO-03: projeto montado pelo Creative Core a partir do plano de uma produção
      const doCore = sessionStorage.getItem(CHAVE_PROJETO_DO_CORE);
      if (doCore) {
        sessionStorage.removeItem(CHAVE_PROJETO_DO_CORE);
        const { projeto, nome: n } = JSON.parse(doCore) as { projeto: ProjetoDeVideo; nome: string };
        if (projeto?.tipo === 'video') { setP(projeto); setNome(n); return; }
      }
    } catch { /* sem projeto do Core */ }
    try {
      const bruto = sessionStorage.getItem(CHAVE_ARTE_PARA_VIDEO);
      if (!bruto) return;
      sessionStorage.removeItem(CHAVE_ARTE_PARA_VIDEO);
      const { doc, nome: n } = JSON.parse(bruto) as { doc: Documento; nome: string };
      setP((x) => ({ ...x, formato: telaDoFormato(doc.formato), clipes: [novoClipe('arte', '', n, { documento: doc, duracao: duracaoDoVideo(doc), zoomPara: 1 })] }));
      setNome(n);
    } catch { /* sem arte para trazer */ }
  }, [projetoId]);

  const lembrar = useCallback(() => { passado.current = [...passado.current.slice(-59), p]; futuro.current = []; setVersao((v) => v + 1); }, [p]);
  const mudar = (f: (x: ProjetoDeVideo) => ProjetoDeVideo, guardar = true) => { if (guardar) lembrar(); setP(f); setExportado(null); };
  const ultimoAjuste = useRef(0);
  const mudarSuave = (f: (x: ProjetoDeVideo) => ProjetoDeVideo) => { const agora = Date.now(); mudar(f, agora - ultimoAjuste.current > 800); ultimoAjuste.current = agora; };
  const desfazer = () => { const a = passado.current.pop(); if (!a) return; futuro.current.push(p); setP(a); setVersao((v) => v + 1); };
  const refazer = () => { const a = futuro.current.pop(); if (!a) return; passado.current.push(p); setP(a); setVersao((v) => v + 1); };

  const mudarClipe = (id: string, x: Partial<Clipe>, suave = true) => {
    // F-292: a transição de um produto do palco volta para o palco (cada produto com a sua)
    if (embutido && x.transicao && aoTransicao) { const c = p.clipes.find((k) => k.id === id); if (c?.tipo === 'arte') aoTransicao(c.nome, x.transicao.tipo); }
    (suave ? mudarSuave : mudar)((q) => ({ ...q, clipes: q.clipes.map((c) => (c.id === id ? { ...c, ...x } : c)) }));
  };
  const mudarSob = (id: string, x: Partial<Sobreposicao>, suave = true) => (suave ? mudarSuave : mudar)((q) => ({ ...q, sobreposicoes: q.sobreposicoes.map((s) => (s.id === id ? normalizar({ ...s, ...x } as Sobreposicao) : s)) }));
  const mudarAudio = (id: string, x: Partial<FaixaDeAudio>, suave = true) => (suave ? mudarSuave : mudar)((q) => ({ ...q, audios: q.audios.map((a) => (a.id === id ? { ...a, ...x } : a)) }));

  // F-232: ferramentas da linha do tempo (estilo DaVinci Resolve)
  const [ferramenta, setFerramenta] = useState<Ferramenta>('selecao');
  const [ima, setIma] = useState(true);
  const cortarComLamina = (alvo: Alvo, t: number) => {
    const r = cortarEm(p, alvo, t);
    if (!r) { toast.info('Corte muito perto da ponta: toque um pouco mais para dentro.'); return; }
    mudar(() => r.projeto);
    setSel({ tipo: alvo.tipo, id: r.novoId });
  };
  const moverClipeNaFaixa = (id: string, inicioNovo: number) => mudar((q) => moverClipePara(q, id, inicioNovo), false);

  const clipeSel = sel?.tipo === 'clipe' ? p.clipes.find((c) => c.id === sel.id) ?? null : null;
  const sobSel = sel?.tipo === 'sob' ? p.sobreposicoes.find((s) => s.id === sel.id) ?? null : null;
  const audioSel = sel?.tipo === 'audio' ? p.audios.find((a) => a.id === sel.id) ?? null : null;

  // o texto/elemento escolhido aparece inteiro (sem a animação) enquanto edita
  useEffect(() => { const m = motor.current; if (!m) return; m.destaque = sobSel?.id ?? null; if (!m.tocando) m.ir(m.tempo); }, [sobSel?.id]);

  // ao escolher, abre o primeiro cartão do tipo
  useEffect(() => {
    if (!sel) setAba('projeto');
    else if (sel.tipo === 'clipe') setAba((a) => (ABAS_CLIPE.some((x) => x.id === a) ? a : 'cortar'));
    else if (sel.tipo === 'audio') setAba('audio');
    else setAba((a) => (a === 'tempo' || abasDe(sobSel).some((x) => x.id === a) ? a : abasDe(sobSel)[0].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.tipo, sel?.id]);

  // ── tocar / parar / ir
  const tocarPausar = () => { const m = motor.current; if (!m) return; if (m.tocando) { m.pausar(); setTocando(false); } else { m.tocar(); setTocando(true); } };
  const ir = (t: number) => { motor.current?.ir(t); setTempo(Math.max(0, Math.min(total, t))); };

  /** F-297: na mesa, escolher um clipe mostra a arte já montada (os elementos entram nos primeiros segundos) */
  const noMeioDoClipe = (c: Clipe) => Math.min(2.5, duracaoDoClipe(c) * 0.4);
  // F-297: na mesa do palco — a arte voltou para a visualização: o vídeo pausa
  useEffect(() => { if (mesa && !mesa.visivel && motor.current?.tocando) { motor.current.pausar(); setTocando(false); } }, [mesa?.visivel]); // eslint-disable-line react-hooks/exhaustive-deps
  // F-297: o produto em edição no palco leva o cursor da linha do tempo para o clipe dele
  useEffect(() => {
    const n = mesa?.clipeEmFoco;
    if (!n) return;
    const i = p.clipes.findIndex((c) => c.nome === n);
    if (i < 0) return;
    const ini = inicios(p.clipes)[i];
    if (tempo < ini || tempo >= ini + duracaoDoClipe(p.clipes[i])) ir(ini + noMeioDoClipe(p.clipes[i]));
  }, [mesa?.clipeEmFoco]); // eslint-disable-line react-hooks/exhaustive-deps
  // F-297: escolheu um clipe/texto/música na linha do tempo: a lateral volta ao topo, onde abrem as ferramentas dele
  useEffect(() => { if (mesa?.ferramentas && sel) mesa.ferramentas.parentElement?.scrollTo?.({ top: 0, behavior: 'smooth' }); }, [sel?.tipo, sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /** F-297: tocar na prévia — tocando: pausa; parada: abre a edição do elemento tocado no produto daquele instante */
  const tocarNaTela = (ev: EventoDoMouse<HTMLCanvasElement>) => {
    if (!mesa) return;
    if (motor.current?.tocando) { tocarPausar(); return; }
    const q = noTempo(p.clipes, tempo).atual;
    if (q?.clipe.tipo === 'arte' && q.clipe.documento && mesa.aoTocarNaTela) mesa.aoTocarNaTela(q.clipe.nome, ev, q.clipe.documento);
  };

  // ── atalhos de teclado
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === ' ') { e.preventDefault(); tocarPausar(); }
      else if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); }
      // F-232: atalhos do DaVinci — B lâmina, A seleção, N ímã, Ctrl+B dividir no cursor, setas = 1 quadro, J/K/L
      else if (ctrl && e.key.toLowerCase() === 'b') { e.preventDefault(); dividirNoCursor(); }
      else if (!ctrl && e.key.toLowerCase() === 'b') setFerramenta('lamina');
      else if (!ctrl && e.key.toLowerCase() === 'a') setFerramenta('selecao');
      else if (!ctrl && e.key.toLowerCase() === 'n') setIma((v) => !v);
      else if (e.key === 'ArrowRight') { e.preventDefault(); ir(umQuadro(tempo, 1)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(umQuadro(tempo, -1)); }
      else if (e.key.toLowerCase() === 'k') { motor.current?.pausar(); setTocando(false); }
      else if (e.key.toLowerCase() === 'l') { if (!motor.current?.tocando) tocarPausar(); }
      else if (e.key.toLowerCase() === 'j') { motor.current?.pausar(); setTocando(false); ir(Math.max(0, tempo - 1)); }
      else if (e.key === 'Home') ir(0);
      else if (e.key === 'End') ir(total);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); excluir(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  // ── enviar arquivos para o R2 em segundo plano (o vídeo já toca pelo arquivo local)
  const enviarAoR2 = (f: File, local: string) => {
    if (!user) return;
    setEnviando((n) => n + 1);
    const nomeSeguro = f.name.normalize('NFD').replace(/[^\w.-]+/g, '-').slice(-60);
    void uploadToR2(f, `${user.id}/studio/video/${Date.now()}-${nomeSeguro}`, f.type, user.id, { preventOverwrite: true })
      .then(({ publicUrl }) => {
        locais.current.set(publicUrl, local);
        setP((q) => ({
          ...q,
          clipes: q.clipes.map((c) => (c.src === local ? { ...c, src: publicUrl } : c)),
          audios: q.audios.map((a) => (a.src === local ? { ...a, src: publicUrl } : a)),
          sobreposicoes: q.sobreposicoes.map((s) => (s.tipo === 'imagem' && s.src === local ? { ...s, src: publicUrl } : s)),
        }));
      })
      .catch((e) => toast.error(`Não foi possível guardar "${f.name}": ${(e as Error).message}`))
      .finally(() => setEnviando((n) => n - 1));
  };

  const inserirClipes = (novos: Clipe[]) => {
    mudar((q) => {
      const i = clipeSel ? q.clipes.findIndex((c) => c.id === clipeSel.id) + 1 : q.clipes.length;
      const l = [...q.clipes]; l.splice(i, 0, ...novos);
      return { ...q, clipes: l };
    });
    setSel({ tipo: 'clipe', id: novos[novos.length - 1].id });
  };

  const adicionarArquivos = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const novos: Clipe[] = [];
    for (const f of Array.from(lista)) {
      if (f.size > MAX_ARQUIVO) { toast.error(`"${f.name}" passa de 300 MB.`); continue; }
      const local = URL.createObjectURL(f);
      if (f.type.startsWith('video/')) {
        const d = await MotorDeVideo.lerDuracao(local, 'video');
        if (!d) { toast.error(`Este navegador não abre o vídeo "${f.name}". Use MP4 (H.264) ou WebM.`); continue; }
        novos.push(novoClipe('video', local, f.name.replace(/\.[^.]+$/, ''), { duracaoArquivo: d, fim: d }));
      } else if (f.type.startsWith('image/')) novos.push(novoClipe('imagem', local, f.name.replace(/\.[^.]+$/, '')));
      else { toast.error(`"${f.name}" não é vídeo nem foto.`); continue; }
      enviarAoR2(f, local);
    }
    if (novos.length) inserirClipes(novos);
  };

  const adicionarAudio = async (lista: FileList | null) => {
    const f = lista?.[0];
    if (!f) return;
    if (!f.type.startsWith('audio/') && !f.type.startsWith('video/')) { toast.error('Escolha uma música ou áudio (MP3, M4A, WAV…).'); return; }
    const local = URL.createObjectURL(f);
    const d = await MotorDeVideo.lerDuracao(local, 'audio');
    if (!d) { toast.error('Este navegador não abre esse áudio. Use MP3 ou M4A.'); return; }
    const a: FaixaDeAudio = { id: idNovo('a'), nome: f.name.replace(/\.[^.]+$/, ''), src: local, duracaoArquivo: d, em: 0, inicio: 0, fim: d, volume: 0.8, somEntra: 0.5, somSai: 1.5, repetir: false };
    mudar((q) => ({ ...q, audios: [...q.audios, a] }));
    setSel({ tipo: 'audio', id: a.id });
    enviarAoR2(f, local);
  };

  const { w: W, h: H } = TAMANHO_DOC[p.formato];
  const noMeio = <T extends Camada>(c: T, y?: number): T => ({ ...c, x: Math.round(W / 2 - c.w / 2), y: Math.round(y ?? H / 2 - c.h / 2) });
  const adicionarSob = (c: Camada, dur = 3) => {
    const s = normalizar({ ...c, de: Math.min(tempo, Math.max(0, total - 0.5)), ate: Math.min(tempo, Math.max(0, total - 0.5)) + dur, animacao: c.animacao ?? { tipo: 'subir', atraso: 0, duracao: 0.6 } } as Sobreposicao);
    if (!p.clipes.length) { s.de = 0; s.ate = dur; }
    mudar((q) => ({ ...q, sobreposicoes: [...q.sobreposicoes, s] }));
    setSel({ tipo: 'sob', id: s.id });
    motor.current?.pausar(); setTocando(false);
  };
  const ferramentasAdd: { n: string; I: typeof Type; f: () => void; id: string }[] = [
    { id: 'midia', n: 'Vídeo/Foto', I: Film, f: () => arqMidia.current?.click() },
    { id: 'galeria', n: 'Galeria', I: FolderOpen, f: () => setEscolher('galeria') },
    { id: 'arte', n: 'Arte do Studio', I: Sparkles, f: () => setEscolher('arte') },
    { id: 'texto', n: 'Texto', I: Type, f: () => adicionarSob(noMeio(texto('Texto', 'SEU TEXTO AQUI', 0, 0, Math.round(W * 0.7), { fonte: 'anton', tamanho: p.formato === '16:9' ? 110 : 120, maiusculas: true, alinhamento: 'center', sombra: { cor: 'rgba(0,0,0,.55)', desfoque: 18, dx: 0, dy: 6 } }))) },
    { id: 'legenda', n: 'Legenda', I: PenLine, f: () => adicionarSob(noMeio(texto('Legenda', 'Escreva a legenda', 0, 0, Math.round(W * 0.8), { tamanho: 44, peso: 700, alinhamento: 'center', cor: '#ffffff', fundo: { cor: 'rgba(0,0,0,0.65)', raio: 18, margem: 22 } }), H * 0.82), 4) },
    { id: 'preco', n: 'Preço', I: Ticket, f: () => adicionarSob(noMeio(texto('Preço', 'R$ 9,99', 0, 0, 640, { fonte: 'anton', tamanho: 150, cor: '#111111', alinhamento: 'center', fundo: { cor: '#ffd21f', raio: 30, margem: 30 }, sombra: { cor: 'rgba(0,0,0,.4)', desfoque: 24, dx: 0, dy: 8 } })), 3) },
    { id: 'elementos', n: 'Elementos', I: Smile, f: () => setEscolher('elementos') },
    { id: 'logo', n: 'Logo/Imagem', I: ImagePlus, f: () => arqLogo.current?.click() },
    { id: 'musica', n: 'Música', I: AudioLines, f: () => arqAudio.current?.click() },
  ];
  const adicionarLogo = (lista: FileList | null) => {
    const f = lista?.[0];
    if (!f || !f.type.startsWith('image/')) return;
    const local = URL.createObjectURL(f);
    const lado = Math.round(Math.min(W, H) * 0.3);
    adicionarSob({ ...imagem('Logo', local, Math.round(W - lado - 40), 40, lado, lado, { raio: 0 }), animacao: { tipo: 'zoom', atraso: 0, duracao: 0.6 } }, Math.max(3, total));
    enviarAoR2(f, local);
  };

  // ── ações do escolhido
  const excluir = () => {
    if (!sel) return;
    mudar((q) => ({ ...q, clipes: q.clipes.filter((c) => c.id !== sel.id), sobreposicoes: q.sobreposicoes.filter((s) => s.id !== sel.id), audios: q.audios.filter((a) => a.id !== sel.id) }));
    setSel(null);
  };
  const duplicar = () => {
    if (clipeSel) { const n = { ...clipeSel, id: idNovo('c') }; mudar((q) => { const l = [...q.clipes]; l.splice(l.findIndex((c) => c.id === clipeSel.id) + 1, 0, n); return { ...q, clipes: l }; }); setSel({ tipo: 'clipe', id: n.id }); }
    else if (sobSel) { const d = sobSel.ate - sobSel.de; const n = { ...sobSel, id: idNovo('s'), x: sobSel.x + 30, y: sobSel.y + 30, de: sobSel.ate, ate: sobSel.ate + d }; mudar((q) => ({ ...q, sobreposicoes: [...q.sobreposicoes, n] })); setSel({ tipo: 'sob', id: n.id }); }
  };
  const dividirNoCursor = () => {
    const q = noTempo(p.clipes, tempo);
    const alvo = clipeSel && q.atual?.clipe.id !== clipeSel.id ? null : q.atual;
    if (!alvo) { toast.info('Leve o cursor (linha branca) para dentro do clipe e toque em Dividir.'); return; }
    const partes = dividir(alvo.clipe, alvo.local);
    if (!partes) { toast.info('Muito perto da ponta do clipe para dividir.'); return; }
    mudar((x) => { const l = [...x.clipes]; l.splice(alvo.indice, 1, ...partes); return { ...x, clipes: l }; });
    setSel({ tipo: 'clipe', id: partes[1].id });
  };
  const congelar = () => agir('congelar', async () => {
    const q = noTempo(p.clipes, tempo).atual;
    const b = await motor.current?.quadroAtual();
    if (!b || !q) throw new Error('Leve o cursor até o quadro que quer congelar.');
    const f = new File([b], `quadro-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const local = URL.createObjectURL(f);
    const novo = novoClipe('imagem', local, `Quadro de ${q.clipe.nome}`, { duracao: 2, zoomPara: 1, transicao: { tipo: 'corte', duracao: 0 } });
    // divide no cursor e põe o quadro parado no meio (na ponta do clipe: antes ou depois dele)
    const partes = dividir(q.clipe, q.local);
    mudar((x) => { const l = [...x.clipes]; if (partes) l.splice(q.indice, 1, partes[0], novo, partes[1]); else l.splice(q.local < duracaoDoClipe(q.clipe) / 2 ? q.indice : q.indice + 1, 0, novo); return { ...x, clipes: l }; });
    setSel({ tipo: 'clipe', id: novo.id });
    enviarAoR2(f, local);
  });
  const moverClipe = (d: -1 | 1) => clipeSel && mudar((q) => {
    const i = q.clipes.findIndex((c) => c.id === clipeSel.id); const j = i + d;
    if (j < 0 || j >= q.clipes.length) return q;
    const l = [...q.clipes]; [l[i], l[j]] = [l[j], l[i]]; return { ...q, clipes: l };
  });
  const moverSob = (para: 'cima' | 'baixo' | 'topo' | 'fundo') => sobSel && mudar((q) => {
    const l = [...q.sobreposicoes]; const i = l.findIndex((s) => s.id === sobSel.id); const [s] = l.splice(i, 1);
    const j = para === 'topo' ? l.length : para === 'fundo' ? 0 : Math.max(0, Math.min(l.length, i + (para === 'cima' ? 1 : -1)));
    l.splice(j, 0, s); return { ...q, sobreposicoes: l };
  });

  const agir = async (n: string, f: () => Promise<void>) => { setOcupado(n); try { await f(); } catch (e) { toast.error((e as Error).message || 'Não foi possível concluir.'); } finally { setOcupado(null); } };
  const salvar = () => agir('salvar', async () => {
    if (enviando > 0) throw new Error('Espere terminar de guardar as mídias na nuvem (alguns segundos) e salve de novo.');
    if ([...p.clipes.map((c) => c.src), ...p.audios.map((a) => a.src)].some((s) => s.startsWith('blob:'))) throw new Error('Alguma mídia não foi guardada na nuvem. Remova-a e adicione de novo.');
    const id = await salvarProjeto({ id: idProjeto, modeloId: 'video', nome: nome.trim() || 'Meu vídeo', formato: p.formato, dados: p as unknown as Record<string, unknown>, miniatura: null });
    setIdProjeto(id);
    if (!projetoId) navegar(`/studio/video/${id}`, { replace: true });
    void qc.invalidateQueries({ queryKey: ['studio-projetos'] });
    toast.success('Projeto de vídeo salvo em Meus Projetos.');
  });
  const exportar = () => agir('exportar', async () => {
    if (!p.clipes.length && !p.sobreposicoes.length) throw new Error('Adicione um vídeo, foto ou arte antes de exportar.');
    setTocando(false); setSel(null); setExportando(0);
    try {
      const q = QUALIDADES.find((x) => x.id === qualidade);
      const v = q?.o && podeExportarQuadroAQuadro()
        ? await motor.current!.exportarQuadroAQuadro(q.o, (f) => setExportando(f))
        : await motor.current!.exportar((f) => setExportando(f));
      setExportado({ v, url: URL.createObjectURL(v.video) });
      toast.success('Vídeo pronto! Salve na galeria, publique ou baixe.');
    } finally { setExportando(null); setTempo(motor.current?.tempo ?? 0); }
  });
  /**
   * F-304 (pedido do dono, 12/11/2026): o vídeo criado vai para MEUS PROJETOS — o projeto (para continuar editando) e o
   * vídeo pronto (MP4 + capa, na nuvem, na pasta da pessoa). `publicar`: depois de salvar, escolhe a tela (como já é).
   */
  const enviadoDoExportado = useRef<{ v: VideoExportado; video: string; capa: string | null } | null>(null);
  const salvarEmMeusProjetos = (publicar: boolean) => exportado && user && agir(publicar ? 'salvar-publicar' : 'salvar-projeto', async () => {
    let enviado = enviadoDoExportado.current?.v === exportado.v ? enviadoDoExportado.current : null;
    if (!enviado) {
      const base = `${user.id}/studio/projetos/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const video = (await uploadToR2(exportado.v.video, `${base}.${exportado.v.ext}`, exportado.v.mime, user.id, { preventOverwrite: true })).publicUrl;
      const capa = exportado.v.capa ? (await uploadToR2(exportado.v.capa, `${base}-capa.jpg`, 'image/jpeg', user.id, { preventOverwrite: true })).publicUrl : null;
      enviado = { v: exportado.v, video, capa };
      enviadoDoExportado.current = enviado;
    }
    const pronto = { url: enviado.video, capa: enviado.capa, largura: exportado.v.largura, altura: exportado.v.altura, duracaoMs: exportado.v.duracaoMs, mime: exportado.v.mime, criadoEm: new Date().toISOString() };
    const id = await salvarProjeto({ id: idProjeto, modeloId: 'video', nome: nome.trim() || 'Meu vídeo', formato: p.formato, dados: { ...(p as unknown as Record<string, unknown>), videoPronto: pronto }, miniatura: enviado.capa });
    setIdProjeto(id);
    if (!projetoId && !embutido) navegar(`/studio/video/${id}`, { replace: true });
    void qc.invalidateQueries({ queryKey: ['studio-projetos'] });
    if (publicar) {
      if (total > maxGaleria) { toast.success('Vídeo salvo em Meus Projetos.'); toast.error(`Para as telas, o vídeo pode ter até ${maxGaleria} s (este tem ${Math.round(total)} s). Corte para publicar.`); return; }
      toast.success('Vídeo salvo em Meus Projetos. Agora escolha a tela para publicar.');
      setPublicando(true);
    } else toast.success('Vídeo salvo em Meus Projetos.');
  });
  // F-306: o botão "Visualizar vídeo e salvar" da tela do palco pede o vídeo pronto
  const ultimoPedido = useRef(mesa?.exportarAgora ?? 0);
  useEffect(() => {
    const n = mesa?.exportarAgora ?? 0;
    if (n > ultimoPedido.current) { ultimoPedido.current = n; exportar(); }
  }, [mesa?.exportarAgora]); // eslint-disable-line react-hooks/exhaustive-deps
  const salvarNaGaleria = () => exportado && user && agir('galeria', async () => {
    if (total > maxGaleria) throw new Error(`Para as telas, o vídeo pode ter até ${maxGaleria} s (este tem ${Math.round(total)} s). Corte ou baixe o arquivo.`);
    await salvarNasMidias({ userId: user.id, clienteId, video: exportado.v, nome: nome.trim() || 'Meu vídeo', largura: exportado.v.largura, altura: exportado.v.altura, formato: p.formato, pasta: PASTA_VIDEOS });
    toast.success(`Vídeo salvo na sua galeria, na pasta "${PASTA_VIDEOS.nome}".`);
  });

  // ── palco (textos/elementos por cima do vídeo: arrastar, girar, redimensionar)
  const ativas = useMemo(() => (tocando ? [] : p.sobreposicoes.filter((s) => tempo >= s.de && tempo < s.ate)), [tocando, p.sobreposicoes, tempo]);
  const docPalco: Documento = useMemo(() => ({ versao: 2, formato: p.formato, fundo: 'transparent', camadas: ativas }), [p.formato, ativas]);
  const docSob: Documento = { versao: 2, formato: p.formato, fundo: p.fundo, camadas: p.sobreposicoes };

  const abasSob = sobSel ? [...abasDe(sobSel).filter((a) => a.id !== 'camadas'), { id: 'tempo' as Aba, nome: 'Tempo', I: Timer }] : [];
  const abas = clipeSel ? ABAS_CLIPE : sobSel ? abasSob : audioSel ? [{ id: 'audio', nome: 'Música', I: AudioLines }] : [{ id: 'projeto', nome: 'Projeto', I: Layers }];
  const botao = 'flex min-h-[56px] min-w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 text-[11px] font-semibold leading-tight transition active:scale-95';
  const vertical = p.formato === '9:16';

  if (!carregado) return <p className="p-10 text-sm text-slate-400">Abrindo o editor de vídeo…</p>;

  const entradas = (
    <>
      <input ref={arqMidia} type="file" multiple accept="video/*,image/*" className="sr-only" onChange={(e) => { void adicionarArquivos(e.target.files); e.target.value = ''; }} />
      <input ref={arqAudio} type="file" accept="audio/*,video/mp4" className="sr-only" onChange={(e) => { void adicionarAudio(e.target.files); e.target.value = ''; }} />
      <input ref={arqLogo} type="file" accept="image/*" className="sr-only" onChange={(e) => { adicionarLogo(e.target.files); e.target.value = ''; }} />
    </>
  );
  // ── a prévia (no editor sozinho fica aqui; na mesa vai para a visualização da outra tela)
  const previa = (
    <div className={cn('relative', mesa ? 'w-full' : 'mx-auto')} style={mesa ? undefined : vertical ? { width: 'min(62vw, calc((100dvh - 330px) * 0.5625), 380px)' } : { maxWidth: 'calc((100dvh - 360px) * 1.7778)', minWidth: 240 }}>
      <canvas ref={refTela} onClick={mesa ? tocarNaTela : undefined} className={cn('block w-full rounded-lg bg-black shadow-2xl', mesa && 'cursor-pointer rounded-xl')} style={{ aspectRatio: vertical ? '9 / 16' : '16 / 9' }} data-testid="video-tela" />
      {!tocando && ativas.length > 0 && (
        <div className="absolute inset-0">
          <Palco doc={docPalco} semPrevia sel={sobSel?.id ?? null} onSelecionar={(id) => setSel(id ? { tipo: 'sob', id } : null)} onInicio={lembrar}
            onMudar={(id, x) => mudarSob(id, x as Partial<Sobreposicao>, false)} onApagar={() => excluir()} onDuplicar={() => duplicar()}
            onEditarTexto={() => { setAba('texto'); setTimeout(() => textoRef.current?.focus(), 30); }} />
        </div>
      )}
      {exportando !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/70 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFD400]" />
          <p className="text-sm font-bold text-[#FFD400]">Criando o vídeo… {Math.round(exportando * 100)}%</p>
          <p className="px-4 text-[11px] text-slate-300">{qualidade === 'rapida' ? `Deixe esta tela aberta até terminar (${total.toFixed(0)} s).` : 'Montando quadro a quadro em qualidade máxima. Deixe esta tela aberta até terminar.'}</p>
        </div>
      )}
    </div>
  );
  const transporte = (pequeno: boolean) => (
    <>
      <button type="button" onClick={() => ir(0)} aria-label="Voltar ao começo" className={cn('items-center justify-center rounded-full border border-white/15', pequeno ? 'hidden h-9 w-9 sm:flex' : 'flex h-11 w-11')}><SkipBack className={pequeno ? 'h-4 w-4' : 'h-5 w-5'} /></button>
      <button type="button" onClick={() => ir(tempo - 1)} aria-label="Voltar 1 segundo" className={cn('items-center justify-center rounded-full border border-white/15 text-xs', pequeno ? 'hidden h-9 px-2 sm:flex' : 'flex h-11 px-3')}>−1s</button>
      <button type="button" onClick={tocarPausar} aria-label={tocando ? 'Pausar' : 'Tocar'} className={cn('flex items-center justify-center rounded-full bg-[#FFD400] text-[#22004A] shadow-[0_0_20px_rgba(255,212,0,.5)]', pequeno ? 'h-11 w-11' : 'h-14 w-14')} data-testid="video-play">{tocando ? <Pause className={pequeno ? 'h-6 w-6' : 'h-7 w-7'} /> : <Play className={cn('ml-1', pequeno ? 'h-6 w-6' : 'h-7 w-7')} />}</button>
      <button type="button" onClick={() => ir(tempo + 1)} aria-label="Avançar 1 segundo" className={cn('items-center justify-center rounded-full border border-white/15 text-xs', pequeno ? 'hidden h-9 px-2 sm:flex' : 'flex h-11 px-3')}>+1s</button>
      <button type="button" onClick={dividirNoCursor} aria-label="Dividir no cursor" className={cn('flex items-center gap-1 rounded-full border border-[#FFD400]/50 text-xs font-semibold text-[#FFD400]', pequeno ? 'h-9 px-2.5' : 'h-11 px-3')}><Scissors className="h-4 w-4" /><span className={pequeno ? 'hidden sm:inline' : undefined}>Dividir</span></button>
      <button type="button" onClick={() => ir(total)} aria-label="Ir ao fim" className={cn('hidden items-center justify-center rounded-full border border-white/15 sm:flex', pequeno ? 'h-9 w-9' : 'h-11 w-11')}><SkipForward className={pequeno ? 'h-4 w-4' : 'h-5 w-5'} /></button>
    </>
  );
  const adicionar = (
    <div className={cn('flex gap-1.5 overflow-x-auto rounded-xl border border-white/10 bg-[#140632] p-1.5', mesa && 'p-1')} aria-label="Adicionar">
      {ferramentasAdd.map(({ id, n, I, f }) => (
        mesa
          ? <button key={id} type="button" onClick={f} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-[11px] font-semibold text-slate-200 hover:border-[#8A2EFF]/50 hover:bg-white/5" data-testid={`video-add-${id}`}><I className="h-4 w-4 text-[#B04DFF]" />{n}</button>
          : <button key={id} type="button" onClick={f} className={cn(botao, 'border-transparent text-slate-200 hover:border-[#8A2EFF]/50 hover:bg-white/5')} data-testid={`video-add-${id}`}><I className="h-5 w-5 text-[#B04DFF]" />{n}</button>
      ))}
    </div>
  );
  const linhaDoTempo = (
    <LinhaDoTempo projeto={p} tempo={tempo} sel={sel} motor={motor.current} versaoMidia={versaoMidia} onSelecionar={(s) => { setSel(s); if (s?.tipo === 'clipe') { const i = p.clipes.findIndex((c) => c.id === s.id); const ini = inicios(p.clipes)[i]; if (tempo < ini || tempo > ini + duracaoDoClipe(p.clipes[i])) ir(ini + (mesa ? noMeioDoClipe(p.clipes[i]) : 0.05)); } else if (s?.tipo === 'sob') { const x = p.sobreposicoes.find((o) => o.id === s.id); if (x && (tempo < x.de || tempo >= x.ate)) ir(x.de + 0.05); } }}
      onIr={ir} onInicio={lembrar} onClipe={(id, x) => mudarClipe(id, x, false)} onSob={(id, x) => mudarSob(id, x, false)} onAudio={(id, x) => mudarAudio(id, x, false)}
      ferramenta={ferramenta} ima={ima} onFerramenta={setFerramenta} onIma={setIma} onDividir={dividirNoCursor} onCortarEm={cortarComLamina} onMoverClipe={moverClipeNaFaixa}
      onTransicao={(id) => { setSel({ tipo: 'clipe', id }); setTimeout(() => setAba('transicao'), 0); }} />
  );
  // ── ferramentas do escolhido (no editor sozinho: ao lado; na mesa: no topo da lateral da outra tela)
  const ferramentasDoEscolhido = (
    <>
      <div className="rounded-xl border border-white/10 bg-[#140632] p-2">
        <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-bold text-white">
          <Palette className="h-4 w-4 shrink-0 text-[#B04DFF]" />
          <span className="truncate">{clipeSel ? `Clipe: ${clipeSel.nome}` : sobSel ? `Elemento: ${sobSel.tipo === 'texto' ? sobSel.texto.split('\n')[0] : sobSel.nome}` : audioSel ? `Música: ${audioSel.nome}` : 'Toque num clipe, texto ou música na linha do tempo'}</span>
          {sel && <button type="button" onClick={() => setSel(null)} className="ml-auto shrink-0 rounded-md px-2 py-1 text-[11px] font-normal text-slate-400 hover:bg-white/5">soltar</button>}
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5" role="toolbar" aria-label="Ferramentas">
          {abas.map(({ id, nome: n, I }) => (
            <button key={id} type="button" onClick={() => setAba(id)} aria-pressed={aba === id} data-testid={`video-aba-${id}`}
              className={cn(botao, aba === id ? 'border-[#B04DFF] bg-gradient-to-b from-[#8A2EFF]/70 to-[#5D1BFF]/60 text-white' : 'border-white/10 text-slate-200 hover:bg-white/5')}><I className="h-5 w-5" />{n}</button>
          ))}
          {(clipeSel || sobSel) && <button type="button" onClick={duplicar} className={cn(botao, 'border-white/10 text-slate-200 hover:bg-white/5')}><Copy className="h-5 w-5" />Duplicar</button>}
          {sel && <button type="button" onClick={excluir} className={cn(botao, 'border-rose-400/40 text-rose-300 hover:bg-rose-500/15')} data-testid="video-excluir"><Trash2 className="h-5 w-5" />Excluir</button>}
        </div>
      </div>
      {(sel || !mesa) && (
        <div className="rounded-xl border border-[#8A2EFF]/30 bg-[#140632] p-3" data-testid="video-cartao">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#B04DFF]">{abas.find((a) => a.id === aba)?.nome ?? 'Editar'}</p>
          {clipeSel ? (
            <CartaoDoClipe aba={(ABAS_CLIPE.some((x) => x.id === aba) ? aba : 'cortar') as AbaDoClipe} c={clipeSel} mudar={(x) => mudarClipe(clipeSel.id, x)}
              onDividir={dividirNoCursor} onCongelar={congelar} onMover={moverClipe} temProximo={p.clipes.findIndex((c) => c.id === clipeSel.id) < p.clipes.length - 1} />
          ) : sobSel ? (
            aba === 'tempo' ? (
              <div className="space-y-2">
                <Faixa t="Aparece em" valor={sobSel.de} min={0} max={Math.max(0.5, total)} passo={0.1} mostrar={formatarTempo(sobSel.de)} onChange={(v) => mudarSob(sobSel.id, { de: Math.min(v, sobSel.ate - 0.3) })} />
                <Faixa t="Some em" valor={sobSel.ate} min={sobSel.de + 0.3} max={Math.max(sobSel.de + 0.3, total + 10)} passo={0.1} mostrar={formatarTempo(sobSel.ate)} onChange={(v) => mudarSob(sobSel.id, { ate: v })} />
                <button type="button" onClick={() => mudarSob(sobSel.id, { de: 0, ate: Math.max(1, total) }, false)} className="h-10 w-full rounded-lg border border-white/10 text-xs hover:bg-white/5">Mostrar no vídeo inteiro</button>
              </div>
            ) : (
              <CartaoDaAba aba={abasSob.some((a) => a.id === aba) ? (aba as Aba) : abasSob[0].id} c={sobSel} doc={docSob} textoRef={textoRef}
                mudar={(x) => mudarSob(sobSel.id, x as Partial<Sobreposicao>)} mudarFundo={(cor) => mudar((q) => ({ ...q, fundo: cor }))} mover={moverSob} camadas={null} />
            )
          ) : audioSel ? (
            <CartaoDoAudio a={audioSel} total={total} mudar={(x) => mudarAudio(audioSel.id, x)} />
          ) : (
            <CartaoDoProjeto p={p} total={total} mudar={(x) => mudar((q) => ({ ...q, ...x }))} />
          )}
        </div>
      )}

      {exportado && (
        <div className="space-y-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/5 p-3" data-testid="video-pronto">
          <p className="text-sm font-bold text-[#7dffb0]">Vídeo pronto</p>
          <video src={exportado.url} controls playsInline className={cn('mx-auto rounded-md bg-black', vertical ? 'max-h-80' : 'w-full')} />
          <p className="text-[11px] text-slate-400">{exportado.v.ext.toUpperCase()} · {exportado.v.largura}×{exportado.v.altura} · {(exportado.v.duracaoMs / 1000).toFixed(1)} s · {(exportado.v.video.size / 1024 / 1024).toFixed(1)} MB</p>
          <div className={cn('grid grid-cols-1 gap-1.5', !mesa && 'sm:grid-cols-3 lg:grid-cols-1')}>
            {/* F-304 (dono): o usuário decide — só Meus Projetos, Meus Projetos + publicar numa tela, ou baixar no aparelho */}
            <button type="button" onClick={() => salvarEmMeusProjetos(false)} disabled={!!ocupado} className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] text-sm font-semibold text-white" data-testid="video-salvar-projetos">{ocupado === 'salvar-projeto' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}Salvar em Meus Projetos</button>
            <button type="button" onClick={() => salvarEmMeusProjetos(true)} disabled={!!ocupado} className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] text-sm font-bold text-[#0b2a17]" data-testid="video-salvar-publicar">{ocupado === 'salvar-publicar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Salvar e publicar numa tela</button>
            <button type="button" onClick={() => baixar(exportado.v.video, nomeDoArquivo(nome).replace(/\.png$/i, '') + '.' + exportado.v.ext)} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-white/15 text-sm text-white" data-testid="video-baixar"><Download className="h-4 w-4" />Baixar no aparelho</button>
          </div>
        </div>
      )}
    </>
  );
  const janelas = (
    <>
      <EscolherDialog aberto={escolher} onFechar={() => setEscolher(null)} clienteId={clienteId} userId={user?.id ?? null} formato={p.formato}
        onMidias={async (lista) => {
          const novos: Clipe[] = [];
          for (const m of lista) {
            if (m.tipo === 'video') { const d = await MotorDeVideo.lerDuracao(m.url, 'video'); if (d) novos.push(novoClipe('video', m.url, m.nome, { duracaoArquivo: d, fim: d })); else toast.error(`Não foi possível abrir "${m.nome}".`); }
            else novos.push(novoClipe('imagem', m.url, m.nome));
          }
          if (novos.length) inserirClipes(novos);
        }}
        onArte={(doc, n) => inserirClipes([novoClipe('arte', '', n, { documento: doc, duracao: duracaoDoVideo(doc), zoomPara: 1 })])}
        onElemento={(c, dur) => adicionarSob(c.x || c.y ? c : noMeio(c), dur)} W={W} H={H} figurinhas={FIGURINHAS} />

      <PublicarDialog aberto={publicando && !!exportado} onFechar={() => setPublicando(false)} pasta={PASTA_VIDEOS} video
        gerarPng={async () => ({ video: exportado!.v, largura: exportado!.v.largura, altura: exportado!.v.altura })} nome={nome || 'Meu vídeo'} formato={p.formato} clienteId={clienteId} />
    </>
  );

  // F-297: MESA DE EDIÇÃO do palco — uma visualização só (a prévia vai para a tela da arte) e, aqui embaixo, os controles,
  // o adicionar e a linha do tempo de largura inteira, sempre à vista junto com a arte.
  if (mesa) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5" data-testid="studio-video" onPointerDownCapture={mesa.aoUsar}>
        {entradas}
        <div className="flex flex-wrap items-center gap-1.5" data-testid="video-mesa-controles">
          <div className="flex items-center gap-1">
            <button type="button" onClick={desfazer} disabled={!passado.current.length} aria-label="Desfazer" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={refazer} disabled={!futuro.current.length} aria-label="Refazer" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-1 items-center justify-center gap-1.5">{transporte(true)}</div>
          <label className="hidden h-9 w-44 items-center gap-1.5 rounded-lg border border-white/15 bg-[#0f0428] px-2 focus-within:border-[#8A2EFF] xl:flex">
            <Film className="h-4 w-4 shrink-0 text-[#B04DFF]" /><span className="sr-only">Nome do vídeo</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Nome do vídeo" className="min-w-0 flex-1 bg-transparent text-xs font-bold text-white focus:outline-none" data-testid="video-nome" />
          </label>
          <div className="flex items-center gap-1">
            <button type="button" onClick={salvar} disabled={!!ocupado} aria-label="Salvar o vídeo em Meus Projetos" className="flex h-9 items-center justify-center gap-1 rounded-lg bg-[#5D1BFF] px-2.5 text-xs font-semibold text-white">{ocupado === 'salvar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}<span className="hidden sm:inline">Salvar</span></button>
<select value={qualidade} onChange={(e) => setQualidade(e.target.value as Qualidade)} aria-label="Qualidade do vídeo" title="Qualidade do vídeo" data-testid="video-qualidade"
              className="h-9 w-[7.5rem] sm:w-auto rounded-lg border border-white/15 bg-[#0f0428] px-1.5 text-xs font-semibold text-white focus:border-[#8A2EFF] focus:outline-none [&_option]:bg-[#14062f]">
              {QUALIDADES.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            <button type="button" onClick={exportar} disabled={!!ocupado} className="sm-reflexo flex h-9 items-center justify-center gap-1 rounded-lg bg-[#FFD400] px-2.5 text-xs font-bold text-[#22004A]" data-testid="video-exportar">{ocupado === 'exportar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar<span className="hidden sm:inline">&nbsp;vídeo</span></button>
          </div>
        </div>
        {enviando > 0 && <p className="flex items-center gap-2 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Guardando {enviando} mídia(s) na nuvem… (pode continuar editando)</p>}
        {adicionar}
        {linhaDoTempo}
        {mesa.previa && createPortal(previa, mesa.previa)}
        {mesa.ferramentas && ((sel && mesa.visivel) || exportado) && createPortal(<div className="space-y-2" data-testid="video-ferramentas-na-lateral">{ferramentasDoEscolhido}</div>, mesa.ferramentas)}
        {janelas}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="studio-video">
      {entradas}

      {/* ── topo */}
      <div className="flex flex-wrap items-center gap-2">
        {!embutido && <Link to="/studio" aria-label="Voltar ao Studio" className="flex h-11 items-center gap-1 rounded-xl border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-5 w-5" /><span className="hidden sm:inline">Studio</span></Link>}
        <label className="flex h-11 min-w-[160px] flex-1 items-center gap-2 rounded-xl border border-white/15 bg-[#0f0428] px-3 focus-within:border-[#8A2EFF]">
          <Film className="h-4 w-4 shrink-0 text-[#B04DFF]" /><span className="sr-only">Nome do vídeo</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Nome do vídeo" className="min-w-0 flex-1 bg-transparent text-base font-bold text-white focus:outline-none" data-testid="video-nome" />
        </label>
        <button type="button" onClick={desfazer} disabled={!passado.current.length} aria-label="Desfazer" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 disabled:opacity-30"><Undo2 className="h-5 w-5" /></button>
        <button type="button" onClick={refazer} disabled={!futuro.current.length} aria-label="Refazer" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 disabled:opacity-30"><Redo2 className="h-5 w-5" /></button>
        <div className={cn('grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1', embutido && 'hidden')} role="radiogroup" aria-label="Formato">
          {(['16:9', '9:16'] as FormatoDoc[]).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={p.formato === f} onClick={() => mudar((q) => ({ ...q, formato: f }))}
              className={cn('flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-bold', p.formato === f ? 'bg-[#5D1BFF] text-white' : 'text-slate-300')}>{f === '16:9' ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}{f}</button>
          ))}
        </div>
        <div className="flex w-full gap-1.5 sm:w-auto">
          <button type="button" onClick={salvar} disabled={!!ocupado} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#5D1BFF] px-3 text-sm font-semibold text-white sm:flex-none">{ocupado === 'salvar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar</button>
<select value={qualidade} onChange={(e) => setQualidade(e.target.value as Qualidade)} aria-label="Qualidade do vídeo" title="Qualidade do vídeo" data-testid="video-qualidade"
              className="h-11 max-w-[11rem] rounded-lg border border-white/15 bg-[#0f0428] px-1.5 text-xs font-semibold text-white focus:border-[#8A2EFF] focus:outline-none [&_option]:bg-[#14062f]">
              {QUALIDADES.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            <button type="button" onClick={exportar} disabled={!!ocupado} className="sm-reflexo flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#FFD400] px-4 text-sm font-bold text-[#22004A] sm:flex-none" data-testid="video-exportar">{ocupado === 'exportar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar vídeo</button>
        </div>
      </div>
      {enviando > 0 && <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Guardando {enviando} mídia(s) na nuvem… (pode continuar editando)</p>}

      <div className={cn('grid gap-3', !embutido && 'lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start')}>
        <div className="min-w-0 space-y-2">
          {/* ── prévia */}
          <div className="rounded-2xl border border-[#8A2EFF]/30 bg-[#0a031c] px-4 py-4 sm:px-8">
            {previa}
            <div className="mt-3 flex items-center justify-center gap-2">{transporte(false)}</div>
          </div>

          {/* ── adicionar */}
          {adicionar}

          {linhaDoTempo}
        </div>

        {/* ── ferramentas do escolhido */}
        <div className={cn('min-w-0 space-y-2', !embutido && 'lg:sticky lg:top-[84px]')}>
          {ferramentasDoEscolhido}
        </div>
      </div>

      {janelas}
    </div>
  );
}

interface MidiaDaGaleria { id: string; nome: string; url: string; tipo: 'video' | 'imagem'; capa: string | null }

/** Janelas para escolher: mídias da galeria, artes salvas no Studio e elementos (formas, selos, figurinhas). */
function EscolherDialog({ aberto, onFechar, clienteId, userId, formato, onMidias, onArte, onElemento, W, H, figurinhas }: {
  aberto: null | 'galeria' | 'arte' | 'elementos'; onFechar: () => void; clienteId: string | null; userId: string | null; formato: FormatoDoc;
  onMidias: (l: MidiaDaGaleria[]) => void; onArte: (d: Documento, nome: string) => void; onElemento: (c: Camada, dur: number) => void; W: number; H: number; figurinhas: string[];
}) {
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const ultimo = useRef(aberto);
  if (aberto) ultimo.current = aberto;
  const tipo = aberto ?? ultimo.current;
  const midias = useQuery({
    queryKey: ['video-galeria', clienteId, userId],
    enabled: aberto === 'galeria' && !!userId,
    queryFn: async (): Promise<MidiaDaGaleria[]> => {
      if (clienteId) {
        const { data } = await supabase.from('cliente_assets').select('id, nome, object_url, tipo, created_at').eq('cliente_id', clienteId).in('tipo', ['imagem', 'video']).order('created_at', { ascending: false }).limit(80);
        return ((data ?? []) as { id: string; nome: string; object_url: string; tipo: string }[]).map((a) => ({ id: a.id, nome: a.nome, url: a.object_url, tipo: a.tipo === 'video' ? 'video' : 'imagem', capa: a.tipo === 'imagem' ? a.object_url : null }));
      }
      const { data } = await supabase.from('media').select('id, name, file_url, file_type, thumbnail_url, created_at').eq('user_id', userId!).in('file_type', ['image', 'video']).order('created_at', { ascending: false }).limit(80);
      return ((data ?? []) as { id: string; name: string; file_url: string; file_type: string; thumbnail_url: string | null }[]).map((m) => ({ id: m.id, nome: m.name, url: m.file_url, tipo: m.file_type === 'video' ? 'video' : 'imagem', capa: m.thumbnail_url || (m.file_type === 'image' ? m.file_url : null) }));
    },
  });
  const artes = useQuery({ queryKey: ['studio-projetos'], queryFn: listarProjetos, enabled: aberto === 'arte' });
  useEffect(() => { if (!aberto) setMarcadas([]); }, [aberto]);
  const lado = Math.round(Math.min(W, H) * 0.3);
  const elementos: { n: string; I: typeof Type; c: () => Camada; dur?: number }[] = [
    { n: 'Retângulo', I: Square, c: () => forma('Retângulo', 0, 0, Math.round(W * 0.5), Math.round(H * 0.18), { cor: '#5D1BFF', raio: 24 }) },
    { n: 'Círculo', I: Circle, c: () => forma('Círculo', 0, 0, lado, lado, { forma: 'elipse', cor: '#ffd21f' }) },
    { n: 'Faixa', I: Minus, c: () => forma('Faixa', 0, Math.round(H * 0.75), W, Math.round(H * 0.12), { cor: '#e11d48' }), dur: 4 },
    { n: 'Selo', I: Ticket, c: () => selo(0, 0, lado) },
    { n: 'Lista', I: List, c: () => itens(['Item 1', 'Item 2', 'Item 3'], 0, 0, Math.round(W * 0.5), { tamanho: 44, vertical: true }) },
  ];
  return (
    <Dialog open={!!aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto border-[#8A2EFF]/40 bg-[#14062f] text-slate-100">
        <DialogHeader>
          <DialogTitle>{tipo === 'galeria' ? 'Da sua galeria' : tipo === 'arte' ? 'Artes do Studio' : 'Elementos e figurinhas'}</DialogTitle>
          <DialogDescription className="text-slate-400">{tipo === 'galeria' ? 'Escolha um ou mais vídeos e fotos das suas mídias.' : tipo === 'arte' ? 'Uma arte salva em Meus Projetos vira um clipe (com as animações dela).' : 'Toque para pôr por cima do vídeo; depois arraste, gire e mude a cor.'}</DialogDescription>
        </DialogHeader>
        {aberto === 'galeria' && (
          <>
            {midias.isLoading && <p className="text-sm text-slate-400"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p>}
            {midias.data?.length === 0 && <p className="text-sm text-slate-400">Nenhuma mídia ainda. Use o botão Vídeo/Foto para trazer do aparelho.</p>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {midias.data?.map((m) => {
                const on = marcadas.includes(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => setMarcadas((l) => (on ? l.filter((x) => x !== m.id) : [...l, m.id]))} className={cn('relative aspect-square overflow-hidden rounded-lg border-2 bg-black', on ? 'border-[#FFD400]' : 'border-transparent')}>
                    {m.capa ? <img src={m.capa} alt={m.nome} loading="lazy" crossOrigin="anonymous" className="h-full w-full object-cover" /> : <video src={m.url} muted preload="metadata" crossOrigin="anonymous" className="h-full w-full object-cover" />}
                    {m.tipo === 'video' && <Film className="absolute left-1 top-1 h-4 w-4 text-white drop-shadow" />}
                    {on && <span className="absolute right-1 top-1 rounded-full bg-[#FFD400] px-1.5 text-[10px] font-bold text-[#22004A]">{marcadas.indexOf(m.id) + 1}</span>}
                  </button>
                );
              })}
            </div>
            <button type="button" disabled={!marcadas.length} onClick={() => { onMidias(marcadas.map((id) => midias.data!.find((m) => m.id === id)!)); onFechar(); }} className="h-11 w-full rounded-lg bg-[#5D1BFF] text-sm font-semibold text-white disabled:opacity-40">Adicionar {marcadas.length || ''} ao vídeo</button>
          </>
        )}
        {aberto === 'arte' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {artes.isLoading && <p className="text-sm text-slate-400">Carregando…</p>}
            {artes.data?.filter((a) => (a.dados as { versao?: number }).versao === 2).map((a) => {
              const docs = (a.dados as { documentos?: Partial<Record<FormatoDoc, Documento>> }).documentos ?? {};
              const doc = docs[formato] ?? Object.values(docs)[0];
              return doc ? (
                <button key={a.id} type="button" onClick={() => { onArte(doc, a.nome); onFechar(); }} className="rounded-lg border border-white/10 p-2 text-left text-sm hover:border-[#8A2EFF]/60 hover:bg-white/5">
                  <Sparkles className="mb-1 h-4 w-4 text-[#FFD400]" /><span className="line-clamp-2">{a.nome}</span><span className="block text-[10px] text-slate-500">{doc.formato}</span>
                </button>
              ) : null;
            })}
            {artes.data && !artes.data.some((a) => (a.dados as { versao?: number }).versao === 2) && <p className="col-span-full text-sm text-slate-400">Nenhuma arte salva. No Studio, abra um modelo, edite e toque em <b>Salvar</b> — ou use <b>Levar para o vídeo</b> no editor de imagens.</p>}
          </div>
        )}
        {aberto === 'elementos' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {elementos.map(({ n, I, c, dur }) => <button key={n} type="button" onClick={() => { onElemento(c(), dur ?? 3); onFechar(); }} className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border border-white/10 text-xs hover:bg-white/5"><I className="h-5 w-5 text-[#B04DFF]" />{n}</button>)}
            </div>
            <p className="text-xs font-semibold text-slate-300">Figurinhas</p>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {figurinhas.map((f) => (
                <button key={f} type="button" onClick={() => { onElemento({ ...texto('Figurinha', f, 0, 0, lado, { tamanho: Math.round(lado * 0.8), alinhamento: 'center', fonte: 'poppins' }), animacao: { tipo: 'zoom', atraso: 0, duracao: 0.5 } }, 3); onFechar(); }}
                  className="flex h-12 items-center justify-center rounded-lg border border-white/10 text-2xl hover:bg-white/5" aria-label={`Figurinha ${f}`}>{f}</button>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><ImageIcon className="h-3.5 w-3.5" />Para pôr a sua logo ou uma foto por cima, use <b>Logo/Imagem</b>.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Circle, Clapperboard, Copy, Download, ExternalLink, Film, FlipHorizontal, FolderOpen, Pause, Play, Image as ImageIcon, ImagePlus, List, Loader2, Lock, LockOpen, Minus, Monitor, MousePointerClick,
  PenLine, Plus, Redo2, RotateCcw, Save, Send, Smartphone, Sparkles, Square, Ticket, Trash2, Type, Undo2, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Palco } from '@/components/studio/editor/Palco';
import { CartaoDaAba, PainelCamadas, abasDe, campo, type Aba } from '@/components/studio/editor/Paineis';
import { PublicarDialog } from '@/components/studioai/PublicarDialog';
import { useAuth } from '@/contexts/AuthContext';
import { uploadToR2 } from '@/lib/r2Upload';
import {
  TAMANHO_DOC, alturaDoTexto, alturaDosItens, clonar, forma, imagem, itens, modeloParaDocumento, novoId, selo, texto,
  type Camada, type Documento, type FormatoDoc,
} from '@/lib/studio/documento';
import { documentoParaPng } from '@/lib/studio/desenhar';
import { herdarEstilo, levarMudanca } from '@/lib/studio/sincronizar';
import { DURACAO_PADRAO, animarTudo, duracaoDoVideo, temAnimacao, tirarAnimacoes } from '@/lib/studio/animacao';
import { documentoParaVideo, formatoDeVideo, type VideoGravado } from '@/lib/studio/video';
import type { PastaDaGaleria } from '@/lib/galeria';
import { CHAVE_ARTE_PARA_VIDEO } from '@/lib/studio/video/linha';
import { modeloPorId, type ModeloDeArte } from '@/lib/studio/modelos';
import { acharModelo } from '@/lib/studio/pastas';
import { SEGMENTOS, type SegmentoId } from '@/lib/studio/catalogo';
import { meuSaldo, obterProjeto, salvarModelo, salvarNasMidias, salvarProjeto } from '@/lib/studioai/api';
import { idDoModelo, useCatalogo } from '@/lib/studioai/modelos';
import { baixar, nomeDoArquivo } from '@/lib/studioai/exportar';
import { cn } from '@/lib/utils';

type Docs = Partial<Record<FormatoDoc, Documento>>;
interface DadosV2 { versao: 2; documentos: Docs; formato: FormatoDoc }

function Bloco({ titulo, icone: Icone, children, acao }: { titulo: string; icone: typeof Type; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-[#140632] p-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Icone className="h-4 w-4 text-[#B04DFF]" />{titulo}<span className="ml-auto">{acao}</span></h2>
      {children}
    </section>
  );
}

/** Ajusta a altura das camadas que crescem com o conteúdo (texto e lista). */
function normalizar(c: Camada): Camada {
  if (c.tipo === 'texto') return { ...c, h: Math.round(alturaDoTexto(c)) };
  if (c.tipo === 'itens') return { ...c, h: Math.round(alturaDosItens(c)) };
  return c;
}

/** Studio de criação: editor de camadas (como no Canva/Photoshop) de um modelo do catálogo ou de um projeto salvo. */
export default function EditorPage() {
  const { modeloId, projetoId } = useParams();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  const projeto = useQuery({ queryKey: ['studio-projeto', projetoId], queryFn: () => obterProjeto(projetoId!), enabled: !!projetoId });
  const catalogo = useCatalogo();
  const idBase = projeto.data?.modelo_id ?? modeloId ?? '';
  const base = useMemo<ModeloDeArte | null>(() => catalogo.todos.find((m) => m.id === idBase) ?? acharModelo(idBase) ?? modeloPorId(idBase), [idBase, catalogo.todos]);

  const [docs, setDocs] = useState<Docs | null>(null);
  const [formato, setFormato] = useState<FormatoDoc>('16:9');
  const [sel, setSel] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('fundo');
  const [nome, setNome] = useState('');
  const [idProjeto, setIdProjeto] = useState<string | null>(projetoId ?? null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [publicando, setPublicando] = useState<false | 'arte' | 'video'>(false);
  // F-225: animação e vídeo
  const [tocando, setTocando] = useState(false);
  const [gravando, setGravando] = useState<number | null>(null);
  const [videoPronto, setVideoPronto] = useState<{ v: VideoGravado; url: string; formato: FormatoDoc } | null>(null);
  const [novoModelo, setNovoModelo] = useState<{ nome: string; segmento: SegmentoId; pasta: string } | null>(null);
  const passado = useRef<Docs[]>([]);
  const futuro = useRef<Docs[]>([]);
  const [, setVersao] = useState(0);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const destinoDaFoto = useRef<'trocar' | 'nova'>('trocar');

  // abre o projeto salvo (novo formato em camadas ou o antigo, que é convertido) ou o modelo nos dois formatos
  useEffect(() => {
    if (!base || docs) return;
    const dados = (projeto.data?.dados ?? {}) as Partial<DadosV2> & Partial<ModeloDeArte>;
    const pedido = (params.get('formato') as FormatoDoc | null) ?? null;
    if (dados.versao === 2 && dados.documentos) {
      setDocs(clonar(dados.documentos));
      setFormato(pedido ?? dados.formato ?? (base.formato as FormatoDoc));
    } else {
      const m: ModeloDeArte = projeto.data ? { ...base, ...dados, textos: { ...base.textos, ...(dados.textos ?? {}) }, cores: { ...base.cores, ...(dados.cores ?? {}) } } : base;
      const f = pedido ?? (projeto.data?.formato as FormatoDoc | undefined) ?? (base.formato as FormatoDoc);
      setDocs({ [f]: modeloParaDocumento(m, f) });
      setFormato(f);
    }
    setNome(projeto.data?.nome ?? base.nome);
  }, [base, projeto.data, docs, params]);

  // o outro formato nasce do modelo quando o usuário troca (cada formato guarda as suas edições)
  useEffect(() => {
    if (!docs || !base || docs[formato]) return;
    const outro = docs[formato === '16:9' ? '9:16' : '16:9'];
    const novo = modeloParaDocumento(base, formato);
    // F-224: textos, cores, fontes e foto já editados no outro formato vêm junto
    const herdado = outro ? herdarEstilo(outro, novo) : null;
    setDocs({ ...docs, [formato]: herdado ? { ...herdado, camadas: herdado.camadas.map(normalizar) } : novo });
  }, [docs, formato, base]);

  const doc = docs?.[formato] ?? null;
  useEffect(() => () => { if (videoPronto) URL.revokeObjectURL(videoPronto.url); }, [videoPronto]);
  const camadaSel = doc?.camadas.find((c) => c.id === sel) ?? null;
  const abas = abasDe(camadaSel);
  // ao escolher outro elemento, abre o primeiro cartão dele (Texto, Ajustes, Cor…)
  const tipoSel = camadaSel?.tipo ?? null;
  useEffect(() => { setAba(abasDe(tipoSel ? ({ tipo: tipoSel } as never) : null)[0].id); }, [sel, tipoSel]);

  const lembrar = useCallback(() => {
    if (!docs) return;
    passado.current = [...passado.current.slice(-59), clonar(docs)];
    futuro.current = [];
    setVersao((v) => v + 1);
  }, [docs]);
  const trocarDoc = useCallback((f: (d: Documento) => Documento) => setDocs((ds) => (ds && ds[formato] ? { ...ds, [formato]: f(ds[formato]!) } : ds)), [formato]);
  // F-224: o que é aparência/conteúdo (texto, cor, fonte, foto…) vale nos dois formatos; posição e tamanho, só neste
  const mudarCamada = useCallback((id: string, p: Partial<Camada>) => setDocs((ds) => {
    const atual = ds?.[formato];
    if (!ds || !atual) return ds;
    const out: Docs = { ...ds, [formato]: { ...atual, camadas: atual.camadas.map((c) => (c.id === id ? normalizar({ ...c, ...p } as Camada) : c)) } };
    const fo: FormatoDoc = formato === '16:9' ? '9:16' : '16:9';
    const irmao = ds[fo];
    if (irmao) { const levado = levarMudanca(atual, id, p, irmao); if (levado !== irmao) out[fo] = { ...levado, camadas: levado.camadas.map(normalizar) }; }
    return out;
  }), [formato]);
  const mudarFundo = (cor: string) => { lembrar(); setDocs((ds) => ds && Object.fromEntries(Object.entries(ds).map(([k, d]) => [k, { ...d!, fundo: cor }])) as Docs); };
  // mudança pelo painel: cada alteração pode ser desfeita (agrupa digitação rápida em um passo)
  const ultimoPainel = useRef(0);
  const mudarPeloPainel = (id: string, p: Partial<Camada>) => { const agora = Date.now(); if (agora - ultimoPainel.current > 800) lembrar(); ultimoPainel.current = agora; mudarCamada(id, p); };

  const desfazer = useCallback(() => { const a = passado.current.pop(); if (!a || !docs) return; futuro.current.push(clonar(docs)); setDocs(a); setVersao((v) => v + 1); }, [docs]);
  const refazer = useCallback(() => { const a = futuro.current.pop(); if (!a || !docs) return; passado.current.push(clonar(docs)); setDocs(a); setVersao((v) => v + 1); }, [docs]);

  const adicionar = (c: Camada) => { lembrar(); trocarDoc((d) => ({ ...d, camadas: [...d.camadas, normalizar(c)] })); setSel(c.id); };
  const apagar = useCallback((id: string) => { lembrar(); trocarDoc((d) => ({ ...d, camadas: d.camadas.filter((c) => c.id !== id) })); setSel(null); }, [lembrar, trocarDoc]);
  const duplicar = useCallback((id: string) => {
    const c = doc?.camadas.find((x) => x.id === id);
    if (!c) return;
    lembrar();
    const novo = { ...clonar(c), id: novoId(), nome: `${c.nome} (cópia)`, x: c.x + 30, y: c.y + 30, bloqueada: false };
    trocarDoc((d) => { const i = d.camadas.findIndex((x) => x.id === id); const l = [...d.camadas]; l.splice(i + 1, 0, novo); return { ...d, camadas: l }; });
    setSel(novo.id);
  }, [doc, lembrar, trocarDoc]);
  const mover = (id: string, para: 'cima' | 'baixo' | 'topo' | 'fundo') => {
    lembrar();
    trocarDoc((d) => {
      const l = [...d.camadas]; const i = l.findIndex((c) => c.id === id); const [c] = l.splice(i, 1);
      const j = para === 'topo' ? l.length : para === 'fundo' ? 0 : Math.max(0, Math.min(l.length, i + (para === 'cima' ? 1 : -1)));
      l.splice(j, 0, c); return { ...d, camadas: l };
    });
  };

  // teclado: Delete apaga, setas movem (Shift = 10 px), Ctrl+Z/Y desfaz/refaz, Ctrl+D duplica, Esc solta
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.closest('input, textarea, select, [contenteditable="true"]')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); return; }
      if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); refazer(); return; }
      if (!camadaSel) return;
      if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicar(camadaSel.id); return; }
      if (e.key === 'Escape') { setSel(null); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !camadaSel.bloqueada) { e.preventDefault(); apagar(camadaSel.id); return; }
      const passo = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
      if (d && !camadaSel.bloqueada) { e.preventDefault(); lembrar(); mudarCamada(camadaSel.id, { x: camadaSel.x + d[0], y: camadaSel.y + d[1] }); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [camadaSel, desfazer, refazer, duplicar, apagar, lembrar, mudarCamada]);

  if ((projetoId && projeto.isLoading) || (!base && catalogo.carregando) || (base && !doc)) return <p className="p-10 text-sm text-slate-400">Abrindo o Studio de criação…</p>;
  if (!base || !doc || !docs) return <div className="p-10 text-sm text-slate-300">Modelo não encontrado. <Link to="/studio" className="text-[#FFD400] hover:underline">Voltar aos modelos</Link></div>;

  const { w: W, h: H } = TAMANHO_DOC[formato];
  const agir = async (n: string, f: () => Promise<void>) => { setOcupado(n); try { await f(); } catch (e) { toast.error((e as Error).message || 'Não foi possível concluir.'); } finally { setOcupado(null); } };
  const png = () => documentoParaPng(doc);
  // F-229: cada tela recebe a arte no formato dela (o outro formato herda textos, cores e fotos já editados)
  const gerarArte = (f?: string) => {
    const alvo = (f ?? formato) as FormatoDoc;
    if (alvo === formato || !TAMANHO_DOC[alvo]) return documentoParaPng(doc);
    const pronto = docs[alvo];
    if (pronto) return documentoParaPng(pronto);
    const h = herdarEstilo(doc, modeloParaDocumento(base, alvo));
    return documentoParaPng({ ...h, camadas: h.camadas.map(normalizar) });
  };
  const dados = (): DadosV2 => ({ versao: 2, documentos: docs, formato });

  const gravar = async () => {
    const id = await salvarProjeto({ id: idProjeto, modeloId: base.id, nome: nome.trim() || base.nome, formato, dados: dados() as unknown as Record<string, unknown>, miniatura: null });
    setIdProjeto(id);
    void qc.invalidateQueries({ queryKey: ['studio-projetos'] });
    return id;
  };
  // F-229: Salvar = projeto (Meus Projetos) + a imagem na GALERIA (sem cópia repetida), com o cartão para mandar às telas
  const salvar = () => agir('salvar', async () => { await gravar(); setPublicando('arte'); });
  // "Salvar e publicar" também guarda o projeto: as edições (cores, textos) nunca se perdem
  const abrirPublicar = () => agir('publicar', async () => { await gravar(); setPublicando('arte'); });

  // ── F-225: vídeo da arte animada
  const maxVideo = saldo.data?.cliente ? 20 : 30; // anunciante: até 20 s (regra das mídias dele); equipe: até 30 s
  const pastaGaleria: PastaDaGaleria = {
    chave: base.pasta ?? base.id,
    nome: catalogo.pastas.find((p) => p.capa.id === (base.pasta ?? base.id))?.capa.nome ?? base.nome,
    segmento: base.segmento,
  };
  const mudarTodos = (f: (d: Documento) => Documento) => { lembrar(); setDocs((ds) => ds && Object.fromEntries(Object.entries(ds).map(([k, d]) => [k, f(d!)])) as Docs); setVideoPronto(null); };
  const criarVideo = () => agir('video', async () => {
    if (!temAnimacao(doc)) throw new Error('Escolha uma animação em algum elemento (botão Animar) ou toque em "Animar tudo".');
    setTocando(false); setSel(null); setGravando(0);
    try {
      const v = await documentoParaVideo(doc, (p) => setGravando(p));
      setVideoPronto({ v, url: URL.createObjectURL(v.video), formato });
      toast.success('Vídeo criado! Agora salve na galeria, publique ou baixe.');
    } finally { setGravando(null); }
  });
  const salvarVideoNaGaleria = () => videoPronto && user && agir('salvar-video', async () => {
    await gravar();
    await salvarNasMidias({ userId: user.id, clienteId: saldo.data?.cliente ?? null, video: videoPronto.v, nome: nome.trim() || base.nome, largura: videoPronto.v.largura, altura: videoPronto.v.altura, formato: videoPronto.formato, pasta: pastaGaleria });
    toast.success(`Vídeo salvo na sua galeria, na pasta "${pastaGaleria.nome}".`);
  });
  const enviarFoto = (arq: File | undefined) => arq && user && agir('foto', async () => {
    if (!/^image\/(jpeg|png|webp)$/.test(arq.type) || arq.size > 12 * 1024 * 1024) throw new Error('Envie JPG, PNG ou WebP de até 12 MB.');
    const { publicUrl } = await uploadToR2(arq, `${user.id}/studio/foto-${Date.now()}.${arq.type.split('/')[1]}`, arq.type, user.id, { preventOverwrite: true });
    if (destinoDaFoto.current === 'trocar' && camadaSel?.tipo === 'imagem') { lembrar(); mudarCamada(camadaSel.id, { src: publicUrl, zoom: 1, focoX: 50, focoY: 50 } as Partial<Camada>); }
    else adicionar(imagem('Imagem', publicUrl, W / 2 - 300, H / 2 - 300, 600, 600, { raio: 12 }));
  });
  const pedirFoto = (destino: 'trocar' | 'nova') => { destinoDaFoto.current = destino; arquivoRef.current?.click(); };
  const editarComIA = () => user && agir('ia', async () => {
    const { png: arte } = await png();
    const { publicUrl } = await uploadToR2(arte, `${user.id}/studio/ref-${Date.now()}.png`, 'image/png', user.id, { preventOverwrite: true });
    navegar(`/studio/ia?ref=${encodeURIComponent(publicUrl)}&formato=${encodeURIComponent(formato)}&nome=${encodeURIComponent(nome)}`);
  });
  const abrirNoCanva = () => agir('canva', async () => {
    const { png: arte } = await png();
    baixar(arte, nomeDoArquivo(nome));
    window.open('https://www.canva.com/', '_blank', 'noopener');
    toast.info('A arte foi baixada. No Canva, use "Uploads" para abrir o arquivo e continuar a edição.', { duration: 8000 });
  });
  const restaurar = () => { if (!window.confirm(`Voltar o formato ${formato} ao modelo original? As edições deste formato serão desfeitas (dá para desfazer com Ctrl+Z).`)) return; lembrar(); setDocs({ ...docs, [formato]: modeloParaDocumento(base, formato) }); setSel(null); };
  // owner/ADM: a arte atual (os dois formatos) vira um modelo NOVO do catálogo, numa pasta existente ou numa nova
  const adicionarAoCatalogo = () => novoModelo && agir('modelo', async () => {
    const id = idDoModelo(novoModelo.nome);
    const ambos: Docs = { '16:9': docs['16:9'] ?? modeloParaDocumento(base, '16:9'), '9:16': docs['9:16'] ?? modeloParaDocumento(base, '9:16') };
    const foto = doc.camadas.find((c) => c.tipo === 'imagem');
    await salvarModelo(id, {
      ...base, id, nome: novoModelo.nome.trim(), segmento: novoModelo.segmento, formato, edicao: ['rapida'], criadoEm: new Date().toISOString().slice(0, 10),
      etiquetas: [...new Set([...(base.etiquetas ?? []), 'novo'])], foto: foto?.tipo === 'imagem' ? foto.src : base.foto, documentos: ambos,
      pasta: novoModelo.pasta || undefined,
    });
    void qc.invalidateQueries({ queryKey: ['studio-modelos'] });
    setNovoModelo(null);
    toast.success('Modelo adicionado ao catálogo para todos os usuários.');
  });

  const meio = (w: number, h: number) => ({ x: Math.round(W / 2 - w / 2), y: Math.round(H / 2 - h / 2) });
  const FERRAMENTAS: { n: string; I: typeof Type; f: () => void }[] = [
    { n: 'Título', I: Type, f: () => { const c = texto('Título', 'SEU TÍTULO', 0, 0, Math.round(W * 0.6), { fonte: 'anton', tamanho: 140, maiusculas: true, alinhamento: 'center', sombra: { cor: 'rgba(0,0,0,.35)', desfoque: 18, dx: 0, dy: 6 } }); Object.assign(c, meio(c.w, c.h)); adicionar(c); } },
    { n: 'Texto', I: Type, f: () => { const c = texto('Texto', 'Digite o seu texto', 0, 0, Math.round(W * 0.45), { tamanho: 48, peso: 600, alinhamento: 'center' }); Object.assign(c, meio(c.w, c.h)); adicionar(c); } },
    { n: 'Botão', I: MousePointerClick, f: () => { const c = texto('Botão', 'Compre agora', 0, 0, 520, { tamanho: 44, peso: 800, cor: '#111111', alinhamento: 'center', fundo: { cor: '#ffd21f', raio: 60, margem: 36 } }); Object.assign(c, meio(c.w, c.h)); adicionar(c); } },
    { n: 'Retângulo', I: Square, f: () => adicionar(forma('Retângulo', meio(500, 300).x, meio(500, 300).y, 500, 300, { cor: '#5D1BFF', raio: 24 })) },
    { n: 'Círculo', I: Circle, f: () => adicionar(forma('Círculo', meio(360, 360).x, meio(360, 360).y, 360, 360, { forma: 'elipse', cor: '#ffd21f' })) },
    { n: 'Linha', I: Minus, f: () => adicionar(forma('Linha', meio(600, 12).x, meio(600, 12).y, 600, 12, { cor: '#ffffff', raio: 6 })) },
    { n: 'Neon', I: Zap, f: () => adicionar(forma('Neon', meio(14, 600).x, meio(14, 600).y, 14, 600, { cor: '#ff7a00', raio: 7, sombra: { cor: '#ff7a00', desfoque: 40, dx: 0, dy: 0 } })) },
    { n: 'Selo', I: Ticket, f: () => adicionar(selo(meio(340, 340).x, meio(340, 340).y, 340)) },
    { n: 'Lista', I: List, f: () => { const c = itens(['Item 1', 'Item 2', 'Item 3'], 0, 0, 700, { tamanho: 40 }); Object.assign(c, meio(c.w, c.h)); adicionar(c); } },
    { n: 'Imagem', I: ImageIcon, f: () => pedirFoto('nova') },
  ];

  const animado = temAnimacao(doc);
  const total = duracaoDoVideo(doc);
  const suporte = formatoDeVideo();
  const cartaoVideo = (
    <div className="space-y-3" data-testid="studio-cartao-video">
      <p className="text-xs text-slate-300">Dê movimento à arte, como no Canva: cada elemento pode <b>surgir, subir, entrar pelos lados, dar zoom, pulsar, balançar</b>… A arte continua sendo uma imagem; o vídeo é criado aqui mesmo e vai para a sua galeria, na pasta <b>{pastaGaleria.nome}</b>.</p>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => mudarTodos(animarTudo)} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-[#B04DFF]/60 bg-[#5D1BFF]/25 text-sm font-semibold text-white hover:bg-[#5D1BFF]/40" data-testid="studio-animar-tudo"><Clapperboard className="h-4 w-4" />Animar tudo</button>
        <button type="button" onClick={() => mudarTodos(tirarAnimacoes)} disabled={!animado} className="h-11 rounded-lg border border-white/10 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-40">Tirar animações</button>
      </div>
      <label className="block">
        <span className="flex items-center justify-between text-[11px] font-semibold text-slate-300">Duração do vídeo<span className="rounded-md bg-[#5D1BFF]/30 px-1.5 py-0.5 font-mono text-[11px] text-white">{total} s</span></span>
        <input type="range" min={3} max={maxVideo} step={1} value={Math.min(total, maxVideo)} aria-label="Duração do vídeo"
          onChange={(e) => { const v = Number(e.target.value); setDocs((ds) => ds && Object.fromEntries(Object.entries(ds).map(([k, d]) => [k, { ...d!, video: { duracao: v } }])) as Docs); setVideoPronto(null); }} className="h-7 w-full cursor-pointer accent-[#8A2EFF]" />
      </label>
      <button type="button" onClick={() => { setSel(null); setTocando((t) => !t); }} disabled={!animado} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-40" data-testid="studio-ver-animacao">
        {tocando ? <><Pause className="h-4 w-4" />Parar a animação</> : <><Play className="h-4 w-4" />Ver a animação</>}
      </button>
      {!suporte ? (
        <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-200">Este navegador não grava vídeo. Use o Chrome atualizado no computador, tablet ou celular.</p>
      ) : gravando !== null ? (
        <div className="space-y-1.5 rounded-lg border border-[#FFD400]/40 bg-[#FFD400]/10 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#FFD400]"><Loader2 className="h-4 w-4 animate-spin" />Criando o vídeo… {Math.round(gravando * 100)}%</p>
          <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#FFD400] transition-all" style={{ width: `${Math.round(gravando * 100)}%` }} /></div>
          <p className="text-[11px] text-slate-300">Deixe esta tela aberta até terminar ({total} s).</p>
        </div>
      ) : (
        <button type="button" onClick={criarVideo} disabled={!animado || !!ocupado} className="sm-reflexo flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#FFD400] text-sm font-bold text-[#22004A] hover:brightness-105 disabled:opacity-40" data-testid="studio-criar-video">
          <Film className="h-4 w-4" />Criar vídeo {formato} ({total} s)
        </button>
      )}
      {videoPronto && (
        <div className="space-y-2 rounded-lg border border-[#25D366]/40 bg-[#25D366]/5 p-2.5" data-testid="studio-video-pronto">
          <video src={videoPronto.url} controls loop muted playsInline className={cn('mx-auto rounded-md bg-black', videoPronto.formato === '9:16' ? 'max-h-72' : 'w-full')} />
          <p className="text-[11px] text-slate-400">{videoPronto.v.ext.toUpperCase()} · {videoPronto.v.largura}×{videoPronto.v.altura} · {(videoPronto.v.video.size / 1024 / 1024).toFixed(1)} MB</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <button type="button" onClick={salvarVideoNaGaleria} disabled={!!ocupado} className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] text-sm font-semibold text-white hover:bg-[#8A2EFF]" data-testid="studio-salvar-video">{ocupado === 'salvar-video' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}Salvar na galeria</button>
            <button type="button" onClick={() => agir('publicar', async () => { await gravar(); setPublicando('video'); })} disabled={!!ocupado} className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] text-sm font-bold text-[#0b2a17]" data-testid="studio-publicar-video"><Send className="h-4 w-4" />Publicar</button>
            <button type="button" onClick={() => baixar(videoPronto.v.video, nomeDoArquivo(`${nome}-${videoPronto.formato.replace(':', 'x')}`).replace(/\.png$/i, '') + '.' + videoPronto.v.ext)} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-white/15 text-sm text-white hover:bg-white/5"><Download className="h-4 w-4" />Baixar</button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => { try { sessionStorage.setItem(CHAVE_ARTE_PARA_VIDEO, JSON.stringify({ doc, nome: nome.trim() || base.nome })); } catch { /* sem armazenamento */ } navegar('/studio/video'); }}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#B04DFF]/60 text-sm font-semibold text-white hover:bg-[#5D1BFF]/25" data-testid="studio-levar-video"><Clapperboard className="h-4 w-4 text-[#FFD400]" />Levar para o editor de vídeo (juntar com vídeos, música, cortes…)</button>
      {!animado && <p className="text-[11px] text-slate-500">Dica: toque num elemento e use o botão <b>Animar</b>, ou toque em <b>Animar tudo</b>. Padrão: {DURACAO_PADRAO} s.</p>}
    </div>
  );

  const vertical = formato === '9:16';
  const outroFormato: FormatoDoc = vertical ? '16:9' : '9:16';
  // ações diretas do elemento escolhido (sem cartão): trocar/espelhar foto, duplicar, travar e LIXEIRA
  const acoes: { n: string; I: typeof Type; f: () => void; perigo?: boolean; ativo?: boolean; id: string }[] = camadaSel ? [
    ...(camadaSel.tipo === 'imagem' ? [
      { id: 'trocar', n: 'Trocar foto', I: ImagePlus, f: () => pedirFoto('trocar') },
      { id: 'espelhar', n: 'Espelhar', I: FlipHorizontal, ativo: camadaSel.espelhar, f: () => mudarPeloPainel(camadaSel.id, { espelhar: !camadaSel.espelhar } as Partial<Camada>) },
    ] : []),
    { id: 'duplicar', n: 'Duplicar', I: Copy, f: () => duplicar(camadaSel.id) },
    { id: 'travar', n: camadaSel.bloqueada ? 'Destravar' : 'Travar', I: camadaSel.bloqueada ? Lock : LockOpen, ativo: camadaSel.bloqueada, f: () => { lembrar(); mudarCamada(camadaSel.id, { bloqueada: !camadaSel.bloqueada }); } },
    ...(!camadaSel.bloqueada ? [{ id: 'excluir', n: 'Excluir', I: Trash2, perigo: true, f: () => apagar(camadaSel.id) }] : []),
  ] : [];
  const botao = 'flex min-h-[56px] min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 text-[11px] font-semibold leading-tight transition active:scale-95';

  const barraAdicionar = (
    <div className={cn('rounded-xl border border-white/10 bg-[#140632] p-1.5', vertical ? 'grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5' : 'flex gap-1.5 overflow-x-auto')} aria-label="Adicionar elementos">
      {FERRAMENTAS.map(({ n, I, f }) => (
        <button key={n} type="button" onClick={f} disabled={ocupado === 'foto' && n === 'Imagem'} className={cn(botao, 'shrink-0 border-transparent text-slate-200 hover:border-[#8A2EFF]/50 hover:bg-white/5')} data-testid={`studio-add-${n}`}>
          {ocupado === 'foto' && n === 'Imagem' ? <Loader2 className="h-5 w-5 animate-spin" /> : <I className="h-5 w-5 text-[#B04DFF]" />}{n}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3" data-testid="studio-editor">
      <input ref={arquivoRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void enviarFoto(e.target.files?.[0]); e.target.value = ''; }} />
      {/* ── topo: voltar, NOME DA MÍDIA, desfazer/refazer, formato e salvar/publicar sempre à vista */}
      <div className="flex flex-wrap items-center gap-2">
        <Link to={base.pasta ? `/studio/pasta/${base.pasta}` : '/studio'} aria-label="Voltar aos modelos" className="flex h-11 items-center gap-1 rounded-xl border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-5 w-5" /><span className="hidden sm:inline">Modelos</span></Link>
        <label className="flex h-11 min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-white/15 bg-[#0f0428] px-3 focus-within:border-[#8A2EFF]" title="Renomear a mídia">
          <PenLine className="h-4 w-4 shrink-0 text-[#B04DFF]" />
          <span className="sr-only">Nome da mídia</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da mídia" maxLength={120} className="min-w-0 flex-1 bg-transparent text-base font-bold text-white placeholder:text-slate-500 focus:outline-none" data-testid="studio-nome" />
        </label>
        <div className="flex items-center gap-1">
          <button type="button" onClick={desfazer} disabled={!passado.current.length} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white hover:bg-white/5 disabled:opacity-30"><Undo2 className="h-5 w-5" /></button>
          <button type="button" onClick={refazer} disabled={!futuro.current.length} title="Refazer (Ctrl+Y)" aria-label="Refazer" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white hover:bg-white/5 disabled:opacity-30"><Redo2 className="h-5 w-5" /></button>
          <button type="button" onClick={restaurar} title="Voltar ao modelo original" aria-label="Voltar ao modelo original" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white hover:bg-white/5"><RotateCcw className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Formato">
          {(['16:9', '9:16'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={formato === f} onClick={() => { setFormato(f); setSel(null); }}
              className={cn('flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-bold', formato === f ? 'bg-[#5D1BFF] text-white shadow-[0_0_16px_rgba(93,27,255,.6)]' : 'text-slate-300 hover:bg-white/5')}>
              {f === '16:9' ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}{f}
            </button>
          ))}
        </div>
        <div className="flex w-full gap-1.5 sm:w-auto">
          <button type="button" onClick={() => { setSel(null); setTimeout(() => setAba('video'), 0); }} title="Animar e criar vídeo" className={cn('flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold sm:flex-none', temAnimacao(doc) ? 'border-[#FFD400]/60 bg-[#FFD400]/10 text-[#FFD400]' : 'border-white/15 text-white hover:bg-white/5')} data-testid="studio-botao-video"><Film className="h-4 w-4" />Vídeo</button>
          <button type="button" onClick={abrirPublicar} disabled={!!ocupado} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-sm font-bold text-[#0b2a17] hover:brightness-105 sm:flex-none" data-testid="studio-publicar">{ocupado === 'publicar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Publicar</button>
          <button type="button" onClick={salvar} disabled={!!ocupado} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#5D1BFF] px-3 text-sm font-semibold text-white hover:bg-[#8A2EFF] sm:flex-none">{ocupado === 'salvar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar</button>
          <button type="button" onClick={() => agir('baixar', async () => { const r = await png(); baixar(r.png, nomeDoArquivo(`${nome}-${formato.replace(':', 'x')}`)); })} disabled={!!ocupado} title={`Baixar PNG ${W}×${H}`}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 text-sm text-white hover:bg-white/5 sm:flex-none">{ocupado === 'baixar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}PNG</button>
        </div>
      </div>

      {!vertical && barraAdicionar}

      {/* ── palco com margens dos lados (o dedo rola a página por elas) + ferramentas ao lado/abaixo */}
      <div className={cn('grid gap-3', vertical ? 'sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start' : 'lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start')}>
        <div className={cn('min-w-0 rounded-2xl border border-[#8A2EFF]/30 bg-[#0a031c] px-6 pb-14 pt-12 shadow-[0_0_40px_rgba(93,27,255,0.25)]', vertical ? 'sm:px-8' : 'sm:px-10')}>
          <div className="mx-auto [--lv:62vw] sm:[--lv:40vw] lg:[--lv:30vw]"
            style={vertical ? { width: 'min(var(--lv), calc((100dvh - 260px) * 0.5625), 400px)' } : { maxWidth: 'calc((100dvh - 330px) * 1.7778)', minWidth: 240 }}>
            <Palco doc={doc} animar={tocando} sel={sel} onSelecionar={(id) => { if (id) setTocando(false); setSel(id); }} onInicio={lembrar} onMudar={mudarCamada} onApagar={apagar} onDuplicar={duplicar}
              onEditarTexto={() => { setAba('texto'); setTimeout(() => textoRef.current?.focus(), 30); }} />
          </div>
          {!vertical && <p className="mt-10 hidden text-center text-[11px] text-slate-500 md:block">Toque para escolher · arraste o escolhido para mover · alças redimensionam · bolinha de cima gira · Delete apaga · Ctrl+Z desfaz</p>}
        </div>

        <div className="min-w-0 space-y-2 lg:sticky lg:top-[84px]">
          {vertical && barraAdicionar}
          <div className="rounded-xl border border-white/10 bg-[#140632] p-2" data-testid="studio-ferramentas">
            <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-bold text-white">
              <MousePointerClick className="h-4 w-4 shrink-0 text-[#B04DFF]" />
              <span className="truncate">{camadaSel ? `Editando: ${camadaSel.tipo === 'texto' ? (camadaSel.texto.split('\n')[0] || camadaSel.nome) : camadaSel.nome}` : 'Toque num elemento da arte para editar'}</span>
              {camadaSel && <button type="button" onClick={() => setSel(null)} className="ml-auto shrink-0 rounded-md px-2 py-1 text-[11px] font-normal text-slate-400 hover:bg-white/5 hover:text-white">soltar</button>}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5" role="toolbar" aria-label="Ferramentas de edição">
              {abas.map(({ id, nome: n, I }) => (
                <button key={id} type="button" onClick={() => setAba(id)} aria-pressed={aba === id} data-testid={`studio-aba-${id}`}
                  className={cn(botao, aba === id ? 'border-[#B04DFF] bg-gradient-to-b from-[#8A2EFF]/70 to-[#5D1BFF]/60 text-white shadow-[0_0_18px_rgba(138,46,255,.45)]' : 'border-white/10 text-slate-200 hover:bg-white/5')}>
                  <I className="h-5 w-5" />{n}
                </button>
              ))}
              {acoes.map(({ id, n, I, f, perigo, ativo }) => (
                <button key={id} type="button" onClick={f} aria-pressed={ativo} data-testid={`studio-acao-${id}`}
                  className={cn(botao, perigo ? 'border-rose-400/40 text-rose-300 hover:bg-rose-500/15' : ativo ? 'border-[#FFD400]/60 bg-[#FFD400]/10 text-[#FFD400]' : 'border-white/10 text-slate-200 hover:bg-white/5')}>
                  {id === 'trocar' && ocupado === 'foto' ? <Loader2 className="h-5 w-5 animate-spin" /> : <I className="h-5 w-5" />}{n}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-[#8A2EFF]/30 bg-[#140632] p-3 shadow-[0_0_24px_rgba(93,27,255,.18)]">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#B04DFF]">{abas.find((a) => a.id === aba)?.nome ?? 'Editar'}</p>
            <CartaoDaAba aba={abas.some((a) => a.id === aba) ? aba : abas[0].id} c={camadaSel} doc={doc} mudar={(p) => { if (camadaSel) mudarPeloPainel(camadaSel.id, p); }} mudarFundo={mudarFundo}
              mover={(para) => { if (camadaSel) mover(camadaSel.id, para); }} textoRef={textoRef}
              video={cartaoVideo}
              camadas={<PainelCamadas doc={doc} sel={sel} onSelecionar={setSel} mudar={(id, p) => { lembrar(); mudarCamada(id, p); }} mover={mover} duplicar={duplicar} apagar={apagar} />} />
            <p className="mt-3 border-t border-white/5 pt-2 text-[10px] text-slate-500">Textos, cores, fontes e fotos valem também no {outroFormato}. Posição e tamanho são de cada formato.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Bloco titulo="Outras ferramentas" icone={Sparkles}>
          <button type="button" onClick={editarComIA} disabled={!!ocupado} className="flex w-full items-center gap-3 rounded-lg border border-[#FFD400]/40 bg-[#FFD400]/10 p-3 text-left text-sm text-white hover:bg-[#FFD400]/20">
            {ocupado === 'ia' ? <Loader2 className="h-5 w-5 animate-spin text-[#FFD400]" /> : <Sparkles className="h-5 w-5 text-[#FFD400]" />}
            <span><b>Criar versão com IA</b><span className="block text-xs text-slate-300">Agente SOBRE MÍDIA ou ChatGPT a partir desta arte{saldo.data?.paga ? ` · ${(saldo.data.preco_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por criação` : ''}</span></span>
          </button>
          <button type="button" onClick={abrirNoCanva} disabled={!!ocupado} className="flex w-full items-center gap-3 rounded-lg border border-white/15 p-3 text-left text-sm text-white hover:bg-white/5">
            {ocupado === 'canva' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ExternalLink className="h-5 w-5 text-[#00c4cc]" />}
            <span><b>Abrir no Canva</b><span className="block text-xs text-slate-300">Baixa a arte e abre o Canva para você continuar lá</span></span>
          </button>
        </Bloco>
          {saldo.data?.admin && (
            <div className="space-y-2 rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#7dffb0]">Owner / ADM</p>
              {!novoModelo ? (
                <button type="button" onClick={() => setNovoModelo({ nome, segmento: base.segmento, pasta: base.pasta ?? base.id })} className="w-full rounded-lg border border-[#25D366]/50 py-2 text-sm font-semibold text-white hover:bg-[#25D366]/10" data-testid="studio-novo-modelo">Adicionar ao catálogo como modelo novo</button>
              ) : (
                <div className="space-y-2">
                  <input className={campo} value={novoModelo.nome} maxLength={80} onChange={(e) => setNovoModelo({ ...novoModelo, nome: e.target.value })} aria-label="Nome do modelo" placeholder="Nome do modelo" />
                  <select className={campo} value={novoModelo.segmento} onChange={(e) => setNovoModelo({ ...novoModelo, segmento: e.target.value as SegmentoId })} aria-label="Segmento">
                    {SEGMENTOS.map((sg) => <option key={sg.id} value={sg.id} className="bg-[#140632]">{sg.nome}</option>)}
                  </select>
                  <select className={campo} value={novoModelo.pasta} onChange={(e) => setNovoModelo({ ...novoModelo, pasta: e.target.value })} aria-label="Pasta">
                    <option value="" className="bg-[#140632]">Pasta nova (card próprio no catálogo)</option>
                    {catalogo.pastas.map((p) => <option key={p.capa.id} value={p.capa.id} className="bg-[#140632]">Pasta: {p.capa.nome}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button type="button" disabled={!!ocupado || novoModelo.nome.trim().length < 3} onClick={adicionarAoCatalogo} className="flex-1 rounded-lg bg-[#25D366] py-2 text-sm font-bold text-[#0b2a17]">{ocupado === 'modelo' && <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />}Publicar no catálogo</button>
                    <button type="button" onClick={() => setNovoModelo(null)} className="rounded-lg border border-white/15 px-3 text-sm">Cancelar</button>
                  </div>
                  <p className="text-[11px] text-slate-400">Os dois formatos (16:9 e 9:16) vão juntos. Todos os usuários poderão personalizar.</p>
                </div>
              )}
            </div>
          )}
      </div>

      <PublicarDialog aberto={!!publicando} onFechar={() => setPublicando(false)} pasta={pastaGaleria} video={publicando === 'video'}
        gerarPng={publicando === 'video' && videoPronto ? async () => ({ video: videoPronto.v, largura: videoPronto.v.largura, altura: videoPronto.v.altura }) : gerarArte}
        formatos={publicando === 'video' ? undefined : ['16:9', '9:16']}
        nome={nome || base.nome} formato={publicando === 'video' && videoPronto ? videoPronto.formato : formato} clienteId={saldo.data?.cliente ?? null} />
    </div>
  );
}

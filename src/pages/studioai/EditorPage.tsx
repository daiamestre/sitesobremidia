import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Circle, Download, ExternalLink, Image as ImageIcon, Layers, List, Loader2, Minus, Monitor, MousePointerClick, Redo2, RotateCcw, Save, Send,
  Smartphone, Sparkles, Square, Ticket, Type, Undo2, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Palco } from '@/components/studio/editor/Palco';
import { PainelCamadas, PainelPropriedades, campo } from '@/components/studio/editor/Paineis';
import { PublicarDialog } from '@/components/studioai/PublicarDialog';
import { useAuth } from '@/contexts/AuthContext';
import { uploadToR2 } from '@/lib/r2Upload';
import {
  TAMANHO_DOC, alturaDoTexto, alturaDosItens, clonar, forma, imagem, itens, modeloParaDocumento, novoId, selo, texto,
  type Camada, type Documento, type FormatoDoc,
} from '@/lib/studio/documento';
import { documentoParaPng } from '@/lib/studio/desenhar';
import { modeloPorId, type ModeloDeArte } from '@/lib/studio/modelos';
import { acharModelo } from '@/lib/studio/pastas';
import { SEGMENTOS, type SegmentoId } from '@/lib/studio/catalogo';
import { meuSaldo, obterProjeto, salvarModelo, salvarProjeto } from '@/lib/studioai/api';
import { idDoModelo, useCatalogo } from '@/lib/studioai/modelos';
import { baixar, nomeDoArquivo } from '@/lib/studioai/exportar';
import { cn } from '@/lib/utils';

type Docs = Partial<Record<FormatoDoc, Documento>>;
interface DadosV2 { versao: 2; documentos: Docs; formato: FormatoDoc }

function Bloco({ titulo, icone: Icone, children, acao }: { titulo: string; icone: typeof Type; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-[#140632] p-3.5">
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
  const [nome, setNome] = useState('');
  const [idProjeto, setIdProjeto] = useState<string | null>(projetoId ?? null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
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
    if (docs && base && !docs[formato]) setDocs({ ...docs, [formato]: modeloParaDocumento(base, formato) });
  }, [docs, formato, base]);

  const doc = docs?.[formato] ?? null;
  const camadaSel = doc?.camadas.find((c) => c.id === sel) ?? null;

  const lembrar = useCallback(() => {
    if (!docs) return;
    passado.current = [...passado.current.slice(-59), clonar(docs)];
    futuro.current = [];
    setVersao((v) => v + 1);
  }, [docs]);
  const trocarDoc = useCallback((f: (d: Documento) => Documento) => setDocs((ds) => (ds && ds[formato] ? { ...ds, [formato]: f(ds[formato]!) } : ds)), [formato]);
  const mudarCamada = useCallback((id: string, p: Partial<Camada>) => trocarDoc((d) => ({ ...d, camadas: d.camadas.map((c) => (c.id === id ? normalizar({ ...c, ...p } as Camada) : c)) })), [trocarDoc]);
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
  const dados = (): DadosV2 => ({ versao: 2, documentos: docs, formato });

  const salvar = () => agir('salvar', async () => {
    const id = await salvarProjeto({ id: idProjeto, modeloId: base.id, nome: nome.trim() || base.nome, formato, dados: dados() as unknown as Record<string, unknown>, miniatura: null });
    setIdProjeto(id);
    void qc.invalidateQueries({ queryKey: ['studio-projetos'] });
    toast.success('Projeto salvo em Meus Projetos (os dois formatos).');
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

  return (
    <div className="space-y-3" data-testid="studio-editor">
      <input ref={arquivoRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void enviarFoto(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="flex flex-wrap items-center gap-2">
        <Link to={base.pasta ? `/studio/pasta/${base.pasta}` : '/studio'} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Modelos</Link>
        <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do projeto" maxLength={120} className="min-w-0 flex-1 bg-transparent text-lg font-bold text-white focus:outline-none" />
        <div className="flex items-center gap-1">
          <button type="button" onClick={desfazer} disabled={!passado.current.length} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" className="rounded-lg border border-white/10 p-2 text-white hover:bg-white/5 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={refazer} disabled={!futuro.current.length} title="Refazer (Ctrl+Y)" aria-label="Refazer" className="rounded-lg border border-white/10 p-2 text-white hover:bg-white/5 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
          <button type="button" onClick={restaurar} title="Voltar ao modelo original" aria-label="Voltar ao modelo original" className="rounded-lg border border-white/10 p-2 text-white hover:bg-white/5"><RotateCcw className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Formato">
          {(['16:9', '9:16'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={formato === f} onClick={() => { setFormato(f); setSel(null); }}
              className={cn('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold', formato === f ? 'bg-[#5D1BFF] text-white' : 'text-slate-300 hover:bg-white/5')}>
              {f === '16:9' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}{f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-white/10 bg-[#140632] p-1.5" aria-label="Adicionar elementos">
        {FERRAMENTAS.map(({ n, I, f }) => (
          <button key={n} type="button" onClick={f} disabled={ocupado === 'foto' && n === 'Imagem'} className="flex min-w-[64px] shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 hover:bg-white/5" data-testid={`studio-add-${n}`}>
            {ocupado === 'foto' && n === 'Imagem' ? <Loader2 className="h-4 w-4 animate-spin" /> : <I className="h-4 w-4 text-[#B04DFF]" />}{n}
          </button>
        ))}
        <label className="ml-auto flex shrink-0 items-center gap-2 px-2 text-[11px] text-slate-300">Fundo
          <input type="color" value={/^#[0-9a-f]{6}/i.test(doc.fundo) ? doc.fundo.slice(0, 7) : '#000000'} onChange={(e) => { lembrar(); trocarDoc((d) => ({ ...d, fundo: e.target.value })); }} className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent" aria-label="Cor de fundo" />
        </label>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-center rounded-2xl border border-[#8A2EFF]/30 bg-[#0a031c] p-3 pt-10 shadow-[0_0_40px_rgba(93,27,255,0.25)] sm:p-6 sm:pt-12">
            <div className={formato === '16:9' ? 'w-full' : 'w-full max-w-[min(420px,calc((100vh-170px)*0.5625))] min-w-[240px]'}>
              <Palco doc={doc} sel={sel} onSelecionar={setSel} onInicio={lembrar} onMudar={mudarCamada}
                onEditarTexto={() => setTimeout(() => textoRef.current?.focus(), 30)} />
            </div>
          </div>
          <p className="text-center text-[11px] text-slate-500">Clique para escolher · arraste para mover · alças para redimensionar · bolinha de cima para girar · Shift mantém a proporção · Delete apaga · Ctrl+Z desfaz</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => setPublicando(true)} className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-bold text-[#0b2a17] hover:brightness-105" data-testid="studio-publicar"><Send className="h-4 w-4" />Salvar e publicar</button>
            <button type="button" onClick={salvar} disabled={!!ocupado} className="flex items-center justify-center gap-2 rounded-xl bg-[#5D1BFF] py-3 text-sm font-semibold text-white hover:bg-[#8A2EFF]">{ocupado === 'salvar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar projeto</button>
            <button type="button" onClick={() => agir('baixar', async () => { const r = await png(); baixar(r.png, nomeDoArquivo(`${nome}-${formato.replace(':', 'x')}`)); })} disabled={!!ocupado}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 py-3 text-sm text-white hover:bg-white/5">{ocupado === 'baixar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Baixar PNG {W}×{H}</button>
          </div>
        </div>

        <div className="space-y-3">
          {camadaSel ? (
            <Bloco titulo={camadaSel.nome} icone={MousePointerClick} acao={<button type="button" onClick={() => setSel(null)} className="text-[11px] font-normal text-slate-400 hover:text-white">fechar</button>}>
              <PainelPropriedades c={camadaSel} doc={doc} mudar={(p) => mudarPeloPainel(camadaSel.id, p)} onTrocarImagem={() => pedirFoto('trocar')} textoRef={textoRef} />
            </Bloco>
          ) : (
            <Bloco titulo="Editar" icone={MousePointerClick}>
              <p className="text-xs text-slate-300">Toque em qualquer elemento da arte (texto, foto, faixa, selo, forma) para mudar cor, fonte, tamanho, posição e efeitos. Use a barra acima para adicionar elementos.</p>
            </Bloco>
          )}
          <Bloco titulo="Camadas" icone={Layers}>
            <PainelCamadas doc={doc} sel={sel} onSelecionar={setSel} mudar={(id, p) => { lembrar(); mudarCamada(id, p); }} mover={mover} duplicar={duplicar} apagar={apagar} />
          </Bloco>
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
      </div>

      <PublicarDialog aberto={publicando} onFechar={() => setPublicando(false)} gerarPng={png} nome={nome || base.nome} formato={formato} clienteId={saldo.data?.cliente ?? null} />
    </div>
  );
}

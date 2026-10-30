import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, ExternalLink, ImagePlus, Loader2, Palette, Save, Send, Sparkles, Type } from 'lucide-react';
import { toast } from 'sonner';
import { ArteModelo } from '@/components/studio/ArteModelo';
import { PublicarDialog } from '@/components/studioai/PublicarDialog';
import { useAuth } from '@/contexts/AuthContext';
import { uploadToR2 } from '@/lib/r2Upload';
import { MODELOS, modeloPorId, type FonteDaArte, type ModeloDeArte } from '@/lib/studio/modelos';
import { meuSaldo, obterProjeto, salvarModelo, salvarProjeto } from '@/lib/studioai/api';
import { idDoModelo, useCatalogo } from '@/lib/studioai/modelos';
import { SEGMENTOS, type SegmentoId } from '@/lib/studio/catalogo';
import { baixar, nomeDoArquivo, renderizarArte } from '@/lib/studioai/exportar';
import { cn } from '@/lib/utils';

const FONTES: { id: FonteDaArte; nome: string }[] = [
  { id: 'anton', nome: 'Anton' }, { id: 'bebas', nome: 'Bebas Neue' }, { id: 'montserrat', nome: 'Montserrat Black' }, { id: 'fira-condensed', nome: 'Fira Condensed' },
];
const PALETAS = [
  { base: '#e3262e', destaque: '#ffd21f', texto: '#ffffff' }, { base: '#22004A', destaque: '#FFD400', texto: '#ffffff' },
  { base: '#5D1BFF', destaque: '#25D366', texto: '#ffffff' }, { base: '#0b0b12', destaque: '#f25c05', texto: '#ffffff' },
  { base: '#ffffff', destaque: '#e3262e', texto: '#1a1a1a' }, { base: '#0e3b2e', destaque: '#ffd400', texto: '#ffffff' },
];
const campo = 'w-full rounded-lg border border-white/10 bg-[#0f0428] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#8A2EFF] focus:outline-none';

function Bloco({ titulo, icone: Icone, children }: { titulo: string; icone: typeof Type; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-[#140632] p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Icone className="h-4 w-4 text-[#B04DFF]" />{titulo}</h2>
      {children}
    </section>
  );
}
const Rotulo = ({ t, children }: { t: string; children: ReactNode }) => <label className="block space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t}</span>{children}</label>;

/** Studio de criação: o cliente personaliza um modelo do catálogo (ou um projeto salvo) e escolhe para onde vai. */
export default function EditorPage() {
  const { modeloId, projetoId } = useParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  const projeto = useQuery({ queryKey: ['studio-projeto', projetoId], queryFn: () => obterProjeto(projetoId!), enabled: !!projetoId });
  const catalogo = useCatalogo();
  const idBase = projeto.data?.modelo_id ?? modeloId ?? '';
  const base = useMemo(() => modeloPorId(idBase) ?? catalogo.todos.find((m) => m.id === idBase) ?? null, [idBase, catalogo.todos]);
  const [novoModelo, setNovoModelo] = useState<{ nome: string; segmento: SegmentoId } | null>(null);
  const [arte, setArte] = useState<ModeloDeArte | null>(null);
  const [nome, setNome] = useState('');
  const [idProjeto, setIdProjeto] = useState<string | null>(projetoId ?? null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);

  useEffect(() => {
    if (!base || arte) return;
    const dados = projeto.data?.dados ?? {};
    setArte({ ...base, ...dados, textos: { ...base.textos, ...(dados.textos ?? {}) }, cores: { ...base.cores, ...(dados.cores ?? {}) } });
    setNome(projeto.data?.nome ?? base.nome);
  }, [base, projeto.data, arte]);

  if ((projetoId && projeto.isLoading) || (!arte && base) || (!base && catalogo.carregando)) return <p className="p-10 text-sm text-slate-400">Abrindo o Studio de criação…</p>;
  if (!base || !arte) return <div className="p-10 text-sm text-slate-300">Modelo não encontrado. <Link to="/studio" className="text-[#FFD400] hover:underline">Voltar aos modelos</Link></div>;

  const t = arte.textos;
  const mudarTextos = (c: Partial<ModeloDeArte['textos']>) => setArte({ ...arte, textos: { ...t, ...c } });
  const dados = (): Partial<ModeloDeArte> => ({ textos: arte.textos, cores: arte.cores, fonte: arte.fonte, foto: arte.foto, fotoPosicao: arte.fotoPosicao });
  const agir = async (n: string, f: () => Promise<void>) => { setOcupado(n); try { await f(); } catch (e) { toast.error((e as Error).message || 'Não foi possível concluir.'); } finally { setOcupado(null); } };

  const salvar = () => agir('salvar', async () => {
    const id = await salvarProjeto({ id: idProjeto, modeloId: base.id, nome: nome.trim() || base.nome, formato: arte.formato, dados: dados(), miniatura: null });
    setIdProjeto(id);
    void qc.invalidateQueries({ queryKey: ['studio-projetos'] });
    toast.success('Projeto salvo em Meus Projetos.');
  });
  const trocarFoto = (arq: File | undefined) => arq && user && agir('foto', async () => {
    if (!/^image\/(jpeg|png|webp)$/.test(arq.type) || arq.size > 12 * 1024 * 1024) throw new Error('Envie JPG, PNG ou WebP de até 12 MB.');
    const { publicUrl } = await uploadToR2(arq, `${user.id}/studio/foto-${Date.now()}.${arq.type.split('/')[1]}`, arq.type, user.id, { preventOverwrite: true });
    setArte({ ...arte, foto: publicUrl, fotoPosicao: '50% 50%' });
  });
  const editarComIA = () => user && agir('ia', async () => {
    const { png } = await renderizarArte(arte);
    const { publicUrl } = await uploadToR2(png, `${user.id}/studio/ref-${Date.now()}.png`, 'image/png', user.id, { preventOverwrite: true });
    navegar(`/studio/ia?ref=${encodeURIComponent(publicUrl)}&formato=${encodeURIComponent(arte.formato)}&nome=${encodeURIComponent(nome)}`);
  });
  const abrirNoCanva = () => agir('canva', async () => {
    const { png } = await renderizarArte(arte);
    baixar(png, nomeDoArquivo(nome));
    window.open('https://www.canva.com/', '_blank', 'noopener');
    toast.info('A arte foi baixada. No Canva, use "Uploads" para abrir o arquivo e continuar a edição.', { duration: 8000 });
  });
  // owner/ADM: a arte atual vira um modelo NOVO do catálogo (os demais usuários só editam cópias)
  const adicionarAoCatalogo = () => novoModelo && agir('modelo', async () => {
    const id = idDoModelo(novoModelo.nome);
    await salvarModelo(id, { ...arte, id, nome: novoModelo.nome.trim(), segmento: novoModelo.segmento, edicao: ['rapida'], criadoEm: new Date().toISOString().slice(0, 10), etiquetas: [...new Set([...(arte.etiquetas ?? []), 'novo'])] });
    void qc.invalidateQueries({ queryKey: ['studio-modelos'] });
    setNovoModelo(null);
    toast.success('Modelo adicionado ao catálogo para todos os usuários.');
  });
  const [px, py] = (arte.fotoPosicao ?? '50% 50%').split(' ').map((v) => parseInt(v, 10) || 50);

  return (
    <div className="space-y-4" data-testid="studio-editor">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/studio" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Modelos</Link>
        <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do projeto" maxLength={120} className="min-w-0 flex-1 bg-transparent text-xl font-bold text-white focus:outline-none" />
        <span className="rounded bg-[#5D1BFF]/40 px-2 py-1 text-xs font-bold">{arte.formato}</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_260px]">
        <div className="order-3 space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 xl:order-1 xl:block xl:space-y-4">
          <Bloco titulo="Textos" icone={Type}>
            {t.sobretitulo !== undefined && <Rotulo t="Chamada pequena"><input className={campo} value={t.sobretitulo} maxLength={40} onChange={(e) => mudarTextos({ sobretitulo: e.target.value })} /></Rotulo>}
            <Rotulo t="Título (uma linha por linha)"><textarea className={cn(campo, 'min-h-20')} value={t.titulo.join('\n')} onChange={(e) => mudarTextos({ titulo: e.target.value.split('\n').slice(0, 4) })} /></Rotulo>
            {t.subtitulo !== undefined && <Rotulo t="Subtítulo"><input className={campo} value={t.subtitulo} maxLength={80} onChange={(e) => mudarTextos({ subtitulo: e.target.value })} /></Rotulo>}
            {t.itens && t.itens.map((it, i) => (
              <Rotulo key={i} t={`Item ${i + 1}`}><input className={campo} value={it} maxLength={40} onChange={(e) => mudarTextos({ itens: t.itens!.map((x, k) => (k === i ? e.target.value : x)) })} /></Rotulo>
            ))}
            {t.cta !== undefined && <Rotulo t="Botão / chamada para ação"><input className={campo} value={t.cta} maxLength={40} onChange={(e) => mudarTextos({ cta: e.target.value })} /></Rotulo>}
            {t.rodape !== undefined && <Rotulo t="Rodapé (telefone, endereço…)"><input className={campo} value={t.rodape} maxLength={90} onChange={(e) => mudarTextos({ rodape: e.target.value })} /></Rotulo>}
            {t.selo && (
              <div className="grid grid-cols-4 gap-2">
                <Rotulo t="Selo topo"><input className={campo} value={t.selo.topo ?? ''} maxLength={10} onChange={(e) => mudarTextos({ selo: { ...t.selo!, topo: e.target.value } })} /></Rotulo>
                <Rotulo t="Valor"><input className={campo} value={t.selo.valor} maxLength={8} onChange={(e) => mudarTextos({ selo: { ...t.selo!, valor: e.target.value } })} /></Rotulo>
                <Rotulo t="Sufixo"><input className={campo} value={t.selo.sufixo ?? ''} maxLength={6} onChange={(e) => mudarTextos({ selo: { ...t.selo!, sufixo: e.target.value } })} /></Rotulo>
                <Rotulo t="Base"><input className={campo} value={t.selo.base ?? ''} maxLength={10} onChange={(e) => mudarTextos({ selo: { ...t.selo!, base: e.target.value } })} /></Rotulo>
              </div>
            )}
          </Bloco>
          <Bloco titulo="Cores e fonte" icone={Palette}>
            <div className="grid grid-cols-6 gap-2" aria-label="Paletas prontas">
              {PALETAS.map((p) => (
                <button key={p.base + p.destaque} type="button" title="Aplicar paleta" onClick={() => setArte({ ...arte, cores: p })} className="h-9 overflow-hidden rounded-lg ring-1 ring-white/15 hover:ring-[#B04DFF]">
                  <span className="block h-1/2" style={{ background: p.base }} /><span className="block h-1/2" style={{ background: p.destaque }} />
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['base', 'destaque', 'texto'] as const).map((k) => (
                <Rotulo key={k} t={k === 'base' ? 'Fundo' : k === 'destaque' ? 'Destaque' : 'Texto'}>
                  <input type="color" className="h-9 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" value={arte.cores[k]} onChange={(e) => setArte({ ...arte, cores: { ...arte.cores, [k]: e.target.value } })} />
                </Rotulo>
              ))}
            </div>
            <Rotulo t="Fonte do título">
              <select className={campo} value={arte.fonte} onChange={(e) => setArte({ ...arte, fonte: e.target.value as FonteDaArte })}>{FONTES.map((f) => <option key={f.id} value={f.id} className="bg-[#140632]">{f.nome}</option>)}</select>
            </Rotulo>
          </Bloco>
          <Bloco titulo="Foto" icone={ImagePlus}>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-3 text-sm text-slate-300 hover:border-[#FFD400] hover:text-[#FFD400]">
              {ocupado === 'foto' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}Trocar pela minha foto
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void trocarFoto(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <Rotulo t={`Enquadramento horizontal (${px}%)`}><input type="range" min={0} max={100} value={px} onChange={(e) => setArte({ ...arte, fotoPosicao: `${e.target.value}% ${py}%` })} className="w-full accent-[#8A2EFF]" /></Rotulo>
            <Rotulo t={`Enquadramento vertical (${py}%)`}><input type="range" min={0} max={100} value={py} onChange={(e) => setArte({ ...arte, fotoPosicao: `${px}% ${e.target.value}%` })} className="w-full accent-[#8A2EFF]" /></Rotulo>
            <button type="button" className="text-xs text-slate-400 hover:text-white" onClick={() => setArte({ ...arte, foto: base.foto, fotoPosicao: base.fotoPosicao })}>Voltar à foto do modelo</button>
          </Bloco>
        </div>

        <div className="order-1 xl:order-2">
          <div className="flex items-center justify-center rounded-2xl xl:sticky xl:top-[88px] border border-[#8A2EFF]/30 bg-[#0a031c] p-4 shadow-[0_0_40px_rgba(93,27,255,0.25)]">
            <div className={arte.formato === '16:9' ? 'w-full' : 'w-full max-w-[300px] sm:max-w-[360px]'}><ArteModelo modelo={arte} className="rounded-lg shadow-2xl" /></div>
          </div>
        </div>

        <div className="order-2 grid gap-3 sm:grid-cols-2 xl:order-3 xl:block xl:space-y-3">
          <button type="button" onClick={() => setPublicando(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-bold text-[#0b2a17] hover:brightness-105" data-testid="studio-publicar">
            <Send className="h-4 w-4" />Salvar e publicar
          </button>
          <button type="button" onClick={salvar} disabled={!!ocupado} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5D1BFF] py-3 text-sm font-semibold text-white hover:bg-[#8A2EFF]">
            {ocupado === 'salvar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar projeto
          </button>
          <button type="button" onClick={() => agir('baixar', async () => { const { png } = await renderizarArte(arte); baixar(png, nomeDoArquivo(nome)); })} disabled={!!ocupado}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 py-3 text-sm text-white hover:bg-white/5">
            {ocupado === 'baixar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Baixar PNG {arte.formato === '16:9' ? '1920×1080' : '1080×1920'}
          </button>
          <div className="space-y-3 rounded-xl border border-white/10 bg-[#140632] p-4 sm:col-span-2 xl:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Outras ferramentas</p>
            <button type="button" onClick={editarComIA} disabled={!!ocupado} className="flex w-full items-center gap-3 rounded-lg border border-[#FFD400]/40 bg-[#FFD400]/10 p-3 text-left text-sm text-white hover:bg-[#FFD400]/20">
              {ocupado === 'ia' ? <Loader2 className="h-5 w-5 animate-spin text-[#FFD400]" /> : <Sparkles className="h-5 w-5 text-[#FFD400]" />}
              <span><b>Editar com ChatGPT</b><span className="block text-xs text-slate-300">A IA cria uma nova versão a partir desta arte{saldo.data?.paga ? ` · ${(saldo.data.preco_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por criação` : ''}</span></span>
            </button>
            <button type="button" onClick={abrirNoCanva} disabled={!!ocupado} className="flex w-full items-center gap-3 rounded-lg border border-white/15 p-3 text-left text-sm text-white hover:bg-white/5">
              {ocupado === 'canva' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ExternalLink className="h-5 w-5 text-[#00c4cc]" />}
              <span><b>Abrir no Canva</b><span className="block text-xs text-slate-300">Baixa a arte e abre o Canva para você continuar lá</span></span>
            </button>
          </div>
          {saldo.data?.admin && (
            <div className="space-y-2 rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 p-4 sm:col-span-2 xl:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#7dffb0]">Owner / ADM</p>
              {!novoModelo ? (
                <button type="button" onClick={() => setNovoModelo({ nome, segmento: arte.segmento })} className="w-full rounded-lg border border-[#25D366]/50 py-2 text-sm font-semibold text-white hover:bg-[#25D366]/10" data-testid="studio-novo-modelo">Adicionar ao catálogo como modelo novo</button>
              ) : (
                <div className="space-y-2">
                  <input className={campo} value={novoModelo.nome} maxLength={80} onChange={(e) => setNovoModelo({ ...novoModelo, nome: e.target.value })} aria-label="Nome do modelo" placeholder="Nome do modelo" />
                  <select className={campo} value={novoModelo.segmento} onChange={(e) => setNovoModelo({ ...novoModelo, segmento: e.target.value as SegmentoId })} aria-label="Segmento">
                    {SEGMENTOS.map((sg) => <option key={sg.id} value={sg.id} className="bg-[#140632]">{sg.nome}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button type="button" disabled={!!ocupado || novoModelo.nome.trim().length < 3} onClick={adicionarAoCatalogo} className="flex-1 rounded-lg bg-[#25D366] py-2 text-sm font-bold text-[#0b2a17]">{ocupado === 'modelo' && <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />}Publicar no catálogo</button>
                    <button type="button" onClick={() => setNovoModelo(null)} className="rounded-lg border border-white/15 px-3 text-sm">Cancelar</button>
                  </div>
                  <p className="text-[11px] text-slate-400">Use a foto própria ("Trocar pela minha foto") para o modelo novo. Todos os usuários poderão personalizar.</p>
                </div>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-500 sm:col-span-2 xl:col-span-1">Modelos do catálogo: {catalogo.todos.length}. As fotos dos modelos são próprias da SOBRE MÍDIA; troque pela foto do seu produto quando quiser.</p>
        </div>
      </div>

      <PublicarDialog aberto={publicando} onFechar={() => setPublicando(false)} gerarPng={() => renderizarArte(arte)} nome={nome || base.nome} formato={arte.formato} clienteId={saldo.data?.cliente ?? null} />
    </div>
  );
}

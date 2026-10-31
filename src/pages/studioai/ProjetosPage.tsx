import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, FolderKanban, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMemo } from 'react';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { modeloParaDocumento, type Documento, type FormatoDoc } from '@/lib/studio/documento';
import { modeloPorId, type ModeloDeArte } from '@/lib/studio/modelos';
import { acharModelo } from '@/lib/studio/pastas';
import { apagarProjeto, listarProjetos, ultimasImagens, type Projeto } from '@/lib/studioai/api';

/** Documento do projeto: o salvo em camadas (F-221) ou o antigo convertido. */
function documentoDoProjeto(p: Projeto): Documento | null {
  const d = p.dados as Partial<ModeloDeArte> & { versao?: number; documentos?: Partial<Record<FormatoDoc, Documento>> };
  if (d.versao === 2 && d.documentos) return d.documentos[p.formato] ?? Object.values(d.documentos)[0] ?? null;
  const base = acharModelo(p.modelo_id) ?? modeloPorId(p.modelo_id);
  if (!base) return null;
  return modeloParaDocumento({ ...base, ...d, textos: { ...base.textos, ...(d.textos ?? {}) }, cores: { ...base.cores, ...(d.cores ?? {}) } }, p.formato);
}
// F-227: projeto do editor de vídeo abre no editor de vídeo
const ehVideo = (p: Projeto) => (p.dados as { tipo?: string }).tipo === 'video';
const destino = (p: Projeto) => (ehVideo(p) ? `/studio/video/${p.id}` : `/studio/projeto/${p.id}`);

function Miniatura({ p }: { p: Projeto }) {
  const doc = useMemo(() => (ehVideo(p) ? null : documentoDoProjeto(p)), [p]);
  if (ehVideo(p)) return <span className="flex flex-col items-center gap-1 text-xs text-slate-300"><Clapperboard className="h-10 w-10 text-[#FFD400]" />Projeto de vídeo</span>;
  return doc ? <div className={p.formato === '16:9' ? 'w-full' : 'h-full aspect-[9/16]'}><PreviaDocumento doc={doc} /></div> : null;
}

export default function ProjetosPage() {
  const qc = useQueryClient();
  const projetos = useQuery({ queryKey: ['studio-projetos'], queryFn: listarProjetos });
  const imagens = useQuery({ queryKey: ['studio-ai-ultimas'], queryFn: ultimasImagens });
  const apagar = async (p: Projeto) => {
    if (!window.confirm(`Apagar o projeto "${p.nome}"? As mídias já salvas continuam.`)) return;
    try { await apagarProjeto(p.id); void qc.invalidateQueries({ queryKey: ['studio-projetos'] }); toast.success('Projeto apagado.'); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="space-y-8" data-testid="studio-projetos">
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-2xl font-black text-white"><FolderKanban className="h-6 w-6 text-[#B04DFF]" />Meus Projetos</h1>
        {projetos.isLoading && <p className="text-sm text-slate-400">Carregando…</p>}
        {projetos.data?.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">Nenhum projeto salvo. <Link to="/studio" className="font-semibold text-[#FFD400] hover:underline">Escolha um modelo</Link> para começar.</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {projetos.data?.map((p) => {
            return (
              <article key={p.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#140632] p-3">
                <Link to={destino(p)} className="flex h-40 items-center justify-center overflow-hidden rounded-lg bg-black">
                  <Miniatura p={p} />
                </Link>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{p.nome}</p><p className="text-xs text-slate-500">{p.formato} · {new Date(p.atualizado_em).toLocaleString('pt-BR')}</p></div>
                  <button type="button" aria-label={`Apagar ${p.nome}`} onClick={() => void apagar(p)} className="rounded p-1 text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                </div>
                <Link to={destino(p)} className="mt-2 block rounded-lg bg-[#5D1BFF] py-2 text-center text-sm font-semibold text-white hover:bg-[#8A2EFF]">Continuar editando</Link>
              </article>
            );
          })}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white"><Sparkles className="h-5 w-5 text-[#FFD400]" />Criações com IA</h2>
        {imagens.data?.length === 0 && <p className="text-sm text-slate-400">Nenhuma imagem criada com IA ainda. <Link to="/studio/ia" className="font-semibold text-[#FFD400] hover:underline">Criar agora</Link>.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {imagens.data?.map((i) => (
            <Link key={i.id} to={`/studio/ia?conversa=${i.conversa_id}`} className="overflow-hidden rounded-xl border border-white/10 bg-[#140632] hover:border-[#8A2EFF]/60">
              <img src={i.url} alt="Criação com IA" loading="lazy" className="aspect-square w-full object-contain" />
              <p className="px-2 py-1.5 text-[10px] text-slate-400">{new Date(i.criado_em).toLocaleString('pt-BR')}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

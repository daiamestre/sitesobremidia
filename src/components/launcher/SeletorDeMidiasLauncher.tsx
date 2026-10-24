import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronLeft, Film, FolderOpen, Image as ImageIcon, Loader2, Search, Sparkles, Upload } from 'lucide-react';
import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  buscarMidias, buscarMidiasDaPasta, buscarPastas, midiasPorId, type MidiaEscolhivel, type OrigemDasMidias, type PastaDeMidias,
} from '@/services/launcher.service';
import { ehVideo, PreviaRapidaDeMidia, tempoCurto } from './PreviaRapidaDeMidia';

export const formatoDaMidia = (m: { aspect_ratio?: string | null }) => {
  const a = (m.aspect_ratio ?? '').replace(/\s/g, '');
  if (/^9[:x/]16$/i.test(a) || a === 'vertical' || a === 'portrait') return '9:16';
  if (/^16[:x/]9$/i.test(a) || a === 'horizontal' || a === 'landscape') return '16:9';
  return null;
};

/**
 * F-213 — seletor de mídias da launcher (Destaques e capa). Antes: uma grade solta de até 120 mídias que, na Biblioteca,
 * ficava esmagada (as linhas encolhiam até virar tiras) e sem dizer qual mídia era qual. Agora: abas Enviadas/Biblioteca,
 * as mídias separadas por PASTAS (Enviadas = Vídeos e Fotos, como em Minhas Mídias; Biblioteca = as pastas dela), cada
 * mídia num cartão do mesmo tamanho com o nome, tipo, formato, duração e prévia rápida (tocar/pausar e volume).
 * Busca pelo nome: dentro da pasta aberta, ou em todas quando nenhuma está aberta. "Upload" envia do aparelho em uso.
 */
export function SeletorDeMidiasLauncher({ aberto, empresa, titulo, descricao, formato, capa, onFechar, onEscolher }: {
  aberto: boolean; empresa: string; titulo: string; descricao: string; formato?: '16:9' | '9:16'; capa?: boolean;
  onFechar: () => void; onEscolher: (m: MidiaEscolhivel[]) => Promise<void>;
}) {
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [origem, setOrigem] = useState<OrigemDasMidias>('enviadas');
  const [pasta, setPasta] = useState<PastaDeMidias | null>(null);
  const [marcadas, setMarcadas] = useState<Map<string, MidiaEscolhivel>>(new Map());
  const [tocando, setTocando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { const tm = setTimeout(() => setTermo(busca), 350); return () => clearTimeout(tm); }, [busca]);
  useEffect(() => { if (!aberto) { setMarcadas(new Map()); setBusca(''); setOrigem('enviadas'); setPasta(null); setTocando(null); } }, [aberto]);
  useEffect(() => { setPasta(null); setTocando(null); }, [origem]);

  const pastas = useQuery({
    queryKey: ['launcher-pastas', empresa, origem, !!capa], queryFn: () => buscarPastas(empresa, origem, !!capa), enabled: aberto && !!empresa,
  });
  const buscandoEmTudo = !pasta && !!termo.trim();
  const midias = useQuery({
    queryKey: ['launcher-midias', origem, pasta?.id ?? null, termo, !!capa],
    queryFn: () => (pasta ? buscarMidiasDaPasta(origem, pasta.id, termo, !!capa) : buscarMidias(termo, origem, !!capa)),
    enabled: aberto && (!!pasta || buscandoEmTudo),
  });

  const alternar = (m: MidiaEscolhivel) => setMarcadas((atual) => {
    const novo = capa ? new Map<string, MidiaEscolhivel>() : new Map(atual);
    if (atual.has(m.id)) novo.delete(m.id); else novo.set(m.id, m);
    return novo;
  });
  const usar = async (lista: MidiaEscolhivel[]) => {
    setSalvando(true);
    try { await onEscolher(lista); onFechar(); } finally { setSalvando(false); }
  };
  const mostrandoMidias = !!pasta || buscandoEmTudo;

  return (
    <>
      <Dialog open={aberto && !enviando} onOpenChange={(v) => !v && onFechar()}>
        <DialogContent className="max-w-4xl" data-testid="seletor-midias-launcher">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border p-0.5" role="tablist" data-testid="origem-midias">
              {([['enviadas', 'Enviadas'], ['biblioteca', 'Biblioteca']] as const).map(([id, rotulo]) => (
                <button key={id} type="button" role="tab" aria-selected={origem === id} onClick={() => setOrigem(id)}
                  className={`rounded px-3 py-1 text-sm ${origem === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{rotulo}</button>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="ml-auto gap-1.5" onClick={() => setEnviando(true)} data-testid="enviar-do-aparelho">
              <Upload className="h-4 w-4" />Upload
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9"
              placeholder={pasta ? `Buscar pelo nome em "${pasta.nome}"` : 'Buscar pelo nome da mídia em todas as pastas'} />
          </div>
          {mostrandoMidias && (
            <div className="flex items-center gap-2 text-sm">
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => { setPasta(null); setBusca(''); setTocando(null); }}
                data-testid="voltar-pastas"><ChevronLeft className="h-4 w-4" />Pastas</Button>
              <span className="truncate font-medium">{pasta ? pasta.nome : `Resultado da busca "${termo}"`}</span>
              {midias.data && <Badge variant="secondary" className="shrink-0">{midias.data.length}</Badge>}
            </div>
          )}

          {/* rolagem num quadro próprio: a grade nunca encolhe as linhas (era o que esmagava as mídias) */}
          <div className="max-h-[55vh] overflow-y-auto pr-1" data-testid="grade-do-seletor">
            {!mostrandoMidias && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="pastas-do-seletor">
                {pastas.isLoading && <p className="col-span-full py-6 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando as pastas…</p>}
                {pastas.data?.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPasta(p)} data-testid="pasta-do-seletor"
                    className="group relative flex min-h-[96px] flex-col justify-between overflow-hidden rounded-xl border border-cyan-400/25 bg-gradient-to-br from-slate-950 via-indigo-950/70 to-slate-950 p-3 text-left shadow-[0_0_0_1px_rgba(34,211,238,0.05)] transition hover:border-cyan-300/70 hover:shadow-[0_0_18px_rgba(34,211,238,0.25)]">
                    {p.capa_url && <img src={p.capa_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 transition group-hover:opacity-30" />}
                    <span className="relative flex items-center gap-2 text-cyan-300">
                      {origem === 'enviadas' ? (p.id === 'video' ? <Film className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />) : <FolderOpen className="h-5 w-5" />}
                      {p.automatica && <Badge variant="outline" className="h-4 gap-0.5 border-cyan-400/40 px-1 text-[9px] text-cyan-200"><Sparkles className="h-2.5 w-2.5" />Automática</Badge>}
                    </span>
                    <span className="relative mt-2 block">
                      <span className="line-clamp-2 text-sm font-semibold text-white">{p.nome}</span>
                      <span className="text-[11px] text-slate-300">{p.total} {p.total === 1 ? 'mídia' : 'mídias'}</span>
                    </span>
                  </button>
                ))}
                {pastas.data && pastas.data.length === 0 && (
                  <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                    {origem === 'enviadas' ? 'Nenhuma mídia enviada ainda. Use "Upload".' : 'Nenhuma pasta com mídias na Biblioteca.'}
                  </p>
                )}
              </div>
            )}

            {mostrandoMidias && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="midias-do-seletor">
                {midias.isLoading && <p className="col-span-full py-6 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Buscando…</p>}
                {midias.data?.map((m) => {
                  const marcada = marcadas.has(m.id);
                  const f = formatoDaMidia(m);
                  return (
                    <div key={m.id} role="button" tabIndex={0} onClick={() => alternar(m)} title={m.name} data-testid="midia-do-seletor"
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(m); } }}
                      className={`flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-left transition ${marcada ? 'border-cyan-400 ring-2 ring-cyan-400/70' : 'hover:border-primary/60'}`}>
                      <div className="relative">
                        <PreviaRapidaDeMidia midia={m} tocando={tocando === m.id} onTocar={(sim) => setTocando(sim ? m.id : null)} className="aspect-video w-full" />
                        <span className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border ${marcada ? 'border-cyan-300 bg-cyan-500 text-white' : 'border-white/60 bg-black/40'}`}>
                          {marcada && <Check className="h-3.5 w-3.5" />}
                        </span>
                      </div>
                      <div className="space-y-1 p-2">
                        <p className="line-clamp-2 min-h-[2.25rem] text-xs font-medium leading-tight">{m.name}</p>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{ehVideo(m.file_type) ? 'Vídeo' : 'Foto'}</Badge>
                          {f && <Badge variant={formato && f === formato ? 'default' : 'outline'} className="h-4 px-1 text-[10px]">{f}</Badge>}
                          {ehVideo(m.file_type) && m.duration_ms ? <span className="text-[10px] text-muted-foreground">{tempoCurto(m.duration_ms / 1000)}</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {midias.data && midias.data.length === 0 && (
                  <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Nenhuma mídia encontrada{pasta ? ' nesta pasta' : ''}.</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-xs text-muted-foreground">{marcadas.size ? `${marcadas.size} selecionada(s)` : capa ? 'Escolha uma imagem' : 'Escolha quantas mídias quiser'}</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onFechar}>Cancelar</Button>
              <Button disabled={!marcadas.size || salvando} onClick={() => usar([...marcadas.values()])} data-testid="confirmar-midias">
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{capa ? 'Usar como capa' : `Adicionar ${marcadas.size || ''}`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MediaUploadDialog
        open={aberto && enviando}
        onOpenChange={(v) => { if (!v) setEnviando(false); }}
        onUploadComplete={() => undefined}
        semPlaylist
        titulo={capa ? 'Upload da imagem de capa da launcher' : `Upload para ${titulo}`}
        onUploadedIds={async (ids) => {
          const novas = (await midiasPorId(ids)).filter((m) => !capa || !ehVideo(m.file_type));
          if (!novas.length) { toast.error(capa ? 'A capa precisa ser uma imagem.' : 'Nenhuma mídia enviada.'); return; }
          await onEscolher(capa ? novas.slice(0, 1) : novas);
          setEnviando(false);
          onFechar();
        }}
      />
    </>
  );
}

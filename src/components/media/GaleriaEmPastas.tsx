/**
 * F-225 — galeria em PASTAS: dentro de "Imagens" ou "Vídeos", as mídias aparecem nas mesmas pastas de modelos do
 * SOBRE MÍDIA Studio (ex.: "Açougue – Carnes Selecionadas"). A pasta nasce sozinha quando a pessoa cria uma arte a
 * partir de um modelo; a capa pode ser trocada (uma mídia da pasta ou uma foto enviada). Cada pessoa vê só as suas.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, FolderOpen, ImagePlus, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { OUTRAS, agruparEmPastas, lerGaleria, trocarCapa, type GrupoDaGaleria, type ItemDaGaleria, type OrigemDaMidia } from '@/lib/galeria';
import { uploadToR2 } from '@/lib/r2Upload';
import { cn } from '@/lib/utils';

interface Props<T extends ItemDaGaleria> {
  origem: OrigemDaMidia;
  itens: T[];
  video?: boolean;
  /** desenha as mídias de uma pasta aberta (cada página usa o seu cartão de mídia) */
  render: (itens: T[]) => ReactNode;
}

export function GaleriaEmPastas<T extends ItemDaGaleria>({ origem, itens, video = false, render }: Props<T>) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const galeria = useQuery({ queryKey: ['galeria-pastas', origem], queryFn: () => lerGaleria(origem), staleTime: 30_000 });
  const [aberta, setAberta] = useState<string | null>(null);
  const [capaDe, setCapaDe] = useState<GrupoDaGaleria<T> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const grupos = useMemo(() => agruparEmPastas(itens, galeria.data?.mapa ?? new Map(), galeria.data?.pastas ?? []), [itens, galeria.data]);

  // sem nenhuma pasta do Studio ainda: mostra as mídias como antes
  if (!galeria.isLoading && grupos.every((g) => g.chave === OUTRAS)) return <>{render(itens)}</>;
  const pasta = grupos.find((g) => g.chave === aberta) ?? null;

  const definirCapa = async (url: string | null) => {
    if (!capaDe) return;
    setSalvando(true);
    try {
      await trocarCapa(capaDe.chave, url);
      await qc.invalidateQueries({ queryKey: ['galeria-pastas', origem] });
      toast.success('Capa da pasta trocada.');
      setCapaDe(null);
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };
  const enviarCapa = async (f: File | undefined) => {
    if (!f || !user) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 8 * 1024 * 1024) { toast.error('Envie JPG, PNG ou WebP de até 8 MB.'); return; }
    setSalvando(true);
    try {
      const { publicUrl } = await uploadToR2(f, `${user.id}/galeria/capa-${Date.now()}.${f.type.split('/')[1]}`, f.type, user.id, { preventOverwrite: true });
      setSalvando(false);
      await definirCapa(publicUrl);
    } catch (e) { toast.error((e as Error).message); setSalvando(false); }
  };

  return (
    <div className="space-y-4" data-testid="galeria-em-pastas">
      {pasta ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAberta(null)}><ArrowLeft className="mr-1 h-4 w-4" />Pastas</Button>
            <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold"><FolderOpen className="h-5 w-5 shrink-0 text-primary" /><span className="truncate">{pasta.nome}</span></h2>
            <span className="text-sm text-muted-foreground">{pasta.itens.length} {video ? 'vídeo(s)' : 'imagem(ns)'}</span>
            {pasta.chave !== OUTRAS && <Button variant="outline" size="sm" className="ml-auto" onClick={() => setCapaDe(pasta)} data-testid="galeria-trocar-capa"><ImagePlus className="mr-1 h-4 w-4" />Trocar capa</Button>}
          </div>
          {render(pasta.itens)}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {galeria.isLoading && [...Array(4)].map((_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />)}
          {grupos.map((g) => (
            <div key={g.chave} className="group relative overflow-hidden rounded-xl border border-primary/25 bg-card shadow-[0_0_18px_-8px_hsl(var(--primary)/0.7)] transition hover:border-primary/60 hover:shadow-[0_0_28px_-6px_hsl(var(--primary)/0.9)]" data-testid="galeria-pasta">
              <button type="button" onClick={() => setAberta(g.chave)} className="block w-full text-left">
                <div className="relative aspect-[4/3] bg-black">
                  {g.capa ? <img src={g.capa} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><FolderOpen className="h-10 w-10" /></div>}
                  {video && <span className="absolute left-2 top-2 rounded-full bg-black/60 p-1.5 text-white"><Play className="h-3.5 w-3.5" /></span>}
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur"><FolderOpen className="h-3 w-3 text-[#FFD400]" />{g.itens.length}</span>
                </div>
                <p className="truncate px-3 py-2 text-sm font-semibold" title={g.nome}>{g.nome}</p>
              </button>
              {g.chave !== OUTRAS && (
                <button type="button" onClick={() => setCapaDe(g)} aria-label={`Trocar a capa da pasta ${g.nome}`} title="Trocar capa"
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white opacity-90 backdrop-blur hover:bg-black/80"><ImagePlus className="h-4 w-4" /></button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!capaDe} onOpenChange={(v) => { if (!v) setCapaDe(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Capa da pasta</DialogTitle>
            <DialogDescription>Escolha uma mídia desta pasta ou envie uma foto para ser a capa de "{capaDe?.nome}".</DialogDescription>
          </DialogHeader>
          <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void enviarCapa(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
            {capaDe?.itens.filter((i) => i.capa).map((i) => (
              <button key={i.id} type="button" disabled={salvando} onClick={() => void definirCapa(i.capa)} className={cn('relative aspect-square overflow-hidden rounded-lg border-2', capaDe.capa === i.capa ? 'border-primary' : 'border-transparent hover:border-primary/50')}>
                <img src={i.capa!} alt={i.nome} className="h-full w-full object-cover" loading="lazy" />
                {capaDe.capa === i.capa && <Check className="absolute right-1 top-1 h-5 w-5 rounded-full bg-primary p-0.5 text-white" />}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => arquivo.current?.click()} disabled={salvando} className="flex-1">{salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}Enviar outra foto</Button>
            {capaDe?.capaPropria && <Button variant="outline" disabled={salvando} onClick={() => void definirCapa(null)}>Voltar à capa automática</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

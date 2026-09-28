import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export interface FotoDoPonto { url: string; legenda?: string | null; credito?: string | null }

/**
 * F-108 — Galeria de fotos pequenas dos locais onde as telas estão instaladas.
 * Rola para os lados (arrastar/deslizar ou setas); tocar abre a foto grande.
 */
export function GaleriaDoPonto({ fotos, nome }: { fotos: FotoDoPonto[]; nome: string }) {
  const trilho = useRef<HTMLDivElement>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  if (!fotos.length) return null;

  const rolar = (dir: -1 | 1) => trilho.current?.scrollBy({ left: dir * (trilho.current.clientWidth * 0.8), behavior: 'smooth' });
  const atual = aberta != null ? fotos[aberta] : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4" data-testid="galeria-do-ponto">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Fotos do local <span className="font-normal text-slate-500">· {fotos.length}</span></p>
        <div className="flex gap-1">
          <button type="button" onClick={() => rolar(-1)} aria-label="Fotos anteriores"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-300 hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => rolar(1)} aria-label="Próximas fotos"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-300 hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div ref={trilho} className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:thin]">
        {fotos.map((f, i) => (
          <button key={f.url + i} type="button" onClick={() => setAberta(i)}
            className="group relative w-44 flex-shrink-0 snap-start overflow-hidden rounded-xl border border-white/10 text-left sm:w-52">
            <img src={f.url} alt={f.legenda || `Foto ${i + 1} de ${nome}`} loading="lazy"
              className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            {f.legenda && (
              <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-xs font-medium text-white">
                {f.legenda}
              </span>
            )}
          </button>
        ))}
      </div>

      <Dialog open={aberta != null} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-4xl border-white/10 bg-slate-950 p-2 text-white [&>button]:hidden">
          <DialogTitle className="sr-only">{atual?.legenda || nome}</DialogTitle>
          {atual && (
            <div className="relative">
              <img src={atual.url} alt={atual.legenda || nome} className="max-h-[75vh] w-full rounded-lg object-contain" />
              <button type="button" onClick={() => setAberta(null)} aria-label="Fechar"
                className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"><X className="h-5 w-5" /></button>
              {fotos.length > 1 && (
                <>
                  <button type="button" aria-label="Foto anterior" onClick={() => setAberta((aberta! - 1 + fotos.length) % fotos.length)}
                    className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white"><ChevronLeft className="h-5 w-5" /></button>
                  <button type="button" aria-label="Próxima foto" onClick={() => setAberta((aberta! + 1) % fotos.length)}
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white"><ChevronRight className="h-5 w-5" /></button>
                </>
              )}
              <div className="flex items-center justify-between gap-2 px-2 pt-2 text-sm">
                <span className="font-medium">{atual.legenda}</span>
                <span className="text-xs text-slate-400">{atual.credito}{fotos.length > 1 ? ` · ${aberta! + 1}/${fotos.length}` : ''}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * F-296 (pedido do dono, 10/11/2026): GALERIA DE MODELOS de cada pasta (encartes e palco de cada segmento). Cada modelo é
 * uma pastinha com a capa dele: o cliente escolhe qual quer editar. Cada modelo é dono de si: o que se edita num não passa
 * para o outro.
 */
import type { ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModeloDaGaleria { id: string; nome: string; capa?: string; /** capa ao vivo (a arte com os produtos) */ previa?: ReactNode; selo?: string }

export function GaleriaDeModelos({ titulo, itens, selecionado, aoEscolher, deitado = false }: { titulo: string; itens: ModeloDaGaleria[]; selecionado: string; aoEscolher: (id: string) => void; deitado?: boolean }) {
  return (
    <section className="space-y-2" aria-label={titulo} data-testid="galeria-de-modelos">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white"><FolderOpen className="h-4 w-4 text-[#FFD400]" />{titulo}<span className="text-xs font-normal text-slate-400">· toque no modelo que quer editar</span></h2>
      <div className="flex gap-3 overflow-x-auto pb-1" role="radiogroup" aria-label={titulo}>
        {itens.map((m) => {
          const ativo = m.id === selecionado;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={ativo} onClick={() => aoEscolher(m.id)} data-testid="galeria-modelo"
              className={cn('relative shrink-0 rounded-xl border-2 bg-[#140632] p-1.5 pt-3 text-left transition', deitado ? 'w-44' : 'w-28', ativo ? 'border-[#FFD400] shadow-[0_0_0_3px_rgba(255,212,0,.25)]' : 'border-white/10 hover:border-[#8A2EFF]/60')}>
              {/* a "aba" da pasta */}
              <span className={cn('absolute -top-0.5 left-2 h-2.5 w-10 rounded-t-md', ativo ? 'bg-[#FFD400]' : 'bg-[#5D1BFF]')} aria-hidden />
              {m.previa ? <div className={cn('w-full overflow-hidden rounded-md bg-black', deitado ? 'aspect-video' : 'aspect-[9/16]')}>{m.previa}</div>
                : <img src={m.capa} alt="" loading="lazy" className={cn('w-full rounded-md bg-black object-cover', deitado ? 'aspect-video' : 'aspect-[9/16]')} />}
              <span className="mt-1 block truncate text-[11px] font-semibold text-slate-100">{m.nome}</span>
              {m.selo && <span className="block text-[10px] text-[#FFD400]">{m.selo}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

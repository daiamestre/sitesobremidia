/**
 * F-296 (pedido do dono, 10/11/2026): GALERIA DE MODELOS de cada pasta (encartes e palco de cada segmento). Cada modelo é
 * dono de si: o que se edita num não passa para o outro.
 * F-298 (pedido do dono, 11/11/2026): o modelo se escolhe ANTES da edição. Ao abrir a pasta, a pessoa vê só os modelos
 * (grandes, com a amostra); tocou num deles, vai para a tela de edição — que NÃO mostra mais a galeria. "Modelos", na
 * edição, volta para esta escolha.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FolderOpen, PenLine, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModeloDaGaleria { id: string; nome: string; capa?: string; /** capa ao vivo (a arte com os produtos) */ previa?: ReactNode; selo?: string; /** texto do botão (padrão "Editar este modelo") */ botao?: string; /** ação a mais embaixo do cartão */ extra?: ReactNode }

/** F-298: a tela que abre ao entrar na pasta — os modelos para escolher; a edição vem depois. */
export function EscolhaDeModelo({ titulo, descricao, itens, ultimo, aoEscolher, aoEditarDireto, deitado = false, topo, voltar = '/studio', children }: {
  titulo: string; descricao?: string; itens: ModeloDaGaleria[]; /** o último modelo editado (ganha o selo) */ ultimo?: string; aoEscolher: (id: string) => void; deitado?: boolean;
  /** F-307 (dono): "Editar direto" — vai para a tela de edição de sempre, sem o passo a passo (quem já sabe usar) */ aoEditarDireto?: (id: string) => void;
  /** botões do topo (formato) */ topo?: ReactNode; voltar?: string; /** cartões a mais no fim da grade */ children?: ReactNode;
}) {
  return (
    <div className="space-y-4" data-testid="escolha-de-modelo">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={voltar} className="flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">{voltar === '/studio' ? 'Studio' : 'Voltar'}</span></Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-lg font-black text-white sm:text-xl"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />{titulo}</h1>
          <p className="text-xs text-slate-400 sm:text-sm">{descricao ?? 'Escolha o modelo para editar'}</p>
        </div>
        {topo}
      </div>
      <div className={cn('grid gap-3 sm:gap-4', deitado ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5')} role="list" aria-label={`Modelos de ${titulo}`}>
        {itens.map((m) => {
          const foi = m.id === ultimo;
          return (
            <article key={m.id} role="listitem" className={cn('flex min-w-0 flex-col rounded-2xl border-2 bg-[#140632] p-2 transition sm:p-2.5', foi ? 'border-[#FFD400]/70' : 'border-white/10 hover:border-[#8A2EFF]/70')} data-testid="modelo-para-escolher">
              <button type="button" onClick={() => aoEscolher(m.id)} aria-label={`Editar o modelo ${m.nome}`} className="relative block w-full overflow-hidden rounded-xl bg-black">
                {m.previa ? <div className={cn('w-full overflow-hidden', deitado ? 'aspect-video' : 'aspect-[9/16]')}>{m.previa}</div>
                  : <img src={m.capa} alt="" loading="lazy" className={cn('w-full object-cover', deitado ? 'aspect-video' : 'aspect-[9/16]')} />}
                {foi && <span className="absolute left-2 top-2 rounded-full bg-[#FFD400] px-2 py-0.5 text-[10px] font-black text-[#22004A]">Último editado</span>}
              </button>
              <div className="flex-1 pt-2">
                <h2 className="line-clamp-2 text-sm font-bold leading-tight text-white" title={m.nome}>{m.nome}</h2>
                {m.selo && <p className="text-[11px] text-slate-400">{m.selo}</p>}
              </div>
              <button type="button" onClick={() => aoEscolher(m.id)} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#5D1BFF] px-2 text-sm font-bold text-white transition hover:bg-[#8A2EFF]" data-testid="modelo-escolher">
                {aoEditarDireto ? <Sparkles className="h-4 w-4 shrink-0 text-[#FFD400]" /> : <PenLine className="h-4 w-4 shrink-0" />}<span className="truncate">{m.botao ?? (aoEditarDireto ? 'Passo a passo' : 'Editar este modelo')}</span>
              </button>
              {aoEditarDireto && (
                <button type="button" onClick={() => aoEditarDireto(m.id)} className="mt-1.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/20 px-2 text-xs font-semibold text-white transition hover:bg-white/5" data-testid="modelo-editar-direto">
                  <PenLine className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Editar direto</span>
                </button>
              )}
              {m.extra}
            </article>
          );
        })}
        {children}
      </div>
    </div>
  );
}

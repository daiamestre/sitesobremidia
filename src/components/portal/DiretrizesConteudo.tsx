import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * F-110 — Diretrizes de conteúdo das mídias exibidas nas telas dos pontos parceiros.
 * Texto formal, citando os pontos sem termos fortes (pedido do proprietário).
 */
export const DURACAO_MAXIMA_VIDEO = 30;

export function DiretrizesConteudo({ compacto = false, className }: { compacto?: boolean; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-slate-300', className)} data-testid="diretrizes-conteudo">
      <p className="mb-1.5 flex items-center gap-2 font-semibold text-sky-300"><ShieldCheck className="h-4 w-4" /> Diretrizes de conteúdo</p>
      {!compacto && (
        <p className="mb-1.5 text-xs text-slate-400">
          As telas da SOBRE MÍDIA ficam em estabelecimentos frequentados por famílias e crianças. Por isso, toda mídia passa por
          análise antes de ser exibida.
        </p>
      )}
      <ul className="list-disc space-y-0.5 pl-5 text-xs">
        <li>Vídeos com duração máxima de {DURACAO_MAXIMA_VIDEO} segundos.</li>
        <li>Não são aceitos conteúdos de natureza sexual, nudez ou insinuação explícita.</li>
        <li>Não são aceitos conteúdos discriminatórios, de cunho racista ou que ofendam pessoas ou grupos.</li>
        <li>Não são aceitos conteúdos com violência, apologia a substâncias ilícitas ou que desrespeitem a legislação.</li>
      </ul>
      {!compacto && (
        <p className="mt-1.5 text-xs text-slate-400">
          Mídias fora dessas diretrizes são recusadas automaticamente pelo sistema de análise e não chegam às telas.
        </p>
      )}
    </div>
  );
}

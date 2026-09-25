import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Alerta } from '@/lib/dashboardResumo';

const estilo = {
  critico: { icon: AlertOctagon, box: 'border-red-500/40 bg-red-500/10 hover:bg-red-500/15', ink: 'text-red-400', rotulo: 'Crítico' },
  atencao: { icon: AlertTriangle, box: 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15', ink: 'text-amber-400', rotulo: 'Atenção' },
  ok: { icon: CheckCircle2, box: 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15', ink: 'text-emerald-400', rotulo: 'OK' },
} as const;

/** Faixa do topo: cada alerta leva direto à tela onde se resolve. Cor sempre acompanhada de ícone e rótulo. */
export function AlertStrip({ alertas }: { alertas: Alerta[] }) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]" role="list" aria-label="Alertas de hoje">
      {alertas.map((a) => {
        const e = estilo[a.nivel];
        const Icon = e.icon;
        return (
          <Link
            key={a.id}
            to={a.link}
            role="listitem"
            data-testid={`alerta-${a.id}`}
            className={cn('flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', e.box)}
          >
            <Icon className={cn('h-5 w-5 flex-shrink-0', e.ink)} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{a.titulo}</span>
              <span className="block truncate text-xs text-muted-foreground">
                <span className={cn('font-semibold', e.ink)}>{e.rotulo}</span> · {a.detalhe}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        );
      })}
    </div>
  );
}

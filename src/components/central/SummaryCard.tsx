import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SummaryCardProps {
  title: string;
  icon: LucideIcon;
  /** Tela completa: o cabeçalho do card leva direto para ela. */
  to: string;
  /** Número/valor principal do card. */
  headline?: ReactNode;
  /** Linha curta abaixo do valor principal. */
  caption?: ReactNode;
  /** Resumo sempre visível. */
  children?: ReactNode;
  /** Conteúdo extra mostrado ao clicar em "Expandir" (sem sair da tela). */
  expanded?: ReactNode;
  loading?: boolean;
  /** Ocupa 2 colunas da grade quando houver espaço (cards com lista/gráfico). */
  wide?: boolean;
  className?: string;
  testId?: string;
}

export function SummaryCard({
  title, icon: Icon, to, headline, caption, children, expanded, loading, wide, className, testId,
}: SummaryCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <section
      className={cn(
        'group/card relative flex min-w-0 flex-col rounded-2xl border border-border/60 bg-card/80 p-4 sm:p-5 shadow-sm transition-colors hover:border-primary/40',
        wide && 'md:col-span-2',
        className,
      )}
      aria-label={title}
      data-testid={testId}
    >
      <Link
        to={to}
        className="flex items-start justify-between gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`${title} — abrir tela completa`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover/card:text-primary">
          Ver tudo <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </Link>

      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          {headline !== undefined && (
            <div className="mt-4 text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">{headline}</div>
          )}
          {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
          {children && <div className="mt-4 min-w-0 flex-1">{children}</div>}
          {expanded && (
            <>
              {open && <div className="mt-3 min-w-0 border-t border-border/50 pt-3">{expanded}</div>}
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="mt-3 inline-flex items-center gap-1 self-start rounded-md text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {open ? <>Recolher <ChevronUp className="h-3.5 w-3.5" /></> : <>Expandir <ChevronDown className="h-3.5 w-3.5" /></>}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** Linha de lista dentro de um card: rótulo à esquerda, valor à direita, clicável para o registro. */
export function SummaryRow({ to, label, sub, value, tone }: {
  to?: string; label: ReactNode; sub?: ReactNode; value?: ReactNode; tone?: 'critico' | 'atencao' | 'ok';
}) {
  const body = (
    <span className="flex min-w-0 items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-sm text-foreground">{label}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
      {value !== undefined && (
        <span
          className={cn(
            'flex-shrink-0 text-right text-sm font-semibold tabular-nums',
            tone === 'critico' && 'text-red-400',
            tone === 'atencao' && 'text-amber-400',
            tone === 'ok' && 'text-emerald-400',
            !tone && 'text-foreground',
          )}
        >
          {value}
        </span>
      )}
    </span>
  );
  return (
    <li className="border-b border-border/40 last:border-0">
      {to ? (
        <Link to={to} className="block rounded-md px-1 -mx-1 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {body}
        </Link>
      ) : body}
    </li>
  );
}

/** Mini indicador (número + rótulo) para a linha de KPIs dentro de um card. */
export function MiniStat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'critico' | 'atencao' | 'ok' }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/30 px-3 py-2">
      <div
        className={cn(
          'truncate text-lg font-bold tabular-nums',
          tone === 'critico' ? 'text-red-400' : tone === 'atencao' ? 'text-amber-400' : tone === 'ok' ? 'text-emerald-400' : 'text-foreground',
        )}
      >
        {value}
      </div>
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm text-muted-foreground">{children}</p>;
}

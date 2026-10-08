import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Alerta } from '@/lib/dashboardResumo';
import {
  alertaEstaVisto, assinaturaDoAlerta, avisosVistosKey, lembrarAlertasExibidos, listarAvisosVistos, registrarAvisoVisto,
  type AvisoVisto,
} from '@/lib/avisosVistos';

const estilo = {
  critico: { icon: AlertOctagon, box: 'border-red-500/40 bg-red-500/10 hover:bg-red-500/15', ink: 'text-red-400', rotulo: 'Crítico' },
  atencao: { icon: AlertTriangle, box: 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15', ink: 'text-amber-400', rotulo: 'Atenção' },
  ok: { icon: CheckCircle2, box: 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15', ink: 'text-emerald-400', rotulo: 'OK' },
} as const;

/**
 * Faixa do topo: cada alerta leva direto à tela onde se resolve. Cor sempre acompanhada de ícone e rótulo.
 * F-167: o alerta que o usuário já viu (abriu a tela de destino ou clicou no X) deixa de aparecer para ele; volta se a situação mudar.
 */
export function AlertStrip({ alertas }: { alertas: Alerta[] }) {
  const qc = useQueryClient();
  const { data: vistos = [] } = useQuery({ queryKey: avisosVistosKey, queryFn: listarAvisosVistos, staleTime: 0 });
  const visiveis = alertas.filter((a) => !alertaEstaVisto(a, vistos));
  const chaveDosVisiveis = visiveis.map((a) => `${a.id}:${a.link}:${assinaturaDoAlerta(a)}`).join('§');

  useEffect(() => {
    lembrarAlertasExibidos(visiveis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDosVisiveis]);

  const dispensar = async (a: Alerta) => {
    const assinatura = assinaturaDoAlerta(a);
    qc.setQueryData<AvisoVisto[]>(avisosVistosKey, (atual = []) => [...atual.filter((v) => v.chave !== a.id), { chave: a.id, assinatura }]);
    const ok = await registrarAvisoVisto(a.id, assinatura);
    if (!ok) qc.invalidateQueries({ queryKey: avisosVistosKey });
  };

  if (visiveis.length === 0) return null;

  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]" role="list" aria-label="Alertas de hoje">
      {visiveis.map((a) => {
        const e = estilo[a.nivel];
        const Icon = e.icon;
        return (
          <div key={a.id} className="relative min-w-0" role="listitem">
            <Link
              to={a.link}
              data-testid={`alerta-${a.id}`}
              className={cn('flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', a.nivel !== 'ok' && 'pr-10', e.box)}
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
            {a.nivel !== 'ok' && (
              <button
                type="button"
                onClick={() => dispensar(a)}
                data-testid={`dispensar-${a.id}`}
                aria-label={`Dispensar aviso: ${a.titulo}`}
                title="Já vi — não mostrar mais este aviso"
                className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-black/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

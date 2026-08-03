import { ProducaoStatus } from '../../services/producao.service';
import { CheckCircle2, PlayCircle, Clock } from 'lucide-react';

interface ProductionTimelineProps {
  currentStatus: ProducaoStatus;
}

const STAGES: Array<{ status: ProducaoStatus; label: string }> = [
  { status: 'CRIADA', label: 'Criada' },
  { status: 'AGUARDANDO_MATERIAL', label: 'Aguardando' },
  { status: 'MATERIAL_RECEBIDO', label: 'Recebido' },
  { status: 'EM_DESENVOLVIMENTO', label: 'Desenvolvimento' },
  { status: 'AGUARDANDO_APROVACAO', label: 'Validação' },
  { status: 'APROVADA', label: 'Aprovada' },
  { status: 'LIBERADA', label: 'Liberada' },
  { status: 'PUBLICADA', label: 'Publicada' },
  { status: 'FINALIZADA', label: 'Finalizada' },
];

export function ProductionTimeline({ currentStatus }: ProductionTimelineProps) {
  const currentIndex = STAGES.findIndex((s) => s.status === currentStatus);

  return (
    <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Workflow da Produção de Mídia
        </h3>
        <span className="text-xs text-slate-400 font-semibold">
          Etapa {currentIndex >= 0 ? currentIndex + 1 : 1} de {STAGES.length}
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5 pt-2">
        {STAGES.map((stage, idx) => {
          const isCompleted = currentIndex > idx;
          const isCurrent = currentIndex === idx;

          return (
            <div
              key={stage.status}
              className={`p-2 rounded-xl border text-center transition-all flex flex-col justify-between h-16 ${
                isCurrent
                  ? 'bg-primary/20 border-primary text-primary font-bold shadow-lg glow-primary'
                  : isCompleted
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold'
                  : 'bg-slate-950/40 border-white/5 text-slate-500'
              }`}
            >
              <div className="flex justify-center pt-1">
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : isCurrent ? (
                  <PlayCircle className="h-4 w-4 text-primary animate-pulse" />
                ) : (
                  <span className="text-[11px] font-mono">{idx + 1}</span>
                )}
              </div>
              <div className="text-[11px] leading-tight truncate">{stage.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

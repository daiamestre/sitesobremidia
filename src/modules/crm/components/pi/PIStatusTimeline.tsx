import { PIStatus } from '../../services/pi.service';
import { CheckCircle2, Clock, PlayCircle, ShieldCheck, FileText, AlertCircle, XCircle } from 'lucide-react';

interface PIStatusTimelineProps {
  currentStatus: PIStatus;
  onStatusChange?: (newStatus: PIStatus) => void;
}

const STAGES: Array<{ status: PIStatus; label: string; description: string }> = [
  { status: 'EM_ELABORACAO', label: 'Elaboração', description: 'PI emitido pelo representante' },
  { status: 'AGUARDANDO_MATERIAL', label: 'Material', description: 'Aguardando envio das artes' },
  { status: 'MATERIAL_RECEBIDO', label: 'Recebido', description: 'Artes recebidas' },
  { status: 'EM_PRODUCAO', label: 'Produção', description: 'Designer adaptando arquivos' },
  { status: 'AGUARDANDO_APROVACAO', label: 'Aprovação', description: 'Validação pelo cliente' },
  { status: 'APROVADO', label: 'Aprovado', description: 'Mídia liberada para a grade' },
  { status: 'AGENDADO', label: 'Agendado', description: 'Vinculado às playlists/players' },
  { status: 'EM_EXIBICAO', label: 'Exibição', description: 'Transmitindo na rede de TVs' },
  { status: 'FINALIZADO', label: 'Finalizado', description: 'Campanha encerrada com relatório' },
];

export function PIStatusTimeline({ currentStatus, onStatusChange }: PIStatusTimelineProps) {
  const isCancelled = currentStatus === 'CANCELADO';
  const currentIndex = STAGES.findIndex((s) => s.status === currentStatus);

  if (isCancelled) {
    return (
      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-400">
        <XCircle className="h-6 w-6 shrink-0" />
        <div>
          <h4 className="font-bold text-sm">Pedido de Inserção Cancelado</h4>
          <p className="text-xs text-rose-300">Este PI foi cancelado operacionalmente e teve a veiculação interrompida.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Workflow Operacional do PI
        </h3>
        <span className="text-xs text-slate-400 font-semibold">
          Etapa {currentIndex >= 0 ? currentIndex + 1 : 1} de {STAGES.length}
        </span>
      </div>

      {/* Horizontal Stepper Bar */}
      <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5 pt-2">
        {STAGES.map((stage, idx) => {
          const isCompleted = currentIndex > idx;
          const isCurrent = currentIndex === idx;

          return (
            <div
              key={stage.status}
              onClick={() => onStatusChange && onStatusChange(stage.status)}
              className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col justify-between h-20 ${
                isCurrent
                  ? 'bg-primary/20 border-primary text-primary shadow-lg font-bold glow-primary'
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

              <div>
                <div className="text-[11px] leading-tight truncate">{stage.label}</div>
                <div className="text-[9px] text-slate-400 truncate hidden sm:block">{stage.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

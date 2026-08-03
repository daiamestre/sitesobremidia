import { AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { ConflictRecord } from '../../services/agendamento.service';

interface ConflictPanelProps {
  conflicts: ConflictRecord[];
}

export function ConflictPanel({ conflicts }: ConflictPanelProps) {
  if (conflicts.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-400">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <div>
          <h4 className="font-bold text-xs">Nenhum Conflito Detectado</h4>
          <p className="text-[11px] text-emerald-300">Grade de exibição 100% livre para transmissão nesta tela/player.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3">
      <div className="flex items-center gap-2 text-rose-400">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <h4 className="font-bold text-xs uppercase">Alerta: {conflicts.length} Conflito(s) de Exibição Detectado(s)</h4>
      </div>

      <div className="space-y-1.5">
        {conflicts.map((c, idx) => (
          <div key={idx} className="p-2.5 rounded-lg bg-slate-950/80 border border-rose-500/20 text-xs flex items-center justify-between">
            <span className="font-bold text-white">{c.titulo_conflito}</span>
            <span className="text-[11px] text-rose-300 font-mono">
              {c.hora_inicio_conflito} - {c.hora_fim_conflito}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

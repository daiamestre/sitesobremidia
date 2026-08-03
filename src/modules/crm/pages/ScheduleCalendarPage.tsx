import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { agendamentoService, AgendamentoCompleto } from '../services/agendamento.service';
import { useAuth } from '@/contexts/AuthContext';
import { ScheduleCalendar } from '../components/agendamento/ScheduleCalendar';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Calendar as CalendarIcon } from 'lucide-react';

export default function ScheduleCalendarPage() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [schedules, setSchedules] = useState<AgendamentoCompleto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    const data = await agendamentoService.listSchedules(empresaOperadoraId || undefined);
    setSchedules(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-display font-extrabold text-white flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-primary" />
            Calendário Integrado de Exibição
          </h2>
          <p className="text-xs text-slate-300">Grade Consolidada de Transmissão por Período e Player</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/agendamento')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Lista
        </Button>
      </div>

      <ScheduleCalendar agendamentos={schedules} />
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Clock, Tv, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { AgendamentoCompleto } from '../../services/agendamento.service';

interface ScheduleCalendarProps {
  agendamentos: AgendamentoCompleto[];
}

export function ScheduleCalendar({ agendamentos }: ScheduleCalendarProps) {
  const [viewMode, setViewMode] = useState<'DIARIO' | 'SEMANAL' | 'MENSAL'>('SEMANAL');

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            Calendário Oficial da Rede de Exibição ({agendamentos.length})
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Visualização consolidada por Período, PI, Telas e Status de Veiculação.
          </CardDescription>
        </div>

        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-white/10">
          {(['DIARIO', 'SEMANAL', 'MENSAL'] as const).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={viewMode === mode ? 'default' : 'ghost'}
              onClick={() => setViewMode(mode)}
              className={`text-xs px-3 h-8 rounded-lg ${viewMode === mode ? 'gradient-primary font-bold shadow' : 'text-slate-400'}`}
            >
              {mode === 'DIARIO' ? 'Diário' : mode === 'SEMANAL' ? 'Semanal' : 'Mensal'}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {agendamentos.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">Nenhuma programação cadastrada no calendário.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {agendamentos.map((ag) => (
              <div
                key={ag.id}
                className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-2 hover:border-primary/40 transition-all shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-mono">
                    {ag.pedido_insercao?.numero_pi || 'PI'}
                  </Badge>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                    {ag.status}
                  </Badge>
                </div>

                <h4 className="font-bold text-sm text-white truncate">{ag.titulo}</h4>

                <div className="text-xs text-slate-400 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    <span>
                      {new Date(ag.inicio).toLocaleDateString('pt-BR')} até {new Date(ag.fim).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Tv className="h-3.5 w-3.5 text-primary" />
                    <span>{ag.grade?.length || 1} Tela(s) / Player(s) Mapeados</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

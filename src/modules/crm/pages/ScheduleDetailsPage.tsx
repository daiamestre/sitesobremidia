import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { agendamentoService, AgendamentoCompleto, ConflictRecord } from '../services/agendamento.service';
import { ScheduleTimeline } from '../components/agendamento/ScheduleTimeline';
import { ConflictPanel } from '../components/agendamento/ConflictPanel';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Calendar as CalendarIcon, CheckCircle2, RefreshCw, XCircle, Play, ShieldAlert } from 'lucide-react';

export default function ScheduleDetailsPage() {
  const { agendamentoId } = useParams<{ agendamentoId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [schedule, setSchedule] = useState<AgendamentoCompleto | null>(null);
  const [loading, setLoading] = useState(true);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadData = useCallback(async () => {
    if (!agendamentoId) return;
    setLoading(true);
    const data = await agendamentoService.getSchedule(agendamentoId);
    setSchedule(data);

    if (data?.grade?.[0]) {
      const val = await agendamentoService.validateConflicts({
        agendamentoId,
        telaId: data.grade[0].tela_id,
        playerId: data.grade[0].player_id,
        horaInicio: data.grade[0].hora_inicio,
        horaFim: data.grade[0].hora_fim,
        inicio: data.inicio,
        fim: data.fim,
      });
      setConflicts(val.conflicts);
    }

    setLoading(false);
  }, [agendamentoId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePublish = async () => {
    if (!agendamentoId) return;
    setIsPublishing(true);
    const res = await agendamentoService.publishSchedule(agendamentoId);
    setIsPublishing(false);

    if (res.success) {
      toast({ title: 'Programação Ativada!', description: 'Mídia agendada na rede de exibição sem conflitos.' });
      loadData();
    } else {
      toast({ title: 'Bloqueio de Conflito', description: res.error || 'Conflito de grade detectado.', variant: 'destructive' });
      if (res.conflicts) setConflicts(res.conflicts);
    }
  };

  const handleSync = async () => {
    if (!agendamentoId) return;
    setIsSyncing(true);
    const res = await agendamentoService.syncPlayers(agendamentoId);
    setIsSyncing(false);

    if (res.success) {
      toast({ title: 'Sincronização Concluída!', description: `${res.playerCount} player(s) sincronizados com sucesso.` });
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-slate-300">Agendamento não encontrado.</p>
        <Button onClick={() => {
          const basePath = window.location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
          navigate(`${basePath}/agenda/lista`);
        }} variant="outline" className="text-white">
          Voltar para Lista
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-primary" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
              Painel do Agendamento ({schedule.titulo})
            </h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 ml-2">FASE 7.5-C</Badge>
          </div>
          <p className="text-slate-300 text-xs">
            Validação Automática de Conflitos na Grade ➔ Ativação na Rede & Sincronização
          </p>
        </div>

        <Button variant="outline" onClick={() => {
          const basePath = window.location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
          navigate(`${basePath}/agenda/lista`);
        }} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Agendamentos
        </Button>
      </div>

      <ScheduleTimeline currentStatus={schedule.status} />

      <ConflictPanel conflicts={conflicts} />

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white">Detalhes da Grade de Exibição</CardTitle>
          <CardDescription className="text-slate-400 text-xs">Horários, Dias da Semana e Frequência de Inserções.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {schedule.grade?.map((g) => (
            <div key={g.id} className="p-3 rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-between text-xs">
              <div>
                <strong className="text-white block">{g.unidade?.nome || 'Unidade Cadastrada'}</strong>
                <span className="text-[11px] text-slate-400 block">Horário: {g.hora_inicio} - {g.hora_fim}</span>
              </div>
              <Badge className="bg-primary/20 text-primary">{g.quantidade_insercoes} Inserções / Dia</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="p-4 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={handleSync}
          disabled={isSyncing}
          className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs rounded-xl gap-1.5"
        >
          {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span>Sincronizar Players da Rede</span>
        </Button>

        <Button
          onClick={handlePublish}
          disabled={isPublishing}
          className="gradient-primary glow-primary font-bold rounded-xl text-xs px-6 h-10 gap-2 shadow-xl"
        >
          {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          <span>Validar Conflitos & Ativar na Rede</span>
        </Button>
      </div>
    </div>
  );
}

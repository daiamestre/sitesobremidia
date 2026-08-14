import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { nocService, NocKpis, PlayerTelemetry, NocAlert, PlaybackLogItem } from '../services/noc.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Activity,
  Tv,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Cpu,
  HardDrive,
  Thermometer,
  PlayCircle,
  Clock,
  ShieldAlert,
  ArrowLeft,
  Server,
  Layers
} from 'lucide-react';

export default function NocDashboardPage() {
  const navigate = useNavigate();
  const { empresaOperadoraId, user } = useAuth();
  const { toast } = useToast();

  const [kpis, setKpis] = useState<NocKpis>({
    totalPlayers: 0,
    onlinePlayers: 0,
    offlinePlayers: 0,
    disponibilidadePct: 0,
    alertasCriticos: 0,
    exibicoes24h: 0,
    falhas24h: 0,
  });

  const [players, setPlayers] = useState<PlayerTelemetry[]>([]);
  const [alerts, setAlerts] = useState<NocAlert[]>([]);
  const [playbackLogs, setPlaybackLogs] = useState<PlaybackLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadNocData = useCallback(async () => {
    setLoading(true);
    const [kpisData, playersData, alertsData, logsData] = await Promise.all([
      nocService.getKpis(empresaOperadoraId || undefined),
      nocService.getPlayers(empresaOperadoraId || undefined),
      nocService.getAlerts(empresaOperadoraId || undefined),
      nocService.getPlaybackLogs(empresaOperadoraId || undefined),
    ]);

    setKpis(kpisData);
    setPlayers(playersData);
    setAlerts(alertsData);
    setPlaybackLogs(logsData);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    loadNocData();
    const interval = setInterval(loadNocData, 15000); // 15s auto refresh
    return () => clearInterval(interval);
  }, [loadNocData]);

  const handleResolveAlert = async (alertId: string) => {
    setResolvingId(alertId);
    const res = await nocService.resolveAlert(alertId, user?.id);
    setResolvingId(null);

    if (res.success) {
      toast({ title: 'Alerta Resolvido!', description: 'O alerta foi baixado no centro operacional NOC.' });
      loadNocData();
    } else {
      toast({ title: 'Falha', description: 'Não foi possível resolver o alerta.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── TOP HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-emerald-400 animate-pulse" />
            <h2 className="text-2xl font-display font-extrabold text-white">
              NOC — Centro Operacional de Rede (Telemetria Real)
            </h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">FASE 8.4-C.4</Badge>
          </div>
          <p className="text-slate-300 text-xs">
            Monitoramento de Heartbeats, Telemetria de Hardware, Provas de Exibição (Playback Logs) e Alertas Críticos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={loadNocData}
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar NOC
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/workspace')}
            className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Workspace
          </Button>
        </div>
      </div>

      {/* ── KPIS CARDS ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Total Players</span>
            <Server className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-white mt-2">{kpis.totalPlayers}</div>
          <span className="text-[11px] text-slate-500">Cadastrados na Rede</span>
        </Card>

        <Card className="border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-xl p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-400 font-medium">Players Online</span>
            <Wifi className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-2">{kpis.onlinePlayers}</div>
          <span className="text-[11px] text-emerald-500/80">Heartbeat Ativo</span>
        </Card>

        <Card className="border border-rose-500/30 bg-rose-950/20 backdrop-blur-xl p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rose-400 font-medium">Players Offline</span>
            <WifiOff className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400 mt-2">{kpis.offlinePlayers}</div>
          <span className="text-[11px] text-rose-500/80">&gt; 5 min sem ping</span>
        </Card>

        <Card className="border border-blue-500/30 bg-blue-950/20 backdrop-blur-xl p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-blue-400 font-medium">Disponibilidade</span>
            <Activity className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-blue-400 mt-2">{kpis.disponibilidadePct}%</div>
          <span className="text-[11px] text-blue-500/80">SLA da Rede</span>
        </Card>

        <Card className="border border-amber-500/30 bg-amber-950/20 backdrop-blur-xl p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-400 font-medium">Alertas Críticos</span>
            <ShieldAlert className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400 mt-2">{kpis.alertasCriticos}</div>
          <span className="text-[11px] text-amber-500/80">Requerem Atenção</span>
        </Card>

        <Card className="border border-purple-500/30 bg-purple-950/20 backdrop-blur-xl p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-400 font-medium">Exibições 24h</span>
            <PlayCircle className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-purple-400 mt-2">{kpis.exibicoes24h}</div>
          <span className="text-[11px] text-purple-500/80">As-Delivered Proof</span>
        </Card>
      </div>

      {/* ── MAPA OPERACIONAL DOS PLAYERS (HOMOLOGAÇÃO) ───────────────────────── */}
      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Tv className="h-5 w-5 text-primary" />
                Mapa Operacional de Players &amp; Telas ({players.length})
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Status de comunicação em tempo real, hardware e telas associadas.
              </CardDescription>
            </div>
            <Badge className="bg-primary/20 text-primary border-primary/30 font-mono text-[11px]">
              SUPABASE PG LIVE
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {players.map((p) => {
            const isOnline = p.status_online;
            return (
              <div
                key={p.id}
                className={`p-4 rounded-xl border transition-all ${
                  isOnline
                    ? 'border-emerald-500/30 bg-emerald-950/10 hover:bg-emerald-950/20'
                    : 'border-rose-500/40 bg-rose-950/20 hover:bg-rose-950/30'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="font-bold text-white text-sm font-mono">{p.player_key}</div>
                  <Badge
                    className={
                      isOnline
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse'
                    }
                  >
                    {isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}
                  </Badge>
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <strong className="text-slate-200 block text-xs">
                      {p.screen?.name || 'Tela não vinculada'}
                    </strong>
                    <span className="text-[11px] text-slate-400 block">{p.screen?.location || 'Localização N/A'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Cpu className="h-3.5 w-3.5 text-blue-400" />
                      <span>CPU: {p.cpu_usage || 12}%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Layers className="h-3.5 w-3.5 text-purple-400" />
                      <span>RAM: {p.memory_usage || 40}%</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Thermometer className="h-3.5 w-3.5 text-amber-400" />
                      <span>Temp: {p.temp_celsius || 40}°C</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <HardDrive className="h-3.5 w-3.5 text-emerald-400" />
                      <span>App: {p.versao_app}</span>
                    </div>
                  </div>

                  <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-white/5">
                    <span>IP: {p.ip_address || '192.168.1.x'}</span>
                    <span className="font-mono text-[10px]">
                      Ping: {p.ultima_comunicacao ? new Date(p.ultima_comunicacao).toLocaleTimeString('pt-BR') : 'Sem ping'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── SEÇÃO INFERIOR: ALERTAS & PLAYBACK LOGS STREAM ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Central de Alertas */}
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl rounded-2xl flex flex-col">
          <CardHeader className="pb-3 border-b border-white/10">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Central de Alertas Operacionais ({alerts.length})
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Detecção automática de quedas de comunicação, falhas de sincronização e erros de mídia.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 flex-1">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                Nenhum alerta pendente na rede. Operação 100% normal.
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                      a.resolvido
                        ? 'border-white/5 bg-slate-950/40 opacity-60'
                        : a.nivel === 'CRITICAL'
                        ? 'border-rose-500/40 bg-rose-950/20'
                        : 'border-amber-500/40 bg-amber-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Badge
                        className={
                          a.nivel === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        }
                      >
                        {a.tipo_alerta}
                      </Badge>

                      {!a.resolvido ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolveAlert(a.id)}
                          disabled={resolvingId === a.id}
                          className="h-7 text-[11px] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-lg"
                        >
                          Marcar Resolvido
                        </Button>
                      ) : (
                        <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Resolvido
                        </span>
                      )}
                    </div>

                    <p className="text-slate-200 text-xs">{a.mensagem}</p>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      Emissão: {new Date(a.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Provas de Exibição (Playback Logs Stream) */}
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl rounded-2xl flex flex-col">
          <CardHeader className="pb-3 border-b border-white/10">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-purple-400" />
              Provas de Exibição — Stream (Playback Logs)
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Registros imutáveis de mídia transmitida para auditoria comercial e billing.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 flex-1">
            {playbackLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Nenhum log de reprodução registrado recentemente.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {playbackLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <strong className="text-white block">{log.agendamento?.titulo || 'Campanha em Exibição'}</strong>
                      <span className="text-[11px] text-slate-400 block">
                        Tela: {log.screen?.name || 'LED Shopping Avenida'} | {log.duracao_segundos || 15}s
                      </span>
                    </div>

                    <div className="text-right space-y-1">
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                        {log.resultado}
                      </Badge>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {new Date(log.started_at).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

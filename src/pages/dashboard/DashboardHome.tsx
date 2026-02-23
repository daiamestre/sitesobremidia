import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Monitor, ListVideo, Image, Calendar, TrendingUp, Clock, AlertTriangle, RefreshCw, Trash2, Camera } from 'lucide-react';
import { useState, useEffect } from 'react';
import { fetchAlertDevices, sendRemoteCommand } from '@/services/DeviceService';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function DashboardHome() {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const loadAlerts = async () => {
      const data = await fetchAlertDevices();
      setAlerts(data || []);
    };
    loadAlerts();
    const interval = setInterval(loadAlerts, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const handleRemoteCommand = async (deviceId: string, command: any) => {
    try {
      await sendRemoteCommand(deviceId, command);
      toast.success(`Comando ${command} enviado com sucesso!`);
    } catch (e) {
      toast.error(`Falha ao enviar comando: ${e}`);
    }
  };

  const getSeverity = (lastHeartbeat: string) => {
    if (!lastHeartbeat) return 'critical';
    const diff = Date.now() - new Date(lastHeartbeat).getTime();
    if (diff > 600000) return 'critical'; // > 10 min
    return 'warning'; // 2-10 min
  };

  const stats = [
    { icon: Monitor, label: 'Telas Ativas', value: '0', color: 'text-primary' },
    { icon: ListVideo, label: 'Playlists', value: '0', color: 'text-accent' },
    { icon: Image, label: 'Mídias', value: '0', color: 'text-success' },
    { icon: Calendar, label: 'Agendamentos', value: '0', color: 'text-warning' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold">
          Olá, {profile?.full_name?.split(' ')[0] || 'Usuário'}! 👋 <span className="text-xs font-normal text-white bg-red-600 px-2 py-1 rounded-full align-middle">v3.2 - ATUALIZADO</span>
        </h1>
        <p className="text-muted-foreground">
          Bem-vindo ao painel do SOBRE MÍDIA. Gerencie suas telas de Digital Signage.
        </p>
      </div>

      {/* Device Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-4">
          <Alert variant="destructive" className="glass border-red-500/50 animate-pulse">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atenção: Central de Alertas Operacionais</AlertTitle>
            <AlertDescription>
              Existem {alerts.length} dispositivos exigindo atenção imediata.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alerts.map((device) => {
              const severity = getSeverity(device.last_heartbeat);
              const isStorageLow = device.storage_available && parseInt(device.storage_available) < 500000000; // < 500MB

              return (
                <Card key={device.id} className={`glass border-l-4 ${severity === 'critical' ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold">{device.name || 'Dispositivo Sem Nome'}</h3>
                        <p className="text-xs text-muted-foreground">{device.id}</p>
                      </div>
                      <div className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${severity === 'critical' ? 'bg-red-500/20 text-red-500' : 'bg-yellow-500/20 text-yellow-600'}`}>
                        {severity === 'critical' ? 'CRÍTICO (+10m)' : 'ATENÇÃO (Oscilando)'}
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      {isStorageLow && (
                        <div className="flex items-center gap-2 text-xs text-red-400">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Armazenamento Baixo: {(parseInt(device.storage_available) / (1024 * 1024)).toFixed(0)} MB</span>
                        </div>
                      )}
                      <p className="text-xs">Visto por último: {device.last_heartbeat ? new Date(device.last_heartbeat).toLocaleTimeString() : 'Nunca'}</p>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1" onClick={() => handleRemoteCommand(device.id, 'REBOOT_APP')}>
                        <RefreshCw className="h-3 w-3" /> Reiniciar
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1" onClick={() => handleRemoteCommand(device.id, 'TAKE_SCREENSHOT')}>
                        <Camera className="h-3 w-3" /> Screenshot
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1 text-red-400 hover:text-red-300" onClick={() => handleRemoteCommand(device.id, 'CLEAR_CACHE')}>
                        <Trash2 className="h-3 w-3" /> Limpar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="glass hover:glow-primary transition-all duration-300">
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`p-3 rounded-lg bg-card ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Ações Rápidas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
              <Image className="h-5 w-5 text-primary" />
              <span>Fazer upload de mídia</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
              <ListVideo className="h-5 w-5 text-accent" />
              <span>Criar nova playlist</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
              <Monitor className="h-5 w-5 text-success" />
              <span>Adicionar nova tela</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
              <Calendar className="h-5 w-5 text-warning" />
              <span>Agendar conteúdo</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-accent" />
              Atividade Recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                Nenhuma atividade recente.
              </p>
              <p className="text-sm text-muted-foreground">
                Comece fazendo upload de mídias!
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

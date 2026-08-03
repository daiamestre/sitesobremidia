import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Activity, Clock, ShieldCheck } from 'lucide-react';

interface PlayerHealthPanelProps {
  players: any[];
}

export function PlayerHealthPanel({ players }: PlayerHealthPanelProps) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-400" />
          Monitoramento de Heartbeat dos Players ({players.length})
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Verificação contínua de conectividade, versão do app e resposta dos players.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {players.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-xs">Nenhum registro de heartbeat recebido.</div>
        ) : (
          <div className="space-y-2">
            {players.map((p) => (
              <div key={p.id} className="p-3 rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  {p.is_online ? (
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                      <Wifi className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
                      <WifiOff className="h-4 w-4" />
                    </div>
                  )}
                  <div>
                    <strong className="text-white block">{p.player?.nome || 'Player Signage'}</strong>
                    <span className="text-[10px] text-slate-500 block">App: {p.versao_app}</span>
                  </div>
                </div>

                <div className="text-right">
                  <Badge className={p.is_online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}>
                    {p.is_online ? 'ONLINE' : 'OFFLINE'}
                  </Badge>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    {new Date(p.ultimo_heartbeat).toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

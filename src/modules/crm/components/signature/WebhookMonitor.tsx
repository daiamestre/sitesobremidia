import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Radio, ShieldCheck, Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export function WebhookMonitor({ empresaOperadoraId }: { empresaOperadoraId?: string }) {
  const { toast } = useToast();
  const [eventos, setEventos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEventos = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('assinatura_eventos')
        .select(`
          *,
          assinatura:assinaturas(*, contrato:contratos(numero_contrato, tipo_contrato))
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (empresaOperadoraId) {
        query = query.eq('assinatura.empresa_operadora_id', empresaOperadoraId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[WebhookMonitor] Erro:', error);
        setEventos([]);
      } else {
        setEventos(data || []);
      }
    } catch (err) {
      setEventos([]);
    } finally {
      setLoading(false);
    }
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchEventos();
  }, [fetchEventos]);

  const getStatusBadge = (evento: string, status: string) => {
    const cores: Record<string, string> = {
      ASSINADO: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      ENVIADO: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      VISUALIZADO: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      RECUSADO: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      EXPIRADO: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      CANCELADO: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      VALIDADO: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      download: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    };
    return cores[evento] || cores[status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-blue-400" /> Monitor de Eventos de Assinatura
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchEventos}
            disabled={loading}
            className="border-slate-600 text-slate-300 rounded-xl text-[10px] h-6 gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Eventos reais da tabela assinatura_eventos — sem dados fixos.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        {loading ? (
          <div className="text-center py-4 text-slate-500">Carregando eventos...</div>
        ) : eventos.length === 0 ? (
          <div className="text-center py-4 text-slate-500 flex items-center gap-2 justify-center">
            <Activity className="h-4 w-4" /> Nenhum evento de assinatura registrado.
          </div>
        ) : (
          eventos.map((ev) => (
            <div key={ev.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3 w-3 text-slate-500" />
                  <strong className="text-white font-mono">Evento: {ev.evento}</strong>
                </div>
                <span className="text-[10px] text-slate-500">
                  Envelope: {ev.assinatura?.envelope_id || 'N/I'}
                  {ev.assinatura?.contrato && ` · Contrato: ${ev.assinatura.contrato.numero_contrato}`}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {new Date(ev.created_at).toLocaleString('pt-BR')}
                  {ev.detalhes?.ip_address && ` · IP: ${ev.detalhes.ip_address}`}
                </span>
              </div>
              <Badge className={getStatusBadge(ev.evento, ev.assinatura?.status || '')}>
                {ev.assinatura?.status || ev.evento}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

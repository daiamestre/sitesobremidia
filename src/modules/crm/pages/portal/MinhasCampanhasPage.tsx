import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tv, ShieldCheck, Loader2, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export default function MinhasCampanhasPage() {
  const { usuario } = useAuth();
  const [campanhas, setCampanhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (usuario?.cliente_id) {
      fetchCampanhas(usuario.cliente_id);
    }
  }, [usuario?.cliente_id]);

  const fetchCampanhas = async (clienteId: string) => {
    try {
      // 1. Busca as producoes atreladas aos pedidos de insercao dos contratos deste cliente
      const { data, error } = await supabase
        .from('producao_midia')
        .select(`
          id,
          nome,
          status,
          created_at,
          pedido_insercao_id,
          pedidos_insercao!inner (
            contrato_id,
            contratos!inner (
              cliente_id
            )
          )
        `)
        .eq('pedidos_insercao.contratos.cliente_id', clienteId);

      if (error) throw error;
      setCampanhas(data || []);
    } catch (error: any) {
      console.error('Erro ao buscar campanhas:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar as campanhas.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Tv className="h-6 w-6 text-primary" /> Minhas Campanhas
        </h2>
        <p className="text-slate-400 text-sm mt-1">Gerencie as mídias e campanhas vinculadas aos seus contratos.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : campanhas.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          Você não possui campanhas ativas.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campanhas.map(camp => (
            <Card key={camp.id} className="border border-white/10 bg-slate-900/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold text-white flex items-center justify-between">
                  {camp.nome || `Campanha #${camp.id.slice(0, 8)}`}
                  <Badge className={
                    camp.status === 'APROVADO' || camp.status === 'VEICULANDO' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
                    'bg-purple-500/20 text-purple-400 border-purple-500/30'
                  }>
                    {camp.status}
                  </Badge>
                </CardTitle>
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Criada em {new Date(camp.created_at).toLocaleDateString()}
                </div>
              </CardHeader>
              <CardContent className="pt-2 text-sm text-slate-300">
                <p className="flex items-center gap-2 text-xs">Acessar para ver métricas e proof of play.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

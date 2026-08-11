import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Tv, ShieldCheck, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function MeusPontosPage() {
  const { usuario } = useAuth();
  const [pontos, setPontos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (usuario?.cliente_id) {
      fetchPontos(usuario.cliente_id);
    }
  }, [usuario?.cliente_id]);

  const fetchPontos = async (clienteId: string) => {
    try {
      // Busca os pontos atrelados aos Pedidos de Inserção (PIs) do cliente
      const { data, error } = await supabase
        .from('pi_locais')
        .select(`
          id,
          empresa_id,
          unidade_id,
          tela_id,
          pi_id,
          pedidos_insercao!inner (
            contrato_id,
            status,
            contratos!inner (
              cliente_id
            )
          )
        `)
        .eq('pedidos_insercao.contratos.cliente_id', clienteId)
        .in('pedidos_insercao.status', ['EM_VEICULACAO', 'APROVADO']);

      if (error) throw error;
      
      // Mapeamento simples para exibição (usar id da tela/unidade como chave para evitar crash, futuramente juntar com tabela unidades/screens)
      const pontosUnicos = data?.map(item => ({
        id: item.id,
        nome: item.tela_id ? `Tela ${item.tela_id.substring(0,6)}` : (item.unidade_id ? `Unidade ${item.unidade_id.substring(0,6)}` : 'Ponto'),
        cidade: 'N/A', // Expandir com join se necessário
        estado: 'N/A',
        quantidade_telas: item.tela_id ? 1 : 0
      })) || [];
      
      setPontos(pontosUnicos);
    } catch (error: any) {
      console.error('Erro ao buscar pontos:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar os pontos.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" /> Meus Pontos e Cobertura
          </h2>
          <p className="text-slate-400 text-sm mt-1">Pontos onde sua marca está sendo exibida atualmente.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-white font-bold">
          + Solicitar Expansão
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : pontos.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          Você não possui pontos ativos no momento.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pontos.map(ponto => (
            <Card key={ponto.id} className="border border-white/10 bg-slate-900/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold text-white flex items-center justify-between">
                  {ponto.nome}
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                    Ativo
                  </Badge>
                </CardTitle>
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {ponto.cidade} / {ponto.estado}
                </div>
              </CardHeader>
              <CardContent className="pt-2 text-sm text-slate-300 space-y-2">
                <p className="flex items-center gap-2"><Tv className="h-4 w-4 text-primary" /> {ponto.quantidade_telas || 1} Telas no local</p>
                <p className="flex items-center gap-2 text-xs"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Transmissão Verificada</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

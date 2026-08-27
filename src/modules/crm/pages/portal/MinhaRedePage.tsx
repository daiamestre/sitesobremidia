import { useEffect, useState } from 'react';
import { useClienteModalidade } from '../../hooks/useClienteModalidade';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Tv, Activity, Building2, MonitorPlay, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommerceDatabase } from '@/types/customerPortalDb';
import { formatCurrency } from '@/utils/formatters';

// Cliente tipado com as RPCs do portal (padrão customerPortalDb)
const db = supabase as unknown as SupabaseClient<CommerceDatabase>;

// ──────────────────────────────────────────────────────────────────────
// MINHA REDE (HOST) — dados REAIS do tenant via RPC
// listar_estabelecimentos_disponiveis (SECURITY DEFINER, escopo por
// get_user_empresa_operadora_id). Sem dados fictícios (missão §53).
// ──────────────────────────────────────────────────────────────────────

interface UnidadeRede {
  unidade_id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  endereco: string | null;
  rede_nome: string | null;
  quantidade_telas: number;
  valor_unitario: number | null;
}

export default function MinhaRedePage() {
  const { isHost } = useClienteModalidade();
  const [estabelecimentos, setEstabelecimentos] = useState<UnidadeRede[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    db.rpc('listar_estabelecimentos_disponiveis')
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          console.error('[Minha Rede]', error);
          setErro(error.message);
          setEstabelecimentos([]);
        } else {
          setEstabelecimentos((data ?? []) as unknown as UnidadeRede[]);
        }
        setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  if (!isHost) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-slate-400">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-slate-600" />
          <h2 className="text-xl font-bold text-white">Acesso Restrito</h2>
          <p>Esta página é exclusiva para clientes da modalidade HOST (Hospedadores de Telas).</p>
        </div>
      </div>
    );
  }

  const totalTelas = estabelecimentos.reduce((acc, est) => acc + (est.quantidade_telas || 0), 0);
  const valorMensalRede = estabelecimentos.reduce((acc, est) => acc + Number(est.valor_unitario ?? 0), 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" /> Minha Rede de Telas
          </h2>
          <p className="text-slate-400 text-sm mt-1">Estabelecimentos e pontos de exibição cadastrados na sua rede.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Estabelecimentos</p>
              <h3 className="text-2xl font-bold text-white">{estabelecimentos.length}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Tv className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Total de Telas</p>
              <h3 className="text-2xl font-bold text-white">{totalTelas}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Valor de tabela da rede</p>
              <h3 className="text-2xl font-bold text-white">
                {formatCurrency(valorMensalRede)}
                <span className="text-sm font-normal text-slate-400">/mês</span>
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Estabelecimentos */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Activity className="h-8 w-8 animate-spin" />
        </div>
      ) : erro ? (
        <Card className="border border-rose-500/20 bg-rose-500/5">
          <CardContent className="py-10 text-center space-y-2">
            <AlertCircle className="h-10 w-10 mx-auto text-rose-400" />
            <p className="text-white font-semibold">Não foi possível carregar sua rede</p>
            <p className="text-sm text-slate-400">{erro}</p>
          </CardContent>
        </Card>
      ) : estabelecimentos.length === 0 ? (
        <Card className="border-dashed border-white/10 bg-white/[0.02]">
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 mx-auto text-slate-600 mb-4" />
            <h3 className="font-semibold text-lg">Nenhum estabelecimento cadastrado ainda</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Cadastre as unidades da sua rede para que elas apareçam aqui e possam receber anunciantes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {estabelecimentos.map((est) => (
            <Card key={est.unidade_id} className="border border-white/10 bg-slate-900/70 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-950/50">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">Estabelecimento / Tela</TableHead>
                    <TableHead className="text-slate-300 text-center">Telas ativas</TableHead>
                    <TableHead className="text-slate-300 text-right">Valor de tabela</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="border-white/10 hover:bg-white/5 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MonitorPlay className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="font-medium text-slate-200">{est.nome}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[est.endereco, est.cidade, est.estado].filter(Boolean).join(' · ') || 'Local não informado'}
                            {est.rede_nome && (
                              <Badge variant="outline" className="ml-1 text-[10px] border-white/10 text-slate-400">
                                {est.rede_nome}
                              </Badge>
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-slate-200">{est.quantidade_telas}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-semibold">
                      {est.valor_unitario != null ? `${formatCurrency(Number(est.valor_unitario))}/mês` : 'sob consulta'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

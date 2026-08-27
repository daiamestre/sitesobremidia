import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileText, Loader2, CalendarClock, Receipt, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CONTRATOS_ATIVOS_STATUS } from '../../hooks/useClienteModalidade';

const brl = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_FATURA: Record<string, { label: string; cls: string }> = {
  PAGO: { label: 'Pago', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  PAGA: { label: 'Paga', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  PENDENTE: { label: 'Aberta', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  ABERTA: { label: 'Aberta', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  RASCUNHO: { label: 'Rascunho', cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  VENCIDO: { label: 'Vencida', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  ATRASADA: { label: 'Vencida', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
};

interface Fatura {
  id: string;
  numero_documento?: string | null;
  codigo_operacional?: string | null;
  competencia_date?: string | null;
  data_vencimento?: string | null;
  valor_original?: number | null;
  saldo?: number | null;
  status: string;
  notes?: string | null;
}

/**
 * SOBRE MÍDIA — CONTRATO E FATURAS (missão §35–§37)
 * O anunciante vê APENAS o próprio contrato e as próprias faturas
 * (isolamento garantido por RLS cr_client_select_own).
 */
export default function FinanceiroClientePage() {
  const { usuario } = useAuth();
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [contrato, setContrato] = useState<{ numero: string; vigencia: string; status: string; mensalidade: number } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!usuario?.cliente_id) return;

    (async () => {
      try {
        // Faturas reais do cliente — fonte canônica contas_receber
        const { data, error } = await supabase
          .from('contas_receber')
          .select('id, numero_documento, codigo_operacional, competencia_date, data_vencimento, valor_original, saldo, status, notes')
          .eq('cliente_id', usuario.cliente_id)
          .order('data_vencimento', { ascending: false })
          .limit(100);

        if (error) throw error;
        setFaturas((data ?? []) as unknown as Fatura[]);

        // Contrato vigente (resumo) — workflow ativo, independente do documento
        const { data: k } = await supabase
          .from('contratos')
          .select('id, numero_contrato_legivel, numero_contrato, data_inicio, data_fim, valor_mensal, status_workflow')
          .eq('cliente_id', usuario.cliente_id)
          .in('status_workflow', [...CONTRATOS_ATIVOS_STATUS])
          .order('data_inicio', { ascending: false })
          .limit(1);

        if (k && k[0]) {
          setContrato({
            numero: k[0].numero_contrato_legivel || k[0].numero_contrato || '—',
            vigencia: `${k[0].data_inicio ? new Date(k[0].data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '—'} a ${k[0].data_fim ? new Date(k[0].data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}`,
            status: k[0].status_workflow || '',
            mensalidade: Number(k[0].valor_mensal || 0),
          });
        }
      } catch (error: any) {
        console.error('[Contrato e Faturas]', error);
        toast({ title: 'Erro', description: 'Não foi possível carregar suas faturas.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [usuario?.cliente_id, usuario?.empresa_operadora_id]);

  // Próxima fatura = mais próxima vencimento não paga
  const abertas = faturas
    .filter((f) => !['PAGO', 'PAGA', 'CANCELADO'].includes(f.status))
    .sort((a, b) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)));
  const proxima = abertas[0];

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> Contrato e Faturas
        </h2>
        <p className="text-slate-400 text-sm mt-1">Seu contrato e o histórico das suas faturas.</p>
      </div>

      {/* Resumo do contrato */}
      {contrato && (
        <Card className="border border-white/10 bg-slate-900/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">Meu contrato</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Número</p>
                <p className="font-medium">{contrato.numero}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Vigência</p>
                <p className="font-medium">{contrato.vigencia}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Situação</p>
                <Badge variant="outline" className="border-white/10">{contrato.status || '—'}</Badge>
              </div>
            </div>
            <Link to="/portal/contrato">
              <Button variant="outline" size="sm" className="border-white/10 gap-2">
                Ver contrato completo <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Próxima fatura */}
      {!loading && proxima && (
        <Card className="border border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
              <CalendarClock className="h-4 w-4" /> Próxima fatura
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Documento</p>
              <p className="font-medium">{proxima.numero_documento || proxima.codigo_operacional || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Vencimento</p>
              <p className="font-medium">
                {proxima.data_vencimento ? new Date(proxima.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Valor</p>
              <p className="font-bold text-lg">{brl(Number(proxima.saldo ?? proxima.valor_original ?? 0))}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : faturas.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          Nenhuma fatura registrada até o momento.
        </div>
      ) : (
        <Card className="border border-white/10 bg-slate-900/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-300">
              <Receipt className="h-4 w-4" /> Histórico de faturas
            </CardTitle>
            <CardDescription>Somente faturas da sua empresa.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow className="border-white/10">
                  <TableHead className="text-slate-300">Documento</TableHead>
                  <TableHead className="text-slate-300">Vencimento</TableHead>
                  <TableHead className="text-slate-300">Valor</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faturas.map((f) => {
                  const st = STATUS_FATURA[f.status] ?? { label: f.status, cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
                  return (
                    <TableRow key={f.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-slate-300 text-xs font-mono">
                        {f.numero_documento || f.codigo_operacional || '—'}
                      </TableCell>
                      <TableCell className="text-slate-300 text-xs">
                        {f.data_vencimento ? new Date(f.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell className="text-white font-bold text-xs">
                        {brl(Number(f.saldo ?? f.valor_original ?? 0))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileText, Loader2, CalendarClock, Receipt, ExternalLink, Eye, QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { situacaoCobranca, linkDaFatura } from '@/lib/situacaoCobranca';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CONTRATOS_ATIVOS_STATUS } from '../../hooks/useClienteModalidade';

const brl = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dataBR = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR') : '—');
const mesAno = (d: string) => new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });


interface Fatura {
  id: string;
  numero_documento?: string | null;
  codigo_operacional?: string | null;
  competencia_date?: string | null;
  data_vencimento?: string | null;
  valor_original?: number | null;
  saldo?: number | null;
  valor_pago?: number | null;
  public_identifier?: string | null;
  inter_pix_valor_recebido?: number | null;
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
          .select('id, numero_documento, codigo_operacional, competencia_date, data_vencimento, valor_original:valor, saldo, valor_pago, public_identifier, inter_pix_valor_recebido, status, notes')
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
          .is('deleted_at', null)
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
    .filter((f) => !['PAGO', 'PAGA', 'CONCILIADA', 'CANCELADO', 'CANCELADA'].includes(f.status))
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

      {/* Próxima fatura a pagar (F-105: com Pagar e Visualizar) */}
      {!loading && proxima && (() => {
        const sit = situacaoCobranca(proxima.status, proxima.data_vencimento);
        const link = linkDaFatura(proxima.codigo_operacional, proxima.public_identifier);
        return (
          <Card className={cn('border', sit.tipo === 'atraso' ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/20 bg-amber-500/5')} data-testid="proxima-fatura">
            <CardHeader className="pb-2">
              <CardTitle className={cn('text-sm flex items-center gap-2', sit.tipo === 'atraso' ? 'text-red-400' : 'text-amber-400')}>
                <CalendarClock className="h-4 w-4" /> Próxima fatura · {sit.texto}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Documento</p>
                  <p className="font-medium">{proxima.codigo_operacional || proxima.numero_documento || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Vencimento</p>
                  <p className="font-medium">{dataBR(proxima.data_vencimento)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Valor</p>
                  <p className="font-bold text-lg">{brl(Number(proxima.saldo ?? proxima.valor_original ?? 0))}</p>
                </div>
              </div>
              {link && (
                <div className="flex gap-2">
                  <Link to={link}><Button variant="outline" size="sm" className="gap-2 border-white/10"><Eye className="h-4 w-4" /> Visualizar</Button></Link>
                  <Link to={link}><Button size="sm" className="gap-2"><QrCode className="h-4 w-4" /> Pagar fatura</Button></Link>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

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
              <Receipt className="h-4 w-4" /> Minhas faturas
            </CardTitle>
            <CardDescription>Toque em "Pagar" para ver o PIX ou o boleto da fatura.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-white/10" data-testid="lista-faturas">
              {faturas.map((f) => {
                const sit = situacaoCobranca(f.status, f.data_vencimento);
                const link = linkDaFatura(f.codigo_operacional, f.public_identifier);
                const paga = sit.tipo === 'paga';
                return (
                  <li key={f.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-300">{f.codigo_operacional || f.numero_documento || '—'}</span>
                        <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-semibold', sit.cor, paga && 'border-2')}>{sit.texto}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {f.competencia_date ? `${mesAno(f.competencia_date)} · ` : ''}vence {dataBR(f.data_vencimento)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-right">
                        <p className={cn('font-bold', paga ? 'text-emerald-400' : 'text-white')}>
                          {brl(paga ? Number(f.valor_pago ?? f.valor_original ?? 0) : Number(f.saldo ?? f.valor_original ?? 0))}
                        </p>
                        {paga && Number(f.inter_pix_valor_recebido || 0) > 0 && (
                          <p className="text-[11px] text-emerald-400/80">recebido pelo banco: {brl(Number(f.inter_pix_valor_recebido))}</p>
                        )}
                      </div>
                      {link && (
                        <div className="flex gap-2">
                          <Link to={link}><Button variant="outline" size="sm" className="gap-1 border-white/10"><Eye className="h-4 w-4" /> Visualizar</Button></Link>
                          {!paga && sit.tipo !== 'cancelada' && (
                            <Link to={link}><Button size="sm" className="gap-1"><QrCode className="h-4 w-4" /> Pagar</Button></Link>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

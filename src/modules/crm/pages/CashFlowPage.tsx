import { useState, useCallback, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { financeiroService } from '../services/financeiro.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Landmark, ArrowLeft, Loader2, ArrowUpRight, ArrowDownRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { areaDoCrm } from '@/lib/areaDoCrm';

/**
 * Fluxo de Caixa (F-171): cobranças (entradas) e comissões (saídas) chegam sozinhas do banco; despesas e entradas avulsas
 * (aluguel, internet, serviços…) são lançadas aqui. Previsto = ainda não aconteceu; Realizado = pago/recebido.
 */
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (d?: string | null) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const ORIGEM: Record<string, string> = { CONTA_RECEBER: 'Cobrança', COMISSAO: 'Comissão', MANUAL: 'Avulso' };

interface Linha {
  id: string; tipo: 'ENTRADA' | 'SAIDA'; categoria: string; descricao: string; status: 'PREVISTO' | 'REALIZADO' | 'CANCELADO';
  valor_previsto: number | null; valor_realizado: number | null; data_prevista: string | null; data_realizada: string | null;
  data_movimento: string; origem_tipo: string | null;
}

export default function CashFlowPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const base = areaDoCrm(location.pathname, true);
  const { empresaOperadoraId } = useAuth();
  const [fluxo, setFluxo] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'ENTRADA' | 'SAIDA'>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'PREVISTO' | 'REALIZADO'>('TODOS');

  // novo lançamento avulso
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<'ENTRADA' | 'SAIDA'>('SAIDA');
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [realizado, setRealizado] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const fetchFluxo = useCallback(async () => {
    setLoading(true);
    const rows = await financeiroService.generateCashFlow(empresaOperadoraId || undefined);
    setFluxo(rows as Linha[]);
    setLoading(false);
  }, [empresaOperadoraId]);
  useEffect(() => { fetchFluxo(); }, [fetchFluxo]);

  const linhas = useMemo(
    () => fluxo.filter((f) => (filtroTipo === 'TODOS' || f.tipo === filtroTipo) && (filtroStatus === 'TODOS' || f.status === filtroStatus)),
    [fluxo, filtroTipo, filtroStatus],
  );
  const tot = useMemo(() => {
    const soma = (t: string, k: 'valor_realizado' | 'valor_previsto', so?: string) =>
      fluxo.filter((f) => f.tipo === t && (!so || f.status === so)).reduce((a, f) => a + Number(f[k] || 0), 0);
    const entradas = soma('ENTRADA', 'valor_realizado');
    const saidas = soma('SAIDA', 'valor_realizado');
    return {
      entradas, saidas, saldo: entradas - saidas,
      aReceber: fluxo.filter((f) => f.tipo === 'ENTRADA' && f.status === 'PREVISTO').reduce((a, f) => a + Number(f.valor_previsto || 0) - Number(f.valor_realizado || 0), 0),
      aPagar: fluxo.filter((f) => f.tipo === 'SAIDA' && f.status === 'PREVISTO').reduce((a, f) => a + Number(f.valor_previsto || 0) - Number(f.valor_realizado || 0), 0),
    };
  }, [fluxo]);

  const lancar = async () => {
    const v = Number(valor.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return toast.error('Informe um valor maior que zero.');
    setSalvando(true);
    const r = await financeiroService.lancarMovimento({ tipo, categoria: categoria || 'OUTROS', descricao, valor: v, data, realizado });
    setSalvando(false);
    if (!r.success) return toast.error(r.error || 'Não foi possível lançar.');
    toast.success(tipo === 'SAIDA' ? 'Saída lançada no fluxo de caixa.' : 'Entrada lançada no fluxo de caixa.');
    setAberto(false); setDescricao(''); setValor(''); setCategoria('');
    fetchFluxo();
  };

  const remover = async (id: string) => {
    const r = await financeiroService.removerMovimento(id);
    if (!r.success) return toast.error(r.error || 'Não foi possível remover.');
    toast.success('Lançamento removido.');
    fetchFluxo();
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12" data-testid="pagina-fluxo-caixa">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Landmark className="h-6 w-6 text-blue-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Fluxo de Caixa</h2>
          </div>
          <p className="text-slate-300 text-xs">Entradas e saídas, previsto e realizado — ligado às cobranças, aos pagamentos recebidos e às comissões.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAberto(true)} className="gap-2 text-xs" data-testid="novo-lancamento"><Plus className="h-4 w-4" /> Novo lançamento</Button>
          <Button variant="outline" onClick={() => navigate(`${base}/financeiro`)} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
            <ArrowLeft className="h-4 w-4" /> Voltar ao Financeiro
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="totais-fluxo">
        {[
          { id: 'entradas', rotulo: 'Entradas realizadas', v: tot.entradas, cor: 'text-emerald-400' },
          { id: 'saidas', rotulo: 'Saídas realizadas', v: tot.saidas, cor: 'text-rose-400' },
          { id: 'saldo', rotulo: 'Saldo em caixa', v: tot.saldo, cor: tot.saldo >= 0 ? 'text-sky-400' : 'text-rose-400' },
          { id: 'a-receber', rotulo: 'A receber (previsto)', v: tot.aReceber, cor: 'text-amber-400' },
          { id: 'a-pagar', rotulo: 'A pagar (previsto)', v: tot.aPagar, cor: 'text-orange-400' },
        ].map((c) => (
          <Card key={c.id} className="border border-white/10 bg-slate-900/80 rounded-2xl" data-testid={`total-${c.id}`}>
            <CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{c.rotulo}</div>
              <div className={`mt-1 text-xl font-bold tabular-nums ${c.cor}`}>{brl(c.v)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-blue-400" /> Lançamentos ({linhas.length})</span>
            <span className="flex gap-1 text-xs">
              {(['TODOS', 'ENTRADA', 'SAIDA'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setFiltroTipo(t)} className={`rounded-lg border px-2.5 py-1 ${filtroTipo === t ? 'border-primary bg-primary text-primary-foreground' : 'border-white/10 text-slate-300'}`}>
                  {t === 'TODOS' ? 'Tudo' : t === 'ENTRADA' ? 'Entradas' : 'Saídas'}
                </button>
              ))}
              {(['TODOS', 'PREVISTO', 'REALIZADO'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setFiltroStatus(s)} className={`rounded-lg border px-2.5 py-1 ${filtroStatus === s ? 'border-primary bg-primary text-primary-foreground' : 'border-white/10 text-slate-300'}`}>
                  {s === 'TODOS' ? 'Todos' : s === 'PREVISTO' ? 'Previstos' : 'Realizados'}
                </button>
              ))}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {linhas.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs" data-testid="fluxo-vazio">Nenhum lançamento neste filtro.</div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">Descrição / Origem</TableHead>
                    <TableHead className="text-slate-300">Data</TableHead>
                    <TableHead className="text-slate-300 text-right">Previsto</TableHead>
                    <TableHead className="text-slate-300 text-right">Realizado</TableHead>
                    <TableHead className="text-slate-300">Situação</TableHead>
                    <TableHead className="text-slate-300">Tipo</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((f) => (
                    <TableRow key={f.id} className="border-white/10 hover:bg-white/5" data-testid="linha-fluxo">
                      <TableCell>
                        <strong className="text-white block text-xs">
                          {f.origem_tipo === 'CONTA_RECEBER' ? <Link to={`${base}/financeiro/cobrancas`} className="hover:underline">{f.descricao}</Link> : f.descricao}
                        </strong>
                        <span className="text-[10px] text-slate-500">{ORIGEM[f.origem_tipo || 'MANUAL'] || 'Avulso'} · {f.categoria}</span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-300">{dia(f.status === 'REALIZADO' ? f.data_realizada : f.data_prevista)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-slate-300">{brl(f.valor_previsto)}</TableCell>
                      <TableCell className={`text-xs text-right tabular-nums font-bold ${f.tipo === 'ENTRADA' ? 'text-emerald-400' : 'text-rose-400'}`}>{brl(f.valor_realizado)}</TableCell>
                      <TableCell><Badge className={f.status === 'REALIZADO' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}>{f.status === 'REALIZADO' ? 'Realizado' : 'Previsto'}</Badge></TableCell>
                      <TableCell>
                        <Badge className={f.tipo === 'ENTRADA' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}>
                          {f.tipo === 'ENTRADA' ? <ArrowUpRight className="h-3 w-3 mr-1 inline" /> : <ArrowDownRight className="h-3 w-3 mr-1 inline" />}
                          {f.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {f.origem_tipo === 'MANUAL' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400" onClick={() => remover(f.id)} aria-label="Remover lançamento avulso"><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="bg-slate-900 border-white/10 text-slate-200 max-w-md" data-testid="dialogo-lancamento">
          <DialogHeader>
            <DialogTitle>Novo lançamento</DialogTitle>
            <DialogDescription>Despesas e entradas avulsas. Cobranças e comissões entram sozinhas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['SAIDA', 'ENTRADA'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTipo(t)} data-testid={`tipo-${t}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${tipo === t ? (t === 'SAIDA' ? 'border-rose-500 bg-rose-500/10 text-rose-300' : 'border-emerald-500 bg-emerald-500/10 text-emerald-300') : 'border-white/10 text-slate-300'}`}>
                  {t === 'SAIDA' ? 'Saída (gasto)' : 'Entrada'}
                </button>
              ))}
            </div>
            <div><Label>Descrição *</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Aluguel da sala" className="mt-1 bg-slate-950 border-slate-700" data-testid="lanc-descricao" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Valor (R$) *</Label><Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1 bg-slate-950 border-slate-700" data-testid="lanc-valor" /></div>
              <div><Label>Data *</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-1 bg-slate-950 border-slate-700" /></div>
            </div>
            <div><Label>Categoria</Label><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Aluguel, Internet, Energia" className="mt-1 bg-slate-950 border-slate-700" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={realizado} onChange={(e) => setRealizado(e.target.checked)} /> Já foi {tipo === 'SAIDA' ? 'pago' : 'recebido'} (desmarque para deixar previsto)</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={lancar} disabled={salvando || descricao.trim().length < 3 || !valor.trim()} data-testid="salvar-lancamento">
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Lançar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

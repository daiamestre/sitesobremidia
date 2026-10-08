import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, CheckCircle2, Landmark, Loader2, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { financeiroService } from '../../services/financeiro.service';
import { areaDoCrm } from '@/lib/areaDoCrm';
import { cn } from '@/lib/utils';

/**
 * F-171 — Visão geral do financeiro: entradas, saídas, saldo, a receber, vencido e quem está devendo.
 * Mesma base da Central de Cobranças (fn_financeiro_resumo): cobrança paga entra como entrada, comissão paga como saída.
 */
const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesCurto = (ym: string) => { const [a, m] = ym.split('-'); return `${m}/${a.slice(2)}`; };

type Periodo = 'mes' | '30d' | 'ano';

function intervalo(p: Periodo): { inicio: string; fim: string } {
  const hoje = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (p === 'ano') return { inicio: `${hoje.getFullYear()}-01-01`, fim: fmt(hoje) };
  if (p === '30d') { const i = new Date(hoje); i.setDate(i.getDate() - 29); return { inicio: fmt(i), fim: fmt(hoje) }; }
  return { inicio: fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: fmt(hoje) };
}

export function ResumoFinanceiro() {
  const location = useLocation();
  const base = areaDoCrm(location.pathname, true);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const { inicio, fim } = useMemo(() => intervalo(periodo), [periodo]);

  const q = useQuery({
    queryKey: ['financeiro-resumo', inicio, fim],
    queryFn: () => financeiroService.getResumoFinanceiro(inicio, fim),
    staleTime: 30_000,
  });
  const r = q.data;
  const cobrancas = `${base}/financeiro/cobrancas`;
  const maxMes = useMemo(() => Math.max(1, ...(r?.por_mes ?? []).map((m) => Math.max(m.entradas, m.saidas, m.previsto))), [r]);

  if (q.isLoading) return <div className="flex justify-center py-10 text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!r) return (
    <Card className="border-white/10 bg-slate-900/80"><CardContent className="p-4 text-sm text-slate-400" data-testid="resumo-indisponivel">
      Não foi possível carregar o resumo financeiro (é só para Owner, ADM, Financeiro e Gerente).
    </CardContent></Card>
  );

  const saldo = r.entradas_realizadas - r.saidas_realizadas;
  const cards = [
    { id: 'entradas', rotulo: 'Entradas (recebido)', valor: brl(r.entradas_realizadas), sub: `previsto ainda: ${brl(r.entradas_previstas)}`, icone: ArrowUpRight, cor: 'text-emerald-400' },
    { id: 'saidas', rotulo: 'Saídas (pago)', valor: brl(r.saidas_realizadas), sub: `previsto ainda: ${brl(r.saidas_previstas)}`, icone: ArrowDownRight, cor: 'text-rose-400' },
    { id: 'saldo', rotulo: 'Saldo do período', valor: brl(saldo), sub: `saldo acumulado: ${brl(r.saldo_acumulado)}`, icone: Wallet, cor: saldo >= 0 ? 'text-sky-400' : 'text-rose-400' },
    { id: 'a-receber', rotulo: 'A receber', valor: brl(r.a_receber.valor), sub: `${r.a_receber.qtd} cobrança(s) em aberto`, icone: Landmark, cor: 'text-amber-400' },
  ];

  return (
    <section className="space-y-4" data-testid="resumo-financeiro">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Visão geral do financeiro</h3>
        <div className="flex gap-1" role="group" aria-label="Período">
          {([['mes', 'Este mês'], ['30d', '30 dias'], ['ano', 'Este ano']] as const).map(([v, rot]) => (
            <button key={v} type="button" onClick={() => setPeriodo(v)} data-testid={`periodo-${v}`}
              className={cn('rounded-lg border px-3 py-1 text-xs font-semibold', periodo === v ? 'border-primary bg-primary text-primary-foreground' : 'border-white/10 text-slate-300 hover:bg-white/5')}>
              {rot}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.id} data-testid={`fin-${c.id}`} className="border-white/10 bg-slate-900/80 rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{c.rotulo}<c.icone className={cn('h-4 w-4', c.cor)} /></div>
              <div className={cn('mt-1 text-xl font-bold tabular-nums', c.cor)}>{c.valor}</div>
              <div className="text-[11px] text-slate-500">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Link to={cobrancas} data-testid="fin-vencido" className="block">
          <Card className={cn('h-full rounded-2xl border bg-slate-900/80 transition-colors hover:bg-slate-900', r.vencido.qtd > 0 ? 'border-red-500/40' : 'border-white/10')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Vencido (dívidas)<AlertTriangle className="h-4 w-4 text-red-400" /></div>
              <div className="mt-1 text-xl font-bold tabular-nums text-red-400">{brl(r.vencido.valor)}</div>
              <div className="text-[11px] text-slate-500">{r.vencido.qtd} cobrança(s) · {r.vencido.clientes} cliente(s) · inadimplência {r.inadimplencia_pct.toLocaleString('pt-BR')}%</div>
            </CardContent>
          </Card>
        </Link>
        <Link to={cobrancas} data-testid="fin-a-vencer" className="block">
          <Card className="h-full rounded-2xl border border-white/10 bg-slate-900/80 transition-colors hover:bg-slate-900">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400 font-semibold">A vencer (pendências)<CalendarClock className="h-4 w-4 text-amber-400" /></div>
              <div className="mt-1 text-xl font-bold tabular-nums text-amber-400">{brl(r.a_vencer.valor)}</div>
              <div className="text-[11px] text-slate-500">{r.a_vencer.qtd} cobrança(s) · próximos 7 dias: {brl(r.a_vencer.em_7_dias)} ({r.a_vencer.qtd_7_dias})</div>
            </CardContent>
          </Card>
        </Link>
        <Card className="h-full rounded-2xl border border-white/10 bg-slate-900/80" data-testid="fin-recebido-total">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Recebido desde o início<CheckCircle2 className="h-4 w-4 text-emerald-400" /></div>
            <div className="mt-1 text-xl font-bold tabular-nums text-emerald-400">{brl(r.recebido_total)}</div>
            <div className="text-[11px] text-slate-500">de {brl(r.faturado_total)} faturados</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border border-white/10 bg-slate-900/80"><CardContent className="p-4 space-y-2" data-testid="fin-por-mes">
          <div className="text-sm font-semibold text-white">Últimos 6 meses</div>
          <div className="space-y-1.5">
            {r.por_mes.map((m) => (
              <div key={m.mes} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-[11px] text-slate-400">
                <span>{mesCurto(m.mes)}</span>
                <div className="space-y-0.5">
                  <div className="h-1.5 rounded bg-emerald-500/80" style={{ width: `${Math.max(2, (m.entradas / maxMes) * 100)}%` }} title={`Entradas ${brl(m.entradas)}`} />
                  <div className="h-1.5 rounded bg-rose-500/80" style={{ width: `${Math.max(2, (m.saidas / maxMes) * 100)}%` }} title={`Saídas ${brl(m.saidas)}`} />
                </div>
                <span className="tabular-nums text-right">+{brl(m.entradas)} / −{brl(m.saidas)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-[10px] text-slate-500"><span className="text-emerald-400">■ entradas</span><span className="text-rose-400">■ saídas</span></div>
        </CardContent></Card>

        <Card className="rounded-2xl border border-white/10 bg-slate-900/80"><CardContent className="p-4 space-y-2" data-testid="fin-devedores">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Quem está devendo</div>
            <Button asChild size="sm" variant="outline" className="h-7 border-white/10 text-xs"><Link to={cobrancas}>Abrir Central de Cobranças</Link></Button>
          </div>
          {r.devedores.length === 0 ? <p className="text-xs text-slate-500">Nenhum cliente com cobrança vencida.</p> : (
            <ul className="divide-y divide-white/5">
              {r.devedores.map((d) => (
                <li key={d.cliente_id}>
                  <Link to={`${cobrancas}?cliente=${d.cliente_id}`} data-testid="devedor" className="flex items-center justify-between gap-3 py-1.5 text-xs hover:bg-white/5 rounded px-1">
                    <span className="min-w-0"><span className="block truncate font-medium text-white">{d.nome}</span><span className="text-[11px] text-slate-500">{d.qtd} cobrança(s) · {d.dias_max} dias de atraso</span></span>
                    <span className="shrink-0 font-bold tabular-nums text-red-400">{brl(d.valor)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </div>

      {r.recebimentos_recentes.length > 0 && (
        <Card className="rounded-2xl border border-white/10 bg-slate-900/80"><CardContent className="p-4 space-y-2" data-testid="fin-recentes">
          <div className="text-sm font-semibold text-white">Últimos recebimentos</div>
          <ul className="divide-y divide-white/5">
            {r.recebimentos_recentes.slice(0, 6).map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span className="truncate text-slate-300">{x.descricao}</span>
                <span className="shrink-0 text-slate-500">{new Date(`${x.data}T12:00:00`).toLocaleDateString('pt-BR')}</span>
                <span className="shrink-0 font-bold tabular-nums text-emerald-400">{brl(x.valor)}</span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}
    </section>
  );
}

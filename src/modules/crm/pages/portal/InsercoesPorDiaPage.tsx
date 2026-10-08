import { useState, useEffect, Fragment } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, BarChart2, ChevronDown, ChevronUp, Eye, MapPin, Monitor, Building2, Clock, PlayCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { customerPortalDataService } from '../../services/customerPortalData.service';
import { InsercoesDoAnunciante, TipoDeLocalDeExibicao } from '../../types/portal.types';
import { formatNumber, formatDate } from '@/utils/formatters';

/**
 * F-165 — Inserções do anunciante.
 * Cada número é uma exibição REAL gravada pelo Player (prova de exibição), atribuída ao anunciante pela mídia dele.
 * É a mesma fonte do KPI do início, do card "Onde seu anúncio passa" e das campanhas.
 */
const PERIODOS = [7, 30, 90] as const;

const ROTULO_DO_LOCAL: Record<TipoDeLocalDeExibicao, string> = {
  PARCEIRO: 'Ponto parceiro',
  PROPRIA: 'Sua tela',
  REDE: 'Tela da rede',
};

const COR_DO_LOCAL: Record<TipoDeLocalDeExibicao, string> = {
  PARCEIRO: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  PROPRIA: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  REDE: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

function quando(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function EtiquetaDoLocal({ tipo }: { tipo: TipoDeLocalDeExibicao }) {
  return <Badge className={`${COR_DO_LOCAL[tipo]} text-[10px] px-2 py-0.5`}>{ROTULO_DO_LOCAL[tipo]}</Badge>;
}

export default function InsercoesPorDiaPage() {
  const [dias, setDias] = useState<number>(30);
  const [dados, setDados] = useState<InsercoesDoAnunciante | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    customerPortalDataService.getInsercoesDoAnunciante(dias).then(r => {
      if (vivo) { setDados(r); setLoading(false); }
    });
    return () => { vivo = false; };
  }, [dias]);

  const toggleRow = (data: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(data)) next.delete(data);
      else next.add(data);
      return next;
    });
  };

  const cabecalho = (
    <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" /> Inserções por Dia
          </h2>
          <p className="text-slate-400 text-sm mt-1">Quantas vezes o seu anúncio passou de verdade, nas telas parceiras e na sua própria tela.</p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Período">
          {PERIODOS.map(p => (
            <button
              key={p}
              type="button"
              data-testid={`periodo-${p}`}
              onClick={() => setDias(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${dias === p ? 'bg-primary text-primary-foreground border-primary' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
            >
              {p} dias
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading || !dados) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        {cabecalho}
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  const totalDias = dados.por_dia.length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12" data-testid="pagina-insercoes">
      {cabecalho}

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { rotulo: `Inserções em ${dados.periodo_dias} dias`, valor: formatNumber(dados.total), icone: BarChart2, id: 'total' },
          { rotulo: 'Hoje', valor: formatNumber(dados.hoje), icone: PlayCircle, id: 'hoje' },
          { rotulo: 'Últimos 7 dias', valor: formatNumber(dados.ultimos_7_dias), icone: Calendar, id: '7dias' },
          { rotulo: 'Última exibição', valor: quando(dados.ultima_exibicao), icone: Clock, id: 'ultima' },
        ].map(c => (
          <div key={c.id} data-testid={`resumo-${c.id}`} className="p-4 rounded-xl border border-white/10 bg-slate-900/80">
            <div className="flex items-center gap-2 text-xs text-slate-400"><c.icone className="h-3.5 w-3.5 text-primary" /> {c.rotulo}</div>
            <div className="mt-1 text-xl font-bold text-white tabular-nums">{c.valor}</div>
          </div>
        ))}
      </div>

      {dados.total === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10" data-testid="sem-insercoes">
          <Calendar className="h-12 w-12 mx-auto text-slate-600 mb-4" />
          <p className="text-lg font-medium">Nenhuma exibição registrada nos últimos {dados.periodo_dias} dias</p>
          <p className="text-sm mt-2 max-w-xl mx-auto">
            Cada vez que o seu anúncio passar em uma tela, o Player registra e a contagem aparece aqui, por dia, por anúncio e por tela.
            Se você já publicou uma playlist ou campanha, aguarde a tela buscar o conteúdo (alguns minutos) e abra esta página de novo.
          </p>
        </div>
      ) : (
        <>
          {/* Por anúncio */}
          <Card className="border border-white/10 bg-slate-900/80 overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> Por anúncio</h3>
              <div className="space-y-2" data-testid="lista-por-anuncio">
                {dados.por_anuncio.map(a => (
                  <div key={a.media_id} className="p-3 rounded-lg border border-white/10 bg-slate-950/50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">{a.nome}</p>
                        <p className="text-xs text-slate-400">{formatNumber(a.hoje)} hoje · {formatNumber(a.ultimos_7_dias)} em 7 dias · última {quando(a.ultima)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-primary tabular-nums">{formatNumber(a.total)}</div>
                        <div className="text-[10px] text-slate-400">inserções</div>
                      </div>
                    </div>
                    {a.locais.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.locais.map(l => (
                          <span key={l.chave} className="inline-flex items-center gap-1 text-[11px] text-slate-300 px-2 py-0.5 rounded-full bg-white/5">
                            {l.tipo === 'PARCEIRO' ? <Building2 className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                            {l.nome} · {formatNumber(l.quantidade)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Por local */}
          <Card className="border border-white/10 bg-slate-900/80 overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Onde o anúncio passou</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="lista-por-local">
                {dados.por_local.map(l => (
                  <div key={l.chave} className="p-3 rounded-lg border border-white/10 bg-slate-950/50 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{l.nome}</p>
                      <p className="text-xs text-slate-400 truncate">{l.cidade ? `${l.cidade} · ` : ''}{formatNumber(l.hoje)} hoje · {formatNumber(l.ultimos_7_dias)} em 7 dias</p>
                      <div className="mt-1"><EtiquetaDoLocal tipo={l.tipo} /></div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-primary tabular-nums">{formatNumber(l.total)}</div>
                      <div className="text-[10px] text-slate-400">inserções</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Por dia */}
          <Card className="border border-white/10 bg-slate-900/80 overflow-hidden">
            <CardContent className="p-0">
              <div className="px-4 pt-4 text-sm text-slate-300">
                Total: <strong className="text-white">{formatNumber(dados.total)}</strong> inserções em <strong className="text-white">{totalDias}</strong> {totalDias === 1 ? 'dia' : 'dias'} com exibição
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-950">
                    <TableRow className="border-white/10">
                      <TableHead className="text-slate-300 w-12"></TableHead>
                      <TableHead className="text-slate-300">Data</TableHead>
                      <TableHead className="text-slate-300 text-center">Inserções</TableHead>
                      <TableHead className="text-slate-300">Anúncios</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...dados.por_dia].reverse().map((dia) => (
                      <Fragment key={dia.data}>
                        <TableRow data-testid="linha-do-dia" className="border-white/10 hover:bg-white/5 cursor-pointer" onClick={() => toggleRow(dia.data)}>
                          <TableCell className="text-center">
                            {expandedRows.has(dia.data) ? <ChevronUp className="h-4 w-4 text-slate-400 mx-auto" /> : <ChevronDown className="h-4 w-4 text-slate-400 mx-auto" />}
                          </TableCell>
                          <TableCell className="font-medium text-white">{formatDate(dia.data)}</TableCell>
                          <TableCell className="text-center font-bold text-lg text-primary">{formatNumber(dia.quantidade)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {dia.midias.slice(0, 3).map(m => (
                                <Badge key={m.media_id} className="bg-primary/20 text-primary border-primary/30 text-[10px] px-2 py-0.5">{m.nome}</Badge>
                              ))}
                              {dia.midias.length > 3 && (
                                <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-[10px] px-2 py-0.5">+{dia.midias.length - 3} mais</Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedRows.has(dia.data) && (
                          <TableRow className="bg-slate-950/50 border-white/5">
                            <TableCell colSpan={4} className="p-4">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                                <div className="space-y-1.5">
                                  <p className="text-xs uppercase tracking-wide text-slate-400">Anúncios</p>
                                  {dia.midias.map(m => (
                                    <div key={m.media_id} className="flex justify-between gap-3 text-slate-200"><span className="truncate">{m.nome}</span><strong className="tabular-nums">{formatNumber(m.quantidade)}</strong></div>
                                  ))}
                                </div>
                                <div className="space-y-1.5">
                                  <p className="text-xs uppercase tracking-wide text-slate-400">Telas</p>
                                  {dia.locais.map(l => (
                                    <div key={l.chave} className="flex justify-between gap-3 text-slate-200">
                                      <span className="truncate flex items-center gap-2">{l.nome} <EtiquetaDoLocal tipo={l.tipo} /></span>
                                      <strong className="tabular-nums">{formatNumber(l.quantidade)}</strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { usePermissoesRepresentantes } from '@/hooks/usePermissoesRepresentantes';
import {
  representantesGerenciaService,
  RepresentanteGerencia,
  DesempenhoDetalhe,
} from '@/services/representantesGerencia.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users,
  FileText,
  FileCheck,
  DollarSign,
  Target,
  Pencil,
  Power,
  ShieldAlert,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Mail,
  Phone,
  Building2,
  CreditCard,
  Landmark,
  UserCheck,
  UserX,
  TrendingUp,
} from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters';

export default function RepresentanteDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const permissoes = usePermissoesRepresentantes();

  const [rep, setRep] = useState<RepresentanteGerencia | null>(null);
  const [detalhe, setDetalhe] = useState<DesempenhoDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const abaInicial = searchParams.get('aba') === 'desempenho' ? 'desempenho' : 'visao-geral';
  const [aba, setAba] = useState(abaInicial);

  const carregar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErro(null);
    try {
      const lista = await representantesGerenciaService.listarRepresentantes({ representanteId: id });
      const encontrado = lista[0] ?? null;
      setRep(encontrado);
      if (!encontrado) {
        setErro('Representante não encontrado neste tenant.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao carregar representante.';
      if (/permiss|Acesso Negado|42501/i.test(msg)) {
        setErro('Você não possui permissão para visualizar os representantes.');
      } else {
        setErro(`Erro ao carregar representante: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const carregarDesempenho = useCallback(async () => {
    if (!id) return;
    try {
      const d = await representantesGerenciaService.obterDesempenhoDetalhe(id);
      setDetalhe(d);
    } catch {
      setDetalhe(null);
    }
  }, [id]);

  useEffect(() => {
    if (permissoes.carregado && permissoes.podeVer) {
      carregar();
      if (permissoes.podeVerDesempenho) carregarDesempenho();
    } else if (permissoes.carregado) {
      setLoading(false);
      setErro('Você não possui permissão para visualizar os representantes.');
    }
  }, [permissoes.carregado, permissoes.podeVer, permissoes.podeVerDesempenho, carregar, carregarDesempenho]);

  const recarregarTudo = async () => {
    await carregar();
    if (permissoes.podeVerDesempenho) await carregarDesempenho();
  };

  const salvarEdicao = async (payload: { cpfCnpj?: string; razaoSocial?: string; comissaoPorcentagem?: number }) => {
    if (!rep) return;
    const res = await representantesGerenciaService.editarRepresentante(rep.id, payload);
    if (!res.success) {
      toast({ title: 'Erro ao editar representante', description: res.error, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Representante atualizado', description: 'Dados comerciais salvos com sucesso.' });
    await recarregarTudo();
    return true;
  };

  const toggleStatus = async () => {
    if (!rep) return;
    const res = rep.ativo
      ? await representantesGerenciaService.desativarRepresentante(rep.id)
      : await representantesGerenciaService.ativarRepresentante(rep.id);
    if (!res.success) {
      toast({ title: 'Erro na operação', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: rep.ativo ? 'Representante desativado' : 'Representante ativado',
      description: `${rep.nome} atualizado com sucesso.`,
    });
    await recarregarTudo();
  };

  const semPermissao = permissoes.carregado && !permissoes.podeVer;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      {/* HEADER */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-300 rounded-xl text-xs gap-1 -ml-2"
              onClick={() => navigate('/workspace/representantes')}
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <div className="w-12 h-12 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-extrabold text-lg">
              {rep?.nome.slice(0, 2).toUpperCase() ?? '--'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
                  {rep?.nome ?? 'Representante'}
                </h2>
                {rep?.ativo ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                    <UserCheck className="h-3 w-3 mr-1" /> Ativo
                  </Badge>
                ) : (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                    <UserX className="h-3 w-3 mr-1" /> Inativo
                  </Badge>
                )}
              </div>
              <p className="text-slate-300 text-xs">
                Perfil {rep?.perfil_nome ?? '—'} · Código {rep?.codigo_representante ?? '—'}
                {rep && <span className="text-slate-500"> · cadastrado em {formatDate(rep.created_at)}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {rep && (
              <>
                {rep.ativo && permissoes.podeDesativar && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl text-xs gap-1.5"
                    onClick={toggleStatus}
                  >
                    <Power className="h-3.5 w-3.5" /> Desativar
                  </Button>
                )}
                {!rep.ativo && permissoes.podeAtivar && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-xl text-xs gap-1.5"
                    onClick={toggleStatus}
                  >
                    <Power className="h-3.5 w-3.5" /> Ativar
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-slate-300 rounded-xl text-xs gap-1"
                  onClick={() => navigate('/workspace/representantes/desempenho')}
                >
                  <TrendingUp className="h-3.5 w-3.5" /> Desempenho geral
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* PERMISSÃO NEGADA */}
      {semPermissao && (
        <Card className="border border-red-500/30 bg-red-500/5 rounded-2xl">
          <CardContent className="p-8 flex flex-col items-center text-center gap-3">
            <ShieldAlert className="h-10 w-10 text-red-400" />
            <p className="text-red-300 font-semibold">
              Você não possui permissão para visualizar os representantes.
            </p>
            <p className="text-slate-400 text-xs">
              Solicite a permissão <code className="font-mono">representantes.view</code> ao OWNER na Central de
              Acessos.
            </p>
          </CardContent>
        </Card>
      )}

      {!semPermissao && !permissoes.carregado && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!semPermissao && permissoes.carregado && loading && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!semPermissao && permissoes.carregado && !loading && erro && (
        <Card className="border border-red-500/30 bg-red-500/5 rounded-2xl">
          <CardContent className="p-6 flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-300 text-sm">{erro}</p>
              {erro.includes('não encontrado') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-300 text-xs mt-2"
                  onClick={() => navigate('/workspace/representantes')}
                >
                  Voltar para a lista <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!semPermissao && permissoes.carregado && !loading && !erro && rep && (
        <>
          {/* RESUMO DO REPRESENTANTE */}
          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <InfoItem icon={<Mail className="h-4 w-4" />} label="E-mail" valor={rep.email} />
              <InfoItem icon={<Phone className="h-4 w-4" />} label="Telefone" valor={rep.telefone ?? '—'} />
              <InfoItem icon={<Building2 className="h-4 w-4" />} label="Razão social" valor={rep.razao_social ?? '—'} />
              <InfoItem
                icon={<CreditCard className="h-4 w-4" />}
                label="CPF / CNPJ"
                valor={rep.cpf_cnpj ?? '—'}
                mono
              />
              <InfoItem icon={<DollarSign className="h-4 w-4" />} label="Comissão" valor={`${rep.comissao_porcentagem}%`} />
              <InfoItem icon={<Landmark className="h-4 w-4" />} label="Usuário vinculado" valor={rep.usuario_ativo ? 'Ativo' : 'Sem vínculo'} />
              <InfoItem icon={<Target className="h-4 w-4" />} label="Meta mensal" valor={formatCurrency(rep.meta_mensal)} />
              <InfoItem
                icon={<DollarSign className="h-4 w-4" />}
                label="Receita mensal"
                valor={formatCurrency(rep.receita_mensal)}
                destaque
              />
            </CardContent>
          </Card>

          {/* TABS */}
          <Tabs value={aba} onValueChange={setAba} className="w-full space-y-4">
            <TabsList className="bg-slate-900/90 border border-white/10 p-1 rounded-xl flex-wrap h-auto">
              <TabsTrigger value="visao-geral" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs gap-1.5">
                <Users className="h-3.5 w-3.5" /> Visão Geral
              </TabsTrigger>
              <TabsTrigger value="desempenho" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Desempenho
              </TabsTrigger>
              <TabsTrigger value="clientes" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs gap-1.5">
                <Users className="h-3.5 w-3.5" /> Clientes ({detalhe?.clientes.length ?? rep.total_clientes})
              </TabsTrigger>
              <TabsTrigger value="propostas" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Propostas ({detalhe?.propostas.length ?? rep.total_propostas})
              </TabsTrigger>
              <TabsTrigger value="contratos" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs gap-1.5">
                <FileCheck className="h-3.5 w-3.5" /> Contratos ({detalhe?.contratos.length ?? rep.total_contratos})
              </TabsTrigger>
            </TabsList>

            {/* VISÃO GERAL */}
            <TabsContent value="visao-geral" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniKpi label="Clientes na carteira" valor={String(rep.total_clientes)} sub={`${rep.clientes_ativos} ativos`} cor="text-blue-400 bg-blue-500/20 border-blue-500/30" />
                <MiniKpi label="Propostas" valor={String(rep.total_propostas)} sub="criadas" cor="text-amber-400 bg-amber-500/20 border-amber-500/30" />
                <MiniKpi label="Contratos" valor={String(rep.total_contratos)} sub="total" cor="text-emerald-400 bg-emerald-500/20 border-emerald-500/30" />
                <MiniKpi
                  label="Meta do mês"
                  valor={rep.meta_mensal > 0 ? `${Math.round((rep.meta_realizado / rep.meta_mensal) * 100)}%` : '—'}
                  sub={rep.meta_mensal > 0 ? `${formatCurrency(rep.meta_realizado)} / ${formatCurrency(rep.meta_mensal)}` : 'Sem meta definida'}
                  cor="text-purple-400 bg-purple-500/20 border-purple-500/30"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-slate-300 rounded-xl text-xs gap-1"
                  onClick={() => setAba('clientes')}
                >
                  Ver clientes <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                {permissoes.podeVerDesempenho && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-purple-500/30 text-purple-400 rounded-xl text-xs gap-1"
                    onClick={() => setAba('desempenho')}
                  >
                    Ver desempenho <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* DESEMPENHO */}
            <TabsContent value="desempenho" className="space-y-4">
              {!permissoes.podeVerDesempenho ? (
                <Card className="border border-red-500/30 bg-red-500/5 rounded-2xl">
                  <CardContent className="p-8 flex flex-col items-center text-center gap-3">
                    <ShieldAlert className="h-10 w-10 text-red-400" />
                    <p className="text-red-300 font-semibold">
                      Você não possui permissão para visualizar o desempenho dos representantes.
                    </p>
                    <p className="text-slate-400 text-xs">
                      Solicite a permissão <code className="font-mono">representantes.view_performance</code> ao OWNER.
                    </p>
                  </CardContent>
                </Card>
              ) : !detalhe ? (
                <div className="flex items-center justify-center min-h-[30vh]">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MiniKpi label="Clientes" valor={String(detalhe.resumo.total_clientes)} sub={`${detalhe.resumo.clientes_ativos} ativos`} cor="text-blue-400 bg-blue-500/20 border-blue-500/30" />
                    <MiniKpi label="Propostas" valor={String(detalhe.resumo.propostas_criadas)} sub={`${detalhe.resumo.propostas_aprovadas} aprovadas`} cor="text-amber-400 bg-amber-500/20 border-amber-500/30" />
                    <MiniKpi label="Contratos" valor={String(detalhe.resumo.contratos_fechados)} sub="fechados" cor="text-emerald-400 bg-emerald-500/20 border-emerald-500/30" />
                    <MiniKpi label="Receita mensal" valor={formatCurrency(detalhe.resumo.receita_mensal)} sub={`Ticket ${formatCurrency(detalhe.resumo.ticket_medio)}`} cor="text-emerald-400 bg-emerald-500/20 border-emerald-500/30" />
                  </div>

                  {detalhe.resumo.meta_mensal > 0 && (
                    <Card className="border border-white/10 bg-slate-900/80 rounded-2xl">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-center text-xs mb-2">
                          <span className="font-bold text-white flex items-center gap-1.5">
                            <Target className="h-3.5 w-3.5 text-purple-400" /> Meta mensal
                          </span>
                          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                            {((detalhe.resumo.meta_realizado / detalhe.resumo.meta_mensal) * 100).toFixed(1)}%
                          </Badge>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-white/10">
                          <div
                            className="bg-gradient-to-r from-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((detalhe.resumo.meta_realizado / detalhe.resumo.meta_mensal) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs font-mono pt-1 text-slate-400">
                          <span>Realizado: <strong className="text-emerald-400">{formatCurrency(detalhe.resumo.meta_realizado)}</strong></span>
                          <span>Meta: <strong className="text-slate-200">{formatCurrency(detalhe.resumo.meta_mensal)}</strong></span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {detalhe.metas.length > 0 && (
                    <Card className="border border-white/10 bg-slate-900/80 rounded-2xl overflow-hidden">
                      <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
                        <CardTitle className="text-sm font-bold text-white">Histórico de metas</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 p-0">
                        <div className="divide-y divide-white/5">
                          {detalhe.metas.slice().reverse().map((m) => (
                            <div key={`${m.ano}-${m.mes}`} className="flex items-center justify-between px-4 py-2.5 text-xs">
                              <span className="font-mono text-slate-300">
                                {String(m.mes).padStart(2, '0')}/{m.ano}
                              </span>
                              <span className="font-mono text-slate-400">
                                {formatCurrency(m.valor_realizado)} / {formatCurrency(m.valor_meta)}
                              </span>
                              <Badge
                                className={
                                  m.percentual >= 100
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]'
                                    : 'bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]'
                                }
                              >
                                {m.percentual}%
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {detalhe.evolucao.length > 0 && (
                    <Card className="border border-white/10 bg-slate-900/80 rounded-2xl overflow-hidden">
                      <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
                        <CardTitle className="text-sm font-bold text-white">Evolução por período</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider">
                              <tr>
                                <th className="py-2.5 px-4">Período</th>
                                <th className="py-2.5 px-4 text-center">Propostas</th>
                                <th className="py-2.5 px-4 text-center">Contratos</th>
                                <th className="py-2.5 px-4 text-right">Receita</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-200">
                              {detalhe.evolucao.slice().reverse().map((e) => (
                                <tr key={e.mes} className="hover:bg-white/5">
                                  <td className="py-2.5 px-4 font-mono text-slate-300">{e.mes_nome}</td>
                                  <td className="py-2.5 px-4 text-center font-mono">{e.propostas}</td>
                                  <td className="py-2.5 px-4 text-center font-mono">{e.contratos}</td>
                                  <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400">
                                    {formatCurrency(e.receita)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            {/* CLIENTES */}
            <TabsContent value="clientes" className="space-y-4">
              {!detalhe ? (
                <div className="flex items-center justify-center min-h-[30vh]">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
                    <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                      <span>Carteira de clientes</span>
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                        {detalhe.clientes.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Código</th>
                            <th className="py-3 px-4">Cliente</th>
                            <th className="py-3 px-4 text-center">Status</th>
                            <th className="py-3 px-4 text-center">Propostas</th>
                            <th className="py-3 px-4 text-center">Contratos</th>
                            <th className="py-3 px-4">Cidade</th>
                            <th className="py-3 px-4">Criado em</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          {detalhe.clientes.map((c) => (
                            <tr key={c.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-4 font-mono text-purple-400 font-bold">CLI-{c.codigo_cliente}</td>
                              <td className="py-3 px-4 font-semibold text-white">{c.razao_social}</td>
                              <td className="py-3 px-4 text-center">
                                <Badge
                                  className={
                                    c.status === 'ACTIVE'
                                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]'
                                      : 'bg-slate-500/20 text-slate-400 border-slate-500/30 text-[10px]'
                                  }
                                >
                                  {c.status}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-center font-mono">{c.propostas}</td>
                              <td className="py-3 px-4 text-center font-mono">{c.contratos}</td>
                              <td className="py-3 px-4 text-slate-400">{c.cidade ?? '—'}</td>
                              <td className="py-3 px-4 text-slate-400">{formatDate(c.criado_em)}</td>
                            </tr>
                          ))}
                          {detalhe.clientes.length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-slate-500">
                                Sem clientes na carteira.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* PROPOSTAS */}
            <TabsContent value="propostas" className="space-y-4">
              {!detalhe ? (
                <div className="flex items-center justify-center min-h-[30vh]">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
                    <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                      <span>Propostas comerciais</span>
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                        {detalhe.propostas.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Proposta</th>
                            <th className="py-3 px-4">Campanha</th>
                            <th className="py-3 px-4">Cliente</th>
                            <th className="py-3 px-4 text-right">Valor</th>
                            <th className="py-3 px-4 text-center">Status</th>
                            <th className="py-3 px-4">Criada em</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          {detalhe.propostas.map((p) => (
                            <tr key={p.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-4 font-mono text-amber-400 font-bold">{p.numero_proposta}</td>
                              <td className="py-3 px-4 text-white">{p.titulo_campanha ?? '—'}</td>
                              <td className="py-3 px-4 text-slate-300">{p.cliente_nome}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                                {formatCurrency(p.valor_total)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                                  {p.status}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-slate-400">{formatDate(p.criado_em)}</td>
                            </tr>
                          ))}
                          {detalhe.propostas.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500">
                                Sem propostas registradas.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* CONTRATOS */}
            <TabsContent value="contratos" className="space-y-4">
              {!detalhe ? (
                <div className="flex items-center justify-center min-h-[30vh]">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
                    <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                      <span>Contratos comerciais</span>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                        {detalhe.contratos.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Contrato</th>
                            <th className="py-3 px-4">Cliente</th>
                            <th className="py-3 px-4 text-right">Valor mensal</th>
                            <th className="py-3 px-4 text-center">Status</th>
                            <th className="py-3 px-4">Início</th>
                            <th className="py-3 px-4">Criado em</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          {detalhe.contratos.map((ct) => (
                            <tr key={ct.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-4 font-mono text-emerald-400 font-bold">{ct.numero_contrato}</td>
                              <td className="py-3 px-4 text-white">{ct.cliente_nome}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                                {formatCurrency(ct.valor_mensal)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <Badge
                                  className={
                                    ct.status_workflow === 'ATIVO' || ct.status_workflow === 'ACTIVE'
                                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]'
                                      : 'bg-slate-500/20 text-slate-400 border-slate-500/30 text-[10px]'
                                  }
                                >
                                  {ct.status_workflow}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-slate-400">
                                {ct.data_inicio ? formatDate(ct.data_inicio) : '—'}
                              </td>
                              <td className="py-3 px-4 text-slate-400">{formatDateTime(ct.criado_em)}</td>
                            </tr>
                          ))}
                          {detalhe.contratos.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500">
                                Sem contratos registrados.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function InfoItem({
  icon,
  label,
  valor,
  mono,
  destaque,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  mono?: boolean;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2.5 rounded-xl border border-white/10 bg-slate-950/60 text-slate-400 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <span className="text-[11px] text-slate-400 block font-semibold">{label}</span>
        <strong className={`text-sm text-white block truncate ${mono ? 'font-mono' : ''} ${destaque ? 'text-emerald-400 font-mono' : ''}`}>
          {valor}
        </strong>
      </div>
    </div>
  );
}

function MiniKpi({
  label,
  valor,
  sub,
  cor,
}: {
  label: string;
  valor: string;
  sub?: string;
  cor: string;
}) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardContent className="p-3.5">
        <span className="text-slate-400 text-[11px] block font-semibold">{label}</span>
        <strong className="font-extrabold text-white text-lg block truncate">{valor}</strong>
        {sub && <span className={`text-[10px] block font-mono truncate ${cor.split(' ')[0]}`}>{sub}</span>}
      </CardContent>
    </Card>
  );
}
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useRbac } from '@/hooks/useRbac';
import { usePermissoesRepresentantes } from '@/hooks/usePermissoesRepresentantes';
import {
  representantesGerenciaService,
  RepresentanteGerencia,
} from '@/services/representantesGerencia.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Users,
  Plus,
  Search,
  Eye,
  Pencil,
  BarChart3,
  Power,
  ShieldAlert,
  Loader2,
  ArrowRight,
  UserCheck,
  UserX,
} from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

export default function RepresentantesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isOwner } = useRbac();
  const permissoes = usePermissoesRepresentantes();

  const [representantes, setRepresentantes] = useState<RepresentanteGerencia[]>([]);
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [editando, setEditando] = useState<RepresentanteGerencia | null>(null);
  const [formEdicao, setFormEdicao] = useState({
    cpfCnpj: '',
    razaoSocial: '',
    comissaoPorcentagem: '10.00',
  });
  const [salvando, setSalvando] = useState(false);

  const [desativando, setDesativando] = useState<RepresentanteGerencia | null>(null);
  const [ativando, setAtivando] = useState<RepresentanteGerencia | null>(null);
  const [toggling, setToggling] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const lista = await representantesGerenciaService.listarRepresentantes({
        status: statusFiltro === 'todos' ? undefined : statusFiltro,
        busca: busca.trim() || undefined,
      });
      setRepresentantes(lista);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao carregar representantes.';
      if (/permiss|Acesso Negado|42501/i.test(msg)) {
        setErro('Você não possui permissão para visualizar os representantes.');
      } else {
        setErro(`Erro ao carregar representantes: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFiltro, busca]);

  useEffect(() => {
    if (permissoes.carregado && permissoes.podeVer) {
      carregar();
    } else if (permissoes.carregado) {
      setLoading(false);
      setErro('Você não possui permissão para visualizar os representantes.');
    }
  }, [permissoes.carregado, permissoes.podeVer, carregar]);

  const abrirEdicao = (rep: RepresentanteGerencia) => {
    setEditando(rep);
    setFormEdicao({
      cpfCnpj: rep.cpf_cnpj ?? '',
      razaoSocial: rep.razao_social ?? '',
      comissaoPorcentagem: String(rep.comissao_porcentagem ?? 10),
    });
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    setSalvando(true);
    const res = await representantesGerenciaService.editarRepresentante(editando.id, {
      cpfCnpj: formEdicao.cpfCnpj || undefined,
      razaoSocial: formEdicao.razaoSocial || undefined,
      comissaoPorcentagem: Number(formEdicao.comissaoPorcentagem),
    });
    setSalvando(false);
    if (!res.success) {
      toast({ title: 'Erro ao editar representante', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Representante atualizado', description: 'Dados comerciais salvos com sucesso.' });
    setEditando(null);
    carregar();
  };

  const confirmarDesativar = async () => {
    if (!desativando) return;
    setToggling(true);
    const res = await representantesGerenciaService.desativarRepresentante(desativando.id);
    setToggling(false);
    if (!res.success) {
      toast({ title: 'Erro ao desativar', description: res.error, variant: 'destructive' });
    } else {
      toast({ title: 'Representante desativado', description: `${desativando.nome} foi desativado.` });
    }
    setDesativando(null);
    carregar();
  };

  const confirmarAtivar = async () => {
    if (!ativando) return;
    setToggling(true);
    const res = await representantesGerenciaService.ativarRepresentante(ativando.id);
    setToggling(false);
    if (!res.success) {
      toast({ title: 'Erro ao ativar', description: res.error, variant: 'destructive' });
    } else {
      toast({ title: 'Representante ativado', description: `${ativando.nome} foi ativado.` });
    }
    setAtivando(null);
    carregar();
  };

  const semPermissao = permissoes.carregado && !permissoes.podeVer;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      {/* HEADER */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Representantes</h2>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 ml-2">GESTÃO COMERCIAL</Badge>
          </div>
          <p className="text-slate-300 text-xs">
            Carteira, propostas, contratos, receita e desempenho dos representantes do seu tenant.
          </p>
        </div>
        {permissoes.podeVerDesempenho && (
          <Button
            onClick={() => navigate('/workspace/representantes/desempenho')}
            className="bg-slate-800/80 text-slate-200 border border-white/10 text-xs gap-1.5 rounded-xl hover:bg-slate-700/80"
          >
            <BarChart3 className="h-4 w-4" /> Ver Desempenho
          </Button>
        )}
        <Button
          onClick={() => navigate('/workspace/usuarios')}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg text-xs gap-1.5 rounded-xl"
        >
          <Plus className="h-4 w-4" /> Novo Representante
        </Button>
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
              Solicite a permissão <code className="font-mono">representantes.view</code> ao OWNER na Central de Acessos.
            </p>
          </CardContent>
        </Card>
      )}

      {!semPermissao && !permissoes.carregado && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!semPermissao && permissoes.carregado && (
        <>
          {/* FILTROS */}
          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && carregar()}
                  placeholder="Pesquisar por nome, e-mail, CNPJ..."
                  className="pl-10 bg-slate-950/60 border-white/10 text-white rounded-xl h-10 text-sm"
                />
              </div>
              <div className="w-full sm:w-48">
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger className="bg-slate-950/60 border-white/10 text-white rounded-xl h-10 text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-white/10 text-white">
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="ATIVO">Ativos</SelectItem>
                    <SelectItem value="INATIVO">Inativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={carregar}
                className="border-white/10 text-slate-300 rounded-xl h-10 text-xs"
              >
                Filtrar
              </Button>
            </CardContent>
          </Card>

          {/* ERRO */}
          {erro && !loading && (
            <Card className="border border-red-500/30 bg-red-500/5 rounded-2xl">
              <CardContent className="p-6 flex items-center gap-3">
                <ShieldAlert className="h-6 w-6 text-red-400 flex-shrink-0" />
                <p className="text-red-300 text-sm">{erro}</p>
              </CardContent>
            </Card>
          )}

          {/* LOADING */}
          {loading && (
            <div className="flex items-center justify-center min-h-[40vh]">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {/* LISTA */}
          {!loading && !erro && (
            <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
                <CardTitle className="text-base font-bold text-white flex items-center justify-between">
                  <span>Representantes do Tenant</span>
                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
                    {representantes.length} registros
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 p-0">
                {representantes.length === 0 ? (
                  <div className="p-10 text-center">
                    <Users className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">Nenhum representante encontrado.</p>
                    <p className="text-slate-500 text-xs mt-1">
                      Cadastre representantes pela Central de Acessos (Novo Acesso → perfil Representante).
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Representante</th>
                          <th className="py-3 px-4 text-center">Clientes</th>
                          <th className="py-3 px-4 text-center">Propostas</th>
                          <th className="py-3 px-4 text-center">Contratos</th>
                          <th className="py-3 px-4 text-right">Receita Mensal</th>
                          <th className="py-3 px-4 text-center">Meta</th>
                          <th className="py-3 px-4 text-center">Status</th>
                          <th className="py-3 px-4 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-200">
                        {representantes.map((rep) => {
                          const percentualMeta =
                            rep.meta_mensal > 0
                              ? Number(((rep.meta_realizado / rep.meta_mensal) * 100).toFixed(0))
                              : 0;
                          return (
                            <tr key={rep.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-xs font-bold">
                                    {rep.nome.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-white">{rep.nome}</p>
                                    <p className="text-[11px] text-slate-400 font-mono">{rep.email}</p>
                                    {rep.razao_social && (
                                      <p className="text-[11px] text-slate-500">{rep.razao_social}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-slate-300">
                                {rep.total_clientes}
                                {rep.clientes_ativos > 0 && (
                                  <span className="text-[10px] text-emerald-400 block">({rep.clientes_ativos} ativos)</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-slate-300">{rep.total_propostas}</td>
                              <td className="py-3 px-4 text-center font-mono text-slate-300">{rep.total_contratos}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                                {formatCurrency(rep.receita_mensal)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {rep.meta_mensal > 0 ? (
                                  <span className="font-mono text-purple-400">
                                    {percentualMeta}%
                                    <span className="text-[10px] text-slate-500 block">
                                      {formatCurrency(rep.meta_realizado)} / {formatCurrency(rep.meta_mensal)}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {rep.ativo ? (
                                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                                    <UserCheck className="h-3 w-3 mr-1" /> Ativo
                                  </Badge>
                                ) : (
                                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                                    <UserX className="h-3 w-3 mr-1" /> Inativo
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-slate-300 hover:text-white"
                                    title="Visualizar perfil"
                                    onClick={() => navigate(`/workspace/representantes/${rep.id}`)}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  {permissoes.podeEditar && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-amber-400 hover:text-white"
                                      title="Editar dados comerciais"
                                      onClick={() => abrirEdicao(rep)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {permissoes.podeVerDesempenho && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-purple-400 hover:text-white"
                                      title="Ver desempenho"
                                      onClick={() => navigate(`/workspace/representantes/${rep.id}?aba=desempenho`)}
                                    >
                                      <BarChart3 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {rep.ativo && permissoes.podeDesativar && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-red-400 hover:text-white"
                                      title="Desativar"
                                      onClick={() => setDesativando(rep)}
                                    >
                                      <Power className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {!rep.ativo && permissoes.podeAtivar && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-emerald-400 hover:text-white"
                                      title="Ativar"
                                      onClick={() => setAtivando(rep)}
                                    >
                                      <Power className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* DICA DE NAVEGAÇÃO */}
          {!loading && !erro && (
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-purple-400 text-xs gap-1"
                onClick={() => navigate('/workspace/representantes/desempenho')}
              >
                Abrir painel de Desempenho <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* DIALOG EDITAR */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="bg-slate-950 border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Representante</DialogTitle>
            <DialogDescription className="text-slate-400">
              Dados comerciais de {editando?.nome ?? ''}. A alteração é auditada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">CPF / CNPJ</Label>
              <Input
                value={formEdicao.cpfCnpj}
                onChange={(e) => setFormEdicao({ ...formEdicao, cpfCnpj: e.target.value })}
                placeholder="CPF ou CNPJ"
                className="bg-slate-900 border-white/10 text-white rounded-xl h-10 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Razão social / Empresa</Label>
              <Input
                value={formEdicao.razaoSocial}
                onChange={(e) => setFormEdicao({ ...formEdicao, razaoSocial: e.target.value })}
                placeholder="Razão social"
                className="bg-slate-900 border-white/10 text-white rounded-xl h-10 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Comissão (%)</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={formEdicao.comissaoPorcentagem}
                onChange={(e) => setFormEdicao({ ...formEdicao, comissaoPorcentagem: e.target.value })}
                className="bg-slate-900 border-white/10 text-white rounded-xl h-10 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10 text-slate-300 rounded-xl text-xs"
              onClick={() => setEditando(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={salvarEdicao}
              disabled={salvando}
              className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs gap-1.5"
            >
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAR DESATIVAR */}
      <AlertDialog open={!!desativando} onOpenChange={(o) => !o && setDesativando(null)}>
        <AlertDialogContent className="bg-slate-950 border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar representante?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {desativando?.nome} perderá o status ativo no módulo comercial. A operação é auditada e pode ser
              revertida a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-900 border-white/10 text-slate-300 rounded-xl text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarDesativar}
              disabled={toggling}
              className="bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs"
            >
              {toggling && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRMAR ATIVAR */}
      <AlertDialog open={!!ativando} onOpenChange={(o) => !o && setAtivando(null)}>
        <AlertDialogContent className="bg-slate-950 border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar representante?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {ativando?.nome} voltará a ter status ativo no módulo comercial. A operação é auditada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-900 border-white/10 text-slate-300 rounded-xl text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarAtivar}
              disabled={toggling}
              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs"
            >
              {toggling && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Ativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
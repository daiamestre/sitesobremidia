import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRbac } from '@/hooks/useRbac';
import {
  corporateUsersService,
  PERMISSOES_DISPONIVEIS,
  type DashboardCentral,
  type PerfilCorporativo,
  type UsuarioCentral,
} from '@/services/corporateUsers.service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, UserPlus, Users, ShieldCheck, Mail, Phone, RefreshCw, CheckCircle2, XCircle, Ban,
  UserCheck, KeyRound, Crown, ArrowLeft, ArrowRight, Send, Search, LayoutDashboard, KeySquare, Clock, MailWarning,
  UserCog,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMATO_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function UsuariosAcessosPage() {
  const { usuario, perfilNome } = useAuth();
  const navigate = useNavigate();

  const [usuarios, setUsuarios] = useState<UsuarioCentral[]>([]);
  const [perfis, setPerfis] = useState<PerfilCorporativo[]>([]);
  const [dashboard, setDashboard] = useState<DashboardCentral | null>(null);
  const [minhasPermissoes, setMinhasPermissoes] = useState<string[] | null>(null);
  const [permissoesPorUsuario, setPermissoesPorUsuario] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState('');
  const [wizardAberto, setWizardAberto] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [criadoEmail, setCriadoEmail] = useState<string | null>(null);
  // Senha inicial gerada no backend — exibida UMA única vez (missão §5/§6)
  const [senhaInicial, setSenhaInicial] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<UsuarioCentral | null>(null);
  const [trocandoStatus, setTrocandoStatus] = useState(false);
  const [editTarget, setEditTarget] = useState<UsuarioCentral | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', telefone: '', perfilId: '' });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [autonomiaTarget, setAutonomiaTarget] = useState<UsuarioCentral | null>(null);
  const [autonomiaSelecao, setAutonomiaSelecao] = useState<Set<string>>(new Set());
  const [enviandoAutonomia, setEnviandoAutonomia] = useState(false);

  const [form, setForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    perfilId: '',
  });

  const isOwner = usuario?.is_owner === true || perfilNome === 'OWNER';

  const podeVerCentral = useMemo(
    () => isOwner || (minhasPermissoes ?? []).includes('users.view'),
    [isOwner, minhasPermissoes]
  );

  const podeGerenciarAutonomia = useMemo(
    () => isOwner || (minhasPermissoes ?? []).includes('users.manage_permissions'),
    [isOwner, minhasPermissoes]
  );

  const podeEditar = useMemo(
    () => isOwner || (minhasPermissoes ?? []).includes('users.edit'),
    [isOwner, minhasPermissoes]
  );

  const carregar = useCallback(async (mostrarLoading = true) => {
    if (mostrarLoading) setLoading(true);
    setBuscando(true);
    const [users, perfisLista, dash, permsTenant] = await Promise.all([
      corporateUsersService.listarUsuariosCentral(),
      corporateUsersService.listarPerfis(),
      corporateUsersService.getDashboard(),
      corporateUsersService.listarPermissoesTenant(),
    ]);
    setUsuarios(users);
    setPerfis(perfisLista);
    setDashboard(dash);
    setPermissoesPorUsuario(permsTenant);
    setLoading(false);
    setBuscando(false);
  }, []);

  useEffect(() => {
    let ativo = true;
    corporateUsersService
      .getMyPermissions()
      .then((minhas) => {
        if (ativo) setMinhasPermissoes(minhas);
      })
      .catch(() => {
        if (ativo) setMinhasPermissoes([]);
      });
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    // A decisão de acesso aguarda a carga das permissões (sem users.view o ADMIN
    // perde a Central — delegação de autonomia); OWNER sempre tem acesso.
    if (minhasPermissoes === null) return;
    if (!podeVerCentral) {
      navigate('/workspace/corporate', { replace: true });
      return;
    }
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeVerCentral, minhasPermissoes]);

  const usuariosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(
      (u) =>
        u.nome.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.perfil_nome ?? '').toLowerCase().includes(q)
    );
  }, [usuarios, busca]);

  // Perfis que o chamador pode atribuir: ADMIN exige users.create_admin (exceto OWNER)
  const perfisPermitidos = useMemo(() => {
    const podeCriarAdmin = isOwner || (minhasPermissoes ?? []).includes('users.create_admin');
    return perfis.filter((p) => {
      if (p.nome.toUpperCase() === 'OWNER') return false;
      if (p.nome.toUpperCase() === 'ADMIN') return podeCriarAdmin;
      return true;
    });
  }, [perfis, isOwner, minhasPermissoes]);

  const abrirWizard = () => {
    setForm({ nome: '', email: '', telefone: '', perfilId: perfisPermitidos[0]?.id ?? '' });
    setEtapa(0);
    setCriadoEmail(null);
    setWizardAberto(true);
  };

  const validarEtapa = (): string | null => {
    if (etapa === 0) {
      if (form.nome.trim().length < 3) return 'Informe o nome completo do usuário.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Informe um e-mail válido.';
    }
    if (etapa === 1) {
      if (!form.perfilId) return 'Selecione o perfil de acesso.';
    }
    return null;
  };

  const avancar = () => {
    const erro = validarEtapa();
    if (erro) {
      toast.error(erro);
      return;
    }
    setEtapa((e) => Math.min(e + 1, 2));
  };

  const enviarCriacao = async () => {
    const erro = validarEtapa();
    if (erro) {
      toast.error(erro);
      return;
    }
    setEnviando(true);
    const resultado = await corporateUsersService.criarUsuario({
      nome: form.nome.trim(),
      email: form.email.trim(),
      telefone: form.telefone.trim() || undefined,
      perfilId: form.perfilId,
    });
    setEnviando(false);

    if (resultado.success) {
      setCriadoEmail(form.email.trim());
      setSenhaInicial(resultado.senha_inicial ?? null);
      setEtapa(3);
      await carregar(false);
      toast.success(
        resultado.requer_aprovacao
          ? 'Usuário criado — AGUARDANDO APROVAÇÃO do OWNER na Central de Comunicação.'
          : 'Usuário provisionado com acesso imediato!'
      );
    } else {
      toast.error(resultado.error ?? 'Erro ao criar usuário');
      if (resultado.error === 'EMAIL_JA_CADASTRADO') {
        setEtapa(0);
      }
    }
  };

  const confirmarStatus = async (alvo: UsuarioCentral) => {
    setTrocandoStatus(true);
    const novoAtivo = !alvo.ativo;
    const resultado = await corporateUsersService.atualizarStatusUsuario(alvo.id, novoAtivo);
    setTrocandoStatus(false);
    setStatusTarget(null);

    if (resultado.success) {
      toast.success(novoAtivo ? 'Usuário reativado' : 'Usuário desativado');
      await carregar(false);
    } else {
      toast.error(resultado.error ?? 'Erro ao atualizar status');
    }
  };

  const abrirAutonomia = (alvo: UsuarioCentral) => {
    setAutonomiaTarget(alvo);
    setAutonomiaSelecao(new Set(permissoesPorUsuario[alvo.id] ?? []));
  };

  const abrirEdicao = (alvo: UsuarioCentral) => {
    const perfilAtual = perfis.find((p) => p.nome.toUpperCase() === (alvo.perfil_nome ?? '').toUpperCase());
    setEditForm({
      nome: alvo.nome,
      telefone: alvo.telefone ?? '',
      perfilId: perfilAtual?.id ?? '',
    });
    setEditTarget(alvo);
  };

  const salvarEdicao = async () => {
    if (!editTarget) return;
    if (editForm.nome.trim().length < 3) {
      toast.error('Informe o nome completo do usuário.');
      return;
    }
    setSalvandoEdicao(true);
    const resultado = await corporateUsersService.atualizarUsuario(editTarget.id, {
      nome: editForm.nome.trim(),
      telefone: editForm.telefone.trim() || null,
      perfilId: editForm.perfilId || null,
    });
    setSalvandoEdicao(false);

    if (resultado.success) {
      toast.success('Usuário atualizado com sucesso');
      setEditTarget(null);
      await carregar(false);
    } else {
      toast.error(resultado.error ?? 'Erro ao atualizar usuário');
    }
  };

  const salvarAutonomia = async () => {
    if (!autonomiaTarget) return;
    setEnviandoAutonomia(true);
    const atuais = new Set(permissoesPorUsuario[autonomiaTarget.id] ?? []);
    const conceder = [...autonomiaSelecao].filter((p) => !atuais.has(p));
    const revogar = [...atuais].filter((p) => !autonomiaSelecao.has(p));

    const resultados: string[] = [];
    if (conceder.length > 0) {
      const r = await corporateUsersService.gerenciarAutonomia(autonomiaTarget.id, conceder, true);
      if (!r.success) resultados.push(r.error ?? 'Erro ao conceder');
    }
    if (revogar.length > 0) {
      const r = await corporateUsersService.gerenciarAutonomia(autonomiaTarget.id, revogar, false);
      if (!r.success) resultados.push(r.error ?? 'Erro ao revogar');
    }
    setEnviandoAutonomia(false);

    if (resultados.length === 0) {
      toast.success('Autonomia atualizada com sucesso');
      setAutonomiaTarget(null);
      await carregar(false);
    } else {
      toast.error(resultados[0]);
    }
  };

  const perfilDoForm = perfisPermitidos.find((p) => p.id === form.perfilId);

  // Permissões que o ADMIN delegado pode conceder: apenas as que ele possui
  const autonomiaEditavel = useMemo(() => {
    if (!autonomiaTarget) return [];
    if (isOwner) return PERMISSOES_DISPONIVEIS.map((p) => p.codigo);
    return minhasPermissoes;
  }, [autonomiaTarget, isOwner, minhasPermissoes]);

  const podeAlternarAutonomiaItem = (codigo: string) =>
    isOwner || autonomiaEditavel.includes(codigo);

  const perfilDoUsuario = (u: UsuarioCentral) => (u.is_owner ? 'OWNER' : u.perfil_nome ?? '—');

  if (loading) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!podeVerCentral) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <ShieldCheck className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">Acesso restrito</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Somente OWNER e ADMIN com a permissão users.view podem acessar a Central de Acessos.
          </p>
        </CardContent>
      </Card>
    );
  }

  const dashCards = [
    { label: 'Total de usuários', valor: dashboard?.total ?? 0, icon: Users, cor: 'text-primary bg-primary/10' },
    { label: 'Ativos', valor: dashboard?.ativos ?? 0, icon: UserCheck, cor: 'text-emerald-600 bg-emerald-50' },
    { label: 'Inativos', valor: dashboard?.inativos ?? 0, icon: Ban, cor: 'text-rose-600 bg-rose-50' },
    { label: 'Convites pendentes', valor: dashboard?.pendentes ?? 0, icon: MailWarning, cor: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Central de Acessos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão corporativa de usuários e acessos: perfis, permissões granulares, autonomia delegada e status das contas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => carregar(false)} disabled={buscando}>
            <RefreshCw className={cn('h-4 w-4 mr-2', buscando && 'animate-spin')} /> Atualizar
          </Button>
          <Button size="sm" onClick={abrirWizard}>
            <UserPlus className="h-4 w-4 mr-2" /> Novo Usuário
          </Button>
        </div>
      </div>

      {/* Dashboard com indicadores reais do tenant */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {dashCards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0', c.cor)}>
                <c.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold leading-none">{c.valor}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Distribuição por perfil */}
      {dashboard && dashboard.por_perfil.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-primary" /> Distribuição por perfil
            </CardTitle>
            <CardDescription>Indicadores reais do banco (contagem direta na tabela usuarios)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {dashboard.por_perfil.map((p) => (
                <div key={p.perfil} className="rounded-lg border px-4 py-2 text-sm flex items-center gap-3">
                  <Badge variant="secondary">{p.perfil}</Badge>
                  <span>
                    <strong>{p.total}</strong> total · <strong className="text-emerald-600">{p.ativos}</strong> ativos
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Usuários do Tenant ({usuarios.length})
          </CardTitle>
          <CardDescription>
            Dados reais do banco (usuarios + auth.users) — isolamento por tenant aplicado via RLS
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail ou perfil..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

          {usuariosFiltrados.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              Nenhum usuário encontrado. Clique em "Novo Usuário" para criar o primeiro acesso corporativo.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Usuário</th>
                    <th className="text-left px-4 py-3 font-semibold">Perfil</th>
                    <th className="text-left px-4 py-3 font-semibold">Permissões</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Último acesso</th>
                    <th className="text-right px-4 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usuariosFiltrados.map((u) => {
                    const perms = permissoesPorUsuario[u.id] ?? [];
                    return (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {u.nome.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium flex items-center gap-1.5">
                                {u.nome}
                                {u.is_owner && (
                                  <Crown className="h-3.5 w-3.5 text-amber-500" title="Proprietário do sistema" />
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {u.email}
                              </p>
                              {u.telefone && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" /> {u.telefone}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={u.is_owner ? 'default' : 'secondary'}>{perfilDoUsuario(u)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {u.is_owner ? (
                            <span className="text-xs text-amber-600 font-medium">Todas (OWNER)</span>
                          ) : perms.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Sem permissões delegadas</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-[260px]">
                              {perms.map((p) => (
                                <Badge key={p} variant="outline" className="text-[10px] px-1.5 py-0">
                                  {p}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                'w-fit',
                                u.ativo
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              )}
                            >
                              {u.ativo ? 'Ativo' : 'Inativo'}
                            </Badge>
                            {u.convite_pendente && u.ativo && (
                              <Badge variant="outline" className="w-fit text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                <MailWarning className="h-3 w-3 mr-1" /> Convite pendente
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {u.ultimo_acesso ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {FORMATO_DATA_HORA.format(new Date(u.ultimo_acesso))}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">Nunca acessou</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {!u.is_owner && (
                            <>
                              {podeEditar && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-primary hover:text-primary"
                                  onClick={() => abrirEdicao(u)}
                                >
                                  <UserCog className="h-3.5 w-3.5 mr-1.5" /> Editar
                                </Button>
                              )}
                              {perfilDoUsuario(u).toUpperCase() === 'ADMIN' && podeGerenciarAutonomia && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-primary hover:text-primary"
                                  onClick={() => abrirAutonomia(u)}
                                >
                                  <KeySquare className="h-3.5 w-3.5 mr-1.5" /> Autonomia
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn(u.ativo ? 'text-rose-600 hover:text-rose-700' : 'text-emerald-600 hover:text-emerald-700')}
                                onClick={() => setStatusTarget(u)}
                              >
                                {u.ativo ? (
                                  <>
                                    <Ban className="h-3.5 w-3.5 mr-1.5" /> Desativar
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="h-3.5 w-3.5 mr-1.5" /> Reativar
                                  </>
                                )}
                              </Button>
                            </>
                          )}
                          {u.is_owner && <span className="text-xs text-muted-foreground">Protegido</span>}
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

      {/* WIZARD: criação de usuário (máx. 4 etapas) */}
      <AlertDialog open={wizardAberto} onOpenChange={(open) => !open && !enviando && setWizardAberto(false)}>
        <AlertDialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Novo Usuário Corporativo
            </AlertDialogTitle>
            <AlertDialogDescription>
              O sistema gera automaticamente uma senha inicial forte — o novo usuário será obrigado a trocá-la no primeiro login.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {etapa < 3 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {['Dados Pessoais', 'Acesso Corporativo', 'Revisão'].map((label, i) => (
                <div key={label} className="flex items-center gap-1">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full border',
                      i === etapa
                        ? 'bg-primary text-white border-primary font-semibold'
                        : i < etapa
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-background border-border'
                    )}
                  >
                    {i + 1}. {label}
                  </span>
                  {i < 2 && <span className="text-muted-foreground/50">→</span>}
                </div>
              ))}
            </div>
          )}

          {etapa === 0 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="wz-nome">Nome completo *</Label>
                <Input
                  id="wz-nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex.: João da Silva"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wz-email">E-mail de acesso *</Label>
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="wz-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Ex.: joao@sobremidia.com.br"
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Qualquer e-mail válido é aceito (Gmail, Outlook, corporativo). A senha inicial será gerada automaticamente pelo sistema.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wz-telefone">Telefone (opcional)</Label>
                <div className="relative">
                  <Phone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="wz-telefone"
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                    placeholder="(11) 99999-9999"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          )}

          {etapa === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Perfil de acesso *</Label>
                <div className="grid gap-2">
                  {perfisPermitidos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setForm({ ...form, perfilId: p.id })}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                        form.perfilId === p.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <div
                        className={cn(
                          'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          form.perfilId === p.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {p.nome.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{p.nome}</p>
                        {p.descricao && (
                          <p className="text-xs text-muted-foreground truncate">{p.descricao}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {perfisPermitidos.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum perfil disponível para a sua autoridade.</p>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" />
                A conta OWNER é protegida e não pode ser alterada ou excluída.
              </div>
            </div>
          )}

          {etapa === 2 && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <p className="font-semibold text-base">{form.nome.trim()}</p>
                <p className="text-muted-foreground flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" /> {form.email.trim()}
                </p>
                {form.telefone.trim() && (
                  <p className="text-muted-foreground flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" /> {form.telefone.trim()}
                  </p>
                )}
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Perfil de acesso</span>
                  <Badge>{perfilDoForm?.nome ?? '—'}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Credencial</span>
                  <Badge variant="outline">Senha inicial automática + troca obrigatória</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Ao confirmar, o usuário será criado com acesso imediato (senha inicial automática
                e troca obrigatória no primeiro login), registrado no tenant atual com auditoria e
                notificado na Central de Comunicação.
              </p>
            </div>
          )}

          {etapa === 3 && (
            <div className="space-y-3 py-2">
              <div className="flex flex-col items-center text-center gap-3 py-2">
                <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <p className="font-semibold">Usuário provisionado com sucesso</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Acesso criado para <strong>{criadoEmail}</strong> com senha inicial automática.
                    O usuário trocará a senha no primeiro login.
                  </p>
                </div>
              </div>

              {senhaInicial ? (
                <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Senha inicial — exibida apenas agora
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-sm select-all border">
                      {senhaInicial}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(senhaInicial);
                          toast.success('Senha copiada.');
                        } catch {
                          toast.error('Não foi possível copiar.');
                        }
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Guarde em local seguro e entregue ao usuário por canal confiável.
                    Esta credencial não será exibida novamente pelo sistema.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  A senha inicial não pôde ser exibida. Use a Central para redefinir o acesso se necessário.
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            {etapa < 3 && (
              <>
                {etapa > 0 && (
                  <Button variant="outline" onClick={() => setEtapa((e) => e - 1)} disabled={enviando}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                  </Button>
                )}
                {etapa < 2 && (
                  <Button onClick={avancar}>
                    Avançar <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                )}
                {etapa === 2 && (
                  <Button onClick={enviarCriacao} disabled={enviando}>
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
                    {enviando ? 'Provisionando usuário...' : 'Criar usuário e gerar senha inicial'}
                  </Button>
                )}
              </>
            )}
            {etapa === 3 && (
              <Button onClick={() => setWizardAberto(false)}>Concluir</Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de desativação/reativação */}
      <AlertDialog open={!!statusTarget} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {statusTarget?.ativo ? (
                <>
                  <XCircle className="h-5 w-5 text-rose-500" /> Desativar usuário
                </>
              ) : (
                <>
                  <UserCheck className="h-5 w-5 text-emerald-500" /> Reativar usuário
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.ativo
                ? `O acesso de "${statusTarget?.nome}" será desativado. Ele não conseguirá entrar no sistema até ser reativado.`
                : `O acesso de "${statusTarget?.nome}" será reativado, permitindo login no sistema.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)} disabled={trocandoStatus}>
              Cancelar
            </Button>
            <Button
              variant={statusTarget?.ativo ? 'destructive' : 'default'}
              onClick={() => statusTarget && confirmarStatus(statusTarget)}
              disabled={trocandoStatus}
            >
              {trocandoStatus && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {statusTarget?.ativo ? 'Desativar' : 'Reativar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Editar usuário corporativo (nome, telefone, perfil) */}
      <AlertDialog open={!!editTarget} onOpenChange={(open) => !open && !salvandoEdicao && setEditTarget(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" /> Editar Usuário
            </AlertDialogTitle>
            <AlertDialogDescription>
              Atualize os dados cadastrais de <strong>{editTarget?.nome}</strong>. Alterações são validadas e auditadas no servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ed-nome">Nome completo *</Label>
              <Input
                id="ed-nome"
                value={editForm.nome}
                onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                placeholder="Ex.: João da Silva"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-telefone">Telefone (opcional)</Label>
              <div className="relative">
                <Phone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="ed-telefone"
                  value={editForm.telefone}
                  onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })}
                  placeholder="(11) 99999-9999"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-perfil">Perfil de acesso</Label>
              <select
                id="ed-perfil"
                value={editForm.perfilId}
                onChange={(e) => setEditForm({ ...editForm, perfilId: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Manter perfil atual</option>
                {perfisPermitidos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                A conta OWNER é protegida; atribuir ADMIN exige users.create_admin.
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={salvandoEdicao}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={salvandoEdicao}>
              {salvandoEdicao && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Salvar alterações
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gerenciar Autonomia (delegação de permissões para ADMIN) */}
      <AlertDialog open={!!autonomiaTarget} onOpenChange={(open) => !open && !enviandoAutonomia && setAutonomiaTarget(null)}>
        <AlertDialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeySquare className="h-5 w-5 text-primary" /> Gerenciar Autonomia
            </AlertDialogTitle>
            <AlertDialogDescription>
              Delegue permissões administrativas para{' '}
              <strong>{autonomiaTarget?.nome}</strong> (ADMIN). A autorização é validada no banco:
              um administrador só pode conceder permissões que ele próprio possui.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            {PERMISSOES_DISPONIVEIS.map((p) => {
              const editavel = podeAlternarAutonomiaItem(p.codigo);
              const marcado = autonomiaSelecao.has(p.codigo);
              return (
                <label
                  key={p.codigo}
                  className={cn(
                    'flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer',
                    marcado ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                    !editavel && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  <Checkbox
                    checked={marcado}
                    disabled={!editavel}
                    onCheckedChange={(v) => {
                      const nova = new Set(autonomiaSelecao);
                      if (v) nova.add(p.codigo);
                      else nova.delete(p.codigo);
                      setAutonomiaSelecao(nova);
                    }}
                  />
                  <div>
                    <p className="font-medium text-sm">{p.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.codigo}</p>
                  </div>
                </label>
              );
            })}
            {!isOwner && (
              <p className="text-xs text-muted-foreground">
                Você pode conceder apenas permissões que já possui (princípio do menor privilégio).
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setAutonomiaTarget(null)} disabled={enviandoAutonomia}>
              Cancelar
            </Button>
            <Button onClick={salvarAutonomia} disabled={enviandoAutonomia}>
              {enviandoAutonomia && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Salvar autonomia
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
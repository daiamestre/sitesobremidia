import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { resolverPortalSolicitado, podeAcessarPortal, rotuloPortal } from '@/lib/portalAccess';
import { accessRequestService } from '@/services/accessRequest.service';
import { useCentral, useConversas } from '@/hooks/useCentral';
import { biService } from '@/services/bi.service';
import { centralService } from '@/services/central.service';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Bell,
  AlertTriangle,
  FileText,
  CheckCircle2,
  XCircle,
  BarChart3,
  Inbox,
  UserPlus,
  Building2,
  DollarSign,
  Target,
  TrendingUp,
  Clock,
  Eye,
  ExternalLink,
  ArrowUpRight,
  X,
  RefreshCw,
  MoreHorizontal,
  MessageSquare,
  CheckCircle,
  XCircle as XCircleIcon,
  Shield,
  Activity,
  Users,
  FileQuestion,
  Send,
  Plus,
  ChevronRight,
  Mail,
  KeyRound,
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { Notificacao, Solicitacao, ConversaComMeta, PrioridadeNotificacao } from '@/services/central.service';

const PRIORITY_COLORS: Record<string, string> = {
  CRITICO: 'bg-red-100 text-red-700 border-red-200',
  IMPORTANTE: 'bg-orange-100 text-orange-700 border-orange-200',
  ATENCAO: 'bg-amber-100 text-amber-700 border-amber-200',
  SUCESSO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  INFORMATIVO: 'bg-blue-100 text-blue-700 border-blue-200',
};

const PRIORITY_ICON_COLORS: Record<string, string> = {
  CRITICO: 'text-red-500',
  IMPORTANTE: 'text-orange-500',
  ATENCAO: 'text-amber-500',
  SUCESSO: 'text-emerald-500',
  INFORMATIVO: 'text-blue-500',
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICO: 'bg-red-100 text-red-700 border-red-200',
  ALERTA: 'bg-orange-100 text-orange-700 border-orange-200',
  AVISO: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  INFO: 'bg-blue-100 text-blue-700 border-blue-200',
};

const STATUS_NOTIF_COLORS: Record<string, string> = {
  NAO_LIDA: 'bg-blue-100 text-blue-700 border-blue-200',
  LIDA: 'bg-green-100 text-green-700 border-green-200',
  RESOLVIDA: 'bg-purple-100 text-purple-700 border-purple-200',
};

const SOLICITACAO_STATUS_COLORS: Record<string, string> = {
  PENDENTE: 'bg-amber-100 text-amber-700 border-amber-200',
  APROVADA: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJEITADA: 'bg-rose-100 text-rose-700 border-rose-200',
  CANCELADA: 'bg-gray-100 text-gray-700 border-gray-200',
  EXPIRADA: 'bg-gray-100 text-gray-700 border-gray-200',
};

const TIPO_SOLICITACAO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  NOVO_REPRESENTANTE: UserPlus,
  NOVO_CLIENTE: Building2,
  APROVACAO_CADASTRO: Shield,
  APROVACAO_PROPOSTA: FileText,
  APROVACAO_CAMPANHA: Target,
  APROVACAO_CONTEUDO: FileQuestion,
  SOLICITACAO_FINANCEIRA: DollarSign,
  OUTRO: Activity,
};

const TIPO_SOLICITACAO_LABELS: Record<string, string> = {
  NOVO_REPRESENTANTE: 'Novo Representante',
  NOVO_CLIENTE: 'Novo Cliente',
  APROVACAO_CADASTRO: 'Aprovação de Cadastro',
  APROVACAO_PROPOSTA: 'Aprovação de Proposta',
  APROVACAO_CAMPANHA: 'Aprovação de Campanha',
  APROVACAO_CONTEUDO: 'Aprovação de Conteúdo',
  SOLICITACAO_FINANCEIRA: 'Solicitação Financeira',
  OUTRO: 'Outro',
};

type NotificationWithActions = Notificacao & {
  canResolve: boolean;
  canNavigate: boolean;
};

type SolicitacaoWithDetails = Solicitacao & {
  canApprove: boolean;
  canReject: boolean;
};

export const CentralDashboard = () => {
  const { usuario, perfilNome, empresaOperadoraId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    feed,
    isLoading,
    refetch,
    marcarLida,
    resolver,
    marcarTodasLidas,
    aprovarSolicitacao,
    rejeitarSolicitacao,
    criarConversa,
    enviarMensagem,
    marcarConversaLida,
    isEnviandoMensagem,
    isCriandoConversa,
  } = useCentral();

  const [activeTab, setActiveTab] = useState<'inbox' | 'solicitacoes' | 'chat' | 'feed' | 'inteligencia'>('inbox');
  const [portalNegado, setPortalNegado] = useState<{portal:'ANUNCIANTES'|'REPRESENTANTES'|'GESTOR'|'CORPORATIVO';meuPortal:string}|null>(null);
  const [searchParams] = useSearchParams();
  const [selectedNotification, setSelectedNotification] = useState<NotificationWithActions | null>(null);
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<SolicitacaoWithDetails | null>(null);
  const [filterPrioridade, setFilterPrioridade] = useState<string>('TODAS');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');

  // Chat state
  const [conversaAbertaId, setConversaAbertaId] = useState<string | null>(null);
  const [mensagemTexto, setMensagemTexto] = useState('');
  const [dialogNovaConversa, setDialogNovaConversa] = useState(false);
  const [novaConversaTipo, setNovaConversaTipo] = useState<'INDIVIDUAL' | 'GRUPO'>('INDIVIDUAL');
  const [novaConversaNome, setNovaConversaNome] = useState('');
  const [novaConversaParticipantes, setNovaConversaParticipantes] = useState<string[]>([]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const { data: biData, isLoading: biLoading } = useQuery({
    queryKey: ['central-bi', empresaOperadoraId],
    queryFn: () => biService.getExecutiveKPIs(empresaOperadoraId || undefined),
    enabled: !!empresaOperadoraId,
    refetchInterval: 60000,
  });

  const marcarLidaMutation = useMutation({
    mutationFn: (id: string) => centralService.marcarComoLida(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['central-feed'] });
      toast.success('Notificação marcada como lida');
    },
    onError: () => toast.error('Erro ao marcar notificação como lida'),
  });

  const resolverNotificacaoMutation = useMutation({
    mutationFn: (id: string) => centralService.resolverNotificacao(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['central-feed'] });
      toast.success('Notificação resolvida');
      setSelectedNotification(null);
    },
    onError: () => toast.error('Erro ao resolver notificação'),
  });

  const aprovarSolicitacaoMutation = useMutation({
    mutationFn: ({ id, responsavelId, motivo }: { id: string; responsavelId: string; motivo?: string }) =>
      centralService.aprovarSolicitacao(id, responsavelId, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['central-feed'] });
      toast.success('Solicitação aprovada com sucesso');
      setSelectedSolicitacao(null);
    },
    onError: () => toast.error('Erro ao aprovar solicitação'),
  });

  const rejeitarSolicitacaoMutation = useMutation({
    mutationFn: ({ id, responsavelId, motivo }: { id: string; responsavelId: string; motivo: string }) =>
      centralService.rejeitarSolicitacao(id, responsavelId, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['central-feed'] });
      toast.success('Solicitação rejeitada');
      setSelectedSolicitacao(null);
    },
    onError: () => toast.error('Erro ao rejeitar solicitação'),
  });

  const marcarTodasLidasMutation = useMutation({
    mutationFn: () => centralService.marcarTodasComoLidas(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['central-feed'] });
      toast.success('Todas as notificações marcadas como lidas');
    },
    onError: () => toast.error('Erro ao marcar todas como lidas'),
  });

  const { conversas, usuariosTenant, mensagens, loadingConversas } = useConversas(conversaAbertaId);

  useEffect(() => {
    if (conversaAbertaId) {
      marcarConversaLida(conversaAbertaId);
    }
  }, [conversaAbertaId, mensagens.length]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [mensagens.length, conversaAbertaId]);

  const handleNavigateToEntity = useCallback((tipo?: string, id?: string) => {
    if (!tipo || !id) return;

    const routes: Record<string, string> = {
      cliente: `/representantes/clientes/${id}`,
      contrato: `/representantes/contratos/${id}`,
      proposta: `/representantes/propostas/${id}`,
      campanha: `/representantes/campanhas/${id}`,
      pi: `/representantes/pi/${id}`,
      agendamento: `/representantes/agendamento/${id}`,
      insercao: `/representantes/pi/${id}`,
      tela: `/dashboard/screens/${id}`,
      playlist: `/dashboard/playlists/${id}`,
      financeiro: `/representantes/financeiro`,
      cobranca: `/representantes/financeiro/recebiveis`,
      comissao: `/representantes/financeiro/comissoes`,
      representante: `/representantes/dashboard`,
      solicitacao: `/admin/solicitacoes/${id}`,
      notificacao: `/dashboard/central`,
    };

    const route = routes[tipo.toLowerCase()];
    if (route) {
      navigate(route);
      setSelectedNotification(null);
    }
  }, [navigate]);

  const handleNotificationClick = useCallback((notification: NotificationWithActions) => {
    setSelectedNotification(notification);
    if (!notification.lida && notification.status_notificacao === 'NAO_LIDA') {
      marcarLida(notification.id);
    }
  }, [marcarLida]);

  const handleSolicitacaoClick = useCallback((solicitacao: SolicitacaoWithDetails) => {
    setSelectedSolicitacao(solicitacao);
  }, []);

  const filteredNotificacoes = feed?.notificacoes.filter((n) => {
    const matchesPrioridade = filterPrioridade === 'TODAS' || n.prioridade === filterPrioridade;
    const matchesStatus = filterStatus === 'TODOS' || n.status_notificacao === filterStatus;
    const matchesSearch = searchQuery === '' ||
      n.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.mensagem.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPrioridade && matchesStatus && matchesSearch;
  }) || [];

  const filteredSolicitacoes = feed?.solicitacoes.filter((s) => {
    const matchesStatus = filterStatus === 'TODOS' || s.status === filterStatus;
    const matchesSearch = searchQuery === '' ||
      s.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.descricao || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tipo_solicitacao.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  }) || [];

  const canManageSolicitacoes = perfilNome === 'OWNER' || perfilNome === 'ADMIN' || perfilNome === 'GESTOR' || perfilNome === 'GERENTE' || perfilNome === 'FINANCEIRO';
  const currentUserId = usuario?.id;

  // ============================================================
  // REDEFINIÇÕES DE SENHA (fluxo com autorização — Central)
  // PASSWORD_RESET_REQUEST → AUTORIZAR (emite credencial temporária
  // UMA vez via edge authorize-password-reset) | RECUSAR.
  // ============================================================
  interface SolicitacaoReset extends Solicitacao {
    credencial_emitida_em?: string | null;
  }
  const [credencialEmitida, setCredencialEmitida] = useState<{ email: string; nome?: string; senha: string } | null>(null);
  const [resetProcessandoId, setResetProcessandoId] = useState<string | null>(null);

  const { data: resetsSenha = [], refetch: refetchResets } = useQuery<SolicitacaoReset[]>({
    queryKey: ['central-resets-senha'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitacoes')
        .select('*')
        .eq('tipo_solicitacao', 'PASSWORD_RESET_REQUEST')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.error('[Central] resets senha:', error);
        return [];
      }
      return (data as SolicitacaoReset[]) ?? [];
    },
    staleTime: 10000,
    refetchInterval: 30000,
  });

  const autorizarReset = useCallback(async (sol: SolicitacaoReset) => {
    setResetProcessandoId(sol.id);
    try {
      const { error: rpcErr } = await supabase.rpc('decidir_reset_senha', {
        p_solicitacao_id: sol.id, p_aprovar: true, p_motivo: null,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')}/functions/v1/authorize-password-reset`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
          body: JSON.stringify({ solicitacao_id: sol.id }) },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.senha_temporaria) throw new Error(body?.error || `Falha na emissão (HTTP ${res.status})`);

      toast.success(`Redefinição AUTORIZADA para ${body.email_alvo}.`);
      setCredencialEmitida({ email: body.email_alvo, nome: body.nome_alvo, senha: body.senha_temporaria });
      refetchResets();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao autorizar redefinição.');
      refetchResets();
    } finally {
      setResetProcessandoId(null);
    }
  }, [refetchResets]);

  const recusarReset = useCallback(async (sol: SolicitacaoReset) => {
    const motivo = window.prompt('Motivo da recusa:') ?? '';
    if (!motivo.trim()) return;
    setResetProcessandoId(sol.id);
    try {
      const { error } = await supabase.rpc('decidir_reset_senha', {
        p_solicitacao_id: sol.id, p_aprovar: false, p_motivo: motivo.trim(),
      });
      if (error) throw new Error(error.message);
      toast.success('Solicitação RECUSADA. Nenhuma senha foi alterada.');
      refetchResets();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao recusar solicitação.');
    } finally {
      setResetProcessandoId(null);
    }
  }, [refetchResets]);

  const unifiedFeed = React.useMemo(() => {
    if (!feed) return [];
    const items = [
      ...feed.notificacoes.map((n) => ({
        id: n.id,
        type: 'notificacao' as const,
        title: n.titulo,
        description: n.mensagem,
        timestamp: n.created_at,
        priority: n.prioridade,
        severity: n.severidade,
        status: n.status_notificacao,
        entityType: n.entidade_relacionada_tipo,
        entityId: n.entidade_relacionada_id,
        route: n.rota_destino,
        read: n.lida,
      })),
      ...feed.solicitacoes.map((s) => ({
        id: s.id,
        type: 'solicitacao' as const,
        title: s.titulo,
        description: s.descricao || '',
        timestamp: s.created_at,
        priority: 'INFORMATIVO' as const,
        severity: s.status === 'PENDENTE' ? 'ALERTA' as const : 'INFO' as const,
        status: s.status,
        entityType: s.entidade_tipo,
        entityId: s.entidade_id,
        solicitacaoType: s.tipo_solicitacao,
      })),
    ];
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [feed]);

  const handleEnviarMensagem = () => {
    const texto = mensagemTexto.trim();
    if (!texto || !conversaAbertaId) return;
    enviarMensagem({ conversaId: conversaAbertaId, mensagem: texto });
    setMensagemTexto('');
  };

  const handleCriarConversa = () => {
    if (!empresaOperadoraId || novaConversaParticipantes.length === 0) {
      toast.error('Selecione ao menos um participante');
      return;
    }
    criarConversa({
      empresaId: empresaOperadoraId,
      tipo: novaConversaTipo,
      nome: novaConversaTipo === 'GRUPO' ? novaConversaNome.trim() || undefined : undefined,
      participanteIds: novaConversaParticipantes,
    });
    setDialogNovaConversa(false);
    setNovaConversaParticipantes([]);
    setNovaConversaNome('');
    setNovaConversaTipo('INDIVIDUAL');
  };

  const conversaAberta: ConversaComMeta | undefined = conversas.find((c) => c.id === conversaAbertaId);
  const nomeConversa = (c: ConversaComMeta): string => {
    if (c.tipo === 'GRUPO') return c.nome || 'Grupo';
    const outros = (c.participantes ?? [])
      .filter((p) => p.usuario_id !== currentUserId)
      .map((p) => c.participanteNomes?.[p.usuario_id] || 'Usuário');
    return outros[0] || 'Conversa';
  };
  const nomeUsuario = (id: string): string => {
    if (id === currentUserId) return 'Você';
    const u = usuariosTenant.find((x) => x.id === id);
    return u?.nome || conversaAberta?.participanteNomes?.[id] || 'Usuário';
  };

  if (portalNegado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-red-500/20 bg-slate-900 text-white rounded-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-white">Acesso não autorizado</CardTitle>
            <CardDescription className="text-slate-300 pt-3">Este usuário não possui permissão para acessar o {rotuloPortal(portalNegado.portal)}.<br/>Seu perfil atual não possui acesso a este portal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={() => navigate(portalNegado.meuPortal, { replace: true })}>Ir para meu portal</Button>
            <Button variant="outline" className="w-full" onClick={() => setPortalNegado(null)}>Voltar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando Central de Comunicação & Inteligência...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Central de Comunicação & Inteligência</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centro operacional do sistema: notificações, solicitações, chat, inteligência comercial e KPIs executivos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
          {feed && feed.totalNaoLidas > 0 && (
            <Button variant="secondary" size="sm" onClick={() => marcarTodasLidasMutation.mutate()}>
              <CheckCircle className="h-4 w-4 mr-2" /> Marcar todas como lidas ({feed.totalNaoLidas})
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solicitações Pendentes</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{feed?.totalPendentes ?? 0}</div>
            <p className="text-xs text-muted-foreground">Requerem ação</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Não Lidas</CardTitle>
            <Bell className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{feed?.totalNaoLidas ?? 0}</div>
            <p className="text-xs text-muted-foreground">Notificações</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Faturada</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{biData ? formatCurrency(biData.receitaFaturada) : '...'}</div>
            <p className="text-xs text-muted-foreground">MRR: {biData ? formatCurrency(biData.mrr) : '...'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">{feed?.totalAlertas ?? 0}</div>
            <p className="text-xs text-muted-foreground">Severidade ALERTA/CRÍTICO</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="inbox">
            <Inbox className="h-4 w-4 mr-2" />
            Caixa de Entrada
            {feed && feed.totalNaoLidas > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                {feed.totalNaoLidas}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="solicitacoes">
            <FileText className="h-4 w-4 mr-2" />
            Solicitações
            {feed && feed.totalPendentes > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                {feed.totalPendentes}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageSquare className="h-4 w-4 mr-2" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="feed">
            <Activity className="h-4 w-4 mr-2" />
            Feed
          </TabsTrigger>
          <TabsTrigger value="inteligencia">
            <BarChart3 className="h-4 w-4 mr-2" />
            Inteligência
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Buscar notificações..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-input bg-background rounded-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterPrioridade}
                onChange={(e) => setFilterPrioridade(e.target.value)}
                className="px-3 py-2 text-sm border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="TODAS">Todas Prioridades</option>
                <option value="CRITICO">Crítico</option>
                <option value="IMPORTANTE">Importante</option>
                <option value="ATENCAO">Atenção</option>
                <option value="SUCESSO">Sucesso</option>
                <option value="INFORMATIVO">Informativo</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 text-sm border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="TODOS">Todos Status</option>
                <option value="NAO_LIDA">Não Lidas</option>
                <option value="LIDA">Lidas</option>
                <option value="RESOLVIDA">Resolvidas</option>
              </select>
            </div>
          </div>

          {selectedNotification && (
            <Card className="mb-4 border-primary/30 bg-primary/5">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm">{selectedNotification.titulo}</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedNotification(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm">{selectedNotification.mensagem}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">Tipo: {selectedNotification.tipo_evento}</Badge>
                  <Badge variant="outline" className={cn(PRIORITY_COLORS[selectedNotification.prioridade])}>
                    Prioridade: {selectedNotification.prioridade}
                  </Badge>
                  <Badge variant="outline" className={cn(SEVERITY_COLORS[selectedNotification.severidade])}>
                    Severidade: {selectedNotification.severidade}
                  </Badge>
                  <Badge variant="outline">Destinatário: {selectedNotification.usuario_id === currentUserId ? 'Você' : selectedNotification.usuario_id.substring(0, 8) + '...'}</Badge>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatDateTime(selectedNotification.created_at)}
                  </span>
                  {selectedNotification.entidade_relacionada_tipo && (
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      Origem: {selectedNotification.entidade_relacionada_tipo} ({selectedNotification.entidade_relacionada_id?.substring(0, 8)}...)
                    </span>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  {selectedNotification.canNavigate && (
                    <Button size="sm" variant="outline" onClick={() => handleNavigateToEntity(selectedNotification.entidade_relacionada_tipo, selectedNotification.entidade_relacionada_id)}>
                      <ArrowUpRight className="h-4 w-4 mr-1" /> Ir para registro de origem
                    </Button>
                  )}
                  {selectedNotification.status_notificacao !== 'RESOLVIDA' && (
                    <Button size="sm" variant="outline" onClick={() => resolverNotificacaoMutation.mutate(selectedNotification.id)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Resolver
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {filteredNotificacoes.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">Nenhuma notificação encontrada</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery || filterPrioridade !== 'TODAS' || filterStatus !== 'TODOS'
                    ? 'Tente ajustar os filtros ou limpar a busca.'
                    : 'Você está em dia! Nenhuma notificação nova no momento.'}
                </p>
                {(searchQuery || filterPrioridade !== 'TODAS' || filterStatus !== 'TODOS') && (
                  <Button variant="ghost" size="sm" className="mt-4" onClick={() => { setSearchQuery(''); setFilterPrioridade('TODAS'); setFilterStatus('TODOS'); }}>
                    <X className="h-4 w-4 mr-1" /> Limpar filtros
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-420px)] min-h-[400px] max-h-[600px]">
              <div className="space-y-2">
                {filteredNotificacoes.map((notification) => {
                  const IconComponent = TIPO_SOLICITACAO_ICONS[notification.tipo_evento] || Bell;
                  const isSelected = selectedNotification?.id === notification.id;
                  const canResolve = notification.status_notificacao !== 'RESOLVIDA';
                  const canNavigate = !!notification.rota_destino || (!!notification.entidade_relacionada_tipo && !!notification.entidade_relacionada_id);

                  return (
                    <Card
                      key={notification.id}
                      className={cn(
                        'transition-all cursor-pointer hover:shadow-md',
                        isSelected && 'ring-2 ring-primary border-primary'
                      )}
                      onClick={() => handleNotificationClick({ ...notification, canResolve, canNavigate })}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                          <div className={cn(
                            'p-2 rounded-lg flex-shrink-0',
                            PRIORITY_COLORS[notification.prioridade] || PRIORITY_COLORS.INFORMATIVO
                          )}>
                            <IconComponent className={cn('h-5 w-5', PRIORITY_ICON_COLORS[notification.prioridade] || PRIORITY_ICON_COLORS.INFORMATIVO)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className={cn('font-semibold text-sm', !notification.lida ? 'text-foreground' : 'text-muted-foreground')}>
                                {notification.titulo}
                              </h4>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <Badge variant="outline" className={cn('text-xs', STATUS_NOTIF_COLORS[notification.status_notificacao] || STATUS_NOTIF_COLORS.NAO_LIDA)}>
                                  {notification.status_notificacao.replace('_', ' ')}
                                </Badge>
                                <Badge variant="outline" className={cn('text-xs', PRIORITY_COLORS[notification.prioridade] || PRIORITY_COLORS.INFORMATIVO)}>
                                  {notification.prioridade}
                                </Badge>
                                <Badge variant="outline" className={cn('text-xs', SEVERITY_COLORS[notification.severidade] || SEVERITY_COLORS.INFO)}>
                                  {notification.severidade}
                                </Badge>
                              </div>
                            </div>
                            <p className={cn('text-sm mt-1 line-clamp-2', !notification.lida ? 'text-foreground' : 'text-muted-foreground')}>
                              {notification.mensagem}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDateTime(notification.created_at)}
                              </span>
                              {notification.entidade_relacionada_tipo && (
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {notification.entidade_relacionada_tipo}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0 sm:w-32">
                            {canNavigate && (
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleNavigateToEntity(notification.entidade_relacionada_tipo, notification.entidade_relacionada_id); }} className="h-8 w-8" title="Navegar para entidade relacionada">
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            )}
                            {!notification.lida && notification.status_notificacao === 'NAO_LIDA' && (
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); marcarLidaMutation.mutate(notification.id); }} className="h-8 w-8" title="Marcar como lida">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </Button>
                            )}
                            {canResolve && (
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); resolverNotificacaoMutation.mutate(notification.id); }} className="h-8 w-8" title="Resolver">
                                <CheckCircle2 className="h-4 w-4 text-blue-500" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="solicitacoes" className="mt-4">
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Buscar solicitações..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-input bg-background rounded-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 text-sm border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="TODOS">Todos Status</option>
                <option value="PENDENTE">Pendentes</option>
                <option value="APROVADA">Aprovadas</option>
                <option value="REJEITADA">Rejeitadas</option>
                <option value="CANCELADA">Canceladas</option>
                <option value="EXPIRADA">Expiradas</option>
              </select>
            </div>
          </div>

          {/* ============================================================
              REDEFINIÇÕES DE SENHA — PASSWORD_RESET_REQUEST (autorização)
              ============================================================ */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Redefinições de Senha</h3>
              <Badge variant="outline" className="text-xs">
                {resetsSenha.filter((r) => r.status === 'PENDENTE').length} aguardando decisão
              </Badge>
            </div>
            {resetsSenha.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma solicitação de redefinição de senha.
                </CardContent>
              </Card>
            ) : (
              resetsSenha.map((sol) => {
                const isPending = sol.status === 'PENDENTE';
                const emitida = !!sol.credencial_emitida_em;
                return (
                  <Card
                    key={sol.id}
                    id={`reset-senha-${sol.id}`}
                    className={cn(
                      'transition-all hover:shadow-md',
                      isPending && 'border-l-4 border-l-amber-500 bg-amber-50/30',
                      solicitacaoDeepLink === sol.id && 'ring-2 ring-primary border-primary'
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className={cn('p-2 rounded-lg flex-shrink-0', isPending ? 'bg-amber-100 text-amber-700' : sol.status === 'APROVADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                          <KeyRound className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-sm">🔐 Solicitação de redefinição de senha</h4>
                            <Badge variant="outline" className={cn('text-xs', isPending ? 'bg-amber-100 text-amber-700 border-amber-200' : sol.status === 'APROVADA' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200')}>
                              {isPending ? 'AGUARDANDO AUTORIZAÇÃO' : sol.status}
                            </Badge>
                            {emitida && <Badge variant="secondary" className="text-xs">credencial emitida</Badge>}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground whitespace-pre-line line-clamp-4">
                            {sol.descricao}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDateTime(sol.created_at)}</span>
                            {sol.decisao_motivo && <span>Motivo: {sol.decisao_motivo}</span>}
                          </div>
                        </div>
                        {isPending && canManageSolicitacoes && (
                          <div className="flex flex-col gap-1.5 flex-shrink-0 sm:w-40">
                            <Button size="sm" disabled={resetProcessandoId === sol.id} onClick={() => autorizarReset(sol)}>
                              {resetProcessandoId === sol.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                              Autorizar
                            </Button>
                            <Button size="sm" variant="destructive" disabled={resetProcessandoId === sol.id} onClick={() => recusarReset(sol)}>
                              <XCircleIcon className="h-4 w-4 mr-2" /> Recusar
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {filteredSolicitacoes.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">Nenhuma solicitação encontrada</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery || filterStatus !== 'TODOS'
                    ? 'Tente ajustar os filtros ou limpar a busca.'
                    : 'Nenhuma solicitação pendente no momento.'}
                </p>
                {(searchQuery || filterStatus !== 'TODOS') && (
                  <Button variant="ghost" size="sm" className="mt-4" onClick={() => { setSearchQuery(''); setFilterStatus('TODOS'); }}>
                    <X className="h-4 w-4 mr-1" /> Limpar filtros
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-420px)] min-h-[400px] max-h-[600px]">
              <div className="space-y-2">
                {filteredSolicitacoes.map((solicitacao) => {
                  const IconComponent = TIPO_SOLICITACAO_ICONS[solicitacao.tipo_solicitacao] || FileText;
                  const isSelected = selectedSolicitacao?.id === solicitacao.id;
                  const isPending = solicitacao.status === 'PENDENTE';
                  const canApprove = canManageSolicitacoes && isPending && currentUserId !== solicitacao.solicitante_id;
                  const canReject = canManageSolicitacoes && isPending && currentUserId !== solicitacao.solicitante_id;

                  return (
                    <Card
                      key={solicitacao.id}
                      className={cn(
                        'transition-all cursor-pointer hover:shadow-md',
                        isSelected && 'ring-2 ring-primary border-primary',
                        isPending && 'border-l-4 border-l-blue-500 bg-blue-50/30'
                      )}
                      onClick={() => handleSolicitacaoClick({ ...solicitacao, canApprove, canReject })}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="p-2 rounded-lg flex-shrink-0 bg-primary/10 text-primary">
                            <IconComponent className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-semibold text-sm">{solicitacao.titulo}</h4>
                                  <Badge variant="outline" className={cn('text-xs', SOLICITACAO_STATUS_COLORS[solicitacao.status] || SOLICITACAO_STATUS_COLORS.PENDENTE)}>
                                    {solicitacao.status}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs">
                                    {TIPO_SOLICITACAO_LABELS[solicitacao.tipo_solicitacao] || solicitacao.tipo_solicitacao}
                                  </Badge>
                                </div>
                                {solicitacao.descricao && (
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{solicitacao.descricao}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDateTime(solicitacao.created_at)}
                              </span>
                              {solicitacao.solicitante_id && (
                                <span className="flex items-center gap-1">
                                  <UserPlus className="h-3 w-3" />
                                  Solicitante: {solicitacao.solicitante_id === currentUserId ? 'Você' : solicitacao.solicitante_id.substring(0, 8) + '...'}
                                </span>
                              )}
                              {solicitacao.entidade_tipo && solicitacao.entidade_id && (
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {solicitacao.entidade_tipo}: {solicitacao.entidade_id.substring(0, 8)}...
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0 sm:w-40">
                            {isPending && canApprove && (
                              <Button
                                size="sm"
                                variant="default"
                                className="w-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!currentUserId) return;
                                  aprovarSolicitacaoMutation.mutate({ id: solicitacao.id, responsavelId: currentUserId });
                                }}
                                disabled={aprovarSolicitacaoMutation.isPending}
                              >
                                {aprovarSolicitacaoMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                )}
                                Aprovar
                              </Button>
                            )}
                            {isPending && canReject && (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="w-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const motivo = prompt('Motivo da rejeição (obrigatório):');
                                  if (motivo && currentUserId) {
                                    rejeitarSolicitacaoMutation.mutate({ id: solicitacao.id, responsavelId: currentUserId, motivo });
                                  }
                                }}
                                disabled={rejeitarSolicitacaoMutation.isPending}
                              >
                                {rejeitarSolicitacaoMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <XCircleIcon className="h-4 w-4 mr-2" />
                                )}
                                Rejeitar
                              </Button>
                            )}
                            {(isPending && !canApprove && !canReject) && (
                              <Badge variant="outline" className="w-full text-xs">
                                Sem permissão
                              </Badge>
                            )}
                            {!isPending && (
                              <Badge variant="outline" className={cn('w-full text-xs', SOLICITACAO_STATUS_COLORS[solicitacao.status] || SOLICITACAO_STATUS_COLORS.PENDENTE)}>
                                {solicitacao.status}
                              </Badge>
                            )}
                            {solicitacao.entidade_tipo && solicitacao.entidade_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => { e.stopPropagation(); handleNavigateToEntity(solicitacao.entidade_tipo, solicitacao.entidade_id); }}
                                title="Navegar para entidade relacionada"
                              >
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Lista de conversas */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Conversas</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setDialogNovaConversa(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Nova
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-2">
                {loadingConversas ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : conversas.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    Nenhuma conversa. Inicie uma conversa individual ou em grupo.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {conversas.map((c) => (
                      <button
                        key={c.id}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors',
                          conversaAbertaId === c.id ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-accent'
                        )}
                        onClick={() => setConversaAbertaId(c.id)}
                      >
                        <div className={cn(
                          'h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          c.tipo === 'GRUPO' ? 'bg-purple-100 text-purple-700' : 'bg-primary/10 text-primary'
                        )}>
                          {c.tipo === 'GRUPO' ? 'G' : (nomeConversa(c).charAt(0) || '?').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm truncate">{nomeConversa(c)}</p>
                            {c.naoLidas > 0 && (
                              <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                                {c.naoLidas}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {c.ultimaMensagem ? `${nomeUsuario(c.ultimaMensagem.remetente_id)}: ${c.ultimaMensagem.mensagem}` : 'Sem mensagens ainda'}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Thread de mensagens */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {conversaAberta ? nomeConversa(conversaAberta) : 'Selecione uma conversa'}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {conversaAberta
                        ? (conversaAberta.tipo === 'GRUPO'
                          ? (conversaAberta.participantes ?? []).map((p) => nomeUsuario(p.usuario_id)).join(', ')
                          : `Conversa individual com ${nomeConversa(conversaAberta)}`)
                        : 'Escolha uma conversa à esquerda ou crie uma nova.'}
                    </p>
                  </div>
                  {conversaAberta && conversaAberta.naoLidas > 0 && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {conversaAberta.naoLidas} não lidas
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {!conversaAbertaId ? (
                  <div className="flex flex-col items-center justify-center h-80 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 opacity-30 mb-3" />
                    <p className="text-sm">Selecione ou crie uma conversa para começar</p>
                  </div>
                ) : (
                  <div className="flex flex-col h-[480px]">
                    <ScrollArea className="flex-1 p-4">
                      <div ref={chatScrollRef} className="space-y-3">
                        {mensagens.length === 0 ? (
                          <p className="text-center text-sm text-muted-foreground py-8">
                            Nenhuma mensagem ainda. Envie a primeira!
                          </p>
                        ) : (
                          mensagens.map((m) => {
                            const minha = m.remetente_id === currentUserId;
                            return (
                              <div key={m.id} className={cn('flex', minha ? 'justify-end' : 'justify-start')}>
                                <div className={cn(
                                  'max-w-[75%] px-3.5 py-2 rounded-2xl text-sm',
                                  minha ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'
                                )}>
                                  {!minha && (
                                    <p className="text-[10px] font-semibold mb-0.5 opacity-70">{nomeUsuario(m.remetente_id)}</p>
                                  )}
                                  <p className="whitespace-pre-wrap break-words">{m.mensagem}</p>
                                  <p className={cn('text-[10px] mt-1', minha ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                                    {formatDateTime(m.created_at)}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                    <div className="p-3 border-t flex gap-2">
                      <input
                        type="text"
                        placeholder="Escreva sua mensagem..."
                        value={mensagemTexto}
                        onChange={(e) => setMensagemTexto(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleEnviarMensagem();
                          }
                        }}
                        className="flex-1 px-3 py-2 text-sm border border-input bg-background rounded-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button size="icon" onClick={handleEnviarMensagem} disabled={isEnviandoMensagem || !mensagemTexto.trim()}>
                        {isEnviandoMensagem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="feed" className="mt-4">
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Buscar no feed..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-input bg-background rounded-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {unifiedFeed.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Activity className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">Feed vazio</h3>
                <p className="text-sm text-muted-foreground mt-1">Nenhuma atividade recente no sistema.</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-420px)] min-h-[400px] max-h-[600px]">
              <div className="space-y-3">
                {unifiedFeed
                  .filter((item) => searchQuery === '' ||
                    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    item.description.toLowerCase().includes(searchQuery.toLowerCase()))
                  .slice(0, 100)
                  .map((item) => {
                    const isNotification = item.type === 'notificacao';
                    const IconComponent = isNotification ? Bell : FileText;
                    const severityColor = isNotification
                      ? SEVERITY_COLORS[item.severidade] || SEVERITY_COLORS.INFO
                      : SOLICITACAO_STATUS_COLORS[item.status] || SOLICITACAO_STATUS_COLORS.PENDENTE;

                    return (
                      <Card key={item.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex gap-3">
                            <div className={cn('p-2 rounded-lg flex-shrink-0', severityColor)}>
                              <IconComponent className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-medium text-sm">{item.title}</h4>
                                  <Badge variant="outline" className={cn('text-xs', severityColor)}>
                                    {isNotification ? item.severidade : item.status}
                                  </Badge>
                                  {isNotification && (
                                    <Badge variant="outline" className={cn('text-xs', PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.INFORMATIVO)}>
                                      {item.priority}
                                    </Badge>
                                  )}
                                  {!isNotification && (
                                    <Badge variant="secondary" className="text-xs">
                                      {TIPO_SOLICITACAO_LABELS[item.solicitacaoType || ''] || item.solicitacaoType}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                                  {formatDateTime(item.timestamp)}
                                </span>
                              </div>
                              {item.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                                {item.entityType && item.entityId && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={() => handleNavigateToEntity(item.entityType, item.entityId)}
                                  >
                                    <ArrowUpRight className="h-3 w-3 mr-1" />
                                    {item.entityType}
                                  </Button>
                                )}
                                {isNotification && item.route && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={() => navigate(item.route || '')}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Ver detalhes
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="inteligencia" className="mt-4">
          {biLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : biData ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <KPICard
                  title="MRR (Recorrência Mensal)"
                  value={formatCurrency(biData.mrr)}
                  icon={DollarSign}
                  iconColor="text-green-500"
                />
                <KPICard
                  title="ARR (Recorrência Anual)"
                  value={formatCurrency(biData.arr)}
                  icon={TrendingUp}
                  iconColor="text-blue-500"
                />
                <KPICard
                  title="Contratos Ativos"
                  value={biData.contratosAtivos.toString()}
                  icon={FileText}
                  iconColor="text-purple-500"
                />
                <KPICard
                  title="Clientes Ativos"
                  value={biData.clientesAtivos.toString()}
                  icon={Users}
                  iconColor="text-orange-500"
                />
                <KPICard
                  title="Inadimplência"
                  value={`${biData.inadimplenciaPct.toFixed(1)}%`}
                  icon={AlertTriangle}
                  iconColor={biData.inadimplenciaPct > 10 ? 'text-red-500' : 'text-green-500'}
                />
                <KPICard
                  title="Comissões Liberadas"
                  value={formatCurrency(biData.comissoesLiberadas)}
                  icon={Target}
                  iconColor="text-emerald-500"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Resumo Financeiro Detalhado</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-green-50/50 rounded-lg border border-green-100">
                      <p className="text-sm text-green-700 font-medium">Faturado</p>
                      <p className="text-2xl font-bold text-green-900">{formatCurrency(biData.receitaFaturada)}</p>
                    </div>
                    <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                      <p className="text-sm text-blue-700 font-medium">Recebido</p>
                      <p className="text-2xl font-bold text-blue-900">{formatCurrency(biData.receitaRecebida)}</p>
                    </div>
                    <div className="p-4 bg-amber-50/50 rounded-lg border border-amber-100">
                      <p className="text-sm text-amber-700 font-medium">Pendente</p>
                      <p className="text-2xl font-bold text-amber-900">{formatCurrency(biData.receitaPendente)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Indicadores Operacionais</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Ocupação da Rede</p>
                      <p className="text-2xl font-bold">{biData.ocupacaoRedePct.toFixed(1)}%</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">SLA da Rede</p>
                      <p className="text-2xl font-bold">{biData.slaRedePct.toFixed(1)}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">Dados de inteligência indisponíveis</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Não foi possível carregar os KPIs executivos. Verifique a conexão com o banco de dados.
                </p>
                <Button variant="outline" className="mt-4" onClick={() => queryClient.invalidateQueries({ queryKey: ['central-bi'] })}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog: Nova Conversa */}
      <Dialog open={dialogNovaConversa} onOpenChange={setDialogNovaConversa}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
            <DialogDescription>
              Crie uma conversa individual ou em grupo com usuários da sua empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={novaConversaTipo === 'INDIVIDUAL' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNovaConversaTipo('INDIVIDUAL')}
              >
                <Mail className="h-4 w-4 mr-1" /> Individual
              </Button>
              <Button
                variant={novaConversaTipo === 'GRUPO' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNovaConversaTipo('GRUPO')}
              >
                <Users className="h-4 w-4 mr-1" /> Grupo
              </Button>
            </div>
            {novaConversaTipo === 'GRUPO' && (
              <input
                type="text"
                placeholder="Nome do grupo (opcional)"
                value={novaConversaNome}
                onChange={(e) => setNovaConversaNome(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-input bg-background rounded-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            )}
            <div>
              <p className="text-sm font-medium mb-2">Participantes ({novaConversaParticipantes.length} selecionados)</p>
              <ScrollArea className="h-56 border rounded-lg p-2">
                <div className="space-y-1">
                  {usuariosTenant
                    .filter((u) => u.id !== currentUserId)
                    .map((u) => (
                      <label
                        key={u.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors',
                          novaConversaParticipantes.includes(u.id) ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-accent'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={novaConversaParticipantes.includes(u.id)}
                          onChange={() => {
                            setNovaConversaParticipantes((prev) =>
                              prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                            );
                          }}
                          className="h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{u.nome}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        {u.perfil_nome && (
                          <Badge variant="secondary" className="text-[10px]">{u.perfil_nome}</Badge>
                        )}
                      </label>
                    ))}
                  {usuariosTenant.filter((u) => u.id !== currentUserId).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhum outro usuário disponível na sua empresa.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNovaConversa(false)}>Cancelar</Button>
            <Button onClick={handleCriarConversa} disabled={isCriandoConversa || novaConversaParticipantes.length === 0}>
              {isCriandoConversa ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Criar conversa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREDENCIAL TEMPORÁRIA — exibida UMA única vez ao aprovador */}
      <Dialog open={!!credencialEmitida} onOpenChange={(o) => !o && setCredencialEmitida(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-500" />
              Senha temporária gerada
            </DialogTitle>
            <DialogDescription>
              {credencialEmitida?.nome ? `${credencialEmitida.nome} — ` : ''}
              {credencialEmitida?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 rounded-lg bg-muted border font-mono text-center text-lg tracking-wider select-all">
              {credencialEmitida?.senha}
            </div>
            <p className="text-xs text-muted-foreground">
              Copie agora: esta senha não será exibida novamente. O usuário deverá trocá-la
              obrigatoriamente no próximo login.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(credencialEmitida?.senha ?? '');
                    toast.success('Senha copiada.');
                  } catch {
                    toast.error('Não foi possível copiar.');
                  }
                }}
              >
                Copiar senha
              </Button>
              <Button className="flex-1" onClick={() => setCredencialEmitida(null)}>Concluir</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface KPICardProps {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, icon: Icon, iconColor }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={cn('p-3 rounded-lg bg-primary/10', iconColor)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default CentralDashboard;
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { centralService } from '@/services/central.service';
import { subscribeCentralRealtime } from '@/services/central.realtime';
import { toast } from 'sonner';

export const centralFeedKey = ['central-feed'] as const;
export const centralUnreadKey = ['central-unread'] as const;

/**
 * Contador de não lidas da Central (notificações + conversas).
 * Atualizado via realtime — sem polling.
 */
export const useCentralUnread = () => {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: centralUnreadKey,
    queryFn: async () => {
      const [notificacoes, conversas] = await Promise.all([
        centralService.contarNaoLidas(),
        centralService.contarNaoLidasConversas(),
      ]);
      return { notificacoes, conversas, total: notificacoes + conversas };
    },
    staleTime: 30000,
  });

  useEffect(() => {
    return subscribeCentralRealtime(() => {
      queryClient.invalidateQueries({ queryKey: centralUnreadKey });
    });
  }, [queryClient]);

  return {
    total: data?.total ?? 0,
    notificacoes: data?.notificacoes ?? 0,
    conversas: data?.conversas ?? 0,
  };
};

export const useCentral = () => {
  const queryClient = useQueryClient();

  // Query: Feed completo (realtime invalida a query — sem polling)
  const { data, isLoading, refetch } = useQuery({
    queryKey: centralFeedKey,
    queryFn: () => centralService.getFeedUnificado(),
    staleTime: 15000,
  });

  useEffect(() => {
    return subscribeCentralRealtime(() => {
      queryClient.invalidateQueries({ queryKey: centralFeedKey });
      queryClient.invalidateQueries({ queryKey: centralUnreadKey });
    });
  }, [queryClient]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: centralFeedKey });
    queryClient.invalidateQueries({ queryKey: centralUnreadKey });
    queryClient.invalidateQueries({ queryKey: ['central-conversas'] });
    queryClient.invalidateQueries({ queryKey: ['central-mensagens'] });
    queryClient.invalidateQueries({ queryKey: ['central-usuarios-tenant'] });
  };

  // Mutation: Marcar como lida
  const marcarLidaMutation = useMutation({
    mutationFn: (id: string) => centralService.marcarComoLida(id),
    onSuccess: () => {
      invalidateAll();
    },
    onError: () => toast.error('Erro ao marcar notificação como lida'),
  });

  // Mutation: Resolver notificação
  const resolverMutation = useMutation({
    mutationFn: (id: string) => centralService.resolverNotificacao(id),
    onSuccess: () => invalidateAll(),
    onError: () => toast.error('Erro ao resolver notificação'),
  });

  // Mutation: Marcar todas como lidas
  const marcarTodasLidasMutation = useMutation({
    mutationFn: () => centralService.marcarTodasComoLidas(),
    onSuccess: () => invalidateAll(),
    onError: () => toast.error('Erro ao marcar todas como lidas'),
  });

  // Mutation: Aprovar solicitação
  const aprovarSolicitacaoMutation = useMutation({
    mutationFn: ({ id, responsavelId, motivo }: { id: string, responsavelId: string, motivo?: string }) =>
      centralService.aprovarSolicitacao(id, responsavelId, motivo),
    onSuccess: () => {
      toast.success('Solicitação aprovada com sucesso');
      invalidateAll();
    },
    onError: () => toast.error('Erro ao aprovar solicitação'),
  });

  // Mutation: Rejeitar solicitação
  const rejeitarSolicitacaoMutation = useMutation({
    mutationFn: ({ id, responsavelId, motivo }: { id: string, responsavelId: string, motivo: string }) =>
      centralService.rejeitarSolicitacao(id, responsavelId, motivo),
    onSuccess: () => {
      toast.success('Solicitação rejeitada');
      invalidateAll();
    },
    onError: () => toast.error('Erro ao rejeitar solicitação'),
  });

  // Mutation: Criar conversa
  const criarConversaMutation = useMutation({
    mutationFn: (payload: { empresaId: string; tipo: 'INDIVIDUAL' | 'GRUPO'; nome?: string; participanteIds: string[] }) =>
      centralService.criarConversa(payload),
    onSuccess: () => invalidateAll(),
    onError: () => toast.error('Erro ao criar conversa'),
  });

  // Mutation: Enviar mensagem
  const enviarMensagemMutation = useMutation({
    mutationFn: ({ conversaId, mensagem }: { conversaId: string; mensagem: string }) =>
      centralService.enviarMensagem(conversaId, mensagem),
    onSuccess: () => invalidateAll(),
    onError: () => toast.error('Erro ao enviar mensagem'),
  });

  // Mutation: Marcar conversa como lida
  const marcarConversaLidaMutation = useMutation({
    mutationFn: (conversaId: string) => centralService.marcarConversaLida(conversaId),
    onSuccess: () => invalidateAll(),
    onError: () => toast.error('Erro ao atualizar leitura da conversa'),
  });

  return {
    feed: data,
    isLoading,
    refetch,
    marcarLida: marcarLidaMutation.mutate,
    resolver: resolverMutation.mutate,
    marcarTodasLidas: marcarTodasLidasMutation.mutate,
    aprovarSolicitacao: aprovarSolicitacaoMutation.mutate,
    rejeitarSolicitacao: rejeitarSolicitacaoMutation.mutate,
    criarConversa: criarConversaMutation.mutate,
    enviarMensagem: enviarMensagemMutation.mutate,
    marcarConversaLida: marcarConversaLidaMutation.mutate,
    isEnviandoMensagem: enviarMensagemMutation.isPending,
    isCriandoConversa: criarConversaMutation.isPending,
  };
};

/**
 * Chat: conversas, participantes disponíveis e mensagens de uma conversa.
 * Mensagens reagem a realtime via invalidação de ['central-feed']-twin key.
 */
export const useConversas = (conversaAbertaId?: string | null) => {
  const queryClient = useQueryClient();
  const conversasKey = ['central-conversas'] as const;
  const usuariosKey = ['central-usuarios-tenant'] as const;
  const mensagensKey = ['central-mensagens', conversaAbertaId ?? 'none'] as const;

  const { data: conversas, isLoading: loadingConversas } = useQuery({
    queryKey: conversasKey,
    queryFn: () => centralService.listarConversas(),
    staleTime: 15000,
  });

  const { data: usuariosTenant } = useQuery({
    queryKey: usuariosKey,
    queryFn: () => centralService.listarUsuariosTenant(),
    staleTime: 60000,
  });

  const { data: mensagens, isLoading: loadingMensagens } = useQuery({
    queryKey: mensagensKey,
    queryFn: () => (conversaAbertaId ? centralService.listarMensagens(conversaAbertaId) : Promise.resolve([])),
    enabled: !!conversaAbertaId,
    staleTime: 10000,
  });

  useEffect(() => {
    return subscribeCentralRealtime(() => {
      queryClient.invalidateQueries({ queryKey: conversasKey });
      queryClient.invalidateQueries({ queryKey: mensagensKey });
    });
  }, [queryClient, conversaAbertaId]);

  return {
    conversas: conversas ?? [],
    usuariosTenant: usuariosTenant ?? [],
    mensagens: mensagens ?? [],
    loadingConversas,
    loadingMensagens,
    refetchConversas: () => queryClient.invalidateQueries({ queryKey: conversasKey }),
  };
};
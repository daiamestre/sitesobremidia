import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

// ============================================================
// TIPOS — Central de Comunicação & Inteligência
// ============================================================

export type PrioridadeNotificacao = 'INFORMATIVO' | 'SUCESSO' | 'ATENCAO' | 'IMPORTANTE' | 'CRITICO';
export type SeveridadeNotificacao = 'INFO' | 'AVISO' | 'ALERTA' | 'CRITICO';
export type StatusNotificacao = 'NAO_LIDA' | 'LIDA' | 'RESOLVIDA';
export type StatusSolicitacao = 'PENDENTE' | 'APROVADA' | 'REJEITADA' | 'CANCELADA' | 'EXPIRADA';
export type TipoSolicitacao =
  | 'NOVO_REPRESENTANTE'
  | 'NOVO_CLIENTE'
  | 'APROVACAO_CADASTRO'
  | 'APROVACAO_PROPOSTA'
  | 'APROVACAO_CAMPANHA'
  | 'APROVACAO_CONTEUDO'
  | 'SOLICITACAO_FINANCEIRA'
  | 'NOVO_PONTO'
  | 'PASSWORD_RESET_REQUEST'
  | 'OUTRO';

export interface Notificacao {
  id: string;
  empresa_operadora_id: string;
  usuario_id: string;
  tipo_evento: string;
  canal: string;
  titulo: string;
  mensagem: string;
  prioridade: PrioridadeNotificacao;
  severidade: SeveridadeNotificacao;
  status_notificacao: StatusNotificacao;
  rota_destino?: string | null;
  entidade_relacionada_tipo?: string | null;
  entidade_relacionada_id?: string | null;
  lida: boolean;
  resolvida_em?: string | null;
  created_at: string;
}

export interface Solicitacao {
  id: string;
  empresa_operadora_id: string;
  tipo_solicitacao: TipoSolicitacao;
  titulo: string;
  descricao?: string | null;
  entidade_tipo?: string | null;
  entidade_id?: string | null;
  status: StatusSolicitacao;
  solicitante_id?: string | null;
  responsavel_id?: string | null;
  decisao_motivo?: string | null;
  decisao_data?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversa {
  id: string;
  empresa_operadora_id: string;
  tipo: 'INDIVIDUAL' | 'GRUPO';
  nome?: string | null;
  criado_por?: string | null;
  created_at: string;
  participantes?: ConversaParticipante[];
  mensagens?: ConversaMensagem[];
}

export interface ConversaParticipante {
  conversa_id: string;
  usuario_id: string;
  ultima_leitura?: string | null;
  created_at: string;
}

export interface ConversaMensagem {
  id: string;
  conversa_id: string;
  empresa_operadora_id: string;
  remetente_id: string;
  mensagem: string;
  created_at: string;
}

export interface ConversaComMeta extends Conversa {
  ultimaMensagem?: ConversaMensagem | null;
  naoLidas: number;
  participanteNomes: Record<string, string>;
}

export interface CentralFeed {
  notificacoes: Notificacao[];
  solicitacoes: Solicitacao[];
  totalNaoLidas: number;
  totalPendentes: number;
  totalAlertas: number;
}

export interface FiltrosCentral {
  tipo?: 'TODAS' | 'SOLICITACOES' | 'ALERTAS' | 'ATIVIDADES';
  prioridade?: PrioridadeNotificacao;
  status?: StatusNotificacao | StatusSolicitacao;
  pagina?: number;
  itensPorPagina?: number;
}

// ============================================================
// CENTRAL SERVICE
// ============================================================

export class CentralService {
  // ---------- NOTIFICAÇÕES ----------

  async listarNotificacoes(filtros?: FiltrosCentral): Promise<Notificacao[]> {
    let query = supabase
      .from('notificacoes_central')
      .select('*')
      .eq('canal', 'IN_APP')
      .order('created_at', { ascending: false });

    if (filtros?.prioridade) {
      query = query.eq('prioridade', filtros.prioridade);
    }

    if (filtros?.status) {
      query = query.eq('status_notificacao', filtros.status as string);
    }

    const inicio = ((filtros?.pagina ?? 1) - 1) * (filtros?.itensPorPagina ?? 50);
    query = query.range(inicio, inicio + (filtros?.itensPorPagina ?? 50) - 1);

    const { data, error } = await query;
    if (error) {
      console.error('[CentralService.listarNotificacoes]', error);
      return [];
    }
    return (data as unknown as Notificacao[]) ?? [];
  }

  async contarNaoLidas(): Promise<number> {
    const { count, error } = await supabase
      .from('notificacoes_central')
      .select('id', { count: 'exact', head: true })
      .eq('canal', 'IN_APP')
      .eq('status_notificacao', 'NAO_LIDA');

    if (error) return 0;
    return count ?? 0;
  }

  async marcarComoLida(notificacaoId: string): Promise<boolean> {
    const { error } = await supabase
      .from('notificacoes_central')
      .update({ lida: true, status_notificacao: 'LIDA' })
      .eq('id', notificacaoId);

    return !error;
  }

  async marcarTodasComoLidas(): Promise<boolean> {
    const { error } = await supabase
      .from('notificacoes_central')
      .update({ lida: true, status_notificacao: 'LIDA' })
      .eq('canal', 'IN_APP')
      .eq('status_notificacao', 'NAO_LIDA');

    return !error;
  }

  async resolverNotificacao(notificacaoId: string): Promise<boolean> {
    const { error } = await supabase
      .from('notificacoes_central')
      .update({
        lida: true,
        status_notificacao: 'RESOLVIDA',
        resolvida_em: new Date().toISOString(),
      })
      .eq('id', notificacaoId);

    return !error;
  }

  async criarNotificacao(payload: {
    usuarioId: string;
    empresaId: string;
    tipoEvento: string;
    titulo: string;
    mensagem: string;
    prioridade?: PrioridadeNotificacao;
    severidade?: SeveridadeNotificacao;
    rotaDestino?: string;
    entidadeTipo?: string;
    entidadeId?: string;
  }): Promise<boolean> {
    const { error } = await supabase.from('notificacoes_central').insert({
      empresa_operadora_id: payload.empresaId,
      usuario_id: payload.usuarioId,
      tipo_evento: payload.tipoEvento,
      canal: 'IN_APP',
      destinatario_contato: payload.usuarioId,
      titulo: payload.titulo,
      mensagem: payload.mensagem,
      prioridade: payload.prioridade ?? 'INFORMATIVO',
      severidade: payload.severidade ?? 'INFO',
      status_notificacao: 'NAO_LIDA',
      rota_destino: payload.rotaDestino,
      entidade_relacionada_tipo: payload.entidadeTipo,
      entidade_relacionada_id: payload.entidadeId,
      status_envio: 'SENT',
      enviado_em: new Date().toISOString(),
    });

    if (error) {
      console.error('[CentralService.criarNotificacao]', error);
      return false;
    }
    return true;
  }

  // ---------- SOLICITAÇÕES ----------

  async listarSolicitacoes(filtros?: { status?: StatusSolicitacao; pagina?: number }): Promise<Solicitacao[]> {
    let query = supabase
      .from('solicitacoes')
      .select('*')
      .order('created_at', { ascending: false });

    if (filtros?.status) {
      query = query.eq('status', filtros.status);
    }

    const inicio = ((filtros?.pagina ?? 1) - 1) * 50;
    query = query.range(inicio, inicio + 49);

    const { data, error } = await query;
    if (error) {
      console.error('[CentralService.listarSolicitacoes]', error);
      return [];
    }
    return (data as unknown as Solicitacao[]) ?? [];
  }

  async aprovarSolicitacao(
    solicitacaoId: string,
    responsavelId: string,
    motivo?: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('solicitacoes')
      .update({
        status: 'APROVADA',
        responsavel_id: responsavelId,
        decisao_motivo: motivo ?? null,
        decisao_data: new Date().toISOString(),
      })
      .eq('id', solicitacaoId)
      .eq('status', 'PENDENTE');

    if (error) {
      console.error('[CentralService.aprovarSolicitacao]', error);
      return false;
    }
    return true;
  }

  async rejeitarSolicitacao(
    solicitacaoId: string,
    responsavelId: string,
    motivo: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('solicitacoes')
      .update({
        status: 'REJEITADA',
        responsavel_id: responsavelId,
        decisao_motivo: motivo,
        decisao_data: new Date().toISOString(),
      })
      .eq('id', solicitacaoId)
      .eq('status', 'PENDENTE');

    if (error) {
      console.error('[CentralService.rejeitarSolicitacao]', error);
      return false;
    }
    return true;
  }

  async criarSolicitacao(payload: {
    empresaId: string;
    tipo: TipoSolicitacao;
    titulo: string;
    descricao?: string;
    solicitanteId?: string;
    entidadeTipo?: string;
    entidadeId?: string;
  }): Promise<{ success: boolean; id?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    const solicitanteId = payload.solicitanteId ?? user?.id;

    const { data, error } = await supabase
      .from('solicitacoes')
      .insert({
        empresa_operadora_id: payload.empresaId,
        tipo_solicitacao: payload.tipo,
        titulo: payload.titulo,
        descricao: payload.descricao,
        solicitante_id: solicitanteId,
        entidade_tipo: payload.entidadeTipo,
        entidade_id: payload.entidadeId,
        status: 'PENDENTE',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[CentralService.criarSolicitacao]', error);
      return { success: false };
    }
    return { success: true, id: data.id };
  }

  // ---------- CHAT INDIVIDUAL E GRUPO ----------

  async listarUsuariosTenant(): Promise<{ id: string; nome: string; email: string; perfil_nome?: string | null }[]> {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nome, email, perfil:perfis(nome)')
      .order('nome', { ascending: true });

    if (error || !data) return [];
    return data.map((u: any) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      perfil_nome: u.perfil?.nome ?? null,
    }));
  }

  async criarConversa(payload: {
    empresaId: string;
    tipo: 'INDIVIDUAL' | 'GRUPO';
    nome?: string;
    participanteIds: string[];
  }): Promise<{ success: boolean; id?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const participantes = Array.from(new Set([user.id, ...payload.participanteIds]));

    const { data, error } = await supabase
      .from('conversas')
      .insert({
        empresa_operadora_id: payload.empresaId,
        tipo: payload.tipo,
        nome: payload.nome ?? null,
        criado_por: user.id,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[CentralService.criarConversa]', error);
      return { success: false };
    }

    const { error: partErr } = await supabase
      .from('conversa_participantes')
      .insert(participantes.map((usuarioId) => ({
        conversa_id: data.id,
        usuario_id: usuarioId,
      })));

    if (partErr) {
      console.error('[CentralService.criarConversa] participantes', partErr);
      return { success: false, id: data.id };
    }

    return { success: true, id: data.id };
  }

  async listarConversas(): Promise<ConversaComMeta[]> {
    const { data, error } = await supabase
      .from('conversas')
      .select(`
        *,
        participantes:conversa_participantes(*),
        mensagens:conversa_mensagens(*)
      `)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('[CentralService.listarConversas]', error);
      return [];
    }

    const usuarioIds = Array.from(new Set(
      (data as any[]).flatMap((c: any) => [
        ...(c.participantes ?? []).map((p: any) => p.usuario_id),
        ...(c.mensagens ?? []).map((m: any) => m.remetente_id),
      ])
    ));

    const nomes: Record<string, string> = {};
    if (usuarioIds.length > 0) {
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id, nome')
        .in('id', usuarioIds);
      (usuarios ?? []).forEach((u: any) => { nomes[u.id] = u.nome; });
    }

    const { data: { user } } = await supabase.auth.getUser();
    const meId = user?.id;

    return (data as any[]).map((c) => {
      const mensagens = (c.mensagens ?? [])
        .map((m: any) => ({
          id: m.id,
          conversa_id: m.conversa_id,
          empresa_operadora_id: m.empresa_operadora_id,
          remetente_id: m.remetente_id,
          mensagem: m.mensagem,
          created_at: m.created_at,
        } as ConversaMensagem))
        .sort((a: ConversaMensagem, b: ConversaMensagem) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, 50);

      const minhaParticipacao = (c.participantes ?? []).find((p: any) => p.usuario_id === meId);
      const ultimaLeitura = minhaParticipacao?.ultima_leitura ?? null;
      const naoLidas = mensagens.filter(
        (m) => m.remetente_id !== meId &&
          (ultimaLeitura === null || new Date(m.created_at).getTime() > new Date(ultimaLeitura).getTime())
      ).length;

      const participanteNomes: Record<string, string> = {};
      (c.participantes ?? []).forEach((p: any) => {
        participanteNomes[p.usuario_id] = nomes[p.usuario_id] ?? 'Usuário';
      });

      return {
        id: c.id,
        empresa_operadora_id: c.empresa_operadora_id,
        tipo: c.tipo,
        nome: c.nome,
        criado_por: c.criado_por,
        created_at: c.created_at,
        participantes: c.participantes,
        mensagens,
        ultimaMensagem: mensagens.length > 0 ? mensagens[0] : null,
        naoLidas,
        participanteNomes,
      } as ConversaComMeta;
    });
  }

  async listarMensagens(conversaId: string): Promise<ConversaMensagem[]> {
    const { data, error } = await supabase
      .from('conversa_mensagens')
      .select('*')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !data) return [];
    return data as unknown as ConversaMensagem[];
  }

  async enviarMensagem(conversaId: string, mensagem: string): Promise<{ success: boolean; id?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const { data: conv } = await supabase
      .from('conversas')
      .select('empresa_operadora_id')
      .eq('id', conversaId)
      .maybeSingle();

    if (!conv) return { success: false };

    const { data, error } = await supabase
      .from('conversa_mensagens')
      .insert({
        conversa_id: conversaId,
        empresa_operadora_id: conv.empresa_operadora_id,
        remetente_id: user.id,
        mensagem,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[CentralService.enviarMensagem]', error);
      return { success: false };
    }
    return { success: true, id: data.id };
  }

  async marcarConversaLida(conversaId: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('conversa_participantes')
      .update({ ultima_leitura: new Date().toISOString() })
      .eq('conversa_id', conversaId)
      .eq('usuario_id', user.id);

    return !error;
  }

  async contarNaoLidasConversas(): Promise<number> {
    const conversas = await this.listarConversas();
    return conversas.reduce((acc, c) => acc + c.naoLidas, 0);
  }

  // ---------- EVENTOS DO SISTEMA ----------

  async registrarEvento(payload: {
    empresaId: string;
    tipoEvento: string;
    entidadeOrigem: string;
    entidadeId: string;
    eventoPayload?: Record<string, unknown>;
    criadoPor?: string;
  }): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('eventos').insert({
      empresa_operadora_id: payload.empresaId,
      tipo_evento: payload.tipoEvento,
      entidade_origem: payload.entidadeOrigem,
      entidade_id: payload.entidadeId,
      payload: (payload.eventoPayload ?? {}) as Record<string, Json>,
      created_by: payload.criadoPor ?? user?.id ?? null,
    });

    if (error) {
      console.error('[CentralService.registrarEvento]', error);
      return false;
    }
    return true;
  }

  // ---------- FEED UNIFICADO ----------

  async getFeedUnificado(): Promise<CentralFeed> {
    const [notificacoes, solicitacoes, contagem] = await Promise.all([
      this.listarNotificacoes({ itensPorPagina: 30 }),
      this.listarSolicitacoes(),
      this.contarNaoLidas(),
    ]);

    const totalAlertas = notificacoes.filter(
      (n) => n.severidade === 'ALERTA' || n.severidade === 'CRITICO'
    ).length;

    const totalPendentes = solicitacoes.filter((s) => s.status === 'PENDENTE').length;

    return {
      notificacoes,
      solicitacoes,
      totalNaoLidas: contagem,
      totalPendentes,
      totalAlertas,
    };
  }
}

export const centralService = new CentralService();

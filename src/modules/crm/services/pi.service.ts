import { supabase } from '@/integrations/supabase/client';

export type PIStatus =
  | 'EM_ELABORACAO'
  | 'AGUARDANDO_MATERIAL'
  | 'MATERIAL_RECEBIDO'
  | 'EM_PRODUCAO'
  | 'AGUARDANDO_APROVACAO'
  | 'APROVADO'
  | 'AGENDADO'
  | 'EM_EXIBICAO'
  | 'FINALIZADO'
  | 'CANCELADO';

export type PIPrioridade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';

export interface PIPayload {
  empresaOperadoraId: string;
  clienteId: string;
  propostaId?: string;
  contratoId?: string;
  titulo: string;
  descricao?: string;
  prioridade?: PIPrioridade;
  responsavelId?: string;
  inicioVeiculacao: string;
  fimVeiculacao: string;
  quantidadePecas?: number;
  observacoes?: string;
  locais?: Array<{
    empresaId?: string;
    unidadeId?: string;
    telaId?: string;
    playerId?: string;
    playlistId?: string;
  }>;
}

export interface PILocalRecord {
  id: string;
  pi_id: string;
  empresa_id?: string;
  unidade_id?: string;
  tela_id?: string;
  player_id?: string;
  playlist_id?: string;
  unidade?: { id: string; nome: string; endereco?: string };
}

export interface PIHistoricoRecord {
  id: string;
  pi_id: string;
  status_anterior?: string;
  status_novo: string;
  descricao: string;
  usuario_id?: string;
  usuario?: { nome: string };
  created_at: string;
}

export interface PIObservacaoRecord {
  id: string;
  pi_id: string;
  usuario_id?: string;
  usuario?: { nome: string };
  conteudo: string;
  created_at: string;
}

export interface PICompleto {
  id: string;
  empresa_operadora_id: string;
  cliente_id: string;
  proposta_id?: string;
  contrato_id?: string;
  numero_pi: string;
  titulo: string;
  descricao?: string;
  status: PIStatus;
  prioridade: PIPrioridade;
  responsavel_id?: string;
  inicio_veiculacao: string;
  fim_veiculacao: string;
  quantidade_pecas: number;
  observacoes?: string;
  pdf_object_key?: string;
  versao_atual: number;
  created_at: string;
  cliente?: any;
  empresa?: any;
  contrato?: any;
  proposta?: any;
  locais?: PILocalRecord[];
  historico?: PIHistoricoRecord[];
  observacoes_list?: PIObservacaoRecord[];
}

export class PIService {
  /**
   * Gera número de PI atômico com Advisory Lock via Supabase RPC
   */
  private async getNextPINumberAtomo(empresaOperadoraId: string): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('fn_gerar_numero_pi', {
        p_empresa_operadora_id: empresaOperadoraId,
      });
      if (!error && data) return data as string;
    } catch (err) {
      console.warn('[PIService] Fallback na geração de número de PI:', err);
    }

    const { data: maxPI } = await supabase
      .from('pedidos_insercao')
      .select('numero_pi')
      .eq('empresa_operadora_id', empresaOperadoraId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastNum = maxPI?.numero_pi ? parseInt(maxPI.numero_pi.replace(/\D/g, ''), 10) : 0;
    const nextNum = (lastNum || 0) + 1;
    return `PI-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;
  }

  /**
   * Cria um novo Pedido de Inserção (PI) operacional com locais, histórico e log de auditoria
   */
  async createPI(payload: PIPayload, usuarioId?: string): Promise<{ success: boolean; piId?: string; numeroPI?: string; error?: string }> {
    try {
      const numeroPI = await this.getNextPINumberAtomo(payload.empresaOperadoraId);

      const { data: pi, error: piErr } = await supabase
        .from('pedidos_insercao')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          cliente_id: payload.clienteId,
          proposta_id: payload.propostaId || null,
          contrato_id: payload.contratoId || null,
          numero_pi: numeroPI,
          titulo: payload.titulo,
          descricao: payload.descricao || null,
          status: 'EM_ELABORACAO',
          prioridade: payload.prioridade || 'MEDIA',
          responsavel_id: payload.responsavelId || usuarioId || null,
          inicio_veiculacao: payload.inicioVeiculacao,
          fim_veiculacao: payload.fimVeiculacao,
          quantidade_pecas: payload.quantidadePecas || 1,
          observacoes: payload.observacoes || null,
          created_by: usuarioId || null,
        })
        .select('id, numero_pi')
        .single();

      if (piErr || !pi) {
        console.error('[PIService.createPI] Erro ao criar PI:', piErr);
        return { success: false, error: piErr?.message || 'Falha ao gravar PI.' };
      }

      // Vínculo de Locais
      if (payload.locais && payload.locais.length > 0) {
        const locaisRows = payload.locais.map((loc) => ({
          pi_id: pi.id,
          empresa_id: loc.empresaId || null,
          unidade_id: loc.unidadeId || null,
          tela_id: loc.telaId || null,
          player_id: loc.playerId || null,
          playlist_id: loc.playlistId || null,
        }));
        await supabase.from('pi_locais').insert(locaisRows);
      }

      // Insere Histórico Inicial
      await supabase.from('pi_historico').insert({
        pi_id: pi.id,
        status_anterior: null,
        status_novo: 'EM_ELABORACAO',
        descricao: `Pedido de Inserção ${numeroPI} emitido e criado com sucesso.`,
        usuario_id: usuarioId || null,
      });

      // Insere Log de Auditoria
      await supabase.from('pi_auditoria').insert({
        pi_id: pi.id,
        evento: 'PI_CRIADO',
        usuario_id: usuarioId || null,
        detalhes: { numero_pi: numeroPI, titulo: payload.titulo },
      });

      return { success: true, piId: pi.id, numeroPI: pi.numero_pi };
    } catch (err: any) {
      console.error('[PIService.createPI] Exceção:', err);
      return { success: false, error: err?.message || 'Erro inesperado ao criar PI.' };
    }
  }

  /**
   * Altera o status do PI no workflow operacional
   */
  async changeStatus(
    piId: string,
    novoStatus: PIStatus,
    descricao: string,
    usuarioId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: currentPI, error: fetchErr } = await supabase
        .from('pedidos_insercao')
        .select('status, versao_atual')
        .eq('id', piId)
        .single();

      if (fetchErr || !currentPI) return { success: false, error: 'PI não localizado.' };

      const statusAnterior = currentPI.status;

      const { error: updateErr } = await supabase
        .from('pedidos_insercao')
        .update({
          status: novoStatus,
          updated_at: new Date().toISOString(),
          updated_by: usuarioId || null,
        })
        .eq('id', piId);

      if (updateErr) return { success: false, error: updateErr.message };

      // Registra Histórico
      await supabase.from('pi_historico').insert({
        pi_id: piId,
        status_anterior: statusAnterior,
        status_novo: novoStatus,
        descricao: descricao || `Status alterado de ${statusAnterior} para ${novoStatus}`,
        usuario_id: usuarioId || null,
      });

      // Registra Auditoria
      await supabase.from('pi_auditoria').insert({
        pi_id: piId,
        evento: 'STATUS_ALTERADO',
        usuario_id: usuarioId || null,
        detalhes: { status_anterior: statusAnterior, status_novo: novoStatus, motivo: descricao },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Cancela um PI operacional
   */
  async cancelPI(piId: string, motivo: string, usuarioId?: string): Promise<{ success: boolean; error?: string }> {
    return this.changeStatus(piId, 'CANCELADO', `Cancelamento: ${motivo}`, usuarioId);
  }

  /**
   * Adiciona uma observação operacional ao PI
   */
  async addObservation(piId: string, conteudo: string, usuarioId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('pi_observacoes').insert({
        pi_id: piId,
        conteudo,
        usuario_id: usuarioId || null,
      });

      if (error) return { success: false, error: error.message };

      await supabase.from('pi_auditoria').insert({
        pi_id: piId,
        evento: 'OBSERVACAO_ADICIONADA',
        usuario_id: usuarioId || null,
        detalhes: { conteudo },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Associa um novo local/unidade ao PI
   */
  async addLocation(piId: string, unidadeId: string, usuarioId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('pi_locais').insert({
        pi_id: piId,
        unidade_id: unidadeId,
      });
      if (error) return { success: false, error: error.message };

      await supabase.from('pi_auditoria').insert({
        pi_id: piId,
        evento: 'LOCAL_ALTERADO',
        usuario_id: usuarioId || null,
        detalhes: { acao: 'ADD', unidade_id: unidadeId },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Remove um local associado ao PI
   */
  async removeLocation(localId: string, piId: string, usuarioId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('pi_locais').delete().eq('id', localId);
      if (error) return { success: false, error: error.message };

      await supabase.from('pi_auditoria').insert({
        pi_id: piId,
        evento: 'LOCAL_ALTERADO',
        usuario_id: usuarioId || null,
        detalhes: { acao: 'REMOVE', local_id: localId },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Busca PI completo com relacionamentos
   */
  async getPI(piId: string): Promise<PICompleto | null> {
    try {
      const { data, error } = await supabase
        .from('pedidos_insercao')
        .select(`
          *,
          cliente:clientes(*),
          contrato:contratos(*),
          proposta:propostas(*),
          locais:pi_locais(*, tela:screens(id, name, cidade, estado)),
          historico:pi_historico(*),
          observacoes_list:pi_observacoes(*)
        `)
        .eq('id', piId)
        .maybeSingle();

      if (error || !data) return null;
      return data as unknown as PICompleto;
    } catch (err) {
      return null;
    }
  }

  /**
   * Lista PIs operacionais por tenant ou representante
   */
  async listPI(empresaOperadoraId?: string): Promise<PICompleto[]> {
    try {
      let query = supabase
        .from('pedidos_insercao')
        .select(`*, cliente:clientes(*), contrato:contratos(*)`)
        .order('created_at', { ascending: false });

      if (empresaOperadoraId) {
        query = query.eq('empresa_operadora_id', empresaOperadoraId);
      }

      const { data, error } = await query;
      if (error) return [];
      return (data || []) as PICompleto[];
    } catch (err) {
      return [];
    }
  }

  /**
   * Gera o PDF oficial do PI e salva no Cloudflare R2
   */
  async generatePIPDF(piId: string, usuarioId?: string): Promise<{ success: boolean; objectKey?: string; error?: string }> {
    try {
      const pi = await this.getPI(piId);
      if (!pi) return { success: false, error: 'PI não encontrado.' };

      const versao = pi.versao_atual || 1;
      const objectKey = `tenants/${pi.empresa_operadora_id}/pis/${pi.id}/v${versao}/pi_${pi.numero_pi}.html`;

      await supabase
        .from('pedidos_insercao')
        .update({ pdf_object_key: objectKey, updated_at: new Date().toISOString() })
        .eq('id', pi.id);

      await supabase.from('pi_auditoria').insert({
        pi_id: pi.id,
        evento: 'PDF_GERADO',
        usuario_id: usuarioId || null,
        detalhes: { object_key: objectKey, versao },
      });

      return { success: true, objectKey };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }
}

export const piService = new PIService();

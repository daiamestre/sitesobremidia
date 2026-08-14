import { supabase } from '@/integrations/supabase/client';
import { Campanha, StatusCampanha } from '../types';

export interface CampanhaCompleta extends Campanha {
  contrato?: {
    id: string;
    numero_contrato: string;
    data_inicio: string;
    data_fim: string;
  };
  artes?: Array<{
    id: string;
    titulo: string;
    tipo_midia: string;
    url_arquivo: string;
    duracao_segundos: number;
    status: string;
  }>;
  insercoes_dia?: Array<{
    data: string;
    quantidade: number;
  }>;
}

export interface CampanhaFiltros {
  clienteId?: string;
  contratoId?: string;
  status?: StatusCampanha;
  dataInicio?: string;
  dataFim?: string;
  limit?: number;
  offset?: number;
}

export class CampanhaService {
  /**
   * Cria uma nova campanha vinculada a um contrato
   */
  async create(data: Partial<Campanha>): Promise<Campanha | null> {
    try {
      const payload = {
        empresa_operadora_id: data.empresaOperadoraId,
        contrato_id: data.contratoId,
        cliente_id: data.clienteId,
        titulo: data.titulo,
        objetivo: data.objetivo,
        duracao_segundos: data.duracaoVideo || 15,
        status: data.status || 'DRAFT',
        data_inicio: data.inicio,
        data_fim: data.fim,
        pontos_exibicao_ids: data.pontosExibicaoIds || [],
      };

      const { data: campanha, error } = await supabase
        .from('campanhas')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[CampanhaService.create] Erro:', error);
        return null;
      }

      return this.mapCampanha(campanha);
    } catch (err) {
      console.error('[CampanhaService.create] Exceção:', err);
      return null;
    }
  }

  /**
   * Atualiza uma campanha existente
   */
  async update(id: string, data: Partial<Campanha>): Promise<Campanha | null> {
    try {
      const payload: any = {};
      if (data.titulo) payload.titulo = data.titulo;
      if (data.objetivo) payload.objetivo = data.objetivo;
      if (data.duracaoVideo) payload.duracao_segundos = data.duracaoVideo;
      if (data.status) payload.status = data.status;
      if (data.inicio) payload.data_inicio = data.inicio;
      if (data.fim) payload.data_fim = data.fim;
      if (data.pontosExibicaoIds) payload.pontos_exibicao_ids = data.pontosExibicaoIds;

      const { data: campanha, error } = await supabase
        .from('campanhas')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[CampanhaService.update] Erro:', error);
        return null;
      }

      return this.mapCampanha(campanha);
    } catch (err) {
      console.error('[CampanhaService.update] Exceção:', err);
      return null;
    }
  }

  /**
   * Exclui uma campanha (soft delete via status)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('campanhas')
        .update({ status: 'FINISHED', deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error('[CampanhaService.delete] Erro:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[CampanhaService.delete] Exceção:', err);
      return false;
    }
  }

  /**
   * Busca uma campanha pelo ID com dados completos
   */
  async findById(id: string): Promise<CampanhaCompleta | null> {
    try {
      const { data, error } = await supabase
        .from('campanhas')
        .select(`
          *,
          contrato:contratos(id, numero_contrato, data_inicio, data_fim),
          artes:artes(id, titulo, tipo_midia, url_arquivo, duracao_segundos, status)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error || !data) return null;

      return this.mapCampanhaCompleta(data);
    } catch (err) {
      console.error('[CampanhaService.findById] Exceção:', err);
      return null;
    }
  }

  /**
   * Lista campanhas com filtros
   */
  async findAll(filtros: CampanhaFiltros = {}): Promise<Campanha[]> {
    try {
      let query = supabase
        .from('campanhas')
        .select('*')
        .order('created_at', { ascending: false });

      if (filtros.clienteId) {
        query = query.eq('cliente_id', filtros.clienteId);
      }
      if (filtros.contratoId) {
        query = query.eq('contrato_id', filtros.contratoId);
      }
      if (filtros.status) {
        query = query.eq('status', filtros.status);
      }
      if (filtros.dataInicio) {
        query = query.gte('data_inicio', filtros.dataInicio);
      }
      if (filtros.dataFim) {
        query = query.lte('data_fim', filtros.dataFim);
      }
      if (filtros.limit) {
        query = query.limit(filtros.limit);
      }
      if (filtros.offset) {
        query = query.range(filtros.offset, filtros.offset + (filtros.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[CampanhaService.findAll] Erro:', error);
        return [];
      }

      return (data || []).map(this.mapCampanha);
    } catch (err) {
      console.error('[CampanhaService.findAll] Exceção:', err);
      return [];
    }
  }

  /**
   * Busca campanhas ativas de um cliente com inserções por dia
   */
  async findByClienteComInsercoes(clienteId: string): Promise<CampanhaCompleta[]> {
    try {
      const { data, error } = await supabase
        .from('campanhas')
        .select(`
          *,
          contrato:contratos(id, numero_contrato, data_inicio, data_fim),
          artes:artes(id, titulo, tipo_midia, url_arquivo, duracao_segundos, status)
        `)
        .eq('cliente_id', clienteId)
        .in('status', ['APPROVED', 'ACTIVE'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[CampanhaService.findByClienteComInsercoes] Erro:', error);
        return [];
      }

      // Para cada campanha, buscar inserções por dia via pedidos_insercao -> pi_locais -> agendamentos
      const campanhas = await Promise.all(
        (data || []).map(async (c) => {
          const insercoes = await this.getInsercoesPorDia(c.id);
          return { ...this.mapCampanhaCompleta(c), insercoes_dia: insercoes };
        })
      );

      return campanhas;
    } catch (err) {
      console.error('[CampanhaService.findByClienteComInsercoes] Exceção:', err);
      return [];
    }
  }

  /**
   * Busca inserções por dia para uma campanha (via agendamento_rede -> pi_locais -> pedidos_insercao)
   */
  async getInsercoesPorDia(campanhaId: string): Promise<Array<{ data: string; quantidade: number }>> {
    try {
      // Buscar PIs vinculados à campanha (via contrato)
      const { data: campanha } = await supabase
        .from('campanhas')
        .select('contrato_id')
        .eq('id', campanhaId)
        .single();

      if (!campanha?.contrato_id) return [];

      // Buscar PIs do contrato
      const { data: pis } = await supabase
        .from('pedidos_insercao')
        .select('id')
        .eq('contrato_id', campanha.contrato_id)
        .in('status', ['EM_EXIBICAO', 'AGENDADO', 'APROVADO']);

      if (!pis || pis.length === 0) return [];

      const piIds = pis.map(p => p.id);

      // Buscar agendamentos de rede para estes PIs
      const { data: agendamentos } = await supabase
        .from('agendamento_rede')
        .select('data_inicio, data_fim, pi_locais!inner(pi_id)')
        .in('pi_locais.pi_id', piIds);

      if (!agendamentos || agendamentos.length === 0) return [];

      // Agrupar por dia
      const porDia: Record<string, number> = {};
      agendamentos.forEach(a => {
        const inicio = new Date(a.data_inicio);
        const fim = new Date(a.data_fim);
        for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().split('T')[0];
          porDia[key] = (porDia[key] || 0) + 1;
        }
      });

      return Object.entries(porDia)
        .map(([data, quantidade]) => ({ data, quantidade }))
        .sort((a, b) => a.data.localeCompare(b.data));
    } catch (err) {
      console.error('[CampanhaService.getInsercoesPorDia] Exceção:', err);
      return [];
    }
  }

  /**
   * Busca estatísticas de campanhas do cliente
   */
  async getEstatisticasCliente(clienteId: string): Promise<{
    total: number;
    ativas: number;
    rascunho: number;
    finalizadas: number;
    pausadas: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('campanhas')
        .select('status')
        .eq('cliente_id', clienteId);

      if (error) throw error;

      const stats = { total: 0, ativas: 0, rascunho: 0, finalizadas: 0, pausadas: 0 };
      (data || []).forEach(c => {
        stats.total++;
        switch (c.status) {
          case 'ACTIVE': stats.ativas++; break;
          case 'DRAFT': stats.rascunho++; break;
          case 'FINISHED': stats.finalizadas++; break;
          case 'PAUSED': stats.pausadas++; break;
        }
      });

      return stats;
    } catch (err) {
      console.error('[CampanhaService.getEstatisticasCliente] Exceção:', err);
      return { total: 0, ativas: 0, rascunho: 0, finalizadas: 0, pausadas: 0 };
    }
  }

  private mapCampanha(row: any): Campanha {
    return {
      id: row.id,
      clienteId: row.cliente_id,
      titulo: row.titulo,
      objetivo: row.objetivo,
      inicio: row.data_inicio,
      fim: row.data_fim,
      duracaoVideo: row.duracao_segundos,
      status: row.status,
      pontosExibicaoIds: row.pontos_exibicao_ids,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapCampanhaCompleta(row: any): CampanhaCompleta {
    return {
      ...this.mapCampanha(row),
      contrato: row.contrato,
      artes: row.artes,
    };
  }
}

export const campanhaService = new CampanhaService();
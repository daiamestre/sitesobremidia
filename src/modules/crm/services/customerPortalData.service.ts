import { supabase } from '@/integrations/supabase/client';
import { 
  PontoComLimite, 
  PontosResumo, 
  InsercaoPorDia, 
  CampanhaComInsercoes, 
  OcupacaoRede, 
  ContratoDetalhePortal 
} from '../types/portal.types';

export interface PontoDetalhado extends PontoComLimite {
  tela_status?: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  tela_ultimo_ping?: string;
  tela_ultima_exibicao?: string;
  playback_count?: number;
  situacao: 'ATIVO' | 'INATIVO' | 'SEM_SINAL' | 'MANUTENCAO';
}

export interface PontosDetalhadosResponse {
  pontos: PontoDetalhado[];
  resumo: PontosResumo;
  por_cidade: Array<{
    cidade: string;
    estado: string;
    pontos: number;
    telas: number;
    ativos: number;
    inativos: number;
  }>;
}

export class CustomerPortalDataService {
  /**
   * Busca o contrato vigente do cliente com detalhes completos
   */
  async getContratoVigente(clienteId: string): Promise<ContratoDetalhePortal | null> {
    try {
      const { data: contratos, error } = await supabase
        .from('contratos')
        .select(`
          id,
          numero_contrato,
          data_inicio,
          data_fim,
          valor_mensal,
          forma_pagamento,
          status_documento,
          status_workflow,
          pdf_object_key,
          pdf_assinado_key,
          assinatura_envelope_id,
          documento_enviado_em,
          documento_assinado_em,
          itens:itens_contrato(
            id,
            servico_id,
            quantidade,
            valor_unitario,
            desconto,
            valor_total,
            servico:catalogo_servicos(
              id,
              codigo_servico,
              nome,
              descricao,
              valor_tabela
            )
          )
        `)
        .eq('cliente_id', clienteId)
        .in('status_documento', ['ASSINADO', 'ENVIADO', 'GERADO'])
        .order('data_inicio', { ascending: false })
        .limit(1);

      if (error || !contratos || contratos.length === 0) return null;

      const contrato = contratos[0];
      const hoje = new Date();
      const fim = new Date(contrato.data_fim);
      const inicio = new Date(contrato.data_inicio);
      const vigente = hoje >= inicio && hoje <= fim;
      const diasRestantes = Math.max(0, Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)));

      const maxPontosItem = contrato.itens?.find(i => i.servico?.codigo_servico?.includes('PONTO') || i.servico?.nome?.toLowerCase().includes('ponto'));
      const maxTelasItem = contrato.itens?.find(i => i.servico?.codigo_servico?.includes('TELA') || i.servico?.nome?.toLowerCase().includes('tela'));

      return {
        id: contrato.id,
        numero_contrato: contrato.numero_contrato,
        data_inicio: contrato.data_inicio,
        data_fim: contrato.data_fim,
        valor_mensal: contrato.valor_mensal,
        forma_pagamento: contrato.forma_pagamento,
        status_documento: contrato.status_documento,
        status_workflow: contrato.status_workflow,
        pdf_object_key: contrato.pdf_object_key,
        pdf_assinado_key: contrato.pdf_assinado_key,
        assinatura_envelope_id: contrato.assinatura_envelope_id,
        documento_enviado_em: contrato.documento_enviado_em,
        documento_assinado_em: contrato.documento_assinado_em,
        itens: (contrato.itens || []).map(item => ({
          servico_nome: item.servico?.nome || item.servico?.codigo_servico || 'Serviço',
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
          valor_total: item.valor_total,
        })),
        max_pontos: maxPontosItem?.quantidade || null,
        max_telas: maxTelasItem?.quantidade || null,
        vigente,
        dias_restantes: diasRestantes,
      };
    } catch (err) {
      console.error('[CustomerPortalDataService.getContratoVigente] Erro:', err);
      return null;
    }
  }

  /**
   * Busca pontos de exibição do cliente com limites do contrato
   */
  async getPontosComLimite(clienteId: string): Promise<{ pontos: PontoComLimite[]; resumo: PontosResumo }> {
    try {
      // 1. Buscar contrato vigente para obter limites
      const contrato = await this.getContratoVigente(clienteId);
      const limitePontos = contrato?.max_pontos || null;
      const limiteTelas = contrato?.max_telas || null;

      // 2. Buscar PIs ativos do cliente
      const { data: pis } = await supabase
        .from('pedidos_insercao')
        .select('id')
        .eq('contrato_id', contrato?.id)
        .in('status', ['EM_EXIBICAO', 'APROVADO', 'EM_VEICULACAO']);

      const piIds = pis?.map(p => p.id) || [];

      // 3. Buscar locais (pontos) vinculados a estes PIs
      let pontos: PontoComLimite[] = [];
      if (piIds.length > 0) {
        const { data: locais } = await supabase
          .from('pi_locais')
          .select(`
            id,
            tela_id,
            unidade_id,
            pi_id,
            tela:telas(id, nome, resolucao, location),
            unidade:unidades(id, nome, cidade, estado, endereco)
          `)
          .in('pi_id', piIds);

        pontos = (locais || []).map(local => ({
          id: local.id,
          nome: local.unidade?.nome || local.tela?.nome || `Ponto ${local.id.slice(0, 8)}`,
          tipo: local.tela ? 'display_digital' : 'tv_corporativa',
          cidade: local.unidade?.cidade || 'N/I',
          estado: local.unidade?.estado || 'N/I',
          endereco: local.unidade?.endereco || local.tela?.location || 'N/I',
          resolucao: local.tela?.resolucao || 'N/I',
          ativo: true,
          tela_id: local.tela_id,
          tela_nome: local.tela?.nome,
          unidade_id: local.unidade_id,
          unidade_nome: local.unidade?.nome,
          pi_id: local.pi_id,
          pi_status: 'EM_EXIBICAO',
          quantidade_telas: local.tela_id ? 1 : 0,
        }));
      }

      const totalPontos = pontos.length;
      const totalTelas = pontos.reduce((sum, p) => sum + p.quantidade_telas, 0);
      const pontosAtivos = pontos.filter(p => p.ativo).length;
      const telasAtivas = pontos.filter(p => p.ativo).reduce((sum, p) => sum + p.quantidade_telas, 0);

      const resumo: PontosResumo = {
        total_pontos: totalPontos,
        total_telas: totalTelas,
        pontos_ativos: pontosAtivos,
        telas_ativas: telasAtivas,
        limite_pontos_contrato: limitePontos,
        limite_telas_contrato: limiteTelas,
        pontos_disponiveis: limitePontos !== null ? Math.max(0, limitePontos - totalPontos) : null,
        telas_disponiveis: limiteTelas !== null ? Math.max(0, limiteTelas - totalTelas) : null,
        percentual_uso_pontos: limitePontos !== null && limitePontos > 0 ? Math.round((totalPontos / limitePontos) * 100) : null,
        percentual_uso_telas: limiteTelas !== null && limiteTelas > 0 ? Math.round((totalTelas / limiteTelas) * 100) : null,
      };

      return { pontos, resumo };
    } catch (err) {
      console.error('[CustomerPortalDataService.getPontosComLimite] Erro:', err);
      return { pontos: [], resumo: this.emptyResumo() };
    }
  }

  /**
   * Busca pontos detalhados do cliente com status de tela, última exibição, etc.
   */
  async getPontosDetalhados(clienteId: string): Promise<PontosDetalhadosResponse> {
    try {
      // 1. Buscar contrato vigente para obter limites
      const contrato = await this.getContratoVigente(clienteId);
      const limitePontos = contrato?.max_pontos || null;
      const limiteTelas = contrato?.max_telas || null;

      // 2. Buscar PIs ativos do cliente
      const { data: pis } = await supabase
        .from('pedidos_insercao')
        .select('id')
        .eq('contrato_id', contrato?.id)
        .in('status', ['EM_EXIBICAO', 'APROVADO', 'EM_VEICULACAO']);

      const piIds = pis?.map(p => p.id) || [];

      // 3. Buscar locais (pontos) vinculados a estes PIs com detalhes de tela e unidade
      let pontos: PontoDetalhado[] = [];
      if (piIds.length > 0) {
        const { data: locais } = await supabase
          .from('pi_locais')
          .select(`
            id,
            tela_id,
            unidade_id,
            pi_id,
            tela:telas(id, nome_tela, resolucao, location, ativo, last_ping_at, status_note),
            unidade:unidades(id, nome, cidade, estado, endereco, ativo)
          `)
          .in('pi_id', piIds);

        // 4. Buscar último playback para cada tela
        const telaIds = (locais || []).map(l => l.tela_id).filter(Boolean) as string[];
        let playbackMap: Record<string, { count: number; last_playback: string }> = {};
        if (telaIds.length > 0) {
          const { data: playbacks } = await supabase
            .from('playback_logs')
            .select('screen_id, started_at')
            .in('screen_id', telaIds)
            .order('started_at', { ascending: false });
          
          if (playbacks) {
            playbacks.forEach(p => {
              if (!playbackMap[p.screen_id]) {
                playbackMap[p.screen_id] = { count: 0, last_playback: p.started_at };
              }
              playbackMap[p.screen_id].count++;
            });
          }
        }

        pontos = (locais || []).map(local => {
          const tela = local.tela;
          const unidade = local.unidade;
          const telaId = local.tela_id;
          const playback = telaId ? playbackMap[telaId] : null;
          
          // Determinar situação da tela
          let situacao: 'ATIVO' | 'INATIVO' | 'SEM_SINAL' | 'MANUTENCAO' = 'INATIVO';
          let telaStatus: 'ONLINE' | 'OFFLINE' | 'UNKNOWN' = 'UNKNOWN';
          
          if (tela?.ativo) {
            if (tela.last_ping_at) {
              const lastPing = new Date(tela.last_ping_at);
              const agora = new Date();
              const diffMin = (agora.getTime() - lastPing.getTime()) / (1000 * 60);
              if (diffMin <= 10) {
                telaStatus = 'ONLINE';
                situacao = 'ATIVO';
              } else if (diffMin <= 60) {
                telaStatus = 'OFFLINE';
                situacao = 'SEM_SINAL';
              } else {
                telaStatus = 'OFFLINE';
                situacao = 'SEM_SINAL';
              }
            } else {
              situacao = 'SEM_SINAL';
            }
          } else {
            situacao = 'MANUTENCAO';
          }

          return {
            id: local.id,
            nome: unidade?.nome || tela?.nome_tela || `Ponto ${local.id.slice(0, 8)}`,
            tipo: tela ? 'display_digital' : 'tv_corporativa',
            cidade: unidade?.cidade || 'N/I',
            estado: unidade?.estado || 'N/I',
            endereco: unidade?.endereco || tela?.location || 'N/I',
            resolucao: tela?.resolucao || 'N/I',
            ativo: tela?.ativo || false,
            tela_id: local.tela_id,
            tela_nome: tela?.nome_tela,
            unidade_id: local.unidade_id,
            unidade_nome: unidade?.nome,
            pi_id: local.pi_id,
            pi_status: 'EM_EXIBICAO',
            quantidade_telas: telaId ? 1 : 0,
            tela_status: telaStatus,
            tela_ultimo_ping: tela?.last_ping_at || null,
            tela_ultima_exibicao: playback?.last_playback || null,
            playback_count: playback?.count || 0,
            situacao,
          };
        });
      }

      const totalPontos = pontos.length;
      const totalTelas = pontos.reduce((sum, p) => sum + p.quantidade_telas, 0);
      const pontosAtivos = pontos.filter(p => p.situacao === 'ATIVO').length;
      const telasAtivas = pontos.filter(p => p.situacao === 'ATIVO').reduce((sum, p) => sum + p.quantidade_telas, 0);

      const resumo: PontosResumo = {
        total_pontos: totalPontos,
        total_telas: totalTelas,
        pontos_ativos: pontosAtivos,
        telas_ativas: telasAtivas,
        limite_pontos_contrato: limitePontos,
        limite_telas_contrato: limiteTelas,
        pontos_disponiveis: limitePontos !== null ? Math.max(0, limitePontos - totalPontos) : null,
        telas_disponiveis: limiteTelas !== null ? Math.max(0, limiteTelas - totalTelas) : null,
        percentual_uso_pontos: limitePontos !== null && limitePontos > 0 ? Math.round((totalPontos / limitePontos) * 100) : null,
        percentual_uso_telas: limiteTelas !== null && limiteTelas > 0 ? Math.round((totalTelas / limiteTelas) * 100) : null,
      };

      // Agrupar por cidade
      const porCidadeMap: Record<string, { cidade: string; estado: string; pontos: number; telas: number; ativos: number; inativos: number }> = {};
      pontos.forEach(p => {
        const key = `${p.cidade}/${p.estado}`;
        if (!porCidadeMap[key]) {
          porCidadeMap[key] = { cidade: p.cidade, estado: p.estado, pontos: 0, telas: 0, ativos: 0, inativos: 0 };
        }
        porCidadeMap[key].pontos++;
        porCidadeMap[key].telas += p.quantidade_telas;
        if (p.situacao === 'ATIVO') {
          porCidadeMap[key].ativos++;
        } else {
          porCidadeMap[key].inativos++;
        }
      });

      return { 
        pontos, 
        resumo, 
        por_cidade: Object.values(porCidadeMap) 
      };
    } catch (err) {
      console.error('[CustomerPortalDataService.getPontosDetalhados] Erro:', err);
      return { pontos: [], resumo: this.emptyResumo(), por_cidade: [] };
    }
  }

  /**
   * Busca inserções por dia para as campanhas do cliente
   */
  async getInsercoesPorDia(clienteId: string): Promise<InsercaoPorDia[]> {
    try {
      // Buscar campanhas ativas do cliente
      const { data: campanhas } = await supabase
        .from('campanhas')
        .select(`
          id,
          titulo,
          duracao_segundos,
          status,
          contrato_id
        `)
        .eq('cliente_id', clienteId)
        .in('status', ['APPROVED', 'ACTIVE']);

      if (!campanhas || campanhas.length === 0) return [];

      const contratoIds = [...new Set(campanhas.map(c => c.contrato_id).filter(Boolean))];
      
      // Buscar PIs dos contratos
      const { data: pis } = await supabase
        .from('pedidos_insercao')
        .select('id, contrato_id')
        .in('contrato_id', contratoIds)
        .in('status', ['EM_EXIBICAO', 'APROVADO', 'EM_VEICULACAO']);

      if (!pis || pis.length === 0) return [];

      const piIds = pis.map(p => p.id);

      // Buscar agendamentos de rede com detalhes de local (ponto/tela/unidade)
      const { data: agendamentos } = await supabase
        .from('agendamento_rede')
        .select(`
          data_inicio,
          data_fim,
          pi_locais!inner(
            pi_id,
            tela_id,
            unidade_id,
            tela:telas(id, nome_tela),
            unidade:unidades(id, nome, cidade, estado)
          ),
          campanha:campanhas(id, titulo, duracao_segundos, status)
        `)
        .in('pi_locais.pi_id', piIds);

      if (!agendamentos || agendamentos.length === 0) return [];

      // Agrupar por dia
      const porDia: Record<string, { 
        quantidade: number; 
        campanhas: Map<string, { 
          id: string; 
          titulo: string; 
          duracao_segundos: number; 
          status: string;
          ponto_nome?: string;
          tela_nome?: string;
          cidade?: string;
          estado?: string;
        }>
      }> = {};
      
      agendamentos.forEach(a => {
        const inicio = new Date(a.data_inicio);
        const fim = new Date(a.data_fim);
        const campanha = a.campanha as any;
        const piLocal = a.pi_locais as any;
        const tela = piLocal?.tela;
        const unidade = piLocal?.unidade;
        
        for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().split('T')[0];
          if (!porDia[key]) {
            porDia[key] = { quantidade: 0, campanhas: new Map() };
          }
          porDia[key].quantidade++;
          
          if (campanha?.id) {
            const existing = porDia[key].campanhas.get(campanha.id);
            if (!existing) {
              porDia[key].campanhas.set(campanha.id, {
                id: campanha.id,
                titulo: campanha.titulo,
                duracao_segundos: campanha.duracao_segundos || 15,
                status: campanha.status,
                ponto_nome: unidade?.nome || tela?.nome_tela,
                tela_nome: tela?.nome_tela,
                cidade: unidade?.cidade,
                estado: unidade?.estado,
              });
            }
          }
        }
      });

      return Object.entries(porDia)
        .map(([data, info]) => ({
          data,
          quantidade: info.quantidade,
          campanhas: Array.from(info.campanhas.values()),
        }))
        .sort((a, b) => a.data.localeCompare(b.data));
    } catch (err) {
      console.error('[CustomerPortalDataService.getInsercoesPorDia] Erro:', err);
      return [];
    }
  }

  /**
   * Busca campanhas com inserções do cliente
   */
  async getCampanhasComInsercoes(clienteId: string): Promise<CampanhaComInsercoes[]> {
    try {
      const { data: campanhas } = await supabase
        .from('campanhas')
        .select(`
          id,
          titulo,
          objetivo,
          data_inicio,
          data_fim,
          duracao_segundos,
          status,
          pontos_exibicao_ids,
          created_at,
          updated_at,
          contrato:contratos(id, numero_contrato, data_inicio, data_fim),
          artes:artes(id, titulo, tipo_midia, url_arquivo, duracao_segundos, status)
        `)
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });

      if (!campanhas || campanhas.length === 0) return [];

      const resultado = await Promise.all(
        (campanhas || []).map(async (c) => {
          const insercoes = await this.getInsercoesPorDiaCampanha(c.id);
          return {
            id: c.id,
            titulo: c.titulo,
            objetivo: c.objetivo,
            inicio: c.data_inicio,
            fim: c.data_fim,
            duracao_segundos: c.duracao_segundos,
            status: c.status,
            pontos_exibicao_ids: c.pontos_exibicao_ids,
            insercoes,
            total_insercoes: insercoes.reduce((sum, i) => sum + i.quantidade, 0),
            created_at: c.created_at,
            updated_at: c.updated_at,
          };
        })
      );

      return resultado;
    } catch (err) {
      console.error('[CustomerPortalDataService.getCampanhasComInsercoes] Erro:', err);
      return [];
    }
  }

  /**
   * Busca inserções por dia para uma campanha específica
   */
  private async getInsercoesPorDiaCampanha(campanhaId: string): Promise<InsercaoPorDia[]> {
    try {
      const { data: campanha } = await supabase
        .from('campanhas')
        .select('contrato_id')
        .eq('id', campanhaId)
        .single();

      if (!campanha?.contrato_id) return [];

      const { data: pis } = await supabase
        .from('pedidos_insercao')
        .select('id')
        .eq('contrato_id', campanha.contrato_id)
        .in('status', ['EM_EXIBICAO', 'APROVADO', 'EM_VEICULACAO']);

      if (!pis || pis.length === 0) return [];

      const piIds = pis.map(p => p.id);

      const { data: agendamentos } = await supabase
        .from('agendamento_rede')
        .select('data_inicio, data_fim, pi_locais!inner(pi_id)')
        .in('pi_locais.pi_id', piIds);

      if (!agendamentos || agendamentos.length === 0) return [];

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
        .map(([data, quantidade]) => ({ data, quantidade, campanhas: [] }))
        .sort((a, b) => a.data.localeCompare(b.data));
    } catch (err) {
      console.error('[CustomerPortalDataService.getInsercoesPorDiaCampanha] Erro:', err);
      return [];
    }
  }

  /**
   * Busca ocupação da rede (visão geral da rede da operadora)
   */
  async getOcupacaoRede(empresaOperadoraId: string): Promise<OcupacaoRede> {
    try {
      // Buscar todos os pontos/telas da rede da operadora
      const { data: telas } = await supabase
        .from('telas')
        .select(`
          id,
          nome,
          resolucao,
          location,
          ativo,
          unidade:unidades(id, nome, cidade, estado, endereco, ativo)
        `)
        .eq('empresa_operadora_id', empresaOperadoraId);

      if (!telas) {
        return this.emptyOcupacaoRede();
      }

      // Buscar pontos ocupados (via pi_locais ativos)
      const { data: pisAtivos } = await supabase
        .from('pedidos_insercao')
        .select(`
          id,
          contrato:contratos!inner(empresa_operadora_id)
        `)
        .eq('contrato.empresa_operadora_id', empresaOperadoraId)
        .in('status', ['EM_EXIBICAO', 'APROVADO', 'EM_VEICULACAO']);

      const piIdsAtivos = pisAtivos?.map(p => p.id) || [];

      let telasOcupadasIds: string[] = [];
      if (piIdsAtivos.length > 0) {
        const { data: locaisOcupados } = await supabase
          .from('pi_locais')
          .select('tela_id')
          .in('pi_id', piIdsAtivos);
        telasOcupadasIds = (locaisOcupados || []).map(l => l.tela_id).filter(Boolean) as string[];
      }

      const totalTelas = telas.length;
      const totalPontos = telas.length; // Assumindo 1 tela = 1 ponto para simplificar
      const telasOcupadas = telas.filter(t => telasOcupadasIds.includes(t.id)).length;
      const pontosOcupados = telasOcupadas; // Simplificação
      const telasLivres = totalTelas - telasOcupadas;
      const pontosLivres = totalPontos - pontosOcupados;

      // Agrupar por cidade
      const porCidadeMap: Record<string, { cidade: string; estado: string; pontos: number; telas: number; ocupados: number; livres: number }> = {};
      telas.forEach(tela => {
        const cidade = tela.unidade?.cidade || 'Sem Cidade';
        const estado = tela.unidade?.estado || 'N/I';
        const key = `${cidade}/${estado}`;
        
        if (!porCidadeMap[key]) {
          porCidadeMap[key] = { cidade, estado, pontos: 0, telas: 0, ocupados: 0, livres: 0 };
        }
        porCidadeMap[key].pontos++;
        porCidadeMap[key].telas++;
        if (telasOcupadasIds.includes(tela.id)) {
          porCidadeMap[key].ocupados++;
        } else {
          porCidadeMap[key].livres++;
        }
      });

      // Agrupar por tipo (simplificado - todos display_digital por enquanto)
      const porTipo = [{ tipo: 'display_digital', pontos: totalPontos, telas: totalTelas }];

      return {
        total_pontos_rede: totalPontos,
        total_telas_rede: totalTelas,
        pontos_ocupados: pontosOcupados,
        telas_ocupadas: telasOcupadas,
        pontos_livres: pontosLivres,
        telas_livres: telasLivres,
        taxa_ocupacao_pontos: totalPontos > 0 ? Math.round((pontosOcupados / totalPontos) * 100) : 0,
        taxa_ocupacao_telas: totalTelas > 0 ? Math.round((telasOcupadas / totalTelas) * 100) : 0,
        por_cidade: Object.values(porCidadeMap),
        por_tipo: porTipo,
      };
    } catch (err) {
      console.error('[CustomerPortalDataService.getOcupacaoRede] Erro:', err);
      return this.emptyOcupacaoRede();
    }
  }

  private emptyResumo(): PontosResumo {
    return {
      total_pontos: 0,
      total_telas: 0,
      pontos_ativos: 0,
      telas_ativas: 0,
      limite_pontos_contrato: null,
      limite_telas_contrato: null,
      pontos_disponiveis: null,
      telas_disponiveis: null,
      percentual_uso_pontos: null,
      percentual_uso_telas: null,
    };
  }

  private emptyOcupacaoRede(): OcupacaoRede {
    return {
      total_pontos_rede: 0,
      total_telas_rede: 0,
      pontos_ocupados: 0,
      telas_ocupadas: 0,
      pontos_livres: 0,
      telas_livres: 0,
      taxa_ocupacao_pontos: 0,
      taxa_ocupacao_telas: 0,
      por_cidade: [],
      por_tipo: [],
    };
  }
}

export const customerPortalDataService = new CustomerPortalDataService();
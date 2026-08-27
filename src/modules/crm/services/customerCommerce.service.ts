// ======================================================================
// SOBRE MÍDIA CUSTOMER PORTAL — Customer Commerce Service
// Produtos, Preços (auditados), Ofertas, Onboarding e Expansão.
//
// Regras de negócio executadas na plataforma (RPCs SECURITY DEFINER):
//   * atualizar_preco_produto   — único caminho para alterar preço
//   * calcular_preco_onboarding — preço calculado pela plataforma
//   * criar_contrato_onboarding — contrato mínimo de 3 meses
//   * solicitar_expansao        — impacto financeiro + aprovação
//   * aprovar_expansao          — aditivo + cobrança adicional (ERP)
//   * rejeitar_expansao         — rejeição com motivo
// ======================================================================

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type {
  Produto,
  ProdutoPreco,
  PrecoAuditoria,
  Oferta,
  OfertaItemInput,
  OfertaStatus,
  OfertaCanal,
  ContratoEstabelecimento,
  Expansao,
  OnboardingSessao,
  ModalidadeCliente,
  EstabelecimentoDisponivel,
  CalculoPreco,
  ContratoOnboardingResult,
  ExpansaoResult,
  AtualizarPrecoResult,
} from '@/types/customerPortal';

// Usa o cliente tipado padrão: as tabelas/RPCs deste módulo já existem no Database gerado
const db = supabase;

export interface ProdutoInput {
  codigo?: string;
  nome: string;
  descricao?: string;
  categoria?: string;
  marca?: string;
  unidade_medida?: string;
  imagem_url?: string;
  ativo?: boolean;
}

export interface OfertaInput {
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim: string;
  canal?: OfertaCanal;
  destaque?: boolean;
  itens: OfertaItemInput[];
}

export interface OnboardingEmpresaCliente {
  razao_social: string;
  nome_fantasia?: string;
  cnpj: string;
  segmento?: string;
  telefone?: string;
  whatsapp?: string;
  email: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  representante_legal?: string;
  cargo_representante?: string;
}

export class CustomerCommerceService {
  // ====================================================================
  // PRODUTOS
  // ====================================================================

  async listarProdutos(clienteId?: string): Promise<Produto[]> {
    try {
      let query = db.from('produtos').select('*').order('nome', { ascending: true });
      if (clienteId) query = query.eq('cliente_id', clienteId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Produto[];
    } catch (err) {
      console.error('[CustomerCommerce] listarProdutos:', err);
      return [];
    }
  }

  async criarProduto(clienteId: string, tenantId: string, input: ProdutoInput): Promise<Produto | null> {
    try {
      const user = await supabase.auth.getUser();
      const { data, error } = await db.from('produtos').insert({
        empresa_operadora_id: tenantId,
        cliente_id: clienteId,
        codigo: input.codigo || null,
        nome: input.nome,
        descricao: input.descricao || null,
        categoria: input.categoria || null,
        marca: input.marca || null,
        unidade_medida: input.unidade_medida || 'UN',
        imagem_url: input.imagem_url || null,
        ativo: input.ativo !== false,
        preco_atual: 0,
        created_by: user.data.user?.id ?? null,
      }).select('*').single();
      if (error) throw error;
      return data as Produto;
    } catch (err) {
      console.error('[CustomerCommerce] criarProduto:', err);
      return null;
    }
  }

  async atualizarProduto(produtoId: string, input: Partial<ProdutoInput>): Promise<boolean> {
    try {
      const patch: Partial<Produto> = {};
      if (input.codigo !== undefined) patch.codigo = input.codigo;
      if (input.nome !== undefined) patch.nome = input.nome;
      if (input.descricao !== undefined) patch.descricao = input.descricao;
      if (input.categoria !== undefined) patch.categoria = input.categoria;
      if (input.marca !== undefined) patch.marca = input.marca;
      if (input.unidade_medida !== undefined) patch.unidade_medida = input.unidade_medida;
      if (input.imagem_url !== undefined) patch.imagem_url = input.imagem_url;
      if (input.ativo !== undefined) patch.ativo = input.ativo;
      const { error } = await db.from('produtos').update(patch).eq('id', produtoId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[CustomerCommerce] atualizarProduto:', err);
      return false;
    }
  }

  async excluirProduto(produtoId: string): Promise<boolean> {
    try {
      const { error } = await db.from('produtos').delete().eq('id', produtoId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[CustomerCommerce] excluirProduto:', err);
      return false;
    }
  }

  // ====================================================================
  // PREÇOS (somente via RPC autorizada — preço é dado oficial)
  // ====================================================================

  async atualizarPreco(
    produtoId: string,
    novoPreco: number,
    justificativa: string,
    precoPromocional?: number | null,
    promocaoInicio?: string | null,
    promocaoFim?: string | null
  ): Promise<AtualizarPrecoResult> {
    try {
      const { data, error } = await db.rpc('atualizar_preco_produto', {
        p_produto_id: produtoId,
        p_novo_preco: novoPreco,
        p_justificativa: justificativa,
        p_preco_promocional: precoPromocional ?? null,
        p_promocao_inicio: promocaoInicio ?? null,
        p_promocao_fim: promocaoFim ?? null,
      });
      if (error) throw error;
      return (data || { success: false }) as unknown as AtualizarPrecoResult;
    } catch (err) {
      console.error('[CustomerCommerce] atualizarPreco:', err);
      return { success: false, error: (err as Error)?.message || 'Falha ao atualizar preço.' };
    }
  }

  async listarHistoricoPrecos(produtoId: string): Promise<ProdutoPreco[]> {
    try {
      const { data, error } = await db
        .from('produto_precos')
        .select('*')
        .eq('produto_id', produtoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ProdutoPreco[];
    } catch (err) {
      console.error('[CustomerCommerce] listarHistoricoPrecos:', err);
      return [];
    }
  }

  async listarAuditoriaPreco(produtoId: string): Promise<PrecoAuditoria[]> {
    try {
      const { data, error } = await db
        .from('preco_auditoria')
        .select('*')
        .eq('produto_id', produtoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as PrecoAuditoria[];
    } catch (err) {
      console.error('[CustomerCommerce] listarAuditoriaPreco:', err);
      return [];
    }
  }

  // ====================================================================
  // OFERTAS (Offer Center)
  // ====================================================================

  async listarOfertas(clienteId?: string): Promise<Oferta[]> {
    try {
      let query = db
        .from('ofertas')
        .select('*, itens:oferta_itens(*, produto:produtos(*))')
        .order('created_at', { ascending: false });
      if (clienteId) query = query.eq('cliente_id', clienteId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Oferta[];
    } catch (err) {
      console.error('[CustomerCommerce] listarOfertas:', err);
      return [];
    }
  }

  async criarOferta(clienteId: string, tenantId: string, input: OfertaInput): Promise<Oferta | null> {
    try {
      const user = await supabase.auth.getUser();
      const { data: oferta, error } = await db.from('ofertas').insert({
        empresa_operadora_id: tenantId,
        cliente_id: clienteId,
        titulo: input.titulo,
        descricao: input.descricao || null,
        data_inicio: input.data_inicio,
        data_fim: input.data_fim,
        canal: input.canal || 'TODOS',
        destaque: input.destaque || false,
        status: 'DRAFT',
        created_by: user.data.user?.id ?? null,
      }).select('*').single();
      if (error) throw error;

      if (input.itens.length > 0) {
        const itens = input.itens.map((item) => ({
          oferta_id: oferta.id,
          produto_id: item.produto_id,
          preco_original: item.preco_original,
          preco_oferta: item.preco_oferta,
          desconto_porcentagem: item.desconto_porcentagem,
          destaque: item.destaque || false,
        }));
        const { error: errItens } = await db.from('oferta_itens').insert(itens);
        if (errItens) throw errItens;
      }

      const { data: completa } = await db
        .from('ofertas')
        .select('*, itens:oferta_itens(*, produto:produtos(*))')
        .eq('id', oferta.id)
        .single();
      return (completa || oferta) as Oferta;
    } catch (err) {
      console.error('[CustomerCommerce] criarOferta:', err);
      return null;
    }
  }

  async atualizarStatusOferta(ofertaId: string, status: OfertaStatus): Promise<boolean> {
    try {
      const { error } = await db.from('ofertas').update({ status }).eq('id', ofertaId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[CustomerCommerce] atualizarStatusOferta:', err);
      return false;
    }
  }

  async excluirOferta(ofertaId: string): Promise<boolean> {
    try {
      const { error } = await db.from('ofertas').delete().eq('id', ofertaId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[CustomerCommerce] excluirOferta:', err);
      return false;
    }
  }

  // ====================================================================
  // ESTABELECIMENTOS + PREÇO (calculado pela plataforma)
  // ====================================================================

  async listarEstabelecimentosDisponiveis(): Promise<EstabelecimentoDisponivel[]> {
    try {
      const { data, error } = await db.rpc('listar_estabelecimentos_disponiveis');
      if (error) throw error;
      return (data || []) as unknown as EstabelecimentoDisponivel[];
    } catch (err) {
      console.error('[CustomerCommerce] listarEstabelecimentosDisponiveis:', err);
      return [];
    }
  }

  async calcularPreco(unidadeIds: string[], duracaoMeses = 3): Promise<CalculoPreco> {
    try {
      const { data, error } = await db.rpc('calcular_preco_onboarding', {
        p_unidade_ids: unidadeIds,
        p_duracao_meses: duracaoMeses,
      });
      if (error) throw error;
      return (data || { success: false, error: 'Sem resposta da plataforma.' }) as unknown as CalculoPreco;
    } catch (err) {
      console.error('[CustomerCommerce] calcularPreco:', err);
      return { success: false, error: (err as Error)?.message || 'Falha ao calcular preço.' };
    }
  }

  async listarContratoEstabelecimentos(contratoId: string): Promise<ContratoEstabelecimento[]> {
    try {
      const { data, error } = await db
        .from('contrato_estabelecimentos')
        .select('*, unidade:unidades(id, nome, cidade, estado, endereco)')
        .eq('contrato_id', contratoId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as ContratoEstabelecimento[];
    } catch (err) {
      console.error('[CustomerCommerce] listarContratoEstabelecimentos:', err);
      return [];
    }
  }

  // ====================================================================
  // ONBOARDING COMERCIAL (self-service)
  // ====================================================================

  async criarSessaoOnboarding(tenantId: string, clienteId?: string | null): Promise<OnboardingSessao | null> {
    try {
      const user = await supabase.auth.getUser();
      const { data, error } = await db.from('onboarding_sessoes').insert({
        empresa_operadora_id: tenantId,
        usuario_id: user.data.user?.id,
        cliente_id: clienteId || null,
        step: 'SOLUCAO',
        status: 'EM_ANDAMENTO',
        dados: {},
      }).select('*').single();
      if (error) throw error;
      return data as OnboardingSessao;
    } catch (err) {
      console.error('[CustomerCommerce] criarSessaoOnboarding:', err);
      return null;
    }
  }

  async atualizarSessaoOnboarding(
    sessaoId: string,
    patch: { modalidade?: ModalidadeCliente; step?: string; dados?: Record<string, unknown> }
  ): Promise<boolean> {
    try {
      const patchTyped: { modalidade?: string; step?: string; dados?: Json } = {
        ...(patch.modalidade !== undefined ? { modalidade: patch.modalidade as string } : {}),
        ...(patch.step !== undefined ? { step: patch.step } : {}),
        ...(patch.dados !== undefined ? { dados: patch.dados as unknown as Json } : {}),
      };
      const { error } = await db.from('onboarding_sessoes').update(patchTyped).eq('id', sessaoId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[CustomerCommerce] atualizarSessaoOnboarding:', err);
      return false;
    }
  }

  async listarSessoesOnboarding(): Promise<OnboardingSessao[]> {
    try {
      const { data, error } = await db
        .from('onboarding_sessoes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as OnboardingSessao[];
    } catch (err) {
      console.error('[CustomerCommerce] listarSessoesOnboarding:', err);
      return [];
    }
  }

  async criarContratoOnboarding(
    sessaoId: string,
    unidadeIds: string[],
    duracaoMeses = 3,
    formaPagamento = 'PIX',
    empresaCliente?: OnboardingEmpresaCliente
  ): Promise<ContratoOnboardingResult> {
    try {
      // Empresa nova no wizard: dados ficam na sessão para a RPC criar cliente/empresa
      if (empresaCliente) {
        await this.atualizarSessaoOnboarding(sessaoId, { dados: { empresa_cliente: empresaCliente } });
      }
      const { data, error } = await db.rpc('criar_contrato_onboarding', {
        p_sessao_id: sessaoId,
        p_unidade_ids: unidadeIds,
        p_duracao_meses: duracaoMeses,
        p_forma_pagamento: formaPagamento,
        p_data_inicio: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
      return (data || { success: false, error: 'Sem resposta da plataforma.' }) as unknown as ContratoOnboardingResult;
    } catch (err) {
      console.error('[CustomerCommerce] criarContratoOnboarding:', err);
      return { success: false, error: (err as Error)?.message || 'Falha ao criar contrato.' };
    }
  }

  // ====================================================================
  // EXPANSÃO DE ESTABELECIMENTOS
  // ====================================================================

  async solicitarExpansao(
    contratoId: string,
    unidadeIds: string[],
    justificativa?: string
  ): Promise<ExpansaoResult> {
    try {
      const { data, error } = await db.rpc('solicitar_expansao', {
        p_contrato_id: contratoId,
        p_unidade_ids: unidadeIds,
        p_justificativa: justificativa || null,
      });
      if (error) throw error;
      return (data || { success: false, error: 'Sem resposta da plataforma.' }) as unknown as ExpansaoResult;
    } catch (err) {
      console.error('[CustomerCommerce] solicitarExpansao:', err);
      return { success: false, error: (err as Error)?.message || 'Falha ao solicitar expansão.' };
    }
  }

  async aprovarExpansao(expansaoId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await db.rpc('aprovar_expansao', { p_expansao_id: expansaoId });
      if (error) throw error;
      return (data || { success: false }) as unknown as { success: boolean; error?: string };
    } catch (err) {
      console.error('[CustomerCommerce] aprovarExpansao:', err);
      return { success: false, error: (err as Error)?.message || 'Falha ao aprovar expansão.' };
    }
  }

  async rejeitarExpansao(expansaoId: string, motivo: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await db.rpc('rejeitar_expansao', {
        p_expansao_id: expansaoId,
        p_motivo: motivo,
      });
      if (error) throw error;
      return (data || { success: false }) as unknown as { success: boolean; error?: string };
    } catch (err) {
      console.error('[CustomerCommerce] rejeitarExpansao:', err);
      return { success: false, error: (err as Error)?.message || 'Falha ao rejeitar expansão.' };
    }
  }

  async listarExpansoes(clienteId: string): Promise<Expansao[]> {
    try {
      // RLS (exp_select) já limita o cliente às expansões dos próprios contratos;
      // o filtro por contrato do cliente é reforço adicional de isolamento.
      const { data, error } = await db
        .from('expansoes')
        .select('*, itens:expansao_itens(*, unidade:unidades(id, nome, cidade, estado)), contrato:contratos(id, numero_contrato)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const todas = (data || []) as Expansao[];
      const contratosDoCliente = await this.listarContratosCliente(clienteId);
      const contratoIds = new Set(contratosDoCliente.map((c) => c.id));
      return todas.filter((e) => contratoIds.has(e.contrato_id));
    } catch (err) {
      console.error('[CustomerCommerce] listarExpansoes:', err);
      return [];
    }
  }

  private async listarContratosCliente(clienteId: string): Promise<{ id: string }[]> {
    try {
      const { data, error } = await db.from('contratos').select('id').eq('cliente_id', clienteId);
      if (error) throw error;
      return data || [];
    } catch (err) {
      return [];
    }
  }

  // ====================================================================
  // CAMPANHAS
  // ====================================================================

  async criarCampanha(tenantId: string, clienteId: string, input: any): Promise<any> {
    try {
      const user = await supabase.auth.getUser();

      // campanhas.contrato_id é NOT NULL no banco: resolver o contrato vigente
      // do cliente quando o chamador não o informar (falha explícita se ausente).
      let contratoId: string | null = typeof input?.contratoId === 'string' ? input.contratoId : null;
      if (!contratoId) {
        const { data: contrato } = await db
          .from('contratos')
          .select('id')
          .eq('empresa_operadora_id', tenantId)
          .eq('cliente_id', clienteId)
          .is('deleted_at', null)
          .order('data_inicio', { ascending: false })
          .limit(1)
          .maybeSingle();
        contratoId = (contrato as { id?: string } | null)?.id ?? null;
      }
      if (!contratoId) {
        throw new Error('Cliente sem contrato vigente — não é possível criar campanha.');
      }

      const { data, error } = await db.from('campanhas').insert({
        empresa_operadora_id: tenantId,
        cliente_id: clienteId,
        contrato_id: contratoId,
        titulo: input.titulo,
        objetivo: input.objetivo || null,
        data_inicio: input.inicio,
        data_fim: input.fim,
        status: input.status || 'DRAFT',
        duracao_segundos: input.duracao_segundos || 10,
        created_by: user.data.user?.id,
      }).select('*').single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[CustomerCommerce] criarCampanha:', err);
      return null;
    }
  }

  async atualizarStatusCampanha(campanhaId: string, status: string): Promise<boolean> {
    try {
      const { error } = await db.from('campanhas').update({ status }).eq('id', campanhaId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[CustomerCommerce] atualizarStatusCampanha:', err);
      return false;
    }
  }

  async uploadCriativoCampanha(campanhaId: string, file: File): Promise<string | null> {
    try {
      // 1. Upload para o bucket
      const fileExt = file.name.split('.').pop();
      const fileName = `${campanhaId}/${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('campanhas_midia')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // 2. Registrar na tabela campanha_midias
      const { data: publicUrlData } = supabase.storage
        .from('campanhas_midia')
        .getPublicUrl(fileName);

      const { error: dbError } = await db.from('campanha_midias').insert({
        campanha_id: campanhaId,
        storage_path: fileName,
        file_name: file.name,
        content_type: file.type,
        size_bytes: file.size
      });

      if (dbError) throw dbError;

      return publicUrlData.publicUrl;
    } catch (err) {
      console.error('[CustomerCommerce] uploadCriativoCampanha:', err);
      return null;
    }
  }

  async buscarTelasDisponiveis(tenantId: string): Promise<any[]> {
    try {
      // Retorna pontos que têm equipamentos vinculados ou que estão ativos
      const { data, error } = await db.from('pontos')
        .select('id, nome, cidade, estado, bairro')
        .eq('empresa_operadora_id', tenantId)
        .eq('ativo', true);
        
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[CustomerCommerce] buscarTelasDisponiveis:', err);
      return [];
    }
  }

  async vincularTelasACampanha(campanhaId: string, pontoIds: string[]): Promise<boolean> {
    try {
      const payloads = pontoIds.map(id => ({
        campanha_id: campanhaId,
        ponto_id: id
      }));

      const { error } = await db.from('campanha_telas').insert(payloads);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[CustomerCommerce] vincularTelasACampanha:', err);
      return false;
    }
  }

  async submeterCampanhaParaRevisao(tenantId: string, campanhaId: string): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('submit_campanha_to_review', {
        p_campanha_id: campanhaId,
        p_tenant_id: tenantId
      });

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[CustomerCommerce] submeterCampanhaParaRevisao:', err);
      return false;
    }
  }

  // ====================================================================
  // ASSET LIBRARY (FASE 6)
  // ====================================================================

  async listarAssets(clienteId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('cliente_assets')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[CustomerCommerce] listarAssets:', err);
      return [];
    }
  }

  async registrarAsset(assetData: {
    cliente_id: string;
    empresa_operadora_id: string;
    nome: string;
    tipo: string;
    mime_type: string;
    object_url: string;
    tamanho: number;
    tags?: string[];
  }): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('cliente_assets')
        .insert(assetData)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[CustomerCommerce] registrarAsset:', err);
      return null;
    }
  }

  async deletarAsset(assetId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('cliente_assets').delete().eq('id', assetId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[CustomerCommerce] deletarAsset:', err);
      return false;
    }
  }

  // ====================================================================
  // ENCARTE DIGITAL (FASE 8)
  // ====================================================================

  async listarEncartes(clienteId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('encartes')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[CustomerCommerce] listarEncartes:', err);
      return [];
    }
  }

  async criarEncarte(encarteData: {
    cliente_id: string;
    empresa_operadora_id: string;
    titulo: string;
    descricao?: string;
    cor_primaria?: string;
    cor_secundaria?: string;
    logo_url?: string;
  }, ofertasIds: string[]): Promise<string | null> {
    try {
      // 1. Criar encarte
      const { data: encarte, error: errEncarte } = await supabase
        .from('encartes')
        .insert(encarteData)
        .select('id')
        .single();
        
      if (errEncarte) throw errEncarte;
      if (!encarte) throw new Error('Falha ao criar encarte');

      // 2. Adicionar itens
      if (ofertasIds.length > 0) {
        const itens = ofertasIds.map((oferta_id, index) => ({
          encarte_id: encarte.id,
          oferta_id,
          ordem: index
        }));
        
        const { error: errItens } = await supabase.from('encarte_itens').insert(itens);
        if (errItens) throw errItens;
      }

      return encarte.id;
    } catch (err) {
      console.error('[CustomerCommerce] criarEncarte:', err);
      return null;
    }
  }

  async deletarEncarte(encarteId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('encartes').delete().eq('id', encarteId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[CustomerCommerce] deletarEncarte:', err);
      return false;
    }
  }

  async listarOfertasParaEncarte(clienteId: string): Promise<any[]> {
    try {
      // Retorna ofertas ativas do cliente com detalhes do produto
      // ofertas não tem FK direta para produtos; o produto chega via oferta_itens
      const { data, error } = await supabase
        .from('ofertas')
        .select('*, itens:oferta_itens(preco_oferta, preco_original, produto:produtos(*))')
        .eq('cliente_id', clienteId)
        .eq('status', 'ATIVA')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as Array<{ itens?: Array<{ produto?: unknown; preco_oferta?: number }> }>)
        .map((oferta) => ({
          ...oferta,
          produto: oferta.itens?.[0]?.produto ?? null,
          preco_promocional: oferta.itens?.[0]?.preco_oferta ?? null,
        }));
    } catch (err) {
      console.error('[CustomerCommerce] listarOfertasParaEncarte:', err);
      return [];
    }
  }

}

export const customerCommerceService = new CustomerCommerceService();
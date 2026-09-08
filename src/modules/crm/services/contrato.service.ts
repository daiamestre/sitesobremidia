import { supabase } from '@/integrations/supabase/client';
import { contratoDocumentoService } from './contratoDocumento.service';
import { resolveContractTypeFromCadastroType } from './contractResolver.service';

export interface ContratoTemplateRecord {
  id: string;
  tipo_contrato: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR';
  codigo_template: string;
  nome: string;
  descricao: string;
  versao: number;
  conteudo_html: string;
}

export interface ContratoCompleto {
  id: string;
  empresa_operadora_id: string;
  numero_contrato: string;
  numero_contrato_legivel?: string;
  cliente_id: string | null;
  empresa_id: string | null;
  representante_id: string | null;
  proposta_id: string | null;
  ponto_id?: string | null;
  gestor_usuario_id?: string | null;
  tipo_contrato?: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR';
  template_id?: string;
  template_nome?: string;
  template_versao?: number;
  usuario_responsavel_id?: string;
  data_selecao?: string;
  status_documento: 'RASCUNHO' | 'GERADO' | 'ENVIADO' | 'ASSINADO' | 'CANCELADO';
  status_workflow: string;
  pdf_object_key?: string;
  pdf_assinado_key?: string;
  documento_enviado_em?: string | null;
  documento_assinado_em?: string | null;
  assinatura_envelope_id?: string | null;
  assinado_por?: string | null;
  versao_atual: number;
  valor_mensal: number;
  forma_pagamento: string;
  data_inicio: string;
  data_fim: string;
  proposta?: any;
  cliente?: any;
  empresa?: any;
  ponto?: any;
  itens?: any[];
}


export class ContratoService {
  /**
   * Lista os modelos/templates de contrato disponíveis no banco (ANUNCIANTE e PARCEIRO)
   */
  async fetchTemplates(): Promise<ContratoTemplateRecord[]> {
    try {
      const { data, error } = await supabase
        .from('contrato_templates')
        .select('*')
        .eq('ativo', true)
        .order('tipo_contrato');

      if (error) {
        console.error('[ContratoService.fetchTemplates] Erro:', error);
        return [];
      }
      return (data || []) as ContratoTemplateRecord[];
    } catch (err) {
      return [];
    }
  }

  /**
   * Gera número de contrato sequencial com Advisory Lock atômico no PostgreSQL
   */
  private async getNextContractNumberAtomo(empresaOperadoraId: string): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('fn_gerar_numero_contrato_atomo', {
        p_empresa_operadora_id: empresaOperadoraId
      });

      if (!error && data) {
        return data as string;
      }
    } catch (err) {
      console.warn('[ContratoService] Fallback na geração de número de contrato:', err);
    }

    // Fallback compensatório
    const { data: maxCtr } = await supabase
      .from('contratos')
      .select('numero_contrato')
      .eq('empresa_operadora_id', empresaOperadoraId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastNum = maxCtr?.numero_contrato ? parseInt(maxCtr.numero_contrato.replace(/\D/g, ''), 10) : 0;
    const nextNum = (lastNum || 0) + 1;
    return `CTR-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;
  }

  /**
   * Seleciona o modelo de contrato (ANUNCIANTE ou PARCEIRO) para a proposta
   * P0: propostaId tornou-se opcional — CADASTRO é autoridade. Quando propostaId
   * ausente, usa clienteId/pontoId direto sem quebrar template/preview.
   */
  async selectContractModel(payload: {
    propostaId?: string | null;
    clienteId?: string | null;
    pontoId?: string | null;
    gestorUsuarioId?: string | null;
    contratoId?: string | null;
    tipoContrato: 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR';
    templateId: string;
    templateNome: string;
    templateVersao: number;
    usuarioResponsavelId: string;
  }): Promise<{ success: boolean; contratoId?: string; error?: string }> {
    try {
      if (!payload.templateId || typeof payload.templateId !== 'string' || payload.templateId.trim() === '') {
        return { success: false, error: 'Template ID inválido ou ausente.' };
      }

      // 1. Resolve vínculo: proposta (legado) ou cadastro direto (P0)
      let empresa_operadora_id: string | null = null;
      let cliente_id: string | null = payload.clienteId || null;
      const ponto_id: string | null = payload.pontoId || null;
      const gestor_usuario_id: string | null = payload.gestorUsuarioId || null;
      let representante_id: string | null = null;
      let proposta: any = null;
      let empresaId: string | null = null;

      if (payload.propostaId) {
        const { data: prop, error: propErr } = await supabase
          .from('propostas')
          .select(`*, cliente:clientes(*)`)
          .eq('id', payload.propostaId)
          .single();
        if (!propErr && prop) {
          proposta = prop;
          empresa_operadora_id = proposta.empresa_operadora_id;
          cliente_id = proposta.cliente_id;
          representante_id = proposta.representante_id;
          const { data: emp } = await supabase
            .from('empresas')
            .select('id')
            .eq('cliente_id', proposta.cliente_id)
            .maybeSingle();
          empresaId = emp?.id || null;
        } else if (payload.clienteId || payload.pontoId) {
          // proposta não encontrada mas cadastro direto fornecido — não bloquear (P0 §7)
        } else {
          return { success: false, error: 'Proposta não encontrada.' };
        }
      }

      // Cadastro direto (quando proposta não existe ou é fluxo P0)
      if (!proposta) {
        if (cliente_id) {
          const { data: cli } = await supabase.from('clientes').select('id, empresa_operadora_id, representante_id').eq('id', cliente_id).maybeSingle();
          if (cli) {
            empresa_operadora_id = cli.empresa_operadora_id;
            representante_id = cli.representante_id;
            const { data: emp2 } = await supabase.from('empresas').select('id').eq('cliente_id', cliente_id).maybeSingle();
            empresaId = emp2?.id || null;
          }
        } else if (ponto_id) {
          const { data: pt } = await supabase.from('pontos').select('id, empresa_operadora_id').eq('id', ponto_id).maybeSingle();
          if (pt) empresa_operadora_id = pt.empresa_operadora_id;
        }
        // fallback: resolver empresa_operadora via usuário responsável
        if (!empresa_operadora_id) {
          const { data: usr } = await supabase.from('usuarios').select('empresa_operadora_id').eq('id', payload.usuarioResponsavelId).maybeSingle();
          empresa_operadora_id = usr?.empresa_operadora_id || null;
        }
      }

      if (!empresa_operadora_id) {
        return { success: false, error: 'Tenant não resolvido para criação de contrato.' };
      }

      // 2. Verifica contrato existente (por contratoId direto, proposta, cliente ou ponto)
      let existingContract: any = null;
      // ORIGEM B/C: contratoId direto passado explicitamente
      if (payload.contratoId) {
        const { data } = await supabase.from('contratos').select('id, numero_contrato, versao_atual').eq('id', payload.contratoId).maybeSingle();
        existingContract = data;
      }
      if (!existingContract && payload.propostaId) {
        const { data } = await supabase.from('contratos').select('id, numero_contrato, versao_atual').eq('proposta_id', payload.propostaId).maybeSingle();
        existingContract = data;
      }
      if (!existingContract && cliente_id) {
        const { data } = await supabase.from('contratos').select('id, numero_contrato, versao_atual').eq('cliente_id', cliente_id).eq('tipo_contrato', payload.tipoContrato).is('deleted_at', null).maybeSingle();
        existingContract = data;
      }
      if (!existingContract && ponto_id) {
        const { data } = await supabase.from('contratos').select('id, numero_contrato, versao_atual').eq('ponto_id', ponto_id).eq('tipo_contrato', payload.tipoContrato).is('deleted_at', null).maybeSingle();
        existingContract = data;
      }
      if (!existingContract && gestor_usuario_id) {
        const { data } = await supabase.from('contratos').select('id, numero_contrato, versao_atual').eq('gestor_usuario_id', gestor_usuario_id).eq('tipo_contrato', payload.tipoContrato).is('deleted_at', null).maybeSingle();
        existingContract = data;
      }

      const nowIso = new Date().toISOString();
      let contratoId: string;

      if (existingContract) {
        contratoId = existingContract.id;
        const targetTemplateId = payload.templateId || existingContract.template_id;
        const targetTemplateNome = payload.templateNome || existingContract.template_nome;
        const targetTemplateVersao = payload.templateVersao || existingContract.template_versao || 1;
        await supabase
          .from('contratos')
          .update({
            proposta_id: payload.propostaId || existingContract.proposta_id || null,
            tipo_contrato: payload.tipoContrato,
            template_id: targetTemplateId,
            template_nome: targetTemplateNome,
            template_versao: targetTemplateVersao,
            usuario_responsavel_id: payload.usuarioResponsavelId,
            data_selecao: nowIso,
            status_documento: 'RASCUNHO',
            updated_at: nowIso,
            ...(proposta ? {
              valor_mensal: proposta.valor_final ?? 0,
              forma_pagamento: proposta.forma_pagamento ?? 'PIX',
            } : {}),
          })
          .eq('id', contratoId);
      } else {
        const numeroContrato = await this.getNextContractNumberAtomo(empresa_operadora_id!);
        const dataInicio = new Date().toISOString().split('T')[0];
        const dataFim = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const valorMensal = proposta?.valor_final ?? 0;
        const formaPagamento = proposta?.forma_pagamento ?? 'PIX';
        const { data: newCtr, error: ctrErr } = await supabase
          .from('contratos')
          .insert({
            empresa_operadora_id: empresa_operadora_id!,
            numero_contrato: numeroContrato,
            cliente_id: cliente_id,
            empresa_id: empresaId,
            ponto_id: ponto_id,
            gestor_usuario_id: gestor_usuario_id,
            representante_id: representante_id,
            proposta_id: proposta?.id || null,
            tipo_contrato: payload.tipoContrato,
            template_id: payload.templateId,
            template_nome: payload.templateNome,
            template_versao: payload.templateVersao,
            usuario_responsavel_id: payload.usuarioResponsavelId,
            data_selecao: nowIso,
            status_documento: 'RASCUNHO',
            status_workflow: 'AGUARDANDO_ASSINATURA',
            valor_mensal: valorMensal,
            forma_pagamento: formaPagamento,
            data_inicio: dataInicio,
            data_fim: dataFim,
          } as any)
          .select('id')
          .single();
        if (ctrErr || !newCtr) {
          return { success: false, error: ctrErr?.message || 'Falha ao criar registro de contrato.' };
        }
        contratoId = newCtr.id;
      }

      await supabase.from('contrato_auditoria').insert({
        contrato_id: contratoId,
        evento: 'CONTRATO_SELECIONADO',
        usuario_id: payload.usuarioResponsavelId,
        tipo_contrato: payload.tipoContrato,
        versao: payload.templateVersao,
        detalhes: { template_nome: payload.templateNome, proposta_id: payload.propostaId || null, cliente_id, ponto_id },
      });

      return { success: true, contratoId };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro inesperado na seleção de contrato.' };
    }
  }

  /**
   * Busca dados completos de um contrato pelo seu ID ou pela propostaId
   */
  async findByPropostaId(propostaId: string): Promise<ContratoCompleto | null> {
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          proposta:propostas(*),
          cliente:clientes(*),
          empresa:empresas(*),
          ponto:pontos(*)
        `)
        .eq('proposta_id', propostaId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error || !data) return null;
      return data as ContratoCompleto;
    } catch (err) {
      return null;
    }
  }

  /**
   * Busca dados completos de um contrato pelo contratoId direto (ORIGEM B e C).
   * Suporta contratos criados sem proposta (cadastro direto de Anunciante ou Parceiro).
   */
  async findByContratoId(contratoId: string): Promise<ContratoCompleto | null> {
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          proposta:propostas(*),
          cliente:clientes(*),
          empresa:empresas(*),
          ponto:pontos(*)
        `)
        .eq('id', contratoId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error || !data) return null;
      return data as ContratoCompleto;
    } catch (err) {
      return null;
    }
  }

  /**
   * Gera o documento REAL do contrato (PDF vetorial client-side, R2, versão e
   * auditoria). Delega ao contratoDocumentoService — sem edge function não
   * deployed e sem bucket de storage inexistente.
   */
  async generateContractPDF(contratoId: string, usuarioId: string): Promise<{ success: boolean; objectKey?: string; signedDownloadUrl?: string; documentHash?: string; error?: string }> {
    const resultado = await contratoDocumentoService.gerarDocumentoContrato(contratoId, usuarioId);
    if (!resultado.success) {
      return { success: false, error: resultado.error };
    }
    let signedDownloadUrl: string | undefined;
    if (resultado.objectKey) {
      try {
        signedDownloadUrl = await contratoDocumentoService.obterUrlDownload(resultado.objectKey);
      } catch {
        signedDownloadUrl = undefined;
      }
    }
    return {
      success: true,
      objectKey: resultado.objectKey,
      signedDownloadUrl,
      documentHash: resultado.documentHash,
    };
  }

  /**
   * Gera URL presigned de download do PDF original com autorização REAL
   * (Edge Function get-download-url + RLS do banco).
   */
  async getContractDownloadUrl(contratoId: string): Promise<{ success: boolean; downloadUrl?: string; fileName?: string; error?: string }> {
    try {
      const { data: contrato, error: fetchErr } = await supabase
        .from('contratos')
        .select('pdf_object_key, numero_contrato, tipo_contrato, empresa_operadora_id')
        .eq('id', contratoId)
        .single();

      if (fetchErr || !contrato) return { success: false, error: 'Contrato não encontrado.' };
      if (!contrato.pdf_object_key) return { success: false, error: 'PDF do contrato não foi gerado.' };

      const downloadUrl = await contratoDocumentoService.obterUrlDownload(contrato.pdf_object_key);

      const fileName = `Contrato_${contrato.tipo_contrato || 'Anunciante'}_${contrato.numero_contrato}.pdf`;

      return {
        success: true,
        downloadUrl,
        fileName,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao obter URL de download.' };
    }
  }

  /**
   * Gera URL presigned de download do PDF ASSINADO com autorização REAL.
   */
  async getSignedDocumentDownloadUrl(contratoId: string): Promise<{ success: boolean; downloadUrl?: string; fileName?: string; signedAt?: string; error?: string }> {
    try {
      const { data: contrato, error: fetchErr } = await supabase
        .from('contratos')
        .select('pdf_assinado_key, numero_contrato, tipo_contrato, documento_assinado_em')
        .eq('id', contratoId)
        .single();

      if (fetchErr || !contrato) return { success: false, error: 'Contrato não encontrado.' };
      if (!contrato.pdf_assinado_key) return { success: false, error: 'Documento assinado não disponível.' };

      const downloadUrl = await contratoDocumentoService.obterUrlDownload(contrato.pdf_assinado_key);

      const fileName = `Contrato_Assinado_${contrato.tipo_contrato || 'Anunciante'}_${contrato.numero_contrato}.pdf`;

      return {
        success: true,
        downloadUrl,
        fileName,
        signedAt: contrato.documento_assinado_em,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao obter URL de download.' };
    }
  }

  /**
   * Envia o contrato gerado para assinatura interna (ASSINADOR_INTERNO) —
   * fluxo real com hash SHA-256 do PDF original.
   */
  async enviarParaAssinatura(contratoId: string, usuarioId: string): Promise<{ success: boolean; assinaturaId?: string; envelopeId?: string; error?: string }> {
    return contratoDocumentoService.criarEnvelopeInterno(contratoId, usuarioId);
  }

  /**
   * Busca eventos de auditoria do contrato
   */
  async getAuditTrail(contratoId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('contrato_auditoria')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ContratoService.getAuditTrail] Erro:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Cancela um contrato registrando evento de auditoria
   */
  async cancelContract(contratoId: string, reason: string, usuarioId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await supabase
        .from('contratos')
        .update({
          status_documento: 'CANCELADO',
          status_workflow: 'CANCELADO',
          deleted_at: new Date().toISOString(),
          delete_reason: reason,
        })
        .eq('id', contratoId);

      await supabase.from('contrato_auditoria').insert({
        contrato_id: contratoId,
        evento: 'CONTRATO_CANCELADO',
        usuario_id: usuarioId,
        detalhes: { motivo: reason },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * AR-03.2 — Exclusão atômica de contrato com decisão híbrida (HARD_DELETE vs SOFT_DELETE).
   * Executa a RPC transacional segura fn_excluir_contrato_atomo e aciona cleanup server-side de R2.
   */
  async excluirContrato(contratoId: string, motivo: string): Promise<{
    success: boolean;
    mode?: 'HARD_DELETE' | 'SOFT_DELETE';
    already_deleted?: boolean;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.rpc('fn_excluir_contrato_atomo', {
        p_contrato_id: contratoId,
        p_motivo: motivo,
      });

      if (error) {
        console.error('[ContratoService.excluirContrato] Erro RPC:', error);
        return { success: false, error: error.message || 'Falha ao executar exclusão do contrato.' };
      }

      if (!data || data.success === false) {
        return { success: false, error: data?.error || 'Erro na exclusão do contrato.' };
      }

      // Se for Hard Delete e houver chaves de storage para expurgar, aciona limpeza server-side
      if (data.mode === 'HARD_DELETE' && Array.isArray(data.r2_keys_to_delete) && data.r2_keys_to_delete.length > 0) {
        const uniqueKeys = Array.from(new Set<string>(data.r2_keys_to_delete.filter(Boolean)));
        for (const objectKey of uniqueKeys) {
          try {
            await supabase.functions.invoke('delete-media-object', {
              body: { objectKey },
            });
          } catch (r2Err) {
            console.warn('[ContratoService.excluirContrato] Aviso na deleção R2 server-side:', r2Err);
          }
        }
      }

      return {
        success: true,
        mode: data.mode,
        already_deleted: data.already_deleted,
      };
    } catch (err: any) {
      console.error('[ContratoService.excluirContrato] Exceção:', err);
      return { success: false, error: err?.message || 'Erro inesperado na exclusão do contrato.' };
    }
  }

  async findAll(representanteId?: string): Promise<ContratoCompleto[]> {
    try {
      let query = supabase
        .from('contratos')
        .select(`
          *,
          proposta:propostas(*),
          cliente:clientes(*),
          empresa:empresas(*),
          ponto:pontos(*)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (representanteId) {
        query = query.eq('representante_id', representanteId);
      }

      const { data, error } = await query;
      if (error || !data) return [];
      return data as ContratoCompleto[];
    } catch {
      return [];
    }
  }

  // P0 — Vínculo automático CADASTRO → CONTRATO (fonte única: resolveContractTypeFromCadastroType)
  async ensureContractForCadastro(params: {
    cadastroType: 'ANUNCIANTE' | 'PONTO_PARCEIRO' | 'GESTOR_MIDIAS';
    clienteId?: string | null;
    pontoId?: string | null;
    gestorUsuarioId?: string | null;
    propostaId?: string | null;
    usuarioResponsavelId: string;
  }): Promise<{ success: boolean; contratoId?: string | null; tipoContrato?: string | null; error?: string }> {
    const tipo = resolveContractTypeFromCadastroType(params.cadastroType);
    if (!tipo) {
      return {
        success: false,
        contratoId: null,
        tipoContrato: null,
        error: `Tipo de cadastro inválido ou não suportado para vinculação de contrato (${String(params.cadastroType)}).`,
      };
    }

    // 1. Verifica se contrato já existe para a entidade
    let existingContract: any = null;
    if (params.propostaId) {
      const { data } = await supabase.from('contratos').select('id, numero_contrato, template_id, template_versao, tipo_contrato').eq('proposta_id', params.propostaId).maybeSingle();
      existingContract = data;
    }
    if (!existingContract && params.clienteId) {
      const { data } = await supabase.from('contratos').select('id, numero_contrato, template_id, template_versao, tipo_contrato').eq('cliente_id', params.clienteId).eq('tipo_contrato', tipo).is('deleted_at', null).maybeSingle();
      existingContract = data;
    }
    if (!existingContract && params.pontoId) {
      const { data } = await supabase.from('contratos').select('id, numero_contrato, template_id, template_versao, tipo_contrato').eq('ponto_id', params.pontoId).eq('tipo_contrato', tipo).is('deleted_at', null).maybeSingle();
      existingContract = data;
    }
    if (!existingContract && params.gestorUsuarioId) {
      const { data } = await supabase.from('contratos').select('id, numero_contrato, template_id, template_versao, tipo_contrato').eq('gestor_usuario_id', params.gestorUsuarioId).eq('tipo_contrato', tipo).is('deleted_at', null).maybeSingle();
      existingContract = data;
    }

    if (existingContract && existingContract.template_id && typeof existingContract.template_id === 'string' && existingContract.template_id.trim() !== '') {
      if (params.propostaId) {
        await supabase.from('contratos').update({ proposta_id: params.propostaId }).eq('id', existingContract.id);
      }
      return { success: true, contratoId: existingContract.id, tipoContrato: tipo };
    }

    // 2. Resolver tenant para resolução do template padrão
    let tenantId: string | null = null;
    if (params.clienteId) {
      const { data: cli } = await supabase.from('clientes').select('empresa_operadora_id').eq('id', params.clienteId).maybeSingle();
      tenantId = cli?.empresa_operadora_id || null;
    } else if (params.pontoId) {
      const { data: pt } = await supabase.from('pontos').select('empresa_operadora_id').eq('id', params.pontoId).maybeSingle();
      tenantId = pt?.empresa_operadora_id || null;
    }
    if (!tenantId && params.usuarioResponsavelId) {
      const { data: usr } = await supabase.from('usuarios').select('empresa_operadora_id').eq('id', params.usuarioResponsavelId).maybeSingle();
      tenantId = usr?.empresa_operadora_id || null;
    }

    // 3. Resolver template padrão canônico (via fn_obter_template_padrao ou query de default ativo)
    let tpl: any = null;
    if (tenantId) {
      try {
        const { data: rpcTpl, error: rpcErr } = await supabase.rpc('fn_obter_template_padrao', {
          p_empresa_operadora_id: tenantId,
          p_tipo_contrato: tipo,
        });
        if (!rpcErr && rpcTpl && (rpcTpl as any).length > 0) {
          tpl = (rpcTpl as any)[0];
        }
      } catch (errTpl) {
        console.warn('[ensureContractForCadastro] Fallback no resolver RPC:', errTpl);
      }
    }

    if (!tpl) {
      const { data: activeTpls } = await supabase
        .from('contrato_templates')
        .select('id,nome,versao,conteudo_html,is_default')
        .eq('tipo_contrato', tipo)
        .eq('ativo', true)
        .order('is_default', { ascending: false })
        .order('versao', { ascending: false });

      tpl = activeTpls?.find((t) => t.conteudo_html && t.conteudo_html.length > 200 && !t.conteudo_html.includes('(preservado)')) || activeTpls?.[0];
    }

    if (!tpl || !tpl.id || typeof tpl.id !== 'string' || tpl.id.trim() === '') {
      return { success: false, error: `Template oficial ${tipo} não encontrado ou sem identificador válido.` };
    }
    const res = await this.selectContractModel({
      tipoContrato: tipo,
      templateId: tpl.id,
      templateNome: (tpl as any).nome,
      templateVersao: (tpl as any).versao,
      usuarioResponsavelId: params.usuarioResponsavelId,
      clienteId: params.clienteId || null,
      pontoId: params.pontoId || null,
      gestorUsuarioId: params.gestorUsuarioId || null,
      propostaId: params.propostaId || null,
      contratoId: existingContract?.id || null,
    });
    return { success: res.success, contratoId: res.contratoId || null, tipoContrato: tipo, error: res.error };
  }

  // PDFs oficiais estáticos (public/official-contracts) — sem proposta
  async getOfficialTemplateUrl(tipoContrato: 'ANUNCIANTE' | 'PARCEIRO'): Promise<{ url: string; fileName: string }> {
    const map: Record<string, { url: string; fileName: string }> = {
      ANUNCIANTE: { url: '/official-contracts/contrato-anunciante.pdf', fileName: 'contrato-anunciante.pdf' },
      PARCEIRO: { url: '/official-contracts/contrato-parceria.pdf', fileName: 'contrato-parceria.pdf' },
    };
    return map[tipoContrato] || map.ANUNCIANTE;
  }
}

export const contratoService = new ContratoService();

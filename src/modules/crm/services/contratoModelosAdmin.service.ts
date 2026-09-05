import { supabase } from '@/integrations/supabase/client';
import { TipoContrato } from './contractResolver.service';
import {
  validarPlaceholdersTemplate,
  getCanonicalTemplateForTipo,
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
} from './contratoDocumento.service';

export interface ContratoTemplateAdminRecord {
  id: string;
  empresa_operadora_id: string | null;
  tipo_contrato: TipoContrato;
  codigo_template: string;
  nome: string;
  descricao: string | null;
  versao: number;
  conteudo_html: string;
  ativo: boolean;
  is_default: boolean;
  pdf_anexo_key: string | null;
  created_at: string;
  updated_at: string;
  total_contratos_aplicados?: number;
}

export interface CriarModeloPayload {
  empresaOperadoraId?: string | null;
  tipoContrato: TipoContrato;
  codigoTemplate: string;
  nome: string;
  descricao?: string;
  conteudoHtml: string;
  isDefault?: boolean;
}

export { CANONICAL_TEMPLATE_HTML_ANUNCIANTE, CANONICAL_TEMPLATE_HTML_PARCEIRO, CANONICAL_TEMPLATE_HTML_GESTOR };

export class ContratoModelosAdminService {
  /**
   * Lista todos os modelos de contratos para a Área Administrativa (Tenant atual + Globais)
   */
  async fetchModelos(tipoContrato?: TipoContrato): Promise<ContratoTemplateAdminRecord[]> {
    try {
      let query = supabase
        .from('contrato_templates')
        .select('*')
        .order('tipo_contrato', { ascending: true })
        .order('versao', { ascending: false });

      if (tipoContrato) {
        query = query.eq('tipo_contrato', tipoContrato);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[ContratoModelosAdminService.fetchModelos] Erro:', error);
        return [];
      }

      const templates = (data || []) as ContratoTemplateAdminRecord[];

      // Obter contagem de contratos vinculados a cada template para regra de versionamento
      const templateIds = templates.map((t) => t.id);
      if (templateIds.length > 0) {
        const { data: contratosCount } = await supabase
          .from('contratos')
          .select('template_id')
          .in('template_id', templateIds);

        const countsMap = new Map<string, number>();
        (contratosCount || []).forEach((c: { template_id: string | null }) => {
          if (c.template_id) {
            countsMap.set(c.template_id, (countsMap.get(c.template_id) || 0) + 1);
          }
        });

        templates.forEach((t) => {
          t.total_contratos_aplicados = countsMap.get(t.id) || 0;
        });
      }

      return templates;
    } catch (err) {
      console.error('[ContratoModelosAdminService.fetchModelos] Exceção:', err);
      return [];
    }
  }

  /**
   * Obtém o template oficial canônico completo correspondente ao tipo.
   */
  obterTemplateOficialCompleto(tipo: TipoContrato): string {
    return getCanonicalTemplateForTipo(tipo);
  }

  /**
   * Criar um novo modelo de contrato
   */
  async criarModelo(payload: CriarModeloPayload): Promise<{ success: boolean; templateId?: string; error?: string }> {
    try {
      if (!payload.nome || !payload.codigoTemplate) {
        return { success: false, error: 'Nome e código do template são obrigatórios.' };
      }

      // Garante que NUNCA nasça vazio: se vier vazio ou em branco, usa o oficial completo
      const isVazio =
        !payload.conteudoHtml ||
        !payload.conteudoHtml.trim() ||
        payload.conteudoHtml.trim() === '<p></p>' ||
        payload.conteudoHtml.trim() === '<p><br></p>' ||
        payload.conteudoHtml.trim() === '<div></div>';

      const conteudoHtmlFinal = isVazio
        ? this.obterTemplateOficialCompleto(payload.tipoContrato)
        : payload.conteudoHtml!;

      const validacao = validarPlaceholdersTemplate(conteudoHtmlFinal);
      if (!validacao.valido) {
        return {
          success: false,
          error: `Campo de contrato não reconhecido ou sem origem configurada: ${validacao.placeholdersDesconhecidos.map((p) => `{{${p}}}`).join(', ')}`,
        };
      }

      const { data, error } = await supabase
        .from('contrato_templates')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId || null,
          tipo_contrato: payload.tipoContrato,
          codigo_template: payload.codigoTemplate.trim().toUpperCase(),
          nome: payload.nome.trim(),
          descricao: payload.descricao?.trim() || null,
          versao: 1,
          conteudo_html: conteudoHtmlFinal,
          ativo: true,
          is_default: payload.isDefault ?? false,
        })
        .select('id')
        .single();

      if (error) {
        return { success: false, error: `Falha ao criar modelo: ${error.message}` };
      }

      if (payload.isDefault && data?.id) {
        await this.definirComoPadrao(data.id);
      }

      return { success: true, templateId: data?.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Cria uma nova versão de forma atômica (RPC Server-side) ou edita o rascunho se não houver contratos vinculados
   */
  async criarNovaVersao(
    templateId: string,
    novoConteudoHtml: string,
    novoNome?: string
  ): Promise<{ success: boolean; templateId?: string; versao?: number; error?: string }> {
    try {
      // Se vier vazio, busca o template base ou oficial completo correspondente
      let conteudoHtmlFinal = novoConteudoHtml;
      const isVazio =
        !conteudoHtmlFinal ||
        !conteudoHtmlFinal.trim() ||
        conteudoHtmlFinal.trim() === '<p></p>' ||
        conteudoHtmlFinal.trim() === '<p><br></p>' ||
        conteudoHtmlFinal.trim() === '<div></div>';

      if (isVazio) {
        const { data: currentTpl } = await supabase
          .from('contrato_templates')
          .select('tipo_contrato, conteudo_html')
          .eq('id', templateId)
          .single();
        conteudoHtmlFinal =
          currentTpl?.conteudo_html && currentTpl.conteudo_html.trim().length >= 200
            ? currentTpl.conteudo_html
            : this.obterTemplateOficialCompleto(currentTpl?.tipo_contrato || 'ANUNCIANTE');
      }

      const validacao = validarPlaceholdersTemplate(conteudoHtmlFinal);
      if (!validacao.valido) {
        return {
          success: false,
          error: `Campo de contrato não reconhecido ou sem origem configurada: ${validacao.placeholdersDesconhecidos.map((p) => `{{${p}}}`).join(', ')}`,
        };
      }

      // 1. Tentar execução via RPC Server-side com Advisory Lock atômico (N+1 concorrente seguro)
      const { data, error } = await supabase.rpc('fn_criar_nova_versao_contrato_template', {
        p_template_id: templateId,
        p_novo_conteudo_html: conteudoHtmlFinal,
        p_novo_nome: novoNome?.trim() || null,
      });


      if (!error && data && typeof data === 'object' && 'success' in data) {
        const res = data as unknown as { success: boolean; template_id?: string; versao?: number; error?: string };
        return { success: res.success, templateId: res.template_id, versao: res.versao, error: res.error };
      }

      // 2. Fallback de cliente (para mocks / testes unitários sem RPC mockada)
      const { data: tpl, error: fetchErr } = await supabase
        .from('contrato_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (fetchErr || !tpl) {
        return { success: false, error: 'Template original não encontrado.' };
      }

      const { count } = await supabase
        .from('contratos')
        .select('id', { count: 'exact', head: true })
        .eq('template_id', templateId);

      const possuiContratos = (count || 0) > 0;

      if (!possuiContratos) {
        const { error: updateErr } = await supabase
          .from('contrato_templates')
          .update({
            nome: novoNome?.trim() || tpl.nome,
            conteudo_html: novoConteudoHtml,
            updated_at: new Date().toISOString(),
          })
          .eq('id', templateId);

        if (updateErr) {
          return { success: false, error: `Falha ao atualizar rascunho: ${updateErr.message}` };
        }

        return { success: true, templateId, versao: tpl.versao };
      }

      const novaVersaoNum = (tpl.versao || 1) + 1;

      const { data: novaLinha, error: insertErr } = await supabase
        .from('contrato_templates')
        .insert({
          empresa_operadora_id: tpl.empresa_operadora_id,
          tipo_contrato: tpl.tipo_contrato,
          codigo_template: tpl.codigo_template,
          nome: novoNome?.trim() || tpl.nome,
          descricao: tpl.descricao,
          versao: novaVersaoNum,
          conteudo_html: novoConteudoHtml,
          ativo: true,
          is_default: true,
        })
        .select('id')
        .single();

      if (insertErr || !novaLinha) {
        return { success: false, error: `Falha ao criar nova versão: ${insertErr?.message}` };
      }

      await this.definirComoPadrao(novaLinha.id);
      return { success: true, templateId: novaLinha.id, versao: novaVersaoNum };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Define um modelo específico como o padrão de onboarding do tenant/tipo
   */
  async definirComoPadrao(templateId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('fn_definir_contrato_template_padrao', {
        p_template_id: templateId,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const res = data as unknown as { success: boolean; error?: string };
      if (!res.success) {
        return { success: false, error: res.error || 'Falha ao definir modelo padrão.' };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Ativa ou Desativa um modelo de contrato
   */
  async toggleAtivo(templateId: string, ativo: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      if (!ativo) {
        await supabase
          .from('contrato_templates')
          .update({ is_default: false, ativo: false, updated_at: new Date().toISOString() })
          .eq('id', templateId);
      } else {
        await supabase
          .from('contrato_templates')
          .update({ ativo: true, updated_at: new Date().toISOString() })
          .eq('id', templateId);
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}

export const contratoModelosAdminService = new ContratoModelosAdminService();

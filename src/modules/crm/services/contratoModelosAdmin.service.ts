import { supabase } from '@/integrations/supabase/client';
import { TipoContrato } from './contractResolver.service';
import {
  validarPlaceholdersTemplate,
  getCanonicalTemplateForTipo,
  isTemplateCompleto,
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

      // Invocação da RPC Server-side com autorização, isolamento multi-tenant e lock atômico
      const { data, error } = await supabase.rpc('fn_criar_modelo_contrato_template', {
        p_tipo_contrato: payload.tipoContrato,
        p_codigo_template: payload.codigoTemplate.trim().toUpperCase(),
        p_nome: payload.nome.trim(),
        p_conteudo_html: conteudoHtmlFinal,
        p_descricao: payload.descricao?.trim() || null,
        p_empresa_operadora_id: payload.empresaOperadoraId || null,
        p_is_default: payload.isDefault ?? false,
      });

      if (!error && data && typeof data === 'object' && 'success' in data) {
        const res = data as unknown as { success: boolean; template_id?: string; id?: string; error?: string };
        if (!res.success) {
          return { success: false, error: res.error || 'Falha ao criar modelo de contrato.' };
        }
        const templateId = res.template_id || res.id;
        if (!templateId) {
          return { success: false, error: 'Servidor não retornou o identificador único (UUID) do modelo criado.' };
        }
        return { success: true, templateId };
      }

      if (error) {
        return { success: false, error: `Falha ao criar modelo: ${error.message}` };
      }

      return { success: false, error: 'Resposta inesperada ao criar modelo de contrato.' };
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
        const tipo = currentTpl?.tipo_contrato || 'ANUNCIANTE';
        conteudoHtmlFinal =
          currentTpl?.conteudo_html && isTemplateCompleto(currentTpl.conteudo_html, tipo)
            ? currentTpl.conteudo_html
            : this.obterTemplateOficialCompleto(tipo);
      }

      const validacao = validarPlaceholdersTemplate(conteudoHtmlFinal);
      if (!validacao.valido) {
        return {
          success: false,
          error: `Campo de contrato não reconhecido ou sem origem configurada: ${validacao.placeholdersDesconhecidos.map((p) => `{{${p}}}`).join(', ')}`,
        };
      }

      // Invocação exclusiva da RPC Server-side com Advisory Lock atômico
      const { data, error } = await supabase.rpc('fn_criar_nova_versao_contrato_template', {
        p_template_id: templateId,
        p_novo_conteudo_html: conteudoHtmlFinal,
        p_novo_nome: novoNome?.trim() || null,
      });

      if (!error && data && typeof data === 'object' && 'success' in data) {
        const res = data as unknown as { success: boolean; template_id?: string; versao?: number; error?: string };
        if (!res.success) {
          return { success: false, error: res.error || 'Falha ao processar nova versão do template.' };
        }
        return { success: true, templateId: res.template_id, versao: res.versao };
      }

      if (error) {
        return { success: false, error: `Falha ao processar nova versão: ${error.message}` };
      }

      return { success: false, error: 'Resposta inesperada ao criar nova versão do template.' };
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
   * Ativa ou Desativa um modelo de contrato via RPC Server-side segura
   */
  async toggleAtivo(templateId: string, ativo: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('fn_toggle_contrato_template_ativo', {
        p_template_id: templateId,
        p_ativo: ativo,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const res = data as unknown as { success: boolean; error?: string };
      if (!res.success) {
        return { success: false, error: res.error || 'Falha ao alterar status do modelo.' };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}

export const contratoModelosAdminService = new ContratoModelosAdminService();

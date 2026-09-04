// ======================================================================
// SOBRE MÍDIA — ComposicaoComercialService (Gate 1B)
// Composição comercial: montagem de item, validação e persistência.
//
// Fluxo:
//   montarItem(pontoId, periodicidade, desconto?)
//     → resolve ponto_precos.preco para o snapshot
//     → monta ComposicaoItemResult
//   validarItem(item)
//     → valida regras de domínio sem acesso ao banco
//   persistirItem(contratoId, unidadeId, item)
//     → valida cadeia de tenant antes de persistir
//     → persiste em contrato_estabelecimentos
//
// REGRA CRÍTICA DE SNAPSHOT:
//   valor_tabela, desconto, subtotal e periodicidade são gravados como
//   snapshot no momento da composição. Alterações futuras em ponto_precos
//   NÃO afetam registros já persistidos.
//
// REGRA CRÍTICA DE DESCONTO:
//   desconto é MONETÁRIO (não percentual).
//   0 <= desconto <= valor_tabela — caso contrário, item é inválido.
//
// REGRA CRÍTICA DE TENANT (P0):
//   Antes de persistir, verifica se contrato e ponto pertencem ao mesmo
//   empresa_operadora_id. Não permite associação cross-tenant.
// ======================================================================

import { supabase } from '@/integrations/supabase/client';
import type { ContratoEstabelecimento, PontoPreco } from '@/types/customerPortal';
import type { ContratoEstabelecimentoInsert } from '@/types/customerPortalDb';
import {
  pontoPrecosService,
  type PeriodicidadeComercial,
} from './pontoPrecos.service';

// ── Tipos do resultado de composição ────────────────────────────────────────

export interface ComposicaoItemResult {
  /** Ponto ao qual o item se refere */
  ponto_id: string;
  /** Periodicidade comercial do item */
  periodicidade: PeriodicidadeComercial;
  /** Snapshot do preço de tabela no momento da montagem */
  valor_tabela: number;
  /** Ajuste comercial monetário (não percentual). Padrão: 0. */
  desconto: number;
  /** Valor efetivamente contratado neste item (valor_tabela - desconto) */
  subtotal: number;
  /** Referência ao registro de preço usado para gerar o snapshot */
  ponto_preco_ref: PontoPreco;
  /** Campo livre para observações comerciais */
  observacoes?: string | null;
}

export interface ValidacaoItemResult {
  valido: boolean;
  erros: string[];
}

export interface PersistenciaItemResult {
  sucesso: true;
  registro: ContratoEstabelecimento;
}

export interface PersistenciaItemErro {
  sucesso: false;
  motivo: string;
}

export type PersistenciaResult = PersistenciaItemResult | PersistenciaItemErro;

// ── Service ──────────────────────────────────────────────────────────────────

class ComposicaoComercialService {
  // ====================================================================
  // MONTAGEM DO ITEM
  // ====================================================================

  /**
   * Monta um item de composição com snapshot do preço vigente.
   *
   * Resolve ponto_precos para obter o preço de tabela atual.
   * Se não houver preço ativo para a periodicidade, retorna null.
   * NÃO calcula preço alternativo ou proporcional.
   *
   * @throws PeriodicidadeInvalidaError se periodicidade for inválida.
   */
  async montarItem(
    pontoId: string,
    periodicidade: string,
    desconto = 0,
    observacoes?: string | null
  ): Promise<ComposicaoItemResult | null> {
    const resolucao = await pontoPrecosService.resolverPreco(pontoId, periodicidade);

    if (!resolucao.encontrado) {
      console.warn(
        `[ComposicaoComercialService.montarItem] ${resolucao.motivo}`
      );
      return null;
    }

    const valorTabela = resolucao.preco.preco;
    const descontoVal = desconto;
    const subtotal = valorTabela - descontoVal;

    return {
      ponto_id: pontoId,
      periodicidade: resolucao.preco.periodicidade,
      valor_tabela: valorTabela,
      desconto: descontoVal,
      subtotal,
      ponto_preco_ref: resolucao.preco,
      observacoes: observacoes ?? null,
    };
  }

  // ====================================================================
  // VALIDAÇÃO DO ITEM
  // ====================================================================

  /**
   * Valida as regras de domínio do item de composição.
   * NÃO acessa o banco — opera apenas sobre os valores do item.
   *
   * Regras validadas:
   *   - ponto_id não vazio
   *   - periodicidade válida (delegada à estrutura do item)
   *   - valor_tabela >= 0
   *   - desconto >= 0
   *   - desconto <= valor_tabela
   *   - subtotal coerente (valor_tabela - desconto)
   */
  validarItem(item: ComposicaoItemResult): ValidacaoItemResult {
    const erros: string[] = [];

    if (!item.ponto_id || typeof item.ponto_id !== 'string' || item.ponto_id.trim() === '') {
      erros.push('ponto_id é obrigatório e deve ser um UUID válido.');
    }

    if (!item.periodicidade) {
      erros.push('periodicidade é obrigatória.');
    }

    if (typeof item.valor_tabela !== 'number' || isNaN(item.valor_tabela)) {
      erros.push('valor_tabela deve ser um número válido.');
    } else if (item.valor_tabela < 0) {
      erros.push('valor_tabela não pode ser negativo.');
    }

    if (typeof item.desconto !== 'number' || isNaN(item.desconto)) {
      erros.push('desconto deve ser um número válido.');
    } else if (item.desconto < 0) {
      erros.push('desconto não pode ser negativo (é monetário, não percentual).');
    } else if (item.desconto > item.valor_tabela) {
      erros.push(
        `desconto (${item.desconto}) não pode ser superior ao valor_tabela (${item.valor_tabela}).`
      );
    }

    const subtotalEsperado = item.valor_tabela - item.desconto;
    const subtotalTol = 0.001; // tolerância para ponto flutuante
    if (
      typeof item.subtotal !== 'number' ||
      isNaN(item.subtotal) ||
      Math.abs(item.subtotal - subtotalEsperado) > subtotalTol
    ) {
      erros.push(
        `subtotal (${item.subtotal}) não é coerente com ` +
          `valor_tabela - desconto (${subtotalEsperado}).`
      );
    }

    return { valido: erros.length === 0, erros };
  }

  // ====================================================================
  // PERSISTÊNCIA DO ITEM
  // ====================================================================

  /**
   * Persiste um item de composição em contrato_estabelecimentos.
   *
   * VERIFICAÇÃO DE TENANT (P0):
   *   Antes de inserir, verifica que o contrato e o ponto informados
   *   pertencem ao mesmo empresa_operadora_id. Isso garante que não há
   *   associação cross-tenant. A prova causal é:
   *     contratos.empresa_operadora_id  (coluna existente no banco)
   *     pontos.empresa_operadora_id     (coluna existente no banco)
   *   A igualdade entre os dois é exigida antes de qualquer escrita.
   *
   * SNAPSHOT:
   *   Os campos valor_tabela, desconto, subtotal e periodicidade são
   *   gravados como snapshot. Não há vínculo dinâmico com ponto_precos.
   *
   * @param contratoId  UUID do contrato ao qual o item pertence
   * @param unidadeId   UUID da unidade (NOT NULL no schema)
   * @param item        Item de composição montado e validado
   */
  async persistirItem(
    contratoId: string,
    unidadeId: string,
    item: ComposicaoItemResult
  ): Promise<PersistenciaResult> {
    // ── 1. Validar o item antes de qualquer acesso ao banco ──────────
    const validacao = this.validarItem(item);
    if (!validacao.valido) {
      return {
        sucesso: false,
        motivo: `Item inválido: ${validacao.erros.join('; ')}`,
      };
    }

    // ── 2. Verificar existência e empresa_operadora do contrato ────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contrato, error: contratoErr } = await (supabase as any)
      .from('contratos')
      .select('id, empresa_operadora_id')
      .eq('id', contratoId)
      .maybeSingle();

    if (contratoErr || !contrato) {
      return {
        sucesso: false,
        motivo: `Contrato "${contratoId}" não encontrado ou sem permissão de acesso (RLS).`,
      };
    }

    const tenantDoContrato: string = contrato.empresa_operadora_id;

    // ── 3. Verificar empresa_operadora do ponto ────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ponto, error: pontoErr } = await (supabase as any)
      .from('pontos')
      .select('id, empresa_operadora_id')
      .eq('id', item.ponto_id)
      .maybeSingle();

    if (pontoErr || !ponto) {
      return {
        sucesso: false,
        motivo: `Ponto "${item.ponto_id}" não encontrado ou sem permissão de acesso (RLS).`,
      };
    }

    const tenantDoPonto: string = ponto.empresa_operadora_id;

    // ── 4. Verificação cross-tenant (P0) ──────────────────────────────
    if (tenantDoContrato !== tenantDoPonto) {
      return {
        sucesso: false,
        motivo:
          `Violação de tenant: o contrato pertence ao tenant "${tenantDoContrato}" ` +
          `mas o ponto pertence ao tenant "${tenantDoPonto}". ` +
          `Associação cross-tenant não é permitida.`,
      };
    }

    // ── 5. Obter usuário autenticado ──────────────────────────────────
    const { data: authData } = await supabase.auth.getUser();

    // ── 6. Montar payload de inserção com snapshot comercial ──────────
    const payload: ContratoEstabelecimentoInsert = {
      contrato_id: contratoId,
      unidade_id: unidadeId,
      // snapshot comercial — imutável após inserção
      ponto_id: item.ponto_id,
      periodicidade: item.periodicidade,
      valor_tabela: item.valor_tabela,
      desconto: item.desconto,
      subtotal: item.subtotal,
      observacoes: item.observacoes ?? null,
      // campos obrigatórios legados
      quantidade_telas: 1,
      valor_unitario: item.subtotal,
      ativo: true,
      created_by: authData.user?.id ?? null,
    };

    // ── 7. Persistir ──────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserido, error: insertErr } = await (supabase as any)
      .from('contrato_estabelecimentos')
      .insert(payload)
      .select('*')
      .single();

    if (insertErr || !inserido) {
      console.error('[ComposicaoComercialService.persistirItem] Erro:', insertErr);
      return {
        sucesso: false,
        motivo:
          `Falha ao persistir item: ${insertErr?.message ?? 'erro desconhecido'}.`,
      };
    }

    return {
      sucesso: true,
      registro: inserido as ContratoEstabelecimento,
    };
  }
}

export const composicaoComercialService = new ComposicaoComercialService();

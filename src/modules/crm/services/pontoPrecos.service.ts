// ======================================================================
// SOBRE MÍDIA — PontoPrecosService (Gate 1B)
// Camada de aplicação para a matriz de preços por ponto.
//
// Fonte canônica: public.ponto_precos (criada no Gate 1A — migration 20261209)
// Unicidade de preço ativo garantida pelo banco: uq_ponto_precos_ativo
//
// REGRAS CRÍTICAS:
//   - Periodicidades válidas: MENSAL | BIMESTRAL | TRIMESTRAL | SEMESTRAL | ANUAL
//   - UNICO não pertence a esta camada comercial
//   - NÃO calcular preço alternativo quando periodicidade não tiver preço
//   - NÃO converter/interpolar entre periodicidades
//   - Unicidade ativa é responsabilidade do banco; service captura o erro
// ======================================================================

import { supabase } from '@/integrations/supabase/client';
import type { PontoPreco } from '@/types/customerPortal';
import type { PontoPrecoInsert, PontoPrecoUpdate } from '@/types/customerPortalDb';

// ── Tipo público de periodicidade comercial ──────────────────────────────────
export type PeriodicidadeComercial =
  | 'MENSAL'
  | 'BIMESTRAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL';

export const PERIODICIDADES_COMERCIAIS: readonly PeriodicidadeComercial[] = [
  'MENSAL',
  'BIMESTRAL',
  'TRIMESTRAL',
  'SEMESTRAL',
  'ANUAL',
] as const;

// ── Resultados tipados ───────────────────────────────────────────────────────

export type ResolucaoPrecoEncontrado = {
  encontrado: true;
  preco: PontoPreco;
};

export type ResolucaoPrecoNaoEncontrado = {
  encontrado: false;
  motivo: string;
};

export type ResolucaoPreco = ResolucaoPrecoEncontrado | ResolucaoPrecoNaoEncontrado;

// ── Erro de domínio: periodicidade inválida ──────────────────────────────────

export class PeriodicidadeInvalidaError extends Error {
  constructor(periodicidade: string) {
    super(
      `Periodicidade "${periodicidade}" não é válida nesta camada comercial. ` +
        `Valores aceitos: ${PERIODICIDADES_COMERCIAIS.join(', ')}.`
    );
    this.name = 'PeriodicidadeInvalidaError';
  }
}

// ── Função auxiliar: assert de periodicidade ──────────────────────────────────

function assertPeriodicidadeComercial(
  value: string
): asserts value is PeriodicidadeComercial {
  if (!(PERIODICIDADES_COMERCIAIS as readonly string[]).includes(value)) {
    throw new PeriodicidadeInvalidaError(value);
  }
}

// ── Service ──────────────────────────────────────────────────────────────────

class PontoPrecosService {
  // ====================================================================
  // LEITURA
  // ====================================================================

  /**
   * Lista todos os registros de preço de um ponto (ativos + histórico).
   * Ordenado do mais recente ao mais antigo.
   */
  async listarPrecosPorPonto(pontoId: string): Promise<PontoPreco[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ponto_precos')
        .select('*')
        .eq('ponto_id', pontoId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[PontoPrecosService.listarPrecosPorPonto] Erro:', error);
        return [];
      }
      return (data || []) as PontoPreco[];
    } catch (err) {
      console.error('[PontoPrecosService.listarPrecosPorPonto] Exceção:', err);
      return [];
    }
  }

  /**
   * Obtém o preço ativo de um ponto para uma periodicidade específica.
   * Retorna null se não houver preço ativo.
   * NÃO calcula preço alternativo ou proporcional.
   */
  async obterPrecoAtivo(
    pontoId: string,
    periodicidade: PeriodicidadeComercial
  ): Promise<PontoPreco | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ponto_precos')
        .select('*')
        .eq('ponto_id', pontoId)
        .eq('periodicidade', periodicidade)
        .eq('ativo', true)
        .maybeSingle();

      if (error) {
        console.error('[PontoPrecosService.obterPrecoAtivo] Erro:', error);
        return null;
      }
      return data as PontoPreco | null;
    } catch (err) {
      console.error('[PontoPrecosService.obterPrecoAtivo] Exceção:', err);
      return null;
    }
  }

  /**
   * Retorna somente as periodicidades que possuem preço ativo cadastrado
   * para o ponto informado. NÃO infere periodicidades sem preço real.
   */
  async obterTodasPeriodicidadesDisponiveis(
    pontoId: string
  ): Promise<PeriodicidadeComercial[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ponto_precos')
        .select('periodicidade')
        .eq('ponto_id', pontoId)
        .eq('ativo', true)
        .order('periodicidade');

      if (error) {
        console.error(
          '[PontoPrecosService.obterTodasPeriodicidadesDisponiveis] Erro:',
          error
        );
        return [];
      }

      const resultado: PeriodicidadeComercial[] = [];
      for (const row of (data || []) as { periodicidade: string }[]) {
        if ((PERIODICIDADES_COMERCIAIS as readonly string[]).includes(row.periodicidade)) {
          resultado.push(row.periodicidade as PeriodicidadeComercial);
        }
      }
      return resultado;
    } catch (err) {
      console.error(
        '[PontoPrecosService.obterTodasPeriodicidadesDisponiveis] Exceção:',
        err
      );
      return [];
    }
  }

  /**
   * Resolve o preço ativo de um ponto para uma periodicidade.
   * Retorna resultado estruturado; nunca lança exceção por ausência de preço.
   *
   * @throws PeriodicidadeInvalidaError se a periodicidade não for comercial
   *         (ex.: 'UNICO', 'DIARIO', qualquer outra inválida).
   */
  async resolverPreco(pontoId: string, periodicidade: string): Promise<ResolucaoPreco> {
    assertPeriodicidadeComercial(periodicidade);

    const preco = await this.obterPrecoAtivo(pontoId, periodicidade);

    if (!preco) {
      return {
        encontrado: false,
        motivo:
          `Preço indisponível: não existe preço ativo para a periodicidade ` +
          `"${periodicidade}" no ponto informado. ` +
          `Nenhum preço alternativo é calculado automaticamente.`,
      };
    }

    return { encontrado: true, preco };
  }

  // ====================================================================
  // ESCRITA
  // ====================================================================

  /**
   * Cria um novo preço para um ponto e periodicidade.
   * A unicidade de preço ativo (ponto+periodicidade) é garantida pelo banco
   * via índice uq_ponto_precos_ativo. Conflito é capturado e retorna null.
   *
   * @throws PeriodicidadeInvalidaError se periodicidade for inválida.
   */
  async criarPreco(
    tenantId: string,
    input: Omit<PontoPrecoInsert, 'empresa_operadora_id'>
  ): Promise<PontoPreco | null> {
    try {
      assertPeriodicidadeComercial(input.periodicidade);

      const { data: authData } = await supabase.auth.getUser();

      const payload: PontoPrecoInsert = {
        empresa_operadora_id: tenantId,
        ponto_id: input.ponto_id,
        periodicidade: input.periodicidade,
        preco: input.preco,
        ativo: input.ativo !== false,
        vigencia_inicio:
          input.vigencia_inicio ?? new Date().toISOString().slice(0, 10),
        vigencia_fim: input.vigencia_fim ?? null,
        created_by: authData.user?.id ?? null,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ponto_precos')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        if (
          error.code === '23505' ||
          (typeof error.message === 'string' &&
            error.message.includes('uq_ponto_precos_ativo'))
        ) {
          console.warn(
            '[PontoPrecosService.criarPreco] Conflito de unicidade: já existe preço ativo ' +
              `para ponto=${input.ponto_id} periodicidade=${input.periodicidade}. ` +
              'Use substituirPreco() ou inative o preço atual antes de criar um novo.'
          );
        } else {
          console.error('[PontoPrecosService.criarPreco] Erro:', error);
        }
        return null;
      }

      return data as PontoPreco;
    } catch (err) {
      if (err instanceof PeriodicidadeInvalidaError) throw err;
      console.error('[PontoPrecosService.criarPreco] Exceção:', err);
      return null;
    }
  }

  /**
   * Inativa um preço existente (ativo → false).
   * Não deleta o registro — mantém histórico imutável.
   */
  async inativarPreco(precoId: string): Promise<boolean> {
    try {
      const patch: PontoPrecoUpdate = { ativo: false };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ponto_precos')
        .update(patch)
        .eq('id', precoId);

      if (error) {
        console.error('[PontoPrecosService.inativarPreco] Erro:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[PontoPrecosService.inativarPreco] Exceção:', err);
      return false;
    }
  }

  /**
   * Inativa o preço antigo e cria um novo (substituição de preço ativo).
   *
   * LIMITAÇÃO DOCUMENTADA: esta operação consiste em duas escritas sequenciais
   * e NÃO possui atomicidade transacional garantida nesta camada. O cliente
   * Supabase JS (browser) não expõe BEGIN/COMMIT diretamente. Se a segunda
   * escrita falhar após a inativação do preço anterior, o ponto ficará sem
   * preço ativo para a periodicidade até intervenção manual. Para garantia
   * transacional completa, encapsular em uma RPC SECURITY DEFINER no banco
   * (fora do escopo do Gate 1B).
   *
   * @throws PeriodicidadeInvalidaError se periodicidade do novoInput for inválida.
   */
  async substituirPreco(
    precoIdAntigo: string,
    novoInput: Omit<PontoPrecoInsert, 'empresa_operadora_id'>,
    tenantId: string
  ): Promise<PontoPreco | null> {
    const inativado = await this.inativarPreco(precoIdAntigo);
    if (!inativado) {
      console.error(
        '[PontoPrecosService.substituirPreco] Falha ao inativar preço anterior. ' +
          'Operação cancelada.'
      );
      return null;
    }

    const novo = await this.criarPreco(tenantId, { ...novoInput, ativo: true });
    if (!novo) {
      console.error(
        '[PontoPrecosService.substituirPreco] Falha ao criar preço substituto. ' +
          'O preço anterior foi inativado mas o novo não foi criado. ' +
          'Verifique e corrija manualmente.'
      );
      return null;
    }

    return novo;
  }
}

export const pontoPrecosService = new PontoPrecosService();

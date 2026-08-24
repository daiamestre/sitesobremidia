import { supabase } from '@/integrations/supabase/client';

export interface CobrancaTela {
  cobranca_id: string;
  codigo: string;
  valor: number;
}

export async function criarCobrancaTela(empresaOperadoraId: string, gestorUserId?: string) {
  const { data, error } = await supabase.rpc('criar_cobranca_tela', {
    p_empresa_operadora_id: empresaOperadoraId,
    p_gestor_user_id: gestorUserId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as CobrancaTela;
}

export type StatusCobranca = 'AGUARDANDO PAGAMENTO' | 'PAGAMENTO CONFIRMADO' | 'NAO ENCONTRADA';

export async function statusCobranca(cobrancaId: string): Promise<StatusCobranca> {
  const { data, error } = await supabase
    .from('contas_receber')
    .select('status')
    .eq('id', cobrancaId)
    .maybeSingle();
  if (error || !data) return 'NAO ENCONTRADA';
  return data.status === 'PAGA' || data.status === 'PAGO'
    ? 'PAGAMENTO CONFIRMADO'
    : 'AGUARDANDO PAGAMENTO';
}

export interface CriarTelaInput {
  empresaOperadoraId: string;
  cobrancaId: string;
  nome: string;
  localizacao?: string;
  orientacao?: 'horizontal' | 'vertical';
  capaUrl?: string;
  usuarioId?: string;
}

export async function criarTelaPosPagamento(input: CriarTelaInput): Promise<{ tela_id: string }> {
  const { data, error } = await supabase.rpc('criar_tela_gestor', {
    p_empresa_operadora_id: input.empresaOperadoraId,
    p_cobranca_id: input.cobrancaId,
    p_nome: input.nome,
    p_localizacao: input.localizacao ?? null,
    p_orientacao: input.orientacao ?? 'horizontal',
    p_capa_url: input.capaUrl ?? null,
    p_usuario_id: input.usuarioId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { tela_id: string };
}

/**
 * BR Code estático para apresentação ao pagador.
 * Sem gateway credenciado, a confirmação automática depende do webhook do
 * provedor; até lá o OWNER pode dar baixa na Central de Cobranças (conciliação
 * real pelo trigger), que libera a tela imediatamente.
 */
export function gerarBrcodePix(codigo: string, valor: number): string {
  const txid = codigo.replace(/[^A-Z0-9]/g, '').slice(0, 25);
  const valorStr = valor.toFixed(2);
  return (
    `00020126580014BR.GOV.BCB.PIX0136${txid}` +
    `520400005303986540${String(valorStr.length).padStart(2, '0')}${valorStr}` +
    `5802BR5913SOBRE MIDIA6009CURITIBA62070503***6304`
  );
}

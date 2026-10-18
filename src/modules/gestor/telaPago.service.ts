import { supabase } from '@/integrations/supabase/client';

export interface CobrancaTela {
  cobranca_id: string;
  codigo: string;
  valor: number;
}

export const VALOR_DA_TELA = 22.99;

/** Texto que a criar_cobranca_tela grava na cobrança — é por ele que achamos a cobrança de tela de cada gestor. */
export const notaDaCobrancaDeTela = (usuarioId: string) => `Criacao de tela — Gestor de Midias (user ${usuarioId})`;

export async function criarCobrancaTela(empresaOperadoraId: string, gestorUserId?: string) {
  const { data, error } = await supabase.rpc('criar_cobranca_tela', {
    p_empresa_operadora_id: empresaOperadoraId,
    p_gestor_user_id: gestorUserId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as CobrancaTela;
}

/**
 * F-194 — reaproveita a cobrança de tela que o gestor já abriu e ainda não virou tela (fechar a janela não cria outra
 * cobrança a cada vez). Paga e ainda sem tela vem primeiro.
 */
export async function cobrancaDeTelaEmAberto(usuarioId: string): Promise<CobrancaTela | null> {
  const { data } = await supabase.from('contas_receber')
    .select('id, codigo_operacional, valor, status, created_at')
    .eq('notes', notaDaCobrancaDeTela(usuarioId))
    .not('status', 'in', '("CANCELADA","CANCELADO")')
    .order('created_at', { ascending: false })
    .limit(10);
  const linhas = (data ?? []) as unknown as { id: string; codigo_operacional: string | null; valor: number; status: string }[];
  if (!linhas.length) return null;
  const { data: usadas } = await supabase.from('screens').select('cobranca_id' as never).in('cobranca_id' as never, linhas.map((l) => l.id) as never);
  const jaUsadas = new Set(((usadas ?? []) as unknown as { cobranca_id: string }[]).map((u) => u.cobranca_id));
  const livres = linhas.filter((l) => !jaUsadas.has(l.id));
  const escolhida = livres.find((l) => l.status === 'PAGA' || l.status === 'PAGO') ?? livres[0];
  return escolhida ? { cobranca_id: escolhida.id, codigo: escolhida.codigo_operacional ?? '', valor: Number(escolhida.valor) } : null;
}

/** F-194 — Pix de verdade pelo Banco Inter (inter-pix-engine): devolve o "copia e cola" oficial da cobrança. */
export async function emitirPixDaCobranca(cobrancaId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('inter-pix-engine', { body: { action: 'issue', cobranca_id: cobrancaId } });
  const r = (data ?? {}) as { success?: boolean; pixCopiaECola?: string; error?: string; details?: string };
  if (r.success && r.pixCopiaECola) return r.pixCopiaECola;
  throw new Error(r.error || r.details || error?.message || 'O Banco Inter não devolveu o Pix agora. Tente de novo.');
}

/** Pergunta ao Banco Inter se o Pix foi pago (e registra o pagamento quando foi). Falha aqui não é erro para o usuário. */
export async function conferirPixNoBanco(cobrancaId: string): Promise<void> {
  try { await supabase.functions.invoke('inter-pix-engine', { body: { action: 'consult', cobranca_id: cobrancaId } }); } catch { /* tenta no próximo ciclo */ }
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
  capaUrl?: string | null;
  usuarioId?: string;
  rotacao?: number;
}

export async function criarTelaPosPagamento(input: CriarTelaInput): Promise<{ tela_id: string }> {
  const { data, error } = await supabase.rpc('criar_tela_gestor' as never, {
    p_empresa_operadora_id: input.empresaOperadoraId,
    p_cobranca_id: input.cobrancaId,
    p_nome: input.nome,
    p_localizacao: input.localizacao ?? null,
    p_orientacao: input.orientacao ?? 'horizontal',
    p_capa_url: input.capaUrl ?? null,
    p_usuario_id: input.usuarioId ?? null,
    p_rotacao: input.rotacao ?? null,
  } as never);
  if (error) throw new Error(error.message);
  return data as unknown as { tela_id: string };
}


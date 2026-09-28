import { supabase } from '@/integrations/supabase/client';

/**
 * Suporte com triagem (F-102). Escrita só pelas RPCs suporte_* (SECURITY DEFINER);
 * leitura por RLS: quem abriu vê os seus, OWNER/ADMIN do tenant veem todos.
 */
export type CategoriaSuporte = 'FATURA_PAGAMENTO' | 'ATIVACAO_MIDIA' | 'CAMPANHA_TELAS' | 'ACESSO_CONTA' | 'OUTRO';
export type StatusSuporte = 'ABERTO' | 'EM_ATENDIMENTO' | 'RESOLVIDO';

export const CATEGORIAS_SUPORTE: { valor: CategoriaSuporte; rotulo: string; descricao: string }[] = [
  { valor: 'FATURA_PAGAMENTO', rotulo: 'Fatura ou pagamento', descricao: 'Boleto, PIX, fatura atrasada ou cobrança' },
  { valor: 'ATIVACAO_MIDIA', rotulo: 'Ativação de mídia', descricao: 'Mídia que não entrou no ar ou está atrasada' },
  { valor: 'CAMPANHA_TELAS', rotulo: 'Campanha ou telas', descricao: 'Campanha, pontos parceiros ou exibições' },
  { valor: 'ACESSO_CONTA', rotulo: 'Acesso à conta', descricao: 'Login, senha, dados da empresa' },
  { valor: 'OUTRO', rotulo: 'Outro assunto', descricao: 'Qualquer outra dúvida' },
];

export const rotuloCategoria = (c: string) => CATEGORIAS_SUPORTE.find((x) => x.valor === c)?.rotulo ?? 'Outro assunto';

export const ROTULO_STATUS: Record<StatusSuporte, string> = {
  ABERTO: 'Aguardando suporte',
  EM_ATENDIMENTO: 'Em atendimento',
  RESOLVIDO: 'Resolvido',
};

export interface ChamadoSuporte {
  id: string;
  aberto_por: string;
  cliente_id: string | null;
  perfil_origem: string;
  categoria: CategoriaSuporte;
  assunto: string;
  status: StatusSuporte;
  created_at: string;
  ultima_mensagem_em: string;
  resolvido_em: string | null;
  solicitante?: { nome: string | null; email: string | null } | null;
}

export interface MensagemSuporte {
  id: string;
  chamado_id: string;
  remetente_id: string;
  do_atendente: boolean;
  mensagem: string;
  created_at: string;
}

const CAMPOS = 'id, aberto_por, cliente_id, perfil_origem, categoria, assunto, status, created_at, ultima_mensagem_em, resolvido_em';

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export const suporteService = {
  async souAtendente(): Promise<boolean> {
    const { data, error } = await supabase.rpc('suporte_eh_atendente' as never);
    return !error && data === true;
  },

  /** Chamados do próprio usuário (quem abriu). */
  async meusChamados(usuarioId: string): Promise<ChamadoSuporte[]> {
    const { data, error } = await supabase
      .from('suporte_chamados' as never)
      .select(CAMPOS)
      .eq('aberto_por', usuarioId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ChamadoSuporte[];
  },

  /** Fila do atendimento (OWNER/ADMIN): RLS já limita ao tenant. */
  async filaAtendimento(status: 'ABERTOS' | 'RESOLVIDOS'): Promise<ChamadoSuporte[]> {
    let q = supabase
      .from('suporte_chamados' as never)
      .select(`${CAMPOS}, solicitante:usuarios!suporte_chamados_aberto_por_fkey(nome, email)`)
      .order('ultima_mensagem_em', { ascending: false })
      .limit(100);
    q = status === 'ABERTOS' ? q.neq('status', 'RESOLVIDO') : q.eq('status', 'RESOLVIDO');
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ChamadoSuporte[];
  },

  async mensagens(chamadoId: string): Promise<MensagemSuporte[]> {
    const { data, error } = await supabase
      .from('suporte_mensagens' as never)
      .select('id, chamado_id, remetente_id, do_atendente, mensagem, created_at')
      .eq('chamado_id', chamadoId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as MensagemSuporte[];
  },

  abrir(categoria: CategoriaSuporte, assunto: string, mensagem: string) {
    return rpc<{ status: 'OK' | 'JA_ABERTO'; chamado_id: string }>('suporte_abrir_chamado', {
      p_categoria: categoria, p_assunto: assunto, p_mensagem: mensagem,
    });
  },

  enviar(chamadoId: string, mensagem: string) {
    return rpc<{ status: 'OK' }>('suporte_enviar_mensagem', { p_chamado: chamadoId, p_mensagem: mensagem });
  },

  resolver(chamadoId: string) {
    return rpc<{ status: 'OK' }>('suporte_resolver', { p_chamado: chamadoId });
  },
};

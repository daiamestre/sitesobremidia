import { supabase } from '@/integrations/supabase/client';

/**
 * F-190 — Visão das Contas (OWNER/ADM): o que cada usuário da empresa tem e faz. Quem decide o acesso é o banco
 * (fn_pode_ver_todas_as_contas): qualquer outro perfil recebe SEM_PERMISSAO.
 */
export interface ContaResumo {
  id: string;
  nome: string | null;
  email: string | null;
  perfil: string;
  situacao: string | null;
  ativo: boolean;
  /** F-191: limite de vídeo/áudio desta conta em segundos (null = padrão do perfil). */
  limite_video_segundos: number | null;
  criado_em: string | null;
  ultimo_acesso: string | null;
  telas: number;
  telas_online: number;
  telas_sem_playlist: number;
  playlists: number;
  midias: number;
  espaco_bytes: number;
  exibicoes_7d: number;
  pontos: number;
  campanhas: number;
  contratos: number;
  clientes_carteira: number;
}

export interface ContaDetalhe {
  telas: { id: string; nome: string; cidade: string | null; uf: string | null; online: boolean; conectada: boolean; ultimo_sinal: string | null; app: string | null; playlist: string | null }[];
  playlists: { id: string; nome: string; formato: string | null; atualizada_em: string | null; itens: number; telas: number }[];
  midias: { id: string; nome: string; tipo: string; bytes: number; formato: string | null; criada_em: string; miniatura: string | null }[];
  pontos: { id: string; nome: string; cidade: string | null; uf: string | null; categoria: string | null; ativo: boolean }[];
  campanhas: { id: string; titulo: string | null; status: string | null; inicio: string | null; fim: string | null }[];
  contratos: { id: string; numero: string | null; situacao: string | null; valor_mensal: number | null; inicio: string | null; fim: string | null }[];
  exibicoes_por_dia: { dia: string; n: number }[];
}

type Resposta<T> = { status: 'OK' | 'SEM_PERMISSAO' | 'CONTA_NAO_ENCONTRADA' } & Partial<T>;

export async function buscarContas(): Promise<ContaResumo[]> {
  const { data, error } = await supabase.rpc('fn_visao_contas' as never);
  if (error) throw new Error(error.message);
  const r = data as unknown as Resposta<{ contas: ContaResumo[] }>;
  if (r?.status === 'SEM_PERMISSAO') throw new Error('Apenas o dono e o ADM podem ver todas as contas.');
  return r?.contas ?? [];
}

export async function buscarDetalheDaConta(usuarioId: string): Promise<ContaDetalhe> {
  const { data, error } = await supabase.rpc('fn_visao_conta_detalhe' as never, { p_usuario: usuarioId } as never);
  if (error) throw new Error(error.message);
  const r = data as unknown as Resposta<ContaDetalhe>;
  if (r?.status === 'SEM_PERMISSAO') throw new Error('Apenas o dono e o ADM podem ver todas as contas.');
  if (r?.status === 'CONTA_NAO_ENCONTRADA') throw new Error('Conta não encontrada.');
  return {
    telas: r.telas ?? [], playlists: r.playlists ?? [], midias: r.midias ?? [], pontos: r.pontos ?? [],
    campanhas: r.campanhas ?? [], contratos: r.contratos ?? [], exibicoes_por_dia: r.exibicoes_por_dia ?? [],
  };
}

/** F-191 — dono/ADM definem (ou limpam, com null) o limite de duração de vídeo de uma conta. */
export async function definirLimiteDeVideo(usuarioId: string, segundos: number | null): Promise<void> {
  const { data, error } = await supabase.rpc('fn_definir_limite_video' as never, { p_usuario: usuarioId, p_segundos: segundos } as never);
  if (error) throw new Error(error.message);
  const r = data as unknown as { status: string; mensagem?: string };
  if (r?.status === 'SEM_PERMISSAO') throw new Error('Apenas o dono e o ADM podem mudar este limite.');
  if (r?.status === 'FORA_DA_FAIXA') throw new Error(r.mensagem ?? 'Use de 5 a 600 segundos.');
  if (r?.status !== 'OK') throw new Error('Conta não encontrada.');
}

/** Limite padrão do perfil (em segundos) quando a conta não tem limite próprio; null = sem limite. */
export const limitePadraoDoPerfil = (perfil: string): number | null =>
  perfil === 'GESTOR' ? 30 : perfil === 'ANUNCIANTE' || perfil === 'CLIENTE' ? 20 : null;

/** Nome do perfil como aparece para o dono. */
export const NOME_DO_PERFIL: Record<string, string> = {
  OWNER: 'Dono', ADMIN: 'ADM', GESTOR: 'Gestor de mídia', ANUNCIANTE: 'Anunciante', REPRESENTANTE: 'Representante',
  CLIENTE: 'Cliente', PARCEIRO: 'Parceiro', FINANCEIRO: 'Financeiro', FUNCIONARIO: 'Funcionário', DESIGNER: 'Designer',
  OPERACIONAL: 'Operacional', GERENTE: 'Gerente', SUPERVISOR: 'Supervisor',
};

export const nomeDoPerfil = (perfil: string) => NOME_DO_PERFIL[perfil] ?? (perfil === 'SEM PERFIL' ? 'Sem perfil' : perfil);

export function tamanhoLegivel(bytes: number): string {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${Math.round(mb)} MB`;
}

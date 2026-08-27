import { supabase } from '@/integrations/supabase/client';

export interface PerfilCorporativo {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
}

export interface CriarUsuarioPayload {
  nome: string;
  email: string;
  telefone?: string;
  perfilId: string;
  /** Vinculo comercial (equipe do anunciante); GESTOR de prospeccao NAO envia */
  clienteId?: string | null;
  /** Metadados de prospeccao gravados em solicitacoes_acesso.dados_cadastro */
  dadosExtra?: Record<string, unknown> | null;
}

export interface CriarUsuarioResultado {
  success: boolean;
  error?: string;
  /** Senha inicial gerada no backend - entregue UMA única vez (missão Â§5/Â§6) */
  senha_inicial?: string;
  /** E-mail efetivamente provisionado (eco do backend) */
  email?: string;
  /** true quando o perfil é EXTERNO (ANUNCIANTE/PARCEIRO/CLIENTE): nasce PENDING e depende de aprovação na Central */
  requer_aprovacao?: boolean;
}

export interface UsuarioCentral {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  ativo: boolean;
  status?: string | null;
  is_owner: boolean;
  perfil_nome: string;
  organizacao_nome: string;
  ultimo_acesso?: string | null;
  convite_pendente: boolean;
  created_at?: string | null;
}

export interface DashboardCentral {
  total: number;
  ativos: number;
  inativos: number;
  pendentes: number;
  por_perfil: { perfil: string; total: number; ativos: number }[];
}

export const PERMISSOES_DISPONIVEIS = [
  { codigo: 'users.view', label: 'Visualizar usuários' },
  { codigo: 'users.create', label: 'Criar usuários' },
  { codigo: 'users.edit', label: 'Editar usuários' },
  { codigo: 'users.activate', label: 'Ativar usuários' },
  { codigo: 'users.deactivate', label: 'Desativar usuários' },
  { codigo: 'users.create_admin', label: 'Criar Administradores' },
  { codigo: 'users.manage_permissions', label: 'Gerenciar autonomia' },
  { codigo: 'representantes.view', label: 'Visualizar representantes' },
  { codigo: 'representantes.edit', label: 'Editar representantes' },
  { codigo: 'representantes.activate', label: 'Ativar representantes' },
  { codigo: 'representantes.deactivate', label: 'Desativar representantes' },
  { codigo: 'representantes.edit_clients', label: 'Reatribuir clientes' },
  { codigo: 'representantes.view_performance', label: 'Visualizar desempenho' },
] as const;

export const EDGE_FUNCTION_URL =
  ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost:54321').replace(/\/$/, '') +
  // Console OWNER/ADMIN: roteia EXTERNOS (ANUNCIANTE/PARCEIRO/CLIENTE) para
  // aprovação na Central e INTERNOS para provisionamento direto (missão portal).
  '/functions/v1/create-corporate-user';

/** Provisionamento DIRETO da equipe do ANUNCIANTE (missão portal Â§3/Â§5/Â§7):
 *  senha inicial backend + troca obrigatória. Restrito server-side a
 *  OWNER/ADMIN ou ao próprio ANUNCIANTE para perfis de equipe. */
export const PROVISION_USER_URL =
  ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost:54321').replace(/\/$/, '') +
  '/functions/v1/provision-user';

export class CorporateUsersService {
  async getMyPermissions(): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_my_admin_permissions');
    if (error) {
      console.error('[CorporateUsersService.getMyPermissions]', error);
      return [];
    }
    return (data as string[]) ?? [];
  }

  async getDashboard(): Promise<DashboardCentral | null> {
    const { data, error } = await supabase.rpc('get_central_acessos_dashboard');
    if (error) {
      console.error('[CorporateUsersService.getDashboard]', error);
      return null;
    }
    return (data as unknown as DashboardCentral) ?? null;
  }

  async listarPerfis(): Promise<PerfilCorporativo[]> {
    const { data, error } = await supabase
      .from('perfis')
      .select('id, nome, descricao, ativo')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (error) {
      console.error('[CorporateUsersService.listarPerfis]', error);
      return [];
    }
    return (data as PerfilCorporativo[]) ?? [];
  }

  async listarUsuariosCentral(): Promise<UsuarioCentral[]> {
    const { data, error } = await supabase.rpc('listar_usuarios_central');
    if (error) {
      console.error('[CorporateUsersService.listarUsuariosCentral]', error);
      return [];
    }
    return (data as unknown as UsuarioCentral[]) ?? [];
  }

  async listarPermissoesTenant(): Promise<Record<string, string[]>> {
    const { data, error } = await supabase
      .from('permissoes_usuarios')
      .select('usuario_id, permissao');

    if (error) {
      console.error('[CorporateUsersService.listarPermissoesTenant]', error);
      return {};
    }

    const mapa: Record<string, string[]> = {};
    for (const row of (data as { usuario_id: string; permissao: string }[]) ?? []) {
      (mapa[row.usuario_id] ??= []).push(row.permissao);
    }
    return mapa;
  }

  async criarUsuario(payload: CriarUsuarioPayload): Promise<CriarUsuarioResultado> {
    return this.postProvisionamento(EDGE_FUNCTION_URL, payload);
  }

  /**
   * Provisionamento DIRETO via provision-user (Central de Prospecção do
   * REPRESENTANTE → GESTOR DE MÍDIAS): mesma garantia de senha automática
   * backend-only e troca obrigatória no primeiro login.
   */
  async provisionarUsuarioDireto(payload: CriarUsuarioPayload): Promise<CriarUsuarioResultado> {
    return this.postProvisionamento(PROVISION_USER_URL, payload);
  }

  private async postProvisionamento(url: string, payload: CriarUsuarioPayload): Promise<CriarUsuarioResultado> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        return { success: false, error: body?.error ?? `Falha ao criar usuário (HTTP ${res.status})` };
      }
      return {
        success: true,
        senha_inicial: typeof body?.senha_inicial === 'string' ? body.senha_inicial : undefined,
        email: typeof body?.email === 'string' ? body.email : undefined,
        requer_aprovacao: body?.requer_aprovacao === true,
      };
    } catch (err) {
      console.error('[CorporateUsersService.criarUsuario]', err);
      return { success: false, error: 'Não foi possível contatar o servidor. Tente novamente.' };
    }
  }

  /** Provisionamento direto da equipe do ANUNCIANTE (missão portal). */
  async provisionarMembroEquipe(payload: CriarUsuarioPayload): Promise<CriarUsuarioResultado> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }
    try {
      const res = await fetch(PROVISION_USER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: body?.error ?? `Falha ao provisionar membro (HTTP ${res.status})` };
      }
      return {
        success: true,
        senha_inicial: typeof body?.senha_inicial === 'string' ? body.senha_inicial : undefined,
        requer_aprovacao: false,
      };
    } catch (err) {
      console.error('[CorporateUsersService.provisionarMembroEquipe]', err);
      return { success: false, error: 'Não foi possível contatar o servidor. Tente novamente.' };
    }
  }

  async atualizarStatusUsuario(usuarioId: string, ativo: boolean): Promise<{ success: boolean; error?: string }> {
    const novoStatus = ativo ? 'ACTIVE' : 'INACTIVE';

    const { error } = await supabase
      .from('usuarios')
      .update({ ativo, status: novoStatus })
      .eq('id', usuarioId);

    if (error) {
      console.error('[CorporateUsersService.atualizarStatusUsuario]', error);
      return { success: false, error: error.message };
    }

    // A trilha de auditoria é registrada pelo trigger server-side
    // auditar_alteracao_usuario (impossível de forjar pelo cliente).
    return { success: true };
  }

  async atualizarUsuario(
    usuarioId: string,
    dados: { nome?: string; telefone?: string | null; perfilId?: string | null }
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.rpc('atualizar_usuario_corporativo', {
      p_alvo_id: usuarioId,
      p_nome: dados.nome ?? null,
      p_telefone: dados.telefone ?? null,
      p_perfil_id: dados.perfilId ?? null,
    });

    if (error) {
      console.error('[CorporateUsersService.atualizarUsuario]', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  async gerenciarAutonomia(
    alvoId: string,
    permissoes: string[],
    conceder: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('gerenciar_autonomia', {
      p_alvo_id: alvoId,
      p_permissoes: permissoes,
      p_conceder: conceder,
    });

    if (error) {
      console.error('[CorporateUsersService.gerenciarAutonomia]', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: data ? String(data) : undefined };
  }
}

export const corporateUsersService = new CorporateUsersService();

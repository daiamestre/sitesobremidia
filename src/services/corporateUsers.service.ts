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
] as const;

export const EDGE_FUNCTION_URL =
  (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '') + '/functions/v1/create-corporate-user';

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
    return (data as DashboardCentral) ?? null;
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
    return (data as UsuarioCentral[]) ?? [];
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

  async criarUsuario(payload: CriarUsuarioPayload): Promise<{ success: boolean; error?: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
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
      return { success: true };
    } catch (err) {
      console.error('[CorporateUsersService.criarUsuario]', err);
      return { success: false, error: 'Não foi possível contatar o servidor. Tente novamente.' };
    }
  }

  async atualizarStatusUsuario(usuarioId: string, ativo: boolean): Promise<{ success: boolean; error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const novoStatus = ativo ? 'ACTIVE' : 'INACTIVE';

    const { error } = await supabase
      .from('usuarios')
      .update({ ativo, status: novoStatus })
      .eq('id', usuarioId);

    if (error) {
      console.error('[CorporateUsersService.atualizarStatusUsuario]', error);
      return { success: false, error: error.message };
    }

    const { data: tenantId } = await supabase.rpc('get_user_tenant_id');

    const { error: audErr } = await supabase.from('auditoria_logs').insert({
      empresa_operadora_id: tenantId ?? null,
      usuario_id: user.id,
      usuario_email: user.email,
      usuario_role: null,
      entidade_tipo: 'USUARIO',
      entidade_id: usuarioId,
      acao: ativo ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      status_anterior: ativo ? 'INACTIVE' : 'ACTIVE',
      status_novo: novoStatus,
      observacoes: ativo
        ? `Usuário reativado via Central de Acessos`
        : `Usuário desativado via Central de Acessos`,
    });
    if (audErr) {
      console.error('[CorporateUsersService.atualizarStatusUsuario] auditoria', audErr.message);
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

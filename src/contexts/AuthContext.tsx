import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { securityAuditService } from '@/services/securityAudit.service';

export interface UsuarioRecord {
  id: string;
  empresa_operadora_id: string;
  perfil_id: string;
  nome: string;
  email: string;
  telefone?: string;
  avatar_url?: string;
  ativo: boolean;
  status?: string; // ciclo de vida: ACTIVE | INACTIVE | SUSPENDED | DELETED
  is_owner?: boolean;
  owner_locked?: boolean;
  /** TRUE = senha inicial/provisória — troca obrigatória no primeiro acesso */
  must_change_password?: boolean;
  organization_id?: string;
  department_id?: string;
  role_id?: string;
  cliente_id?: string;
  perfil?: {
    id: string;
    nome: string;
    descricao?: string;
  };
  cliente?: {
    id: string;
    razao_social?: string;
    nome_fantasia?: string;
  };
  organization?: {
    id: string;
    name: string;
  };
  department?: {
    id: string;
    name: string;
  };
  role?: {
    id: string;
    name: string;
  };
}

export interface RepresentanteRecord {
  id: string;
  empresa_operadora_id: string;
  usuario_id: string;
  codigo_representante?: number;
  cpf_cnpj: string;
  razao_social?: string;
  comissao_porcentagem: number;
}

// Perfil legado compatível com componentes do Dashboard
export interface LegacyProfile {
  full_name: string | null;
  company_name: string | null;
  email: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  usuario: UsuarioRecord | null;
  perfilNome: string | null;
  representante: RepresentanteRecord | null;
  empresaOperadoraId: string | null;
  solicitacaoStatus: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'INACTIVE' | 'DELETED' | 'NOT_FOUND';
  loading: boolean;
  // Alias legado: mapeado a partir de usuario para compatibilidade com DashboardLayout, Sidebar, DashboardHome, Settings
  profile: LegacyProfile | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; status?: string; role?: string | null; routeRedirect?: string }>;
  signUp: (email: string, password: string, fullName: string, companyName: string) => Promise<{ error: Error | null; data: { user: User | null } | null }>;
  signOut: () => Promise<void>;
  /** Recarrega usuarios/representantes/status do banco (ex.: após troca obrigatória de senha) */
  refreshUserData: () => Promise<void>;
  isAuthenticated: boolean;
  isApproved: boolean;
  isOwner: boolean;
  workspaceRoute: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [usuario, setUsuario] = useState<UsuarioRecord | null>(null);
  const [representante, setRepresentante] = useState<RepresentanteRecord | null>(null);
  const [solicitacaoStatus, setSolicitacaoStatus] = useState<'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'INACTIVE' | 'DELETED' | 'NOT_FOUND'>('NOT_FOUND');
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string): Promise<{
    usuarioData: UsuarioRecord | null;
    repData: RepresentanteRecord | null;
    perfilNome: string | null;
    solicitacaoStatus: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'INACTIVE' | 'DELETED' | 'NOT_FOUND';
  }> => {
    try {
      // 1. Busca dados cadastrais do usuario + perfil e novas hierarquias
      const { data: usuarioRaw } = await supabase
        .from('usuarios')
        .select('*, perfil:perfis(*), organization:organizations(*), department:departments(*), role:roles(*)')
        .eq('id', userId)
        .maybeSingle();

      const usuarioData = (usuarioRaw as unknown as UsuarioRecord) || null;
      console.log('[AuthContext] fetchUserData -> usuarioData:', usuarioData);
      setUsuario(usuarioData);

      // 2. Busca dados comerciais do representante
      let repData: RepresentanteRecord | null = null;
      if (usuarioData) {
        const { data: repRaw, error: repError } = await supabase
          .from('representantes')
          .select('*')
          .eq('usuario_id', userId)
          .maybeSingle();
        if (repError) {
          console.error('[AuthContext] Erro ao buscar representante:', repError);
        }
        console.log('[AuthContext] fetchUserData -> repData:', repRaw);
        repData = (repRaw as unknown as RepresentanteRecord) || null;
        setRepresentante(repData);
      } else {
        console.log('[AuthContext] fetchUserData -> usuarioData is null, skipping representante fetch');
        setRepresentante(null);
      }

      // 3. Busca status da solicitação de acesso no banco de dados
      const { data: solData } = await supabase
        .from('solicitacoes_acesso')
        .select('status')
        .eq('auth_user_id', userId)
        .maybeSingle();

      let computedStatus: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'INACTIVE' | 'DELETED' | 'NOT_FOUND' = 'NOT_FOUND';

      // REGRA: OWNER e ADMIN têm acesso soberano. Os demais dependem do status em solicitacoes_acesso.
      // NÃO usar usuario.status como bypass — a fonte de verdade é solicitacoes_acesso.
      if (usuarioData?.is_owner || usuarioData?.perfil?.nome === 'OWNER' || usuarioData?.perfil?.nome === 'ADMIN') {
        computedStatus = 'APPROVED';
      } else if (solData && solData.status) {
        computedStatus = solData.status as typeof computedStatus;
      } else {
        computedStatus = 'NOT_FOUND';
      }

      setSolicitacaoStatus(computedStatus);
      // PRIORIDADE: perfilNome vem exclusivamente da fonte oficial (perfil?.nome || is_owner fallback)
      // O flag is_owner NUNCA deve sobrescrever o perfil identificado — evita que Representante seja visto como OWNER
      const perfilNome = usuarioData?.perfil?.nome || (usuarioData?.is_owner ? 'OWNER' : null);
      return { usuarioData, repData, perfilNome, solicitacaoStatus: computedStatus };
    } catch (err) {
      console.warn('[AuthContext] Erro ao carregar dados do usuário:', err);
      setUsuario(null);
      setRepresentante(null);
      setSolicitacaoStatus('NOT_FOUND');
      return { usuarioData: null, repData: null, perfilNome: null, solicitacaoStatus: 'NOT_FOUND' };
    }
  };

  useEffect(() => {
    // Configura listener de auth PRIMEIRO sem setTimeout 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          fetchUserData(currentSession.user.id);
        } else {
          setUsuario(null);
          setRepresentante(null);
          setSolicitacaoStatus('NOT_FOUND');
        }
      }
    );

    // DEPOIS verifica sessão existente e valida com Supabase
    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      
      if (existingSession?.user) {
        await fetchUserData(existingSession.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: Error | null; status?: string; role?: string | null; routeRedirect?: string }> => {
    // FASE 2: AUTENTICAÇÃO REAL E RIGOROSA VIA SUPABASE AUTH
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // 1. Validação de Credenciais no Banco / Supabase Auth
    if (error || !data?.session || !data.user) {
      await securityAuditService.logEvent('LOGIN_FAILED', {
        userEmail: email,
        details: { error: error?.message || 'Credenciais inválidas ou e-mail inexistente.' }
      });
      setUser(null);
      setSession(null);
      setUsuario(null);
      setRepresentante(null);
      setSolicitacaoStatus('NOT_FOUND');
      return { error: error || new Error('Credenciais inválidas: e-mail ou senha incorretos.') };
    }

    // 2. Verificação de E-mail Confirmado (Regra Obrigatória 3)
    // SEGURANÇA: nenhum bypass por metadados de usuário — apenas confirmação real do Supabase Auth
    const isConfirmed = data.user.email_confirmed_at != null ||
                       data.user.app_metadata?.provider !== 'email';

    if (!isConfirmed) {
      await securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: email,
        userId: data.user.id,
        details: { reason: 'EMAIL_NOT_CONFIRMED' }
      });
      await supabase.auth.signOut();
      setUser(null); setSession(null); setUsuario(null); setRepresentante(null); setSolicitacaoStatus('NOT_FOUND');
      return { error: new Error('Acesso negado: seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.') };
    }

    // 3. Consulta em Tempo Real de Cadastro e Status (Regras 4, 5 e 6)
    const userData = await fetchUserData(data.user.id);
    const role = userData.perfilNome;
    const status = userData.solicitacaoStatus;

    // Se não tiver perfil corporativo oficial (7 Perfis Constitucionais + Legado)
    const validRoles = ['OWNER', 'ADMIN', 'GESTOR', 'FUNCIONARIO', 'REPRESENTANTE', 'ANUNCIANTE', 'PARCEIRO', 'GERENTE', 'FINANCEIRO', 'DESIGNER', 'OPERACIONAL', 'CLIENTE', 'SUPERVISOR'];
    if (!role || !validRoles.includes(role.toUpperCase())) {
      await securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: email,
        userId: data.user.id,
        details: { reason: 'UNAUTHORIZED_ROLE', role: role || 'UNKNOWN' }
      });
      await supabase.auth.signOut();
      setUser(null); setSession(null); setUsuario(null); setRepresentante(null); setSolicitacaoStatus('NOT_FOUND');
      return { error: new Error('Acesso negado: esta conta não possui permissão de Representante Comercial ou perfil corporativo do ERP.') };
    }

    // Se o status na tabela de solicitações ou ciclo de vida não for APPROVED nem ACTIVE
    if (status !== 'APPROVED' && status !== 'ACTIVE') {
      await securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: email,
        userId: data.user.id,
        details: { reason: `STATUS_${status}` }
      });
      await supabase.auth.signOut();
      setUser(null); setSession(null); setUsuario(null); setRepresentante(null); setSolicitacaoStatus('NOT_FOUND');
      
      const statusMessage = status === 'PENDING' ? 'Acesso negado: seu cadastro está PENDENTE de aprovação pelo Administrador (sobremidiadesigner@gmail.com).' :
                            status === 'REJECTED' ? 'Acesso negado: sua solicitação de cadastro foi REJEITADA pela Administração.' :
                            status === 'SUSPENDED' ? 'Acesso negado: sua conta corporativa foi SUSPENSA.' :
                            status === 'INACTIVE' ? 'Acesso negado: sua conta de usuário está INATIVA no sistema.' :
                            status === 'DELETED' ? 'Acesso negado: esta conta foi excluída ou encerrada no ERP.' :
                            'Acesso negado: cadastro de representante não localizado nas tabelas oficiais.';
      return { error: new Error(statusMessage) };
    }

    // Determinar Rota Base de Workspace (FASE CORPORATIVA & GESTOR DE MÍDIAS)
    let routeRedirect = '/dashboard'; // default
    if (role === 'GESTOR' || role === 'GESTOR_TELAS' || role === 'GESTOR_MIDIAS' || role === 'OPERACIONAL' || role === 'DESIGNER' || role === 'FUNCIONARIO') {
      routeRedirect = '/dashboard';
    } else if (userData.usuarioData?.is_owner || role === 'OWNER' || role === 'ADMIN') {
      routeRedirect = '/workspace/corporate';
    } else if (role === 'FINANCEIRO') {
      routeRedirect = '/workspace/financeiro';
    } else if (role === 'MARKETING') {
      routeRedirect = '/workspace/marketing';
    } else if (role === 'ANUNCIANTE') {
      routeRedirect = '/portal';
    } else if (role === 'GERENTE' || role === 'SUPERVISOR') {
      routeRedirect = '/workspace/corporate';
    } else if (role === 'REPRESENTANTE') {
      routeRedirect = '/representantes/dashboard';
    } else if (role === 'CLIENTE') {
      routeRedirect = '/portal';
    }

    // REGRA CRÍTICA DE SEGURANÇA (missão §7): senha inicial/provisória
    // obriga troca ANTES de qualquer acesso ao portal/workspace.
    if (userData.usuarioData?.must_change_password) {
      routeRedirect = '/auth/change-password';
    }

    // Sucesso Absoluto: todas as condições foram validadas no banco e no Supabase Auth
    await securityAuditService.logEvent('LOGIN_SUCCESS', {
      userEmail: email,
      userId: data.user.id,
      details: { role, status, workspace: routeRedirect }
    });

    return { error: null, status, role, routeRedirect };
  };

  const signUp = async (email: string, password: string, fullName: string, companyName: string) => {
    const redirectUrl = `${window.location.origin}/representantes/login`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          company_name: companyName,
        },
      },
    });
    return { error, data };
  };

  const signOut = async () => {
    if (user || session) {
      await securityAuditService.logEvent('LOGOUT', {
        userId: user?.id,
        userEmail: user?.email || undefined,
      });
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUsuario(null);
    setRepresentante(null);
    setSolicitacaoStatus('NOT_FOUND');
  };

  /** Recarga explícita dos dados corporativos (usada pós-troca obrigatória de senha) */
  const refreshUserData = async () => {
    if (!user?.id) return;
    await fetchUserData(user.id);
  };

  const perfilNome = usuario?.perfil?.nome || (usuario?.is_owner ? 'OWNER' : null);
  const empresaOperadoraId = usuario?.empresa_operadora_id || representante?.empresa_operadora_id || null;
  const isAuthenticated = !!user && !!session;

  // Alias legado — mapeamento explícito dos campos que os componentes do Dashboard esperam
  const profile: LegacyProfile | null = usuario
    ? {
        full_name: usuario.nome || null,
        company_name: usuario.empresa_operadora_id || null,
        email: user?.email || usuario.email || null,
      }
    : null;
  
  // REGRA ABSOLUTA DE ACESSO CORPORATIVO: Acesso liberado para OWNER/ADMIN soberanos ou contas com ciclo de vida APPROVED/ACTIVE e ativas
  const isApproved = isAuthenticated && (
    perfilNome === 'OWNER' || perfilNome === 'ADMIN' || 
    (usuario?.ativo === true && (solicitacaoStatus === 'APPROVED' || solicitacaoStatus === 'ACTIVE'))
  );

  // DETERMINA O WORKSPACE ATUAL
  let workspaceRoute = '/dashboard';
  if (perfilNome === 'GESTOR' || perfilNome === 'GESTOR_TELAS' || perfilNome === 'GESTOR_MIDIAS' || perfilNome === 'OPERACIONAL' || perfilNome === 'DESIGNER' || perfilNome === 'FUNCIONARIO') {
    workspaceRoute = '/dashboard';
  } else if (usuario?.is_owner || perfilNome === 'OWNER' || perfilNome === 'ADMIN') {
    workspaceRoute = '/workspace/corporate';
  } else if (perfilNome === 'FINANCEIRO') {
    workspaceRoute = '/workspace/financeiro';
  } else if (perfilNome === 'ANUNCIANTE') {
    workspaceRoute = '/portal';
  } else if (perfilNome === 'GERENTE' || perfilNome === 'SUPERVISOR') {
    workspaceRoute = '/workspace/corporate';
  } else if (perfilNome === 'REPRESENTANTE') {
    workspaceRoute = '/representantes/dashboard';
  } else if (perfilNome === 'CLIENTE') {
    workspaceRoute = '/portal';
  }

  return (
    <AuthContext.Provider value={{
      user,
      session,
      usuario,
      perfilNome,
      representante,
      empresaOperadoraId,
      solicitacaoStatus,
      loading,
      profile,
      signIn,
      signUp,
      signOut,
      refreshUserData,
      isAuthenticated,
      isApproved,
      isOwner: usuario?.is_owner || perfilNome === 'OWNER',
      workspaceRoute,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

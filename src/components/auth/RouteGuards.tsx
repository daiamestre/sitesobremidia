import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRbac, RoleName } from '@/hooks/useRbac';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { securityAuditService } from '@/services/securityAudit.service';

interface GuardProps {
  children: ReactNode;
}

interface RoleGuardProps extends GuardProps {
  roles: RoleName[];
}

const FullScreenSpinner = () => (
  <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-white">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
);

/**
 * Exige que o usuário esteja autenticado (Supabase Auth)
 */
export function RequireAuth({ children }: GuardProps) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenSpinner />;

  if (!isAuthenticated) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
}

/**
 * Exige que a solicitação de acesso do usuário esteja APPROVED e valida SESSÃO REAL DO SUPABASE (FASE 4)
 */
export function RequireApproval({ children }: GuardProps) {
  const { isAuthenticated, isApproved, loading, solicitacaoStatus, user, signOut, empresaOperadoraId, usuario } = useAuth();
  const { role } = useRbac();
  const [verifyingRealSession, setVerifyingRealSession] = useState(true);
  const [realSessionValid, setRealSessionValid] = useState(false);

  useEffect(() => {
    async function verifyWithSupabase() {
      if (loading) return;
      try {
        // Validação REAL com motor do Supabase Auth e não apenas estado local do React
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session || !data.session.user) {
          if (isAuthenticated) {
            await signOut();
          }
          setRealSessionValid(false);
        } else {
          setRealSessionValid(true);
        }
      } catch {
        setRealSessionValid(false);
      } finally {
        setVerifyingRealSession(false);
      }
    }
    verifyWithSupabase();
  }, [loading, isAuthenticated, user]);

  if (loading || verifyingRealSession) return <FullScreenSpinner />;

  // 1. Sem sessão Supabase Auth REAL -> Redireciona imediatamente ao login
  if (!isAuthenticated || !user || !realSessionValid) {
    securityAuditService.logEvent('ACCESS_DENIED', {
      userEmail: user?.email || undefined,
      details: { reason: 'UNAUTHENTICATED_ROUTE_ACCESS' }
    });
    return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // 2. Verificação de status APPROVED/ACTIVE na tabela do banco -> Redireciona ao login com mensagem
  if (!isApproved || (solicitacaoStatus !== 'APPROVED' && solicitacaoStatus !== 'ACTIVE')) {
    securityAuditService.logEvent('ACCESS_DENIED', {
      userEmail: user.email || undefined,
      userId: user.id,
      details: { reason: `ROUTE_BLOCKED_STATUS_${solicitacaoStatus}` }
    });
    return <Navigate to={`/auth?error=pending&redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // 2.1 REGRA CRÍTICA (missão §7): senha inicial/provisória — o usuário é
  // levado à troca obrigatória antes de qualquer área protegida.
  if (usuario?.must_change_password && location.pathname !== '/auth/change-password') {
    return <Navigate to="/auth/change-password" replace />;
  }

  // 2.3 NOVA REGRA: Isolamento por perfil de portal (missão P0)
  // Cada perfil só pode acessar seu próprio portal - bloqueio rigoroso
  const isAnunciante = role === 'ANUNCIANTE' || role === 'CLIENTE';
  const isRepresentante = role === 'REPRESENTANTE';
  const isGestor = role === 'GESTOR' || role === 'GERENTE' || role === 'FINANCEIRO' || role === 'SUPERVISOR';
  const isOwnerAdmin = role === 'OWNER' || role === 'ADMIN';

  // Anunciante NÃO pode acessar representante, workspace, dashboard
  if (isAnunciante) {
    // Bloqueia acesso ao portal do representante
    if (location.pathname.startsWith('/representantes')) {
      securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: user.email || undefined,
        userId: user.id,
        details: { reason: 'ANUNCIANTE_BLOCKED_REPRESENTANTE' }
      });
      return <Navigate to="/portal" replace />;
    }
    // Bloqueia acesso ao workspace/ERP (todas as subpaths)
    if (location.pathname.startsWith('/workspace')) {
      securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: user.email || undefined,
        userId: user.id,
        details: { reason: 'ANUNCIANTE_BLOCKED_WORKSPACE' }
      });
      return <Navigate to="/portal" replace />;
    }
    // Bloqueia acesso ao dashboard do Gestor de Mídias (rota exata e todas subpaths)
    if (location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/')) {
      securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: user.email || undefined,
        userId: user.id,
        details: { reason: 'ANUNCIANTE_BLOCKED_DASHBOARD' }
      });
      return <Navigate to="/portal" replace />;
    }
    // Bloqueia acesso ao financeiro standalone (todas as subpaths)
    if (location.pathname.startsWith('/financeiro')) {
      securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: user.email || undefined,
        userId: user.id,
        details: { reason: 'ANUNCIANTE_BLOCKED_FINANCE_STANDALONE' }
      });
      return <Navigate to="/portal" replace />;
    }
    // Bloqueia acesso a qualquer rota administrativa
    if (location.pathname.startsWith('/admin')) {
      securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: user.email || undefined,
        userId: user.id,
        details: { reason: 'ANUNCIANTE_BLOCKED_ADMIN' }
      });
      return <Navigate to="/portal" replace />;
    }
  }

  // Representante NÃO pode acessar portal do anunciante
  if (isRepresentante) {
    if (location.pathname === '/portal') {
      securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: user.email || undefined,
        userId: user.id,
        details: { reason: 'REPRESENTANTE_BLOCKED_PORTAL' }
      });
      return <Navigate to={`/representantes/dashboard`} replace />;
    }
    if (location.pathname.startsWith('/portal/')) {
      securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: user.email || undefined,
        userId: user.id,
        details: { reason: 'REPRESENTANTE_BLOCKED_PORTAL_SUBPATH' }
      });
      return <Navigate to={`/representantes/dashboard`} replace />;
    }
  }

  // Gestor de Mídias NÃO pode acessar portal do anunciante
  if (isGestor) {
    if (location.pathname === '/portal') {
      securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: user.email || undefined,
        userId: user.id,
        details: { reason: 'GESTOR_BLOCKED_PORTAL' }
      });
      return <Navigate to={`/dashboard`} replace />;
    }
    if (location.pathname.startsWith('/portal/')) {
      securityAuditService.logEvent('ACCESS_DENIED', {
        userEmail: user.email || undefined,
        userId: user.id,
        details: { reason: 'GESTOR_BLOCKED_PORTAL_SUBPATH' }
      });
      return <Navigate to={`/dashboard`} replace />;
    }
  }

  // Owner/Admin NÃO deve acessar portal do anunciante como se fosse anunciante
  if (isOwnerAdmin && location.pathname === '/portal') {
    securityAuditService.logEvent('ACCESS_DENIED', {
      userEmail: user.email || undefined,
      userId: user.id,
      details: { reason: 'OWNERADMIN_BLOCKED_PORTAL_ANUNCiante' }
    });
    return <Navigate to={`/workspace/corporate`} replace />;
  }

  // 3. Blindagem de Tenant: Garantir vinculação à empresa operadora
  if (!user?.user_metadata?.is_superadmin && role !== 'ADMIN' && role !== 'OWNER' && !empresaOperadoraId) {
    securityAuditService.logEvent('ACCESS_DENIED', {
      userEmail: user.email || undefined,
      userId: user.id,
      details: { reason: 'ROUTE_BLOCKED_MISSING_TENANT' }
    });
    return <Navigate to={`/auth?error=tenant&redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // 4. Blindagem RBAC: Perfis Constitucionais e Operacionais
  const allowedRoles: RoleName[] = [
    'OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'REPRESENTANTE', 'SUPERVISOR', 
    'FINANCEIRO', 'FUNCIONARIO', 'OPERACIONAL', 'DESIGNER', 'ANUNCIANTE', 'CLIENTE', 'PARCEIRO'
  ];
  if (!role || !allowedRoles.includes(role)) {
    securityAuditService.logEvent('ACCESS_DENIED', {
      userEmail: user.email || undefined,
      userId: user.id,
      details: { reason: 'ROUTE_BLOCKED_INVALID_ROLE', role: role || 'NONE' }
    });
    return <Navigate to={`/auth?error=role&redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
}

/**
 * Exige papel RBAC específico (ex: ADMIN, REPRESENTANTE, etc.)
 */
export function RequireRole({ children, roles }: RoleGuardProps) {
  const { loading } = useAuth();
  const { hasRole } = useRbac();

  if (loading) return <FullScreenSpinner />;

  if (!hasRole(...roles)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * Exige que o usuário possua tenant associado
 */
export function RequireTenant({ children }: GuardProps) {
  const { empresaOperadoraId, loading } = useAuth();

  if (loading) return <FullScreenSpinner />;

  if (!empresaOperadoraId) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

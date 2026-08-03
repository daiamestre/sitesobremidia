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
  const { isAuthenticated, isApproved, loading, solicitacaoStatus, user, signOut, empresaOperadoraId } = useAuth();
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
    return <Navigate to="/representantes/login" replace />;
  }

  // 2. Verificação de status APPROVED na tabela do banco -> Redireciona ao login com mensagem
  if (!isApproved || solicitacaoStatus !== 'APPROVED') {
    securityAuditService.logEvent('ACCESS_DENIED', {
      userEmail: user.email || undefined,
      userId: user.id,
      details: { reason: `ROUTE_BLOCKED_STATUS_${solicitacaoStatus}` }
    });
    return <Navigate to="/representantes/login?error=pending" replace />;
  }

  // 3. Blindagem de Tenant: Garantir vinculação à empresa operadora
  if (!user?.user_metadata?.is_superadmin && role !== 'ADMIN' && !empresaOperadoraId) {
    securityAuditService.logEvent('ACCESS_DENIED', {
      userEmail: user.email || undefined,
      userId: user.id,
      details: { reason: 'ROUTE_BLOCKED_MISSING_TENANT' }
    });
    return <Navigate to="/representantes/login?error=tenant" replace />;
  }

  // 4. Blindagem RBAC: Somente Administrador, Supervisor, Representante ou Financeiro
  const allowedRoles: RoleName[] = ['ADMIN', 'REPRESENTANTE', 'SUPERVISOR', 'FINANCEIRO'];
  if (!role || !allowedRoles.includes(role)) {
    securityAuditService.logEvent('ACCESS_DENIED', {
      userEmail: user.email || undefined,
      userId: user.id,
      details: { reason: 'ROUTE_BLOCKED_INVALID_ROLE', role: role || 'NONE' }
    });
    return <Navigate to="/representantes/login?error=role" replace />;
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

import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { TEMPO_MAX_VERIFICACAO_MS } from '@/lib/tempoLimites';
import { useRbac, RoleName } from '@/hooks/useRbac';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { securityAuditService } from '@/services/securityAudit.service';
import { areaDaRota, podeAbrirRota } from '@/lib/portalAccess';

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
  const { isAuthenticated, isApproved, loading, solicitacaoStatus, user, signOut, empresaOperadoraId, usuario, perfilNome, workspaceRoute } = useAuth();
  const { role } = useRbac();
  const location = useLocation();
  const isOwnerAdmin = role === 'OWNER' || role === 'ADMIN';
  const [verifyingRealSession, setVerifyingRealSession] = useState(true);
  const [realSessionValid, setRealSessionValid] = useState(false);

  useEffect(() => {
    async function verifyWithSupabase() {
      if (loading) return;
      try {
        // Validação REAL com motor do Supabase Auth e não apenas estado local do React.
        // Com tempo máximo: rede travada deixava a tela protegida no spinner para sempre. Se não confirmar no prazo,
        // conta como NÃO confirmada (fail-closed -> login), nunca libera acesso sem sessão comprovada.
        const { data, error } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new Error('verificacao_sessao_tempo_esgotado')), TEMPO_MAX_VERIFICACAO_MS)),
        ]);
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

  // 2.3 Isolamento por área (F-204): cada perfil só abre a SUA área — Anunciante /portal, Representante /representantes,
  // Gestor (e equipe) /dashboard, Financeiro/Gerente/Supervisor /workspace. Fora dela vai direto para a própria área.
  // OWNER/ADMIN abrem todas. Regra única em src/lib/portalAccess.ts (a mesma do login).
  if (perfilNome && !podeAbrirRota(location.pathname, perfilNome, !!usuario?.is_owner)) {
    const area = areaDaRota(location.pathname);
    securityAuditService.logEvent('ACCESS_DENIED', {
      userEmail: user.email || undefined,
      userId: user.id,
      details: { reason: `${String(perfilNome).toUpperCase()}_BLOCKED_${area}`, path: location.pathname }
    });
    return <Navigate to={workspaceRoute || '/dashboard'} replace />;
  }

  // Anunciante NÃO abre nenhuma rota administrativa
  if ((role === 'ANUNCIANTE' || role === 'CLIENTE') && location.pathname.startsWith('/admin')) {
    securityAuditService.logEvent('ACCESS_DENIED', {
      userEmail: user.email || undefined,
      userId: user.id,
      details: { reason: 'ANUNCIANTE_BLOCKED_ADMIN' }
    });
    return <Navigate to="/portal" replace />;
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

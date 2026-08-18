import React, { createContext, useContext, ReactNode, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Session } from '@supabase/supabase-js';
import { useAuth, RepresentanteRecord } from '@/contexts/AuthContext';
import { useRbac, RoleName } from '@/hooks/useRbac';
import { useToast } from '@/hooks/use-toast';
import { securityAuditService } from '@/services/securityAudit.service';

type CrmRepresentante = RepresentanteRecord & { nome?: string | null };

export interface CrmSessionData {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isApproved: boolean;
  empresaOperadoraId: string | null;
  representante: CrmRepresentante | null;
  userRole: RoleName | null;
  userName: string;
  userEmail: string;
  userInitials: string;
  userCargo: string;
  isLoggingOut: boolean;
  handleCrmLogout: () => Promise<void>;
}

const CrmSessionContext = createContext<CrmSessionData | undefined>(undefined);

export function CrmSessionProvider({ children }: { children: ReactNode }) {
  const { user, session, isAuthenticated, isApproved, empresaOperadoraId, representante, signOut } = useAuth();
  const { role } = useRbac();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Derivação limpa de perfil real sem hardcode
  const userEmail = user?.email || 'usuario@sobremidia.com.br';
  
  const userName = useMemo(() => {
    if (user?.user_metadata?.name) return user.user_metadata.name;
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
    if (representante?.nome) return representante.nome;
    if (userEmail && userEmail !== 'usuario@sobremidia.com.br') {
      return userEmail.split('@')[0];
    }
    return 'Representante Comercial';
  }, [user, representante, userEmail]);

  const userInitials = useMemo(() => {
    if (!userName || userName === 'Representante Comercial') return 'RC';
    const parts = userName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return userName.substring(0, 2).toUpperCase();
  }, [userName]);

  const userCargo = useMemo(() => {
    if (role === 'OWNER') return 'Proprietário (Soberano)';
    if (role === 'ADMIN') return 'Administrador Geral';
    if (role === 'SUPERVISOR' || role === 'GESTOR' || role === 'GERENTE') return 'Supervisor Comercial / Gestor';
    if (role === 'FINANCEIRO') return 'Gestão Financeira';
    if (role === 'ANUNCIANTE' || role === 'CLIENTE') return 'Cliente Anunciante';
    if (role === 'PARCEIRO') return 'Parceiro de Rede';
    if (role === 'FUNCIONARIO' || role === 'OPERACIONAL' || role === 'DESIGNER') return 'Operações & Mídia';
    return 'Representante Comercial';
  }, [role]);

  // Rotina de Logout Blindada (Fase 10.2.1-C)
  const handleCrmLogout = async () => {
    setIsLoggingOut(true);
    try {
      securityAuditService.logEvent('LOGOUT_SUCCESS', {
        userEmail,
        details: { module: 'CRM_REPRESENTANTES', reason: 'USER_INITIATED_LOGOUT' }
      });

      // 1. Revogar sessão oficial no Supabase
      await signOut();

      // 2. Limpar Caches locais e Armazenamento no navegador para evitar contaminação
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.error('Erro ao limpar storage locais:', e);
      }

      toast({
        title: 'Sessão Encerrada com Segurança',
        description: 'Você desconectou do CRM e sua sessão no banco foi revogada.',
      });

      // 3. Redirecionar estritamente à tela de login do módulo
      navigate('/representantes/login', { replace: true });
    } catch (err) {
      console.error('Erro durante o encerramento da sessão do CRM:', err);
      navigate('/representantes/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const value = useMemo<CrmSessionData>(() => ({
    user,
    session,
    isAuthenticated,
    isApproved,
    empresaOperadoraId: empresaOperadoraId || null,
    representante: representante || null,
    userRole: role || null,
    userName,
    userEmail,
    userInitials,
    userCargo,
    isLoggingOut,
    handleCrmLogout
  }), [user, session, isAuthenticated, isApproved, empresaOperadoraId, representante, role, userName, userEmail, userInitials, userCargo, isLoggingOut]);

  return (
    <CrmSessionContext.Provider value={value}>
      {children}
    </CrmSessionContext.Provider>
  );
}

export function useCrmSession(): CrmSessionData {
  const context = useContext(CrmSessionContext);
  if (!context) {
    throw new Error('useCrmSession deve ser utilizado dentro de um <CrmSessionProvider>.');
  }
  return context;
}

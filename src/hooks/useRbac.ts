import { useAuth } from '@/contexts/AuthContext';

export type RoleName = 'ADMIN' | 'GERENTE' | 'FINANCEIRO' | 'DESIGNER' | 'REPRESENTANTE' | 'OPERACIONAL' | 'CLIENTE';

export function useRbac() {
  const { usuario, perfilNome, representante, empresaOperadoraId, isAuthenticated } = useAuth();

  const role = (perfilNome || 'REPRESENTANTE') as RoleName;

  const isAdmin = role === 'ADMIN';
  const isGerente = role === 'GERENTE';
  const isFinanceiro = role === 'FINANCEIRO';
  const isDesigner = role === 'DESIGNER';
  const isRepresentante = role === 'REPRESENTANTE';
  const isOperacional = role === 'OPERACIONAL';
  const isCliente = role === 'CLIENTE';

  const hasRole = (...allowedRoles: RoleName[]): boolean => {
    if (!isAuthenticated) return false;
    if (isAdmin) return true; // Admin bypass
    return allowedRoles.includes(role);
  };

  const can = (action: string): boolean => {
    if (!isAuthenticated) return false;
    if (isAdmin) return true;

    // Definição de Permissões Básicas por Perfil
    switch (role) {
      case 'GERENTE':
        return ['crm.read', 'crm.write', 'contracts.read', 'contracts.write', 'financial.read'].includes(action);
      case 'REPRESENTANTE':
        return ['crm.read', 'crm.create', 'proposals.create', 'contracts.read'].includes(action);
      case 'FINANCEIRO':
        return ['financial.read', 'financial.write', 'contracts.read'].includes(action);
      case 'DESIGNER':
        return ['media.manage', 'campaigns.manage', 'contracts.read'].includes(action);
      case 'CLIENTE':
        return ['contracts.read_own', 'campaigns.read_own'].includes(action);
      default:
        return false;
    }
  };

  return {
    role,
    usuario,
    representante,
    empresaOperadoraId,
    isAdmin,
    isGerente,
    isFinanceiro,
    isDesigner,
    isRepresentante,
    isOperacional,
    isCliente,
    hasRole,
    can,
  };
}

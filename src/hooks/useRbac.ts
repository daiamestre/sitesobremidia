import { useAuth } from '@/contexts/AuthContext';
import { PERMISSIONS, PermissionValue } from '@/constants/permissions';

export type RoleName = 
  | 'OWNER' | 'ADMIN' | 'GESTOR' | 'FUNCIONARIO' | 'REPRESENTANTE' | 'ANUNCIANTE' | 'PARCEIRO'
  | 'GERENTE' | 'FINANCEIRO' | 'DESIGNER' | 'OPERACIONAL' | 'CLIENTE' | 'SUPERVISOR';

export function useRbac() {
  const { usuario, perfilNome, representante, empresaOperadoraId, isAuthenticated } = useAuth();

  const role = ((perfilNome || 'REPRESENTANTE') as string).toUpperCase() as RoleName;

  // 1. Perfis Constitucionais Soberanos e Corporativos (Aditivo 01)
  const isOwner = role === 'OWNER';
  const isAdmin = role === 'ADMIN';
  const isGestor = role === 'GESTOR' || role === 'GERENTE' || role === 'FINANCEIRO' || role === 'SUPERVISOR';
  const isFuncionario = role === 'FUNCIONARIO' || role === 'OPERACIONAL' || role === 'DESIGNER';
  const isRepresentante = role === 'REPRESENTANTE';
  const isAnunciante = role === 'ANUNCIANTE' || role === 'CLIENTE';
  const isParceiro = role === 'PARCEIRO';

  // 2. Mantido suporte legado inalterado para evitar quebras
  const isGerente = role === 'GERENTE';
  const isFinanceiro = role === 'FINANCEIRO';
  const isDesigner = role === 'DESIGNER';
  const isOperacional = role === 'OPERACIONAL';
  const isCliente = role === 'CLIENTE';

  const hasRole = (...allowedRoles: RoleName[]): boolean => {
    if (!isAuthenticated) return false;
    if (isOwner || isAdmin) return true; // OWNER e ADMIN possuem privilégios de bypass corporativo
    return allowedRoles.includes(role);
  };

  const can = (action: PermissionValue | string): boolean => {
    if (!isAuthenticated) return false;
    if (isOwner || isAdmin) return true;

    // Matriz de Permissões Consolidada consumindo do Permission Registry Enterprise (Sprint 1.5)
    switch (role) {
      case 'GESTOR':
      case 'GERENTE':
      case 'SUPERVISOR':
        return [
          PERMISSIONS.CRM_READ, 
          PERMISSIONS.CRM_WRITE, 
          PERMISSIONS.CONTRACT_READ, 
          PERMISSIONS.CONTRACT_WRITE, 
          PERMISSIONS.FINANCIAL_READ, 
          PERMISSIONS.USERS_APPROVE, 
          PERMISSIONS.TEAM_MANAGE
        ].includes(action as PermissionValue);
      case 'FINANCEIRO':
        return [
          PERMISSIONS.FINANCIAL_READ, 
          PERMISSIONS.FINANCIAL_WRITE, 
          PERMISSIONS.CONTRACT_READ, 
          PERMISSIONS.REPORTS_VIEW
        ].includes(action as PermissionValue);
      case 'FUNCIONARIO':
      case 'OPERACIONAL':
      case 'DESIGNER':
        return [
          PERMISSIONS.MEDIA_MANAGE, 
          PERMISSIONS.MEDIA_UPLOAD, 
          PERMISSIONS.CAMPAIGNS_MANAGE, 
          PERMISSIONS.CONTRACT_READ, 
          PERMISSIONS.NETWORK_VIEW
        ].includes(action as PermissionValue);
      case 'REPRESENTANTE':
        return [
          PERMISSIONS.CRM_READ, 
          PERMISSIONS.CRM_CREATE, 
          PERMISSIONS.PROPOSAL_CREATE, 
          PERMISSIONS.CONTRACT_READ
        ].includes(action as PermissionValue);
      case 'ANUNCIANTE':
      case 'CLIENTE':
        return [
          PERMISSIONS.CONTRACT_READ_OWN, 
          PERMISSIONS.CAMPAIGNS_READ_OWN, 
          PERMISSIONS.REPORTS_CLIENT_VIEW
        ].includes(action as PermissionValue);
      case 'PARCEIRO':
        return [
          PERMISSIONS.PLAYER_READ_OWN, 
          PERMISSIONS.FINANCIAL_REPASSE_VIEW, 
          PERMISSIONS.NETWORK_PARTNER_STATUS
        ].includes(action as PermissionValue);
      default:
        return false;
    }
  };

  return {
    role,
    usuario,
    representante,
    empresaOperadoraId,
    isOwner,
    isAdmin,
    isGestor,
    isFuncionario,
    isRepresentante,
    isAnunciante,
    isParceiro,
    // Aliases legados
    isGerente,
    isFinanceiro,
    isDesigner,
    isOperacional,
    isCliente,
    hasRole,
    can,
  };
}


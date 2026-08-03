import { CrmRole, CrmPermission } from '../types/rbac.types';

export const ROLE_PERMISSIONS: Record<CrmRole, CrmPermission[]> = {
  ADMIN: [
    'contract:view_all',
    'contract:view_own',
    'contract:create',
    'contract:edit',
    'contract:delete',
    'contract:confirm_payment',
    'contract:cancel',
    'contract:reopen',
    'contract:upload_art',
    'contract:approve_art',
    'contract:request_art_changes',
    'contract:publish',
    'users:manage',
    'permissions:manage',
    'reports:view',
    'financeiro:view',
    'financeiro:edit',
    'settings:manage',
  ],
  GERENTE: [
    'contract:view_all',
    'contract:view_own',
    'contract:create',
    'contract:edit',
    'contract:confirm_payment',
    'contract:cancel',
    'contract:reopen',
    'contract:upload_art',
    'contract:approve_art',
    'contract:request_art_changes',
    'contract:publish',
    'reports:view',
    'financeiro:view',
    'financeiro:edit',
  ],
  FINANCEIRO: [
    'contract:view_all',
    'contract:confirm_payment',
    'financeiro:view',
    'financeiro:edit',
    'reports:view',
  ],
  DESIGNER: [
    'contract:view_all',
    'contract:upload_art',
    'contract:request_art_changes',
  ],
  REPRESENTANTE: [
    'contract:view_own',
    'contract:create',
    'contract:edit',
    'reports:view',
  ],
  CLIENTE: [
    'contract:view_own',
    'contract:approve_art',
    'contract:request_art_changes',
  ],
};

export class CrmRbac {
  /**
   * Verifica se uma Role específica possui determinada permissão
   */
  static hasPermission(role: CrmRole, permission: CrmPermission): boolean {
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission);
  }

  /**
   * Retorna todas as permissões concedidas a uma Role
   */
  static getPermissions(role: CrmRole): CrmPermission[] {
    return ROLE_PERMISSIONS[role] || [];
  }
}

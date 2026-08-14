import { supabase } from '@/lib/supabase';
import { UserIdentity, IdentityScope } from './types';

export class IdentityService {
  private static instance: IdentityService;
  private currentUser: UserIdentity | null = null;

  private constructor() {}

  public static getInstance(): IdentityService {
    if (!IdentityService.instance) {
      IdentityService.instance = new IdentityService();
    }
    return IdentityService.instance;
  }

  public async loadIdentity(userId: string): Promise<UserIdentity | null> {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select(`
          id, email, is_owner, owner_locked, ativo, status,
          role:roles(id, name),
          organization:organizations(id, name),
          department:departments(id, name)
        `)
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.error('Identity load error:', error);
        return null;
      }

      // Fetch permissions if role exists
      let permissions: string[] = [];
      if (data.role?.id) {
        const { data: permData } = await supabase
          .from('role_permissions')
          .select('permission:permissions(code)')
          .eq('role_id', data.role.id);
          
        if (permData) {
          permissions = permData.map((p: any) => p.permission.code);
        }
      }

      // Se for owner, ganha permissão master implicitamente ou assume tudo
      if (data.is_owner) {
        permissions.push('*');
      }

      this.currentUser = {
        id: data.id,
        email: data.email,
        isOwner: data.is_owner,
        ownerLocked: data.owner_locked,
        active: data.ativo && data.status === 'ACTIVE',
        role: data.role ? { id: data.role.id, name: data.role.name } : null,
        organization: data.organization ? { id: data.organization.id, name: data.organization.name } : null,
        department: data.department ? { id: data.department.id, name: data.department.name } : null,
        permissions
      };

      return this.currentUser;
    } catch (err) {
      console.error('Failed to load identity', err);
      return null;
    }
  }

  public getIdentity(): UserIdentity | null {
    return this.currentUser;
  }

  public getScope(): IdentityScope {
    if (!this.currentUser) return { level: 'GUEST' };

    let level: IdentityScope['level'] = 'USER';
    
    if (this.currentUser.isOwner) {
      level = 'SYSTEM_OWNER';
    } else if (this.currentUser.role?.name === 'ADMIN') {
      level = 'ADMIN';
    } else if (this.currentUser.role?.name?.includes('MANAGER')) {
      level = 'MANAGER';
    }

    return {
      level,
      organizationId: this.currentUser.organization?.id,
      departmentId: this.currentUser.department?.id
    };
  }

  public can(permission: string): boolean {
    if (!this.currentUser || !this.currentUser.active) return false;
    if (this.currentUser.isOwner) return true;
    if (this.currentUser.permissions.includes('*')) return true;
    return this.currentUser.permissions.includes(permission);
  }

  public clear() {
    this.currentUser = null;
  }
}

export const identityService = IdentityService.getInstance();

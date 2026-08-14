export type IdentityLevel = 'SYSTEM_OWNER' | 'ADMIN' | 'MANAGER' | 'USER' | 'GUEST';

export interface IdentityScope {
  level: IdentityLevel;
  organizationId?: string;
  departmentId?: string;
}

export interface UserIdentity {
  id: string;
  email: string;
  isOwner: boolean;
  ownerLocked: boolean;
  active: boolean;
  role: {
    id: string;
    name: string;
  } | null;
  organization: {
    id: string;
    name: string;
  } | null;
  department: {
    id: string;
    name: string;
  } | null;
  permissions: string[];
}

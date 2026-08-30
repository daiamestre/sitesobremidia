/**
 * src/lib/safeAuthAdmin.ts
 * 
 * Barreira arquitetural permanente contra mutações indevidas na conta oficial do Owner.
 * Intercepta chamadas administrativas do GoTrue / Supabase Auth Admin e bloqueia operações
 * de alteração de senha, deleção ou substituição sobre a conta real do Owner.
 */

export const PROTECTED_OWNER_ERROR = 'PROTECTED_OWNER_ACCOUNT_MUTATION_FORBIDDEN';

export const PROTECTED_OWNER_CONFIG = {
  OWNER_USER_ID: '4164f657-8896-4e32-9bd4-2c253a1245fe',
  OWNER_EMAILS: ['jairaniran2@gmail.com'],
};

export interface ProtectedOwnerTarget {
  id?: string;
  email?: string;
}

export function isProtectedOwnerAccount(target: string | ProtectedOwnerTarget | null | undefined): boolean {
  if (!target) return false;
  const targetId = typeof target === 'string' ? target : target.id;
  const targetEmail = typeof target === 'object' ? target.email?.toLowerCase().trim() : undefined;

  if (targetId && targetId.toLowerCase() === PROTECTED_OWNER_CONFIG.OWNER_USER_ID.toLowerCase()) {
    return true;
  }
  if (targetEmail && PROTECTED_OWNER_CONFIG.OWNER_EMAILS.includes(targetEmail)) {
    return true;
  }
  return false;
}

export function assertNotProtectedOwner(
  target: string | ProtectedOwnerTarget | null | undefined,
  operation: string
): void {
  if (isProtectedOwnerAccount(target)) {
    throw new Error(
      `[${PROTECTED_OWNER_ERROR}] Operação administrativa de '${operation}' bloqueada na conta protegida do Owner. ` +
      `É estritamente proibido mutar ou deletar a conta oficial do Owner em testes ou automações. ` +
      `Utilize uma conta de teste dedicada (ex: e2e-owner).`
    );
  }
}

/**
 * Cria um wrapper seguro sobre o cliente administrativo do Supabase (Service Role),
 * interceptando chamadas destrutivas antes da execução no GoTrue/Auth.
 */
export function createSafeAuthAdmin(supabaseAdminClient: any): any {
  const safeAdminAuth = {
    ...supabaseAdminClient.auth?.admin,

    updateUserById: async (userId: string, attributes: any) => {
      assertNotProtectedOwner(userId, 'updateUserById');
      if (attributes?.email) {
        assertNotProtectedOwner({ email: attributes.email }, 'updateUserById (email change)');
      }
      return supabaseAdminClient.auth.admin.updateUserById(userId, attributes);
    },

    deleteUser: async (userId: string, shouldSoftDelete?: boolean) => {
      assertNotProtectedOwner(userId, 'deleteUser');
      return supabaseAdminClient.auth.admin.deleteUser(userId, shouldSoftDelete);
    },

    getUserById: async (userId: string) => {
      return supabaseAdminClient.auth.admin.getUserById(userId);
    },

    listUsers: async (params?: any) => {
      return supabaseAdminClient.auth.admin.listUsers(params);
    },

    createUser: async (attributes: any) => {
      if (attributes?.email && isProtectedOwnerAccount({ email: attributes.email })) {
        throw new Error(`[${PROTECTED_OWNER_ERROR}] Proibido recriar a conta protegida do Owner via createUser.`);
      }
      return supabaseAdminClient.auth.admin.createUser(attributes);
    },

    generateLink: async (params: any) => {
      return supabaseAdminClient.auth.admin.generateLink(params);
    },
  };

  const safeAuth = new Proxy(supabaseAdminClient.auth || {}, {
    get(target, prop, receiver) {
      if (prop === 'admin') {
        return safeAdminAuth;
      }
      return Reflect.get(target, prop, receiver);
    }
  });

  return new Proxy(supabaseAdminClient, {
    get(target, prop, receiver) {
      if (prop === 'auth') {
        return safeAuth;
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

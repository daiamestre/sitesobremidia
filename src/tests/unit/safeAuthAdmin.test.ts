import { describe, it, expect, vi } from 'vitest';
import {
  createSafeAuthAdmin,
  isProtectedOwnerAccount,
  assertNotProtectedOwner,
  PROTECTED_OWNER_ERROR,
  PROTECTED_OWNER_CONFIG,
} from '../../lib/safeAuthAdmin';

describe('BLINDAGEM P0 — safeAuthAdmin (Proteção contra mutações na conta Owner)', () => {
  const mockUnderlyingAdmin = {
    auth: {
      admin: {
        updateUserById: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
        deleteUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
        getUserById: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
        createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
        listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
        generateLink: vi.fn().mockResolvedValue({ data: { properties: {} }, error: null }),
      },
    },
  };

  const safeAdmin = createSafeAuthAdmin(mockUnderlyingAdmin);

  it('Identifica corretamente o ID e o e-mail oficial do Owner como protegidos', () => {
    expect(isProtectedOwnerAccount(PROTECTED_OWNER_CONFIG.OWNER_USER_ID)).toBe(true);
    expect(isProtectedOwnerAccount({ id: PROTECTED_OWNER_CONFIG.OWNER_USER_ID })).toBe(true);
    expect(isProtectedOwnerAccount({ email: 'jairaniran2@gmail.com' })).toBe(true);
    expect(isProtectedOwnerAccount({ email: 'JAIRANIRAN2@GMAIL.COM ' })).toBe(true);
  });

  it('Identifica usuários de teste E2E como não protegidos (permitidos)', () => {
    expect(isProtectedOwnerAccount('f0f52704-231a-4a55-b092-088e9e5a8704')).toBe(false);
    expect(isProtectedOwnerAccount({ email: 'e2e-owner@sobremidia-e2e.local' })).toBe(false);
    expect(isProtectedOwnerAccount({ email: 'test-user-99@teste.com' })).toBe(false);
  });

  it('TESTE ADVERSARIAL 1: updateUserById(OWNER_ID) é bloqueado com PROTECTED_OWNER_ERROR', async () => {
    await expect(
      safeAdmin.auth.admin.updateUserById(PROTECTED_OWNER_CONFIG.OWNER_USER_ID, { password: 'HackedPassword123!' })
    ).rejects.toThrow(PROTECTED_OWNER_ERROR);

    // Garante que o underlying admin JAMAIS foi chamado
    expect(mockUnderlyingAdmin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('TESTE ADVERSARIAL 2: deleteUser(OWNER_ID) é bloqueado com PROTECTED_OWNER_ERROR', async () => {
    await expect(
      safeAdmin.auth.admin.deleteUser(PROTECTED_OWNER_CONFIG.OWNER_USER_ID)
    ).rejects.toThrow(PROTECTED_OWNER_ERROR);

    expect(mockUnderlyingAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('TESTE ADVERSARIAL 3: createUser com email do Owner é bloqueado', async () => {
    await expect(
      safeAdmin.auth.admin.createUser({ email: 'jairaniran2@gmail.com', password: 'AnyPassword' })
    ).rejects.toThrow(PROTECTED_OWNER_ERROR);

    expect(mockUnderlyingAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('TESTE ADVERSARIAL 4: updateUserById tentando trocar email para o do Owner é bloqueado', async () => {
    await expect(
      safeAdmin.auth.admin.updateUserById('another-random-user-id', { email: 'jairaniran2@gmail.com' })
    ).rejects.toThrow(PROTECTED_OWNER_ERROR);

    expect(mockUnderlyingAdmin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('Permite operações legítimas sobre contas de teste E2E', async () => {
    const testUserId = '873c71b8-7456-4b4b-a0b0-f4dae8f3eb99';
    const res = await safeAdmin.auth.admin.updateUserById(testUserId, { email_confirm: true });
    expect(res.data.user.id).toBe('test-user-id');
    expect(mockUnderlyingAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(testUserId, { email_confirm: true });
  });

  it('Permite operações de leitura (getUserById, listUsers, generateLink) sem mutação', async () => {
    await safeAdmin.auth.admin.getUserById(PROTECTED_OWNER_CONFIG.OWNER_USER_ID);
    expect(mockUnderlyingAdmin.auth.admin.getUserById).toHaveBeenCalledWith(PROTECTED_OWNER_CONFIG.OWNER_USER_ID);

    await safeAdmin.auth.admin.listUsers();
    expect(mockUnderlyingAdmin.auth.admin.listUsers).toHaveBeenCalled();
  });
});

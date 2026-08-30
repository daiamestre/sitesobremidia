import { describe, it, expect, vi } from 'vitest';
import {
  isProtectedOwnerAccount,
  assertNotProtectedOwner,
  createSafeAuthAdmin,
  PROTECTED_OWNER_CONFIG,
  PROTECTED_OWNER_ERROR
} from '../../lib/safeAuthAdmin';

describe('REGRESSÃO P0-A — Suíte de Preservação e Proteção da Conta Owner', () => {
  it('TESTE A: Configuração de identidade do Owner permanece imutável e exata', () => {
    expect(PROTECTED_OWNER_CONFIG.OWNER_USER_ID).toBe('4164f657-8896-4e32-9bd4-2c253a1245fe');
    expect(PROTECTED_OWNER_CONFIG.OWNER_EMAILS).toContain('jairaniran2@gmail.com');
  });

  it('TESTE B: isProtectedOwnerAccount reconhece qualquer variação de maiúsculas/espaços do email do Owner', () => {
    expect(isProtectedOwnerAccount('4164f657-8896-4e32-9bd4-2c253a1245fe')).toBe(true);
    expect(isProtectedOwnerAccount({ email: 'jairaniran2@gmail.com' })).toBe(true);
    expect(isProtectedOwnerAccount({ email: ' JAIRANIRAN2@GMAIL.COM ' })).toBe(true);
    expect(isProtectedOwnerAccount({ id: '4164f657-8896-4e32-9bd4-2c253a1245fe' })).toBe(true);
  });

  it('TESTE C: assertNotProtectedOwner lança exceção imediata ao tentar mutação no Owner', () => {
    expect(() => assertNotProtectedOwner(PROTECTED_OWNER_CONFIG.OWNER_USER_ID, 'updateUserById'))
      .toThrow(PROTECTED_OWNER_ERROR);
    
    expect(() => assertNotProtectedOwner({ email: 'jairaniran2@gmail.com' }, 'deleteUser'))
      .toThrow(PROTECTED_OWNER_ERROR);
  });

  it('TESTE D: createSafeAuthAdmin blinda o SDK de administração contra mutações de testes', async () => {
    const rawAdminMock = {
      auth: {
        admin: {
          updateUserById: vi.fn(),
          deleteUser: vi.fn(),
          createUser: vi.fn(),
          getUserById: vi.fn().mockResolvedValue({ data: { user: { id: PROTECTED_OWNER_CONFIG.OWNER_USER_ID } } }),
        }
      }
    };

    const safeAdmin = createSafeAuthAdmin(rawAdminMock);

    // Tentativa de update de senha
    await expect(safeAdmin.auth.admin.updateUserById(PROTECTED_OWNER_CONFIG.OWNER_USER_ID, { password: 'bad' }))
      .rejects.toThrow(PROTECTED_OWNER_ERROR);

    // Tentativa de delete
    await expect(safeAdmin.auth.admin.deleteUser(PROTECTED_OWNER_CONFIG.OWNER_USER_ID))
      .rejects.toThrow(PROTECTED_OWNER_ERROR);

    // Leitura é permitida
    const read = await safeAdmin.auth.admin.getUserById(PROTECTED_OWNER_CONFIG.OWNER_USER_ID);
    expect(read.data.user.id).toBe(PROTECTED_OWNER_CONFIG.OWNER_USER_ID);
    expect(rawAdminMock.auth.admin.getUserById).toHaveBeenCalledWith(PROTECTED_OWNER_CONFIG.OWNER_USER_ID);
  });
});

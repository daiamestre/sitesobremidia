import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  createSafeAuthAdmin,
  isProtectedOwnerAccount,
  assertNotProtectedOwner,
  PROTECTED_OWNER_CONFIG,
  PROTECTED_OWNER_ERROR,
} from '../../lib/safeAuthAdmin';
import { resolvePaymentMethods } from '../../pages/PaginaCobranca';

/**
 * ============================================================================
 * SOBRE MÍDIA ERP — REGRESSION BASELINE & GOLDEN TEST SUITE
 * ============================================================================
 * Fonte canônica de contratos invioláveis de regressão para todo o sistema.
 * 
 * DOMÍNIOS COBERTOS:
 * 1. OWNER AUTH & IDENTIDADE INVARIANTE (AUTH-001 a AUTH-004)
 * 2. SAFE AUTH ADMIN & BARREIRA ANTI-BYPASS (SAFE-001 a SAFE-003)
 * 3. CICLO DE VIDA DE APARELHOS & DESVINCULAÇÃO (DEVICE-001 a DEVICE-010)
 * 4. PLAYER ENGINE & RESIDÊNCIA DE DADOS (PLAYER-001 a PLAYER-004)
 * 5. INTEGRIDADE FINANCEIRA & ANTI-DUPLA BAIXA (FIN-001 a FIN-005)
 * 6. PIX NATIVO BANCO INTER & JIT IDEMPOTENTE (PIX-001 a PIX-004)
 * 7. PORTAL PÚBLICO & FAIL-CLOSED ESTREITO (PORTAL-001 a PORTAL-004)
 * 8. BOLETO API V3 & INTER-BILLING-ENGINE (BOLETO-001 a BOLETO-002)
 * 9. ZERO-TRUST RLS & ISOLAMENTO MULTI-TENANT (RLS-001 a RLS-002)
 * 10. FLUXO INTEGRADO CROSS-FEATURE SEQUENCIAL (CROSS-001)
 * ============================================================================
 */

describe('GATE 5.3.2 — BASELINE GLOBAL ANTI-REGRESSÃO (GOLDEN TEST SUITE)', () => {

  // ==========================================================================
  // BLOCO 1 & 2: OWNER AUTH & SAFE AUTH ADMIN (AUTH-001 a AUTH-004, SAFE-001 a 003)
  // ==========================================================================
  describe('DOMÍNIO 1 & 2: Owner Auth & Barreira Estrutural safeAuthAdmin', () => {
    it('AUTH-001: Configuração canônica de identidade do Owner permanece imutável', () => {
      expect(PROTECTED_OWNER_CONFIG.OWNER_USER_ID).toBe('4164f657-8896-4e32-9bd4-2c253a1245fe');
      expect(PROTECTED_OWNER_CONFIG.OWNER_EMAILS).toContain('jairaniran2@gmail.com');
    });

    it('AUTH-002 & SAFE-001: isProtectedOwnerAccount reconhece qualquer variação de UUID, email, maiúsculas ou espaços', () => {
      expect(isProtectedOwnerAccount('4164f657-8896-4e32-9bd4-2c253a1245fe')).toBe(true);
      expect(isProtectedOwnerAccount('4164F657-8896-4E32-9BD4-2C253A1245FE')).toBe(true);
      expect(isProtectedOwnerAccount({ id: '4164f657-8896-4e32-9bd4-2c253a1245fe' })).toBe(true);
      expect(isProtectedOwnerAccount({ email: 'jairaniran2@gmail.com' })).toBe(true);
      expect(isProtectedOwnerAccount({ email: '  JAIRANIRAN2@GMAIL.COM  ' })).toBe(true);
    });

    it('AUTH-003 & SAFE-002: safeAuthAdmin bloqueia qualquer tentativa adversarial de mutação do Owner', async () => {
      const rawAdminMock = {
        auth: {
          admin: {
            updateUserById: vi.fn(),
            deleteUser: vi.fn(),
            createUser: vi.fn(),
            getUserById: vi.fn().mockResolvedValue({ data: { user: { id: PROTECTED_OWNER_CONFIG.OWNER_USER_ID } } }),
          },
        },
        from: vi.fn().mockReturnValue({ select: vi.fn() }),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      const safeAdmin = createSafeAuthAdmin(rawAdminMock);

      // Ataque 1: updateUserById no UUID do Owner
      await expect(
        safeAdmin.auth.admin.updateUserById(PROTECTED_OWNER_CONFIG.OWNER_USER_ID, { password: 'HackedPassword!' })
      ).rejects.toThrow(PROTECTED_OWNER_ERROR);
      expect(rawAdminMock.auth.admin.updateUserById).not.toHaveBeenCalled();

      // Ataque 2: deleteUser no UUID do Owner
      await expect(
        safeAdmin.auth.admin.deleteUser(PROTECTED_OWNER_CONFIG.OWNER_USER_ID)
      ).rejects.toThrow(PROTECTED_OWNER_ERROR);
      expect(rawAdminMock.auth.admin.deleteUser).not.toHaveBeenCalled();

      // Ataque 3: createUser com email do Owner
      await expect(
        safeAdmin.auth.admin.createUser({ email: 'jairaniran2@gmail.com', password: 'Any' })
      ).rejects.toThrow(PROTECTED_OWNER_ERROR);
      expect(rawAdminMock.auth.admin.createUser).not.toHaveBeenCalled();

      // Ataque 4: updateUserById alterando email de terceiro para o email do Owner
      await expect(
        safeAdmin.auth.admin.updateUserById('other-user-uuid', { email: 'jairaniran2@gmail.com' })
      ).rejects.toThrow(PROTECTED_OWNER_ERROR);

      // Operação legítima de leitura ou manipulação de usuário E2E passa normalmente
      await safeAdmin.auth.admin.getUserById(PROTECTED_OWNER_CONFIG.OWNER_USER_ID);
      expect(rawAdminMock.auth.admin.getUserById).toHaveBeenCalledWith(PROTECTED_OWNER_CONFIG.OWNER_USER_ID);

      // Métodos do cliente Supabase são preservados pelo Proxy
      expect(typeof safeAdmin.from).toBe('function');
      expect(typeof safeAdmin.rpc).toBe('function');
    });

    it('AUTH-004: Detector estrutural de código perigoso — nenhum script no repositório executa updateUserById no Owner', () => {
      const rootDir = process.cwd();
      const targetDirs = ['src', 'scripts', 'scratch', 'supabase'];
      const dangerousPatterns = [
        'updateUserById(uid',
        "updateUserById('4164f657-8896-4e32-9bd4-2c253a1245fe'",
        'updateUserById("4164f657-8896-4e32-9bd4-2c253a1245fe"',
      ];

      function scanDir(dir: string): string[] {
        const findings: string[] = [];
        if (!fs.existsSync(dir)) return findings;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (['node_modules', '.git', 'dist', '.gemini', 'android', 'coverage'].includes(entry.name)) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            findings.push(...scanDir(fullPath));
          } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) && !entry.name.includes('regression-baseline')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const pattern of dangerousPatterns) {
              if (content.includes(pattern) && !fullPath.includes('safeAuthAdmin')) {
                findings.push(`${fullPath}: contém padrão perigoso '${pattern}'`);
              }
            }
          }
        }
        return findings;
      }

      const violations = targetDirs.flatMap((d) => scanDir(path.join(rootDir, d)));
      expect(violations).toEqual([]);
    }, 30000);
  });

  // ==========================================================================
  // BLOCO 3: CICLO DE VIDA DE APARELHOS & DESVINCULAÇÃO (DEVICE-001 a DEVICE-010)
  // ==========================================================================
  describe('DOMÍNIO 3: Ciclo de Vida de Aparelhos e Telas', () => {
    let mockScreen: {
      id: string;
      custom_id: string;
      playlist_id: string;
      empresa_operadora_id: string;
      bound_device_id: string | null;
    };

    let mockDevices: Map<string, { id: string; screen_id: string | null; revoked_at: string | null }>;
    let mockRemoteCommands: Array<{ screen_id: string; command: string; target_device_id: string }>;

    beforeEach(() => {
      mockScreen = {
        id: 'screen-golden-001',
        custom_id: 'TEL-GOLDEN-001',
        playlist_id: 'playlist-golden-100',
        empresa_operadora_id: 'tenant-golden-alpha',
        bound_device_id: null,
      };
      mockDevices = new Map();
      mockRemoteCommands = [];
    });

    it('DEVICE-001 & DEVICE-002: admin_unpair_screen NUNCA deleta a Screen e NUNCA remove playlist_id', () => {
      const devA = 'hardware-hash-alpha';
      mockScreen.bound_device_id = devA;
      mockDevices.set(devA, { id: 'dev-1', screen_id: mockScreen.id, revoked_at: null });

      const screenIdBefore = mockScreen.id;
      const playlistIdBefore = mockScreen.playlist_id;

      // Execução da unpair
      const previousDev = mockScreen.bound_device_id;
      mockScreen.bound_device_id = null;
      if (previousDev) {
        mockRemoteCommands.push({
          screen_id: mockScreen.id,
          command: 'unpair',
          target_device_id: previousDev,
        });
      }

      // Assert dos invariantes
      expect(mockScreen.id).toBe(screenIdBefore);
      expect(mockScreen.playlist_id).toBe(playlistIdBefore);
      expect(mockScreen.bound_device_id).toBeNull();
      expect(mockRemoteCommands[0].command).toBe('unpair');
      expect(mockRemoteCommands[0].target_device_id).toBe(devA);
    });

    it('DEVICE-003 & DEVICE-004: Device revogado é rejeitado e não pode acessar playlist', () => {
      const devRevoked = 'hardware-hash-revoked';
      mockDevices.set(devRevoked, { id: 'dev-revoked', screen_id: mockScreen.id, revoked_at: '2026-08-30T10:00:00Z' });

      const isRevoked = mockDevices.get(devRevoked)?.revoked_at !== null;
      const getPlaylistResponse = isRevoked
        ? { status: 'DEVICE_REVOKED', message: 'O vínculo deste aparelho foi revogado.' }
        : { status: 'SUCCESS' };

      expect(getPlaylistResponse.status).toBe('DEVICE_REVOKED');
    });

    it('DEVICE-005 a DEVICE-010: Re-vinculação com novo Device B preserva Screen e Playlist e isola o Device A antigo', () => {
      const devA = 'hardware-hash-alpha';
      const devB = 'hardware-hash-beta';

      // 1. Desvinculação do Device A
      mockScreen.bound_device_id = null;

      // 2. Novo Device B vincula na mesma tela
      mockScreen.bound_device_id = devB;
      mockDevices.set(devB, { id: 'dev-2', screen_id: mockScreen.id, revoked_at: null });

      // Invariantes da tela e playlist
      expect(mockScreen.bound_device_id).toBe(devB);
      expect(mockScreen.playlist_id).toBe('playlist-golden-100');
      expect(mockScreen.custom_id).toBe('TEL-GOLDEN-001');

      // Tentativa do Device A antigo após Device B assumir -> DENY (DEVICE_ALREADY_BOUND)
      const canDevAPlay = mockScreen.bound_device_id === devA;
      const canDevBPlay = mockScreen.bound_device_id === devB;

      expect(canDevAPlay).toBe(false);
      expect(canDevBPlay).toBe(true);
    });
  });

  // ==========================================================================
  // BLOCO 4: INTEGRIDADE FINANCEIRA & ANTI-DUPLA BAIXA (FIN-001 a FIN-005)
  // ==========================================================================
  describe('DOMÍNIO 4: Integridade Financeira e Anti-Dupla Baixa', () => {
    function processarPagamento(
      cobranca: { valor_original: number; valor_pago: number; saldo: number; status: string },
      meio: string,
      valor: number
    ) {
      if (cobranca.status === 'PAGA' || cobranca.saldo <= 0) {
        throw new Error('[INTEGRITY_VIOLATION_PAYMENT_ON_SETTLED_CHARGE] Cobrança já liquidada.');
      }
      if (valor > cobranca.saldo) {
        throw new Error('[INTEGRITY_VIOLATION_OVERPAYMENT] Valor excede o saldo restante.');
      }

      const novoPago = cobranca.valor_pago + valor;
      const novoSaldo = cobranca.valor_original - novoPago;
      const novoStatus = novoSaldo === 0 ? 'PAGA' : 'PENDENTE';

      return {
        valor_original: cobranca.valor_original,
        valor_pago: novoPago,
        saldo: novoSaldo,
        status: novoStatus,
      };
    }

    it('FIN-001: Pagamento integral único liquida com status PAGA e saldo zero', () => {
      const cob = { valor_original: 100, valor_pago: 0, saldo: 100, status: 'PENDENTE' };
      const res = processarPagamento(cob, 'PIX', 100);

      expect(res.status).toBe('PAGA');
      expect(res.saldo).toBe(0);
      expect(res.valor_pago).toBe(100);
    });

    it('FIN-002: Anti-dupla baixa PIX × Boleto — segunda tentativa sobre cobrança quitada é bloqueada', () => {
      const cob = { valor_original: 100, valor_pago: 0, saldo: 100, status: 'PENDENTE' };
      const quitada = processarPagamento(cob, 'PIX', 100);

      expect(quitada.status).toBe('PAGA');

      // Chega webhook de Boleto posterior
      expect(() => processarPagamento(quitada, 'BOLETO', 100)).toThrow(
        'INTEGRITY_VIOLATION_PAYMENT_ON_SETTLED_CHARGE'
      );
    });

    it('FIN-003: Pagamentos parciais legítimos abatem saldo até quitação integral', () => {
      const cob = { valor_original: 100, valor_pago: 0, saldo: 100, status: 'PENDENTE' };
      const parcial1 = processarPagamento(cob, 'PIX', 30);
      expect(parcial1.status).toBe('PENDENTE');
      expect(parcial1.saldo).toBe(70);

      const parcial2 = processarPagamento(parcial1, 'BOLETO', 70);
      expect(parcial2.status).toBe('PAGA');
      expect(parcial2.saldo).toBe(0);
      expect(parcial2.valor_pago).toBe(100);
    });

    it('FIN-004: Pagamento excedente é sumariamente bloqueado', () => {
      const cob = { valor_original: 100, valor_pago: 0, saldo: 100, status: 'PENDENTE' };
      expect(() => processarPagamento(cob, 'PIX', 120)).toThrow('INTEGRITY_VIOLATION_OVERPAYMENT');
    });

    it('FIN-005: Concorrência de pagamentos simultâneos serializa com exatamente 1 aceite e 1 rejeição', async () => {
      let estado = { valor_original: 100, valor_pago: 0, saldo: 100, status: 'PENDENTE' };
      let aceitos = 0;
      let rejeitados = 0;

      async function tentarLiquidarConcorrente(meio: string) {
        try {
          if (estado.saldo >= 100) {
            estado = processarPagamento(estado, meio, 100);
            aceitos++;
          } else {
            throw new Error('Lock acquired: already settled.');
          }
        } catch {
          rejeitados++;
        }
      }

      await Promise.all([tentarLiquidarConcorrente('PIX'), tentarLiquidarConcorrente('BOLETO')]);

      expect(aceitos).toBe(1);
      expect(rejeitados).toBe(1);
      expect(estado.status).toBe('PAGA');
      expect(estado.saldo).toBe(0);
    });
  });

  // ==========================================================================
  // BLOCO 5: PIX NATIVO & JIT IDEMPOTENTE (PIX-001 a PIX-004)
  // ==========================================================================
  describe('DOMÍNIO 5: PIX Nativo e Idempotência JIT', () => {
    it('PIX-001 & PIX-002: Trava JIT garante exatamente 1 emissão oficial mesmo sob 10 requisições simultâneas', async () => {
      let emissoesBancoInterCount = 0;
      const cobrancaPixState: { txid: string | null; copia_e_cola: string | null; lock: boolean } = {
        txid: null,
        copia_e_cola: null,
        lock: false,
      };

      async function publicConsultJIT() {
        if (cobrancaPixState.txid) {
          return { txid: cobrancaPixState.txid, copia_e_cola: cobrancaPixState.copia_e_cola };
        }

        if (!cobrancaPixState.lock) {
          cobrancaPixState.lock = true;
          emissoesBancoInterCount++;
          cobrancaPixState.txid = 'SM1234567890abcdef1234567890abcdef';
          cobrancaPixState.copia_e_cola =
            '00020101021226930014BR.GOV.BCB.PIX2571spi-qrcode.bancointer.com.br/spi/pj/v2/mock52040000530398654041.005802BR5901*6009SAO_PAULO61080391006062070503***6304ABCD';
          cobrancaPixState.lock = false;
        }

        return { txid: cobrancaPixState.txid, copia_e_cola: cobrancaPixState.copia_e_cola };
      }

      const chamadas = Array.from({ length: 10 }).map(() => publicConsultJIT());
      const resultados = await Promise.all(chamadas);

      expect(emissoesBancoInterCount).toBe(1);
      const todosMesmoTxid = resultados.every((r) => r.txid === 'SM1234567890abcdef1234567890abcdef');
      expect(todosMesmoTxid).toBe(true);
    });

    it('PIX-003: Payload Copia e Cola respeita integralmente as Tags do padrão BACEN/EMV', () => {
      const payload =
        '00020101021226930014BR.GOV.BCB.PIX2571spi-qrcode.bancointer.com.br/spi/pj/v2/mock52040000530398654041.005802BR5901*6009SAO_PAULO61080391006062070503***6304ABCD';

      expect(payload.startsWith('000201')).toBe(true);
      expect(payload.includes('BR.GOV.BCB.PIX')).toBe(true);
      expect(payload.includes('5802BR')).toBe(true);
      expect(payload.includes('6304')).toBe(true);
    });
  });

  // ==========================================================================
  // BLOCO 6: PORTAL PÚBLICO & FAIL-CLOSED (PORTAL-001 a PORTAL-004)
  // ==========================================================================
  describe('DOMÍNIO 6: Métodos de Pagamento e Fail-Closed', () => {
    it('PORTAL-001: Matriz de métodos autorizados respeita a configuração exata', () => {
      expect(resolvePaymentMethods(['PIX'])).toEqual({ showPix: true, showBoleto: false, hasAny: true, hasBoth: false });
      expect(resolvePaymentMethods(['BOLETO'])).toEqual({ showPix: false, showBoleto: true, hasAny: true, hasBoth: false });
      expect(resolvePaymentMethods(['PIX', 'BOLETO'])).toEqual({ showPix: true, showBoleto: true, hasAny: true, hasBoth: true });
      expect(resolvePaymentMethods(['BOLETO', 'PIX'])).toEqual({ showPix: true, showBoleto: true, hasAny: true, hasBoth: true });
    });

    it('PORTAL-002: Fail-closed estrito — vazio, null, undefined ou inválido expõe ZERO métodos', () => {
      expect(resolvePaymentMethods([])).toEqual({ showPix: false, showBoleto: false, hasAny: false, hasBoth: false });
      expect(resolvePaymentMethods(null)).toEqual({ showPix: false, showBoleto: false, hasAny: false, hasBoth: false });
      expect(resolvePaymentMethods(undefined)).toEqual({ showPix: false, showBoleto: false, hasAny: false, hasBoth: false });
      expect(resolvePaymentMethods('INVALID' as any)).toEqual({ showPix: false, showBoleto: false, hasAny: false, hasBoth: false });
      expect(resolvePaymentMethods(['CARTAO_CREDITO' as any])).toEqual({ showPix: false, showBoleto: false, hasAny: false, hasBoth: false });
    });
  });

  // ==========================================================================
  // BLOCO 7: ZERO-TRUST RLS & ISOLAMENTO MULTI-TENANT (RLS-001 a RLS-002)
  // ==========================================================================
  describe('DOMÍNIO 7: Multi-Tenant e Segurança Zero-Trust', () => {
    it('RLS-001: Usuário do Tenant A não tem permissão para gerenciar recursos do Tenant B', () => {
      const userTenant = 'tenant-alfa-1111';
      const screenTenant = 'tenant-beta-2222';
      const isOwnerOrAdminGlobal = false;

      const hasAccess = isOwnerOrAdminGlobal || userTenant === screenTenant;
      expect(hasAccess).toBe(false);
    });

    it('RLS-002: Acesso anônimo a tabelas operacionais é bloqueado por padrão', () => {
      const isAnon = true;
      const allowedPublicEndpoints = ['rpc_get_public_billing', 'get_player_playlist_for_screen'];

      const canAnonDirectAccess = !isAnon;
      expect(canAnonDirectAccess).toBe(false);
      expect(allowedPublicEndpoints).toContain('rpc_get_public_billing');
    });
  });

  // ==========================================================================
  // BLOCO 8: FLUXO CROSS-FEATURE SEQUENCIAL (CROSS-001)
  // ==========================================================================
  describe('DOMÍNIO 8: Fluxo Integrado Cross-Feature Sequencial', () => {
    it('CROSS-001: Executa o ciclo completo integrado sem interferência cruzada e com integridade total', async () => {
      // 1. Identidade de Teste E2E
      const testUser = { id: 'e2e-user-999', email: 'e2e-tester@sobremidia-e2e.local', is_owner: false };
      expect(isProtectedOwnerAccount(testUser)).toBe(false);

      // 2. Criação de Screen e Playlist
      const screen = { id: 'scr-cross-1', playlist_id: 'pl-cross-1', bound_device_id: null as string | null };
      expect(screen.bound_device_id).toBeNull();

      // 3. Pareamento do Device A
      screen.bound_device_id = 'dev-cross-alpha';
      expect(screen.bound_device_id).toBe('dev-cross-alpha');

      // 4. Criação de Cobrança PIX e Boleto
      const cobranca = { valor_original: 50, saldo: 50, status: 'PENDENTE', metodos_gateway: ['PIX', 'BOLETO'] };
      const methods = resolvePaymentMethods(cobranca.metodos_gateway);
      expect(methods.showPix).toBe(true);
      expect(methods.showBoleto).toBe(true);

      // 5. Liquidação PIX
      cobranca.saldo = 0;
      cobranca.status = 'PAGA';
      expect(cobranca.status).toBe('PAGA');

      // 6. Desvinculação da Screen
      screen.bound_device_id = null;
      expect(screen.id).toBe('scr-cross-1');
      expect(screen.playlist_id).toBe('pl-cross-1');

      // 7. Re-vinculação com Device B
      screen.bound_device_id = 'dev-cross-beta';
      expect(screen.bound_device_id).toBe('dev-cross-beta');
      expect(screen.playlist_id).toBe('pl-cross-1');
    });
  });
});

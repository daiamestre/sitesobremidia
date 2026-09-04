import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveContractTypeFromCadastroType, getOfficialPdfForCadastro, OFFICIAL_PDFS } from '@/modules/crm/services/contractResolver.service';
import { prospeccaoService } from '@/services/prospeccao.service';
import { corporateUsersService } from '@/services/corporateUsers.service';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/services/corporateUsers.service', () => ({
  corporateUsersService: {
    provisionarUsuarioDireto: vi.fn(),
  },
}));

describe('GATE 4.1 — Gestor de Mídias com Contrato Obrigatório', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Contract Resolver — Mapeamento Oficial do Gestor', () => {
    it('deve resolver GESTOR_MIDIAS para tipo de contrato GESTOR', () => {
      const tc = resolveContractTypeFromCadastroType('GESTOR_MIDIAS');
      expect(tc).toBe('GESTOR');
    });

    it('deve obter o PDF oficial do contrato de Gestor', () => {
      const pdf = getOfficialPdfForCadastro('GESTOR_MIDIAS');
      expect(pdf).toBeDefined();
      expect(pdf?.fileName).toBe('contrato-gestor.pdf');
      expect(pdf?.publicPath).toBe('/official-contracts/contrato-gestor.pdf');
      expect(pdf?.tipoContrato).toBe('GESTOR');
    });
  });

  describe('ProspeccaoService.provisionarGestor()', () => {
    it('deve provisionar o gestor e retornar o contrato_id gerado pelo banco', async () => {
      // Mock busca perfil GESTOR
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'perfis') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'perfil-gestor-uuid' }, error: null }),
                }),
              }),
            }),
          } as any;
        }

        if (table === 'contratos') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'ctr-gestor-uuid-999' }, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          } as any;
        }

        return {} as any;
      });

      // Mock provisionarUsuarioDireto
      vi.mocked(corporateUsersService.provisionarUsuarioDireto).mockResolvedValue({
        success: true,
        userId: 'gestor-user-uuid-123',
        email: 'gestor.gate41@sobremidia.com.br',
        senha_inicial: 'TempPass123!#',
      });

      const res = await prospeccaoService.provisionarGestor({
        nome: 'Gestor E2E Gate 4.1',
        email: 'gestor.gate41@sobremidia.com.br',
        telefone: '81999997777',
        empresa: 'Gestao Midias Ltda',
        cargo: 'Gerente Operacional',
      });

      expect(corporateUsersService.provisionarUsuarioDireto).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: 'Gestor E2E Gate 4.1',
          email: 'gestor.gate41@sobremidia.com.br',
          perfilId: 'perfil-gestor-uuid',
        })
      );

      expect(res.email).toBe('gestor.gate41@sobremidia.com.br');
      expect(res.senha_inicial).toBe('TempPass123!#');
      expect(res.contrato_id).toBe('ctr-gestor-uuid-999');
    });
  });
});

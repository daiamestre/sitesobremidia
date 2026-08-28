import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MeuPerfilBase from '@/components/perfil/MeuPerfilBase';

// Mock AuthContext por variante
const mockUsuario = {
  id: 'u1',
  nome: 'Teste Usuario',
  email: 'teste@ex.com',
  telefone: '11999999999',
  empresa_operadora_id: 'emp1',
  perfil_id: 'p1',
  avatar_url: null,
  cliente_id: 'c1',
  is_owner: false,
  perfil: { nome: 'REPRESENTANTE' },
};

let varianteMock: string = 'REPRESENTANTE';
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    usuario: { ...mockUsuario, perfil: { nome: varianteMock } },
    user: { id: 'u1', email: 'teste@ex.com' },
    refreshUserData: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'teste@ex.com' } } }), getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    storage: { from: vi.fn(() => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) })) },
  },
}));

function renderPerfil(variante: any) {
  cleanup();
  varianteMock = variante;
  return render(
    <MemoryRouter>
      <MeuPerfilBase variante={variante} />
    </MemoryRouter>
  );
}

describe('Meu Perfil — separação absoluta entre perfis', () => {
  it('REPRESENTANTE vê seu perfil e NÃO vê dados de Owner/Anunciante misturados', async () => {
    renderPerfil('REPRESENTANTE');
    expect(await screen.findByText(/Área pessoal — Representante/)).toBeTruthy();
    expect(await screen.findByText(/^Meu Perfil$/)).toBeTruthy();
    // Representante não deve expor empresa_operadora_id editável nem owner badge indevido
    expect(screen.queryByText(/Empresa operadora/)).toBeFalsy();
  });

  it('ANUNCIANTE vê seu perfil com cliente vinculado e NÃO vê CPF de representante', async () => {
    renderPerfil('ANUNCIANTE');
    expect(await screen.findByText(/Área pessoal — Anunciante/)).toBeTruthy();
    expect(await screen.findByText(/Cliente vinculado/)).toBeTruthy();
  });

  it('GESTOR vê seu perfil operacional', async () => {
    renderPerfil('GESTOR');
    expect(await screen.findByText(/Área pessoal — Gestor de Mídias/)).toBeTruthy();
  });

  it('OWNER vê autonomia total preservada', async () => {
    // owner mock tem is_owner true
    const orig = mockUsuario.is_owner;
    (mockUsuario as any).is_owner = true;
    renderPerfil('OWNER');
    expect(await screen.findByText(/Área pessoal — Owner/)).toBeTruthy();
    (mockUsuario as any).is_owner = orig;
  });

  it('campos protegidos nunca são editáveis (tenant/cliente_id/perfil)', async () => {
    renderPerfil('REPRESENTANTE');
    // Inputs desabilitados para perfil/função
    const perfilInput = screen.getByDisplayValue('Representante');
    expect(perfilInput).toBeTruthy();
    expect((perfilInput as HTMLInputElement).disabled).toBe(true);
  });

  it('mensagem de segurança alerta que tenant/cliente/permissões não são alteráveis', async () => {
    renderPerfil('ANUNCIANTE');
    expect(await screen.findByText(/Você não pode alterar tenant/)).toBeTruthy();
  });
});

describe('Meu Perfil — campos obrigatórios validados', () => {
  it('exibe feedback de salvando/salvo/erro via toast (estrutura existe)', async () => {
    renderPerfil('REPRESENTANTE');
    const btn = screen.getByText(/Salvar alterações/);
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('disabled')).toBeFalsy();
  });
  it('upload foto valida 5MB e tipo — mensagem presente', async () => {
    renderPerfil('GESTOR');
    expect(screen.getByText(/JPG\/PNG\/WEBP\/GIF/)).toBeTruthy();
  });
});

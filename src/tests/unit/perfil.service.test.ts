import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { empresa_operadora_id: 'emp1', avatar_url: null }, error: null }),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null }),
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        updateUser: vi.fn().mockResolvedValue({ error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn(() => chain),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({ error: null }),
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn/avatars/u1/avatar.jpg' } }),
          remove: vi.fn().mockResolvedValue({ error: null }),
        })),
      },
    },
  };
});

import { perfilService } from '@/services/perfil.service';

describe('perfil.service — validação obrigatória', () => {
  it('atualizarPerfil exige nome com mín. 3 caracteres', async () => {
    const r = await perfilService.atualizarPerfil({ nome: 'Ab', telefone: '11999999999' });
    expect(r.error).toMatch(/Nome/);
  });
  it('atualizarPerfil exige telefone/whatsapp obrigatório', async () => {
    const r = await perfilService.atualizarPerfil({ nome: 'Fulano da Silva', telefone: '' });
    expect(r.error).toMatch(/Telefone|WhatsApp/);
  });
  it('atualizarPerfil aceita payload válido', async () => {
    const r = await perfilService.atualizarPerfil({ nome: 'Fulano da Silva', telefone: '11999999999' });
    expect(r.error).toBeNull();
  });
});

describe('perfil.service — avatar', () => {
  it('uploadAvatar rejeita arquivo >5MB', async () => {
    const big = new File([new ArrayBuffer(6 * 1024 * 1024)], 'foto.jpg', { type: 'image/jpeg' });
    const r = await perfilService.uploadAvatar(big);
    expect(r.error).toMatch(/5MB/);
    expect(r.url).toBeNull();
  });
  it('uploadAvatar rejeita tipo inválido', async () => {
    const f = new File(['hi'], 'doc.pdf', { type: 'application/pdf' });
    const r = await perfilService.uploadAvatar(f);
    expect(r.error).toMatch(/Formato/);
  });
  it('uploadAvatar aceita JPG válido e retorna URL', async () => {
    const f = new File(['hi'], 'foto.jpg', { type: 'image/jpeg' });
    const r = await perfilService.uploadAvatar(f);
    expect(r.error).toBeNull();
    expect(r.url).toMatch(/https/);
  });
});

describe('perfil.service — segurança senha/e-mail', () => {
  it('alterarSenha exige política oficial (mín 6)', async () => {
    const r = await perfilService.alterarSenha('atual123', 'abc');
    expect(r.error).toMatch(/6/);
  });
  it('solicitarAlteracaoEmail valida formato', async () => {
    const r = await perfilService.solicitarAlteracaoEmail('invalido');
    expect(r.error).toMatch(/E-mail inválido/);
  });
});

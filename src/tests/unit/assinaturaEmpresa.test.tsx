import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-139 — assinatura da Sobre Mídia (dono/administrador) nos contratos: na hora do cadastro ou depois, pela Central.
const ler = (arquivo: string) => readFileSync(path.join(process.cwd(), arquivo), 'utf8').replace(/\r\n/g, '\n');

let contrato: Record<string, unknown> | null = null;
let perfil = 'ADMIN';
const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (f: string, a: unknown) => rpc(f, a),
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) q[m] = () => q;
      q.maybeSingle = async () => ({ data: contrato, error: null });
      return q;
    },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ usuario: { id: 'u1', nome: 'Jairan Santos', email: 'a@b.c', is_owner: false }, isOwner: false, perfilNome: perfil }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AssinaturaEmpresa, assinarPelaEmpresa } from '@/modules/crm/components/signature/AssinaturaEmpresa';

describe('Assinatura da Sobre Mídia (F-139)', () => {
  beforeEach(() => { rpc.mockReset(); perfil = 'ADMIN'; });

  it('contrato sem a assinatura: mostra "Aguardando assinatura Sobre Mídia" e o botão para dono/administrador', async () => {
    contrato = { numero_contrato: 'CTR-1', tipo_contrato: 'ANUNCIANTE', empresa_assinado_em: null, empresa_signatario_nome: null };
    render(<AssinaturaEmpresa contratoId="c1" />);
    expect(await screen.findByText('Aguardando assinatura Sobre Mídia')).toBeInTheDocument();
    expect(screen.getByTestId('assinar-pela-empresa')).toBeInTheDocument();
    expect(screen.getByText(/assinar agora ou deixar para depois/)).toBeInTheDocument();
  });

  it('quem não é dono/administrador vê o aviso, sem botão', async () => {
    perfil = 'REPRESENTANTE';
    contrato = { numero_contrato: 'CTR-1', tipo_contrato: 'ANUNCIANTE', empresa_assinado_em: null, empresa_signatario_nome: null };
    render(<AssinaturaEmpresa contratoId="c1" />);
    expect(await screen.findByText('Aguardando assinatura Sobre Mídia')).toBeInTheDocument();
    expect(screen.queryByTestId('assinar-pela-empresa')).toBeNull();
  });

  it('contrato já assinado pela empresa mostra quem assinou e não oferece assinar de novo', async () => {
    contrato = { numero_contrato: 'CTR-1', tipo_contrato: 'PARCEIRO', empresa_assinado_em: '2026-10-04T10:00:00Z', empresa_signatario_nome: 'Jairan Santos' };
    render(<AssinaturaEmpresa contratoId="c1" />);
    expect(await screen.findByText('Assinado pela Sobre Mídia')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Jairan Santos ·/)).toBeInTheDocument());
    expect(screen.queryByTestId('assinar-pela-empresa')).toBeNull();
  });

  it('sem contrato ainda, o bloco não aparece', () => {
    const { container } = render(<AssinaturaEmpresa contratoId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('gravar chama a função do banco com nome, método e imagem; a recusa volta com o motivo', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'OK', signatario: 'Jairan Santos' }, error: null });
    expect(await assinarPelaEmpresa('c1', { nome: 'Jairan Santos', metodo: 'DRAWN', imagem: 'data:image/png;base64,AAAA' })).toEqual({ ok: true, signatario: 'Jairan Santos' });
    expect(rpc).toHaveBeenCalledWith('fn_assinar_contrato_pela_empresa', expect.objectContaining({ p_contrato: 'c1', p_dados: expect.objectContaining({ nome: 'Jairan Santos', metodo: 'DRAWN', imagem: 'data:image/png;base64,AAAA' }) }));
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Este contrato já foi assinado pela Sobre Mídia.' } });
    expect(await assinarPelaEmpresa('c1', { nome: 'X' })).toEqual({ ok: false, erro: 'Este contrato já foi assinado pela Sobre Mídia.' });
  });

  it('banco: só dono/administrador da própria empresa assina, uma vez; fila só para a gestão', () => {
    const sql = ler('supabase/migrations/20261299_assinatura_da_empresa.sql');
    expect(sql).toContain("IF NOT public.fn_eh_owner_ou_admin() THEN\n    RAISE EXCEPTION 'Só o dono ou o administrador assina pela Sobre Mídia.'");
    expect(sql).toContain('c.empresa_operadora_id IS DISTINCT FROM v_tenant');
    expect(sql).toContain("RAISE EXCEPTION 'Este contrato já foi assinado pela Sobre Mídia.'");
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contrato_assinatura_empresa FROM authenticated;');
    expect(sql).toContain("'CONTRATO_ASSINADO_EMPRESA'");
    expect(sql).toMatch(/fn_contratos_aguardando_empresa[\s\S]*WHERE public\.fn_eh_owner_ou_admin\(\)[\s\S]*AND c\.empresa_assinado_em IS NULL/);
  });

  it('Central mostra a fila da empresa e os três cadastros oferecem a assinatura (agora ou depois)', () => {
    const central = ler('src/modules/crm/pages/SignatureDashboard.tsx');
    expect(central).toContain('<AguardandoSobreMidia onContagem={setAguardandoEmpresa} />');
    expect(central).toContain('Aguardando Sobre Mídia');
    expect(ler('src/modules/crm/components/signature/PendingSignatures.tsx')).toContain('Aguardando assinatura do cliente');
    for (const arq of ['src/modules/crm/components/forms/IntelligentCommercialWizard.tsx', 'src/modules/crm/pages/prospeccao/PontoParceiroWizardPage.tsx', 'src/modules/crm/pages/prospeccao/GestorMidiiasProspeccaoPage.tsx']) {
      expect(ler(arq), arq).toContain('<AssinaturaEmpresa contratoId=');
    }
    expect(ler('src/modules/crm/services/contratoDocumento.service.ts')).toContain('Assinado digitalmente por ${');
  });

  it('"Cadastrar outro ponto" não reaproveita o ponto nem o contrato do cadastro anterior', () => {
    expect(ler('src/modules/crm/pages/prospeccao/PontoParceiroWizardPage.tsx')).toContain('onClick={() => { pontoSalvo.current = null; setContratoIdSalvo(null); setForm(VAZIO);');
  });
});

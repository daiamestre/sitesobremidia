import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-119 — sala de pontos parceiros: cartões, "Novo Ponto Parceiro" = cadastro completo, edição completa, tela grátis.
const pontos = [
  { id: 'p1', nome: 'Farmácia Capital', categoria: 'Farmácia', foto_url: 'https://x/f.jpg', bairro: 'Centro', cidade: 'Caruaru', quantidade_telas: 2, valor_anuncio: 149.9, disponibilidade: 'DISPONIVEL', ativo: true },
  { id: 'p2', nome: 'Padaria Grátis', categoria: 'Padaria', foto_url: null, bairro: 'Centro', cidade: 'Caruaru', quantidade_telas: 1, valor_anuncio: 0, disponibilidade: 'DISPONIVEL', ativo: true },
];
const rpc = vi.fn(async () => ({ data: { status: 'OK' }, error: null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, a: unknown) => rpc(fn, a),
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'is', 'order', 'eq']) q[m] = () => q;
      (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: pontos, error: null }).then(ok);
      return q;
    },
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PontosParceirosPage from '@/modules/corporate/pages/PontosParceirosPage';
import { formularioDoPonto } from '@/modules/corporate/pages/PontoParceiroEdicaoPage';
import { TelaParceiraDialog } from '@/modules/corporate/components/TelaParceiraDialog';
import { precoTela } from '@/lib/enviarImagem';

const Provedor = ({ children, rota }: { children: React.ReactNode; rota: string }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[rota]}>{children}</MemoryRouter>
  </QueryClientProvider>
);

describe('Sala de pontos parceiros (F-119)', () => {
  beforeEach(() => rpc.mockClear());

  it('cartões clicáveis (foto, nome, local, telas, valor; R$ 0 = "Grátis") levam à edição', async () => {
    render(<Provedor rota="/dashboard/pontos-parceiros"><Routes>
      <Route path="/dashboard/pontos-parceiros" element={<PontosParceirosPage />} />
      <Route path="/dashboard/pontos-parceiros/:id" element={<p>edição do ponto</p>} />
    </Routes></Provedor>);
    const cartoes = await screen.findAllByTestId('cartao-ponto');
    expect(cartoes).toHaveLength(2);
    expect(cartoes[0].getAttribute('href')).toBe('/dashboard/pontos-parceiros/p1');
    expect(cartoes[1].textContent).toContain('Grátis');
    fireEvent.click(cartoes[0]);
    expect(await screen.findByText('edição do ponto')).toBeInTheDocument();
  });

  it('"Novo Ponto Parceiro" abre o cadastro completo (7 etapas) e volta para a sala', async () => {
    let estado: unknown = null;
    const Wizard = () => { estado = (window.history.state as { usr?: unknown })?.usr; return <p>cadastro completo</p>; };
    render(<Provedor rota="/workspace/pontos-parceiros"><Routes>
      <Route path="/workspace/pontos-parceiros" element={<PontosParceirosPage />} />
      <Route path="/workspace/prospeccao/ponto-parceiro" element={<Wizard />} />
    </Routes></Provedor>);
    fireEvent.click(await screen.findByTestId('botao-novo-ponto'));
    expect(await screen.findByText('cadastro completo')).toBeInTheDocument();
    const wizard = readFileSync(path.join(process.cwd(), 'src/modules/crm/pages/prospeccao/PontoParceiroWizardPage.tsx'), 'utf8');
    expect(wizard).toContain("(location.state as { voltarPara?: string } | null)?.voltarPara");
    expect(wizard).toContain("'fn_gravar_dados_cadastro_ponto'");
    void estado;
  });

  it('edição traz tudo de volta: do formulário guardado ou, em pontos antigos, da descrição/regras', () => {
    const base = { id: 'p1', nome: 'Mercado X', categoria: 'Mercado', foto_url: null, galeria: [], cep: '55000-000', logradouro: 'Rua A', numero: '1',
      complemento: null, bairro: 'Centro', cidade: 'Caruaru', estado: 'PE', latitude: -8.2, longitude: -35.9, horario_funcionamento: '7h às 22h',
      publico_estimado_dia: 500, modelo_comercial: 'COMISSIONADO', disponibilidade: 'DISPONIVEL' as const, ativo: true };
    const antigo = formularioDoPonto({ ...base, dados_cadastro: null,
      descricao: 'Razao social: Mercado X LTDA | CPF/CNPJ: 11.222.333/0001-44 | Responsavel: Ana (Gerente) | Contato: 8133334444 / 81999998888 | E-mail: a@x.com',
      regras_comerciais: 'MODELO COMERCIAL: COMISSIONADO\nPerfil do publico: famílias\nPonto de referencia: perto da praça' });
    expect(antigo).toMatchObject({ razaoSocial: 'Mercado X LTDA', cnpjCpf: '11.222.333/0001-44', responsavelNome: 'Ana', responsavelCargo: 'Gerente',
      telefone: '8133334444', whatsapp: '81999998888', email: 'a@x.com', perfilPublico: 'famílias', referencia: 'perto da praça', descricaoPublica: '', fluxoDiario: '500' });
    const novo = formularioDoPonto({ ...base, descricao: 'Mercado de bairro.', regras_comerciais: null,
      dados_cadastro: { razaoSocial: 'Guardada LTDA', perfilPublico: 'jovens', modeloComercial: 'PERMUTA' } });
    expect(novo).toMatchObject({ razaoSocial: 'Guardada LTDA', perfilPublico: 'jovens', modeloComercial: 'PERMUTA', descricaoPublica: 'Mercado de bairro.' });
  });

  it('tela nova grátis: botão "Grátis" põe R$ 0,00 e grava pela RPC do ponto', async () => {
    const onSalvo = vi.fn();
    render(<Provedor rota="/"><TelaParceiraDialog aberto onFechar={() => {}} pontoId="p1" tela={null} onSalvo={onSalvo} /></Provedor>);
    fireEvent.change(screen.getByLabelText('Onde fica a tela *'), { target: { value: 'Vitrine' } });
    fireEvent.click(screen.getByRole('button', { name: /Grátis/ }));
    expect(screen.getByText(/Tela grátis: o anunciante coloca a mídia sem pagar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Criar tela/ }));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_salvar_tela_parceira', expect.objectContaining({ p_ponto: 'p1', p_tela: null, p_dados: expect.objectContaining({ local: 'Vitrine', valor: '0' }) })));
    expect(onSalvo).toHaveBeenCalled();
    expect(precoTela(0)).toBe('Grátis');
    expect(precoTela(149.9)).toContain('149,90');
  });

  it('banco: valor 0 = GRATUITO (sem cobrança, no ar ao aprovar); só OWNER/ADMIN criam/editam telas e ponto', () => {
    const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20261287_sala_pontos_parceiros.sql'), 'utf8');
    expect(sql).toContain("IF v_origem = 'PORTAL' AND v_valor = 0 THEN v_origem := 'GRATUITO'; END IF;");
    expect(sql).toContain("WHEN v_origem = 'GRATUITO' THEN 'ATIVO'");
    expect(sql).toContain("WHERE asset_id = NEW.id AND status = 'EM_ANALISE' AND origem = 'GRATUITO';");
    expect(sql.match(/IF NOT public\.fn_eh_owner_ou_admin\(\) THEN RAISE EXCEPTION/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("IF p_valor IS NULL OR p_valor < 0 THEN");
  });
});

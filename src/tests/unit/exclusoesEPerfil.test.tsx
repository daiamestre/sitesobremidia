import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-133 a F-136 — tabelas cruas empilham; foto e capa do perfil; exclusões que funcionam e são honestas.
const ler = (arquivo: string) => readFileSync(path.join(process.cwd(), arquivo), 'utf8').replace(/\r\n/g, '\n');

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (f: string, a: unknown) => rpc(f, a) } }));
const avisos = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({ toast: { success: (m: string) => avisos.success(m), error: (m: string) => avisos.error(m) } }));

import { BotaoExcluir } from '@/components/comum/BotaoExcluir';
import { conferirExclusao, mensagemDeExclusao, NADA_EXCLUIDO } from '@/lib/excluir';
import { prepararTabelas } from '@/lib/tabelasResponsivas';
import { caminhoDoPerfil, iniciais } from '@/components/perfil/AvatarCabecalho';

describe('Tabelas escritas à mão também empilham (F-133)', () => {
  it('marca a tabela, rotula as células com o cabeçalho e ignora tabela de documento', () => {
    document.body.innerHTML = `
      <div id="a"><table><thead><tr><th>Representante</th><th>Clientes</th></tr></thead><tbody><tr><td>Ana</td><td>3</td></tr></tbody></table></div>
      <div data-testid="folha-contrato"><table><thead><tr><th>Cláusula</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table></div>
      <div id="c"><table data-tabela-fixa=""><thead><tr><th>Fixa</th></tr></thead><tbody><tr><td>y</td></tr></tbody></table></div>`;
    prepararTabelas();
    const t = document.querySelector('#a table')!;
    expect(t.classList.contains('tabela-empilhada')).toBe(true);
    expect([...t.querySelectorAll('td')].map((td) => td.getAttribute('data-label'))).toEqual(['Representante', 'Clientes']);
    expect(document.querySelector('[data-testid="folha-contrato"] table')!.classList.contains('tabela-empilhada')).toBe(false);
    expect(document.querySelector('#c table')!.classList.contains('tabela-empilhada')).toBe(false);
  });

  it('liga no início do app, menos nas rotas do Player', () => {
    const main = ler('src/main.tsx');
    expect(main).toContain('if (!window.location.pathname.startsWith("/player")) ativarTabelasResponsivas();');
  });
});

describe('Foto de perfil e capa (F-134)', () => {
  it('círculo do perfil fica logo depois do botão de menu e sai do lado do "Novo Cliente"', () => {
    const cab = ler('src/modules/crm/components/Header.tsx');
    expect(cab.indexOf("<AvatarCabecalho ")).toBeGreaterThan(cab.indexOf('aria-label="Abrir menu"'));
    expect(cab.indexOf("<AvatarCabecalho ")).toBeLessThan(cab.indexOf('{/* Center Search Bar */}'));
    expect(cab).not.toContain("gradient-primary flex items-center justify-center text-white font-bold text-sm shadow-md");
    expect(ler('src/layouts/DashboardLayout.tsx')).toMatch(/aria-label="Abrir menu">[\s\S]{0,120}<AvatarCabecalho \/>/);
  });

  it('abre o perfil da área atual e mostra iniciais quando não há foto', () => {
    expect(caminhoDoPerfil('/workspace/clientes')).toBe('/workspace/perfil');
    expect(caminhoDoPerfil('/representantes/dashboard')).toBe('/representantes/perfil');
    expect(caminhoDoPerfil('/dashboard/screens')).toBe('/dashboard/perfil');
    expect(iniciais('Jairan Santos')).toBe('JS');
    expect(iniciais('Daia')).toBe('DA');
  });

  it('capa só para dono e administrador, só na página de perfil; arquivo na pasta do próprio usuário', () => {
    const perfil = ler('src/components/perfil/MeuPerfilBase.tsx');
    expect(perfil).toContain("perfilNome === 'OWNER' || perfilNome === 'ADMIN'");
    expect(perfil).toContain('{temCapa && (');
    expect(perfil).toContain('data-testid="capa-perfil"');
    const servico = ler('src/services/perfil.service.ts');
    expect(servico).toContain('const path = `${user.id}/capa-${Date.now()}.${ext}`;');
    expect(servico).toContain("update({ capa_url: null } as never)");
    expect(ler('src/modules/crm/components/Header.tsx')).not.toContain('capa_url');
    expect(ler('supabase/migrations/20261296_capa_do_perfil.sql')).toContain('ADD COLUMN IF NOT EXISTS capa_url text');
  });
});

describe('Exclusão honesta (F-135)', () => {
  it('zero linhas apagadas vira erro; erros do banco viram mensagem clara', () => {
    expect(() => conferirExclusao({ error: null, count: 1 })).not.toThrow();
    expect(() => conferirExclusao({ error: null, count: 0 })).toThrow(NADA_EXCLUIDO);
    expect(mensagemDeExclusao({ code: '23503', message: 'violates foreign key constraint' })).toContain('está em uso');
    expect(mensagemDeExclusao({ code: '42501', message: 'new row violates row-level security' })).toContain('não tem permissão');
  });

  it('todas as exclusões diretas do painel conferem quantas linhas saíram', () => {
    for (const arq of ['src/hooks/useMedia.ts', 'src/hooks/usePlaylists.ts', 'src/hooks/useScreens.ts', 'src/pages/dashboard/Widgets.tsx',
      'src/pages/dashboard/ExternalLinks.tsx', 'src/components/screens/ScreenScheduleDialog.tsx', 'src/modules/crm/services/playlistCliente.service.ts',
      'src/modules/crm/services/customerCommerce.service.ts', 'src/modules/crm/services/pi.service.ts']) {
      const t = ler(arq);
      expect(t, arq).toContain(".delete({ count: 'exact' })");
      expect(t, arq).not.toMatch(/\.delete\(\)\s*\.eq\('id'/);
    }
  });

  it('banco: agenda da tela ganha regra; administrador apaga conteúdo da empresa; vínculos deixam de travar', () => {
    const sql = ler('supabase/migrations/20261297_exclusoes_que_funcionam.sql');
    expect(sql).toContain('CREATE POLICY agenda_da_tela ON public.screen_schedules FOR ALL TO authenticated');
    expect(sql).toContain("CREATE POLICY empresa_admin_delete ON public.%I FOR DELETE TO authenticated USING (public.fn_admin_da_empresa_do_usuario(user_id))");
    expect(sql).toContain('REFERENCES public.playlists(id) ON DELETE SET NULL');
    expect(sql).toContain('REFERENCES public.produtos(id) ON DELETE CASCADE');
  });
});

describe('Tudo que se cria pode ser excluído (F-136)', () => {
  beforeEach(() => { rpc.mockReset(); avisos.success.mockReset(); avisos.error.mockReset(); });

  it('botão pede confirmação, chama a exclusão central e recarrega a lista', async () => {
    rpc.mockResolvedValue({ data: { status: 'OK', modo: 'APAGADO' }, error: null });
    const onExcluido = vi.fn();
    render(<BotaoExcluir tipo="PROPOSTA" id="p1" nome="PROP-2026-0001" onExcluido={onExcluido} />);
    fireEvent.click(screen.getByTestId('botao-excluir'));
    expect(rpc).not.toHaveBeenCalled();
    expect(await screen.findByText('PROP-2026-0001')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirmar-exclusao'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_excluir_registro', { p_tipo: 'PROPOSTA', p_id: 'p1' }));
    await waitFor(() => expect(onExcluido).toHaveBeenCalled());
    expect(avisos.success).toHaveBeenCalledWith('Proposta excluído(a).');
  });

  it('recusa do banco aparece com o motivo e nada é recarregado', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Esta cobrança já tem pagamento registrado e não pode ser excluída.' } });
    const onExcluido = vi.fn();
    render(<BotaoExcluir tipo="COBRANCA" id="c1" onExcluido={onExcluido} />);
    fireEvent.click(screen.getByTestId('botao-excluir'));
    fireEvent.click(await screen.findByTestId('confirmar-exclusao'));
    await waitFor(() => expect(avisos.error).toHaveBeenCalledWith('Esta cobrança já tem pagamento registrado e não pode ser excluída.'));
    expect(onExcluido).not.toHaveBeenCalled();
  });

  it('função central: confere quem chama, protege dinheiro e veiculação, arquiva o que tem histórico', () => {
    const sql = ler('supabase/migrations/20261298_excluir_registro.sql');
    for (const tipo of ['PROPOSTA', 'PEDIDO_INSERCAO', 'PRODUCAO', 'AGENDAMENTO', 'CAMPANHA', 'REPRESENTANTE', 'PONTO_PARCEIRO', 'COBRANCA', 'CONTATO']) {
      expect(sql).toContain(`WHEN '${tipo}' THEN`);
    }
    expect(sql).toContain("IF v_uid IS NULL THEN RAISE EXCEPTION 'É preciso estar logado para excluir.'");
    expect(sql.match(/IS DISTINCT FROM v_tenant/g)!.length).toBeGreaterThanOrEqual(9);
    expect(sql).toContain('já tem pagamento registrado e não pode ser excluída');
    expect(sql).toContain('já tem boleto ou PIX emitido no banco');
    expect(sql).toContain('tem anúncio no ar ou em andamento');
    expect(sql).toContain("v_modo := 'ARQUIVADO';");
    expect(sql).toContain("'REGISTRO_EXCLUIDO'");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_excluir_registro(text, uuid) FROM PUBLIC, anon;');
  });

  it('as oito telas têm o botão de excluir ligado', () => {
    const telas: Array<[string, string]> = [
      ['src/modules/crm/pages/RepresentantesPage.tsx', 'tipo="REPRESENTANTE"'],
      ['src/modules/crm/pages/PropostasListPage.tsx', 'tipo="PROPOSTA"'],
      ['src/modules/crm/pages/PedidoInsercaoListPage.tsx', 'tipo="PEDIDO_INSERCAO"'],
      ['src/modules/crm/pages/ProductionListPage.tsx', 'tipo="PRODUCAO"'],
      ['src/modules/crm/pages/ScheduleListPage.tsx', 'tipo="AGENDAMENTO"'],
      ['src/modules/crm/pages/BillingDashboard.tsx', 'tipo="COBRANCA"'],
      ['src/modules/corporate/pages/PontoParceiroEdicaoPage.tsx', 'tipo="PONTO_PARCEIRO"'],
      ['src/modules/crm/pages/portal/MinhasCampanhasPage.tsx', 'tipo="CAMPANHA"'],
    ];
    for (const [arq, marca] of telas) expect(ler(arq), arq).toContain(marca);
  });
});

describe('Cadastro de ponto parceiro não duplica (F-137)', () => {
  const wizard = ler('src/modules/crm/pages/prospeccao/PontoParceiroWizardPage.tsx');
  it('o ponto criado ao gerar o contrato é reaproveitado no "Finalizar" e em nova tentativa', () => {
    expect(wizard).toContain('const pontoSalvo = useRef<{ id: string; codigo_publico: string | null } | null>(null);');
    expect(wizard).toContain('let pontoId = pontoSalvo.current?.id;');
    expect(wizard).toContain('let r = pontoSalvo.current;');
    expect(wizard).toContain('await prospeccaoService.atualizarPontoParceiro(r.id, payload);');
    // criar só acontece quando ainda não existe ponto guardado
    expect(wizard.match(/prospeccaoService\.criarPontoParceiro\(payload\)/g)).toHaveLength(2);
    expect(wizard.indexOf('if (!pontoId) {')).toBeLessThan(wizard.indexOf('const r = await prospeccaoService.criarPontoParceiro(payload);'));
  });
  it('a atualização usa a mesma função da edição do ponto', () => {
    expect(ler('src/services/prospeccao.service.ts')).toContain("supabase.rpc('fn_atualizar_ponto_parceiro' as never, {\n      p_ponto: pontoId,");
  });
});

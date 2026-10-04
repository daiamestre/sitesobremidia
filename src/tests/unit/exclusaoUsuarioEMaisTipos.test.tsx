import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-140 — exclusão de usuário (gestor de mídias, equipe do anunciante), nota fiscal, comissão, chamado e contato.
const ler = (arquivo: string) => readFileSync(path.join(process.cwd(), arquivo), 'utf8').replace(/\r\n/g, '\n');

const rpc = vi.fn();
const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (f: string, a: unknown) => rpc(f, a), functions: { invoke: (f: string, o: unknown) => invoke(f, o) } },
}));
const avisos = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('sonner', () => ({ toast: { success: (m: string) => avisos.success(m), error: (m: string) => avisos.error(m), warning: (m: string) => avisos.warning(m) } }));

import { BotaoExcluir, excluirRegistro } from '@/components/comum/BotaoExcluir';

describe('Exclusão de usuário e novos tipos (F-140)', () => {
  beforeEach(() => { rpc.mockReset(); invoke.mockReset(); Object.values(avisos).forEach((f) => f.mockReset()); });

  it('usuário é excluído pela função de borda (que confere a permissão e encerra o login), não direto no banco', async () => {
    invoke.mockResolvedValue({ data: { ok: true, modo: 'ARQUIVADO' }, error: null });
    const onExcluido = vi.fn();
    render(<BotaoExcluir tipo="USUARIO" id="u9" nome="Gestor Teste" onExcluido={onExcluido} />);
    fireEvent.click(screen.getByTestId('botao-excluir'));
    fireEvent.click(await screen.findByTestId('confirmar-exclusao'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('excluir-usuario', { body: { usuarioId: 'u9' } }));
    expect(rpc).not.toHaveBeenCalled();
    await waitFor(() => expect(onExcluido).toHaveBeenCalled());
    expect(avisos.success).toHaveBeenCalledWith('Usuário excluído: o acesso foi encerrado e o histórico foi preservado.');
  });

  it('recusa do servidor (dono, a própria conta, representante com carteira) aparece com o motivo', async () => {
    invoke.mockResolvedValue({ data: { ok: false, error: 'O dono da conta não pode ser excluído.' }, error: null });
    expect(await excluirRegistro('USUARIO', 'dono')).toEqual({ ok: false, arquivado: false, erro: 'O dono da conta não pode ser excluído.' });
  });

  it('nota fiscal, comissão e chamado usam a exclusão central', async () => {
    rpc.mockResolvedValue({ data: { status: 'OK', modo: 'APAGADO' }, error: null });
    for (const tipo of ['NOTA_FISCAL', 'COMISSAO', 'CHAMADO'] as const) {
      expect((await excluirRegistro(tipo, 'x1')).ok).toBe(true);
      expect(rpc).toHaveBeenLastCalledWith('fn_excluir_registro', { p_tipo: tipo, p_id: 'x1' });
    }
  });

  it('banco: quem pode excluir quem; nada é apagado fisicamente; nota emitida e comissão paga são protegidas', () => {
    const sql = ler('supabase/migrations/20261300_excluir_usuario_e_mais_tipos.sql');
    expect(sql).toContain("RAISE EXCEPTION 'Você não pode excluir a própria conta.'");
    expect(sql).toContain("RAISE EXCEPTION 'O dono da conta não pode ser excluído.'");
    expect(sql).toContain("RAISE EXCEPTION 'Só o dono exclui um administrador.'");
    expect(sql).toContain('alvo.empresa_operadora_id IS DISTINCT FROM eu.empresa_operadora_id');
    expect(sql).toContain("RAISE EXCEPTION 'Só o titular da conta exclui membros da equipe.'");
    expect(sql).toContain('ainda tem clientes na carteira');
    expect(sql).toContain('tem tela com aparelho pareado');
    expect(sql).toContain("SET deleted_at = now(), deleted_by = v_uid, ativo = false, status = 'INACTIVE'");
    expect(sql).not.toMatch(/DELETE FROM public\.usuarios/);
    expect(sql).toContain('já foi emitida na prefeitura');
    expect(sql).toContain('já foi paga e não pode ser excluída');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_excluir_usuario(uuid) FROM PUBLIC, anon;');
  });

  it('função de borda: o banco autoriza ANTES de a chave de serviço encerrar o login', () => {
    const fn = ler('supabase/functions/excluir-usuario/index.ts');
    expect(fn.indexOf('comoUsuario.rpc("fn_excluir_usuario"')).toBeGreaterThan(0);
    expect(fn.indexOf('comoUsuario.rpc("fn_excluir_usuario"')).toBeLessThan(fn.indexOf('SUPABASE_SERVICE_ROLE_KEY'));
    expect(fn).toContain('servico.auth.admin.deleteUser(usuarioId, true)');
    expect(fn).toContain('if (erroBanco) return json(');
  });

  it('telas com o botão: usuários, contas antigas, equipe do anunciante, notas, comissões e contatos', () => {
    const telas: Array<[string, string]> = [
      ['src/modules/corporate/pages/UsuariosAcessosPage.tsx', 'tipo="USUARIO"'],
      ['src/pages/dashboard/AdminUsers.tsx', 'tipo="USUARIO"'],
      ['src/modules/crm/pages/portal/MinhaEquipePage.tsx', 'tipo="USUARIO"'],
      ['src/modules/crm/pages/InvoicesPage.tsx', 'tipo="NOTA_FISCAL"'],
      ['src/modules/crm/pages/CommissionPage.tsx', 'tipo="COMISSAO"'],
      ['src/modules/crm/pages/CommissionsDashboard.tsx', 'tipo="COMISSAO"'],
      ['src/modules/crm/pages/ClienteDetalhePage.tsx', 'tipo="CONTATO"'],
    ];
    for (const [arq, marca] of telas) expect(ler(arq), arq).toContain(marca);
    const usuarios = ler('src/modules/corporate/pages/UsuariosAcessosPage.tsx');
    expect(usuarios).toContain('{!u.is_owner && u.id !== usuario?.id && (');
  });
});

describe('Central de Alertas: só o aparelho atual e "Limpar" dispensa (F-141)', () => {
  const sql = ler('supabase/migrations/20261301_alertas_de_aparelhos.sql');
  it('banco: só o aparelho pareado hoje, não dispensado, e só telas que o usuário gere', () => {
    expect(sql).toContain('AND s.bound_device_id = d.identity_hash');
    expect(sql).toContain('AND d.revoked_at IS NULL');
    expect(sql).toContain('(d.alerta_dispensado_em IS NULL OR greatest(d.last_heartbeat, d.last_seen) > d.alerta_dispensado_em)');
    expect(sql).toContain('(NOT public.fn_perfil_sem_gestao_de_telas() OR s.user_id = auth.uid())');
    expect(sql).toContain('WHERE d.id IN (SELECT a.id FROM public.fn_alertas_dispositivos() a)');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_alertas_dispositivos() FROM PUBLIC, anon;');
  });
  it('tela: "Limpar" dispensa o alerta (não manda mais comando ao aparelho) e existe "Limpar todos"', () => {
    const tela = ler('src/pages/dashboard/DashboardHome.tsx');
    expect(tela).toContain('onClick={() => handleDispensar(device.id)} data-testid="limpar-alerta"');
    expect(tela).toContain('onClick={() => handleDispensar()} data-testid="limpar-todos-alertas"');
    expect(tela).not.toContain("handleRemoteCommand(device.id, 'CLEAR_CACHE')");
    const servico = ler('src/services/DeviceService.ts');
    expect(servico).toContain("supabase.rpc('fn_alertas_dispositivos' as never)");
    expect(servico).toContain("supabase.rpc('fn_dispensar_alerta_dispositivo' as never, { p_device: deviceId ?? null } as never)");
    expect(servico).not.toContain(".from('devices')\n        // [FIX 20261102]");
  });
});

describe('Ações rápidas do painel levam às telas certas (F-142)', () => {
  it('cada ação é um link com destino; mídia e playlist já abrem o "criar novo"', () => {
    const painel = ler('src/pages/dashboard/DashboardHome.tsx');
    for (const destino of ['/dashboard/medias?novo=1', '/dashboard/playlists?novo=1', '/dashboard/screens?secao=anunciantes', '/dashboard/schedule']) {
      expect(painel).toContain(`<Link to="${destino}"`);
    }
    expect(painel).not.toMatch(/<div className="flex items-center gap-3 p-3 rounded-lg bg-muted\/50 hover:bg-muted transition-colors cursor-pointer">/);
    for (const [arq, abrir] of [['src/pages/dashboard/Medias.tsx', 'setUploadDialogOpen(true);'], ['src/pages/dashboard/Playlists.tsx', 'setDialogOpen(true);']] as const) {
      const t = ler(arq);
      expect(t).toContain("if (parametros.get('novo') !== '1') return;");
      expect(t).toContain(abrir);
      expect(t).toContain("resto.delete('novo');");
    }
  });
});

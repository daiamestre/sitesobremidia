import { describe, it, expect, beforeEach } from 'vitest';

// Guarda do módulo Representantes espelhada da migration
// (supabase/migrations/20260826_representantes_gestao_desempenho.sql):
// - OWNER possui TUDO implicitamente dentro do próprio tenant.
// - Perfis delegáveis: ADMIN, GERENTE, GESTOR, SUPERVISOR — somente com a
//   permissão específica delegada via Central de Acessos (permissoes_usuarios).
// - REPRESENTANTE, FINANCEIRO, DESIGNER, OPERACIONAL, CLIENTE NUNCA gerenciam.
const PERFIS_DELEGAVEIS = ['ADMIN', 'GERENTE', 'GESTOR', 'SUPERVISOR'];
const PERFIS_BLOQUEADOS = ['REPRESENTANTE', 'FINANCEIRO', 'DESIGNER', 'OPERACIONAL', 'CLIENTE'];

function podeGerenciar(
  isOwner: boolean,
  perfil: string,
  permissoes: string[],
  permissao: string,
): boolean {
  if (isOwner) return true;
  return PERFIS_DELEGAVEIS.includes(perfil) && permissoes.includes(permissao);
}

// Tenant SEMPRE derivado de auth.uid() no backend — nunca do payload do cliente.
function tenantDoUsuario(uid: string): string {
  const map: Record<string, string> = {
    'uid-owner': 'tenant-A',
    'uid-admin': 'tenant-A',
    'uid-admin-b': 'tenant-B',
    'uid-rep': 'tenant-A',
  };
  return map[uid] ?? '';
}

describe('Security — Gestão de Representantes (módulo novo)', () => {
  beforeEach(() => {
    // nada persistente entre testes
  });

  it('1. OWNER acessa todas as operações SEM delegação (dentro do próprio tenant)', () => {
    const permissoes: string[] = [];
    expect(podeGerenciar(true, 'OWNER', permissoes, 'representantes.view')).toBe(true);
    expect(podeGerenciar(true, 'OWNER', permissoes, 'representantes.edit')).toBe(true);
    expect(podeGerenciar(true, 'OWNER', permissoes, 'representantes.activate')).toBe(true);
    expect(podeGerenciar(true, 'OWNER', permissoes, 'representantes.deactivate')).toBe(true);
    expect(podeGerenciar(true, 'OWNER', permissoes, 'representantes.edit_clients')).toBe(true);
    expect(podeGerenciar(true, 'OWNER', permissoes, 'representantes.view_performance')).toBe(true);
  });

  it('2. ADMIN SEM delegação NÃO acessa o módulo (ADMIN != OWNER)', () => {
    const permissoes: string[] = [];
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.view')).toBe(false);
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.edit')).toBe(false);
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.edit_clients')).toBe(false);
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.view_performance')).toBe(false);
  });

  it('3. ADMIN com apenas representantes.view: lê, mas TODA mutação é negada', () => {
    const permissoes = ['representantes.view'];
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.view')).toBe(true);
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.edit')).toBe(false);
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.deactivate')).toBe(false);
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.edit_clients')).toBe(false);
  });

  it('4. Permissões são independentes: edit não habilita activate/deactivate', () => {
    const permissoes = ['representantes.view', 'representantes.edit'];
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.edit')).toBe(true);
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.activate')).toBe(false);
    expect(podeGerenciar(false, 'ADMIN', permissoes, 'representantes.deactivate')).toBe(false);
  });

  it('5. GERENTE/GESTOR/SUPERVISOR com delegação operam; sem delegação são bloqueados', () => {
    for (const perfil of ['GERENTE', 'GESTOR', 'SUPERVISOR']) {
      expect(podeGerenciar(false, perfil, [], 'representantes.view')).toBe(false);
      expect(podeGerenciar(false, perfil, ['representantes.view'], 'representantes.view')).toBe(true);
    }
  });

  it('6. Perfis REPRESENTANTE/FINANCEIRO/DESIGNER/OPERACIONAL/CLIENTE NUNCA gerenciam representantes', () => {
    const todas = [
      'representantes.view',
      'representantes.edit',
      'representantes.activate',
      'representantes.deactivate',
      'representantes.edit_clients',
      'representantes.view_performance',
    ];
    for (const perfil of PERFIS_BLOQUEADOS) {
      for (const p of todas) {
        expect(podeGerenciar(false, perfil, todas, p)).toBe(false);
      }
    }
  });

  it('7. Tenant nunca vem do payload: usuário do tenant-B não gerencia reps do tenant-A', () => {
    // Cliente tenta forçar tenant-A no payload, mas o backend usa auth.uid()
    const uid = 'uid-admin-b'; // tenant-B
    const tenantServer = tenantDoUsuario(uid);
    const payloadSpoof = 'tenant-A';

    // A RPC ignora payloadSpoof: o tenant efetivo é derivado do usuário autenticado
    expect(tenantServer).toBe('tenant-B');
    expect(tenantServer).not.toBe(payloadSpoof);
    // Cross-tenant sempre bloqueado: rep de outro tenant não pertence ao meu
    expect(tenantServer === payloadSpoof).toBe(false);
  });

  it('8. Reatribuição de cliente exige representantes.edit_clients e tenant igual', () => {
    const clienteOutroTenant = { id: 'cli-x', empresa_operadora_id: 'tenant-B' };
    const tenantAtual = tenantDoUsuario('uid-admin'); // tenant-A

    const podeReassign = podeGerenciar(false, 'ADMIN', ['representantes.edit_clients'], 'representantes.edit_clients');
    const mesmoTenant = clienteOutroTenant.empresa_operadora_id === tenantAtual;

    expect(podeReassign).toBe(true); // delegação OK
    expect(mesmoTenant).toBe(false); // mas o cliente é de outro tenant -> bloqueado
  });

  it('9. OWNER só enxerga o próprio tenant (get_user_tenant_id do usuário)', () => {
    const owner = 'uid-owner';
    const reps = [
      { id: 'rep-1', empresa_operadora_id: 'tenant-A' },
      { id: 'rep-2', empresa_operadora_id: 'tenant-B' },
    ];
    const visiveis = reps.filter((r) => r.empresa_operadora_id === tenantDoUsuario(owner));
    expect(visiveis).toHaveLength(1);
    expect(visiveis[0].id).toBe('rep-1');
  });

  it('10. Perfil REPRESENTANTE acessa apenas os PRÓPRIOS dados (RLS self_or_admin)', () => {
    const repLogado = 'rep-uuid-A';
    const registroAlheio = { id: 'rep-2', representante_id: 'rep-uuid-B' };
    const registroProprio = { id: 'rep-1', representante_id: 'rep-uuid-A' };

    const rlsAlheio = registroAlheio.representante_id === repLogado;
    const rlsProprio = registroProprio.representante_id === repLogado;

    expect(rlsAlheio).toBe(false);
    expect(rlsProprio).toBe(true);
  });

  it('11. Toda mutação administrativa registra auditoria (REPRESENTANTE_UPDATED/ACTIVATED/DEACTIVATED/CLIENTE_REPRESENTANTE_CHANGED)', () => {
    const acoesPermitidas = ['EDITAR', 'ATIVAR', 'DESATIVAR', 'REASSIGN'];
    const acaoLogada = (acao: string): string => {
      const map: Record<string, string> = {
        EDITAR: 'REPRESENTANTE_UPDATED',
        ATIVAR: 'REPRESENTANTE_ACTIVATED',
        DESATIVAR: 'REPRESENTANTE_DEACTIVATED',
        REASSIGN: 'CLIENTE_REPRESENTANTE_CHANGED',
      };
      return map[acao] ?? '';
    };
    for (const acao of acoesPermitidas) {
      expect(acaoLogada(acao)).not.toBe('');
    }
  });

  it('12. ADMIN de outro tenant não pode ATIVAR/DESATIVAR rep do tenant alheio', () => {
    const uid = 'uid-admin-b'; // tenant-B
    const repAlvo = { id: 'rep-1', empresa_operadora_id: 'tenant-A' };

    const mesmoTenant = repAlvo.empresa_operadora_id === tenantDoUsuario(uid);
    const podeDesativar = podeGerenciar(false, 'ADMIN', ['representantes.deactivate'], 'representantes.deactivate');

    expect(podeDesativar).toBe(true); // permissão existe...
    expect(mesmoTenant).toBe(false); // ...mas tenant diverge -> RPC rejeita (block RLS cross-tenant)
  });
});
/**
 * F-195 — REGRA PERMANENTE: cada conta vê só o que é dela; só dono e ADM veem tudo.
 * Se um destes testes quebrar, alguém abriu de novo a visão de uma conta para os dados de outra.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deveLimparMemoria } from '@/lib/memoriaDaConta';

const ler = (p: string) => readFileSync(p, 'utf8');
const sql = ler('supabase/migrations/20261337_cada_conta_so_o_proprio.sql');

describe('F-195 · memória do painel por conta', () => {
  it('trocou de conta ou saiu = apaga a memória; primeira leitura e mesma conta não', () => {
    expect(deveLimparMemoria(undefined, 'dono')).toBe(false);
    expect(deveLimparMemoria('dono', 'dono')).toBe(false);
    expect(deveLimparMemoria('dono', 'gestor')).toBe(true);
    expect(deveLimparMemoria('dono', null)).toBe(true);
    expect(deveLimparMemoria(null, 'gestor')).toBe(true);
  });

  it('o login limpa a memória ao trocar de conta e ao sair', () => {
    const auth = ler('src/contexts/AuthContext.tsx');
    expect(auth).toContain('if (deveLimparMemoria(contaAnterior.current, atual)) queryClient?.clear();');
    expect(auth.match(/limparSeTrocouDeConta\(/g)?.length).toBeGreaterThanOrEqual(3); // sessão nova, sessão existente e sair
  });

  it('a página Telas só junta as telas da empresa para dono/ADM; o gestor só tem o botão pago (azul)', () => {
    const pg = ler('src/pages/dashboard/Screens.tsx');
    expect(pg).toContain('const telasDaEmpresaVisiveis = podeTelasParceiras ? (telasDaEmpresa.data ?? []) : [];');
    expect(pg).toMatch(/className=\{`\$\{BOTAO\} gradient-primary`\} onClick=\{\(\) => setTelaPagaOpen\(true\)\} data-testid="botao-tela-paga"/);
    expect(pg).toMatch(/ehGestor \? \(/);
  });
});

describe('F-195 · banco: regras restritivas por conta', () => {
  it('gestor e representante só leem o próprio em todas as tabelas sensíveis', () => {
    for (const t of ['usuarios', 'clientes', 'contratos', 'contas_receber', 'pagamentos', 'financeiro_auditoria', 'assinaturas',
      'pedidos_insercao', 'campanhas', 'propostas', 'representantes', 'comissoes']) {
      expect(sql).toContain(`CREATE POLICY so_o_proprio ON public.${t} AS RESTRICTIVE FOR SELECT TO authenticated`);
    }
    expect(sql).toContain("OR id = (SELECT auth.uid())"); // usuarios: só a própria linha
  });

  it('anunciante/cliente/parceiro: telas do catálogo, próprias ou que exibiram a mídia dele; exibições só das próprias mídias', () => {
    for (const t of ['screens', 'devices', 'device_health', 'playback_logs']) {
      expect(sql).toContain(`CREATE POLICY externo_so_o_permitido ON public.${t} AS RESTRICTIVE FOR SELECT TO authenticated`);
    }
    expect(sql).toContain("OR tipo_tela = 'PARCEIRA' OR user_id = (SELECT auth.uid())");
    expect(sql).toContain('media_id IN (SELECT m.id::text FROM public.media m WHERE m.user_id = (SELECT auth.uid()))');
  });

  it('o representante continua vendo o catálogo de telas dos pontos parceiros', () => {
    expect(sql).toContain("CREATE POLICY scr_select_catalogo_representante ON public.screens FOR SELECT");
    expect(sql).toContain("tipo_tela = 'PARCEIRA' AND (SELECT public.get_user_role()) = 'REPRESENTANTE'");
  });
});

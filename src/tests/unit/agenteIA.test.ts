// F-223 — "Trabalhar com IA": regras do agente (sem banco).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  PROVEDORES, ferramentas, hojeSP, instrucoes, situacaoDaCobranca, situacaoDaTela, tempoDesde, validarCobranca,
} from '../../../supabase/functions/_shared/agente/ferramentas';

describe('agente Trabalhar com IA', () => {
  it('usa só os 3 provedores grátis, na ordem Groq → Google AI Studio → OpenRouter (modelo :free)', () => {
    expect(PROVEDORES.map((p) => p.nome)).toEqual(['Groq', 'Google AI Studio', 'OpenRouter']);
    expect(PROVEDORES[2].modelo.endsWith(':free')).toBe(true);
  });

  it('tela no ar segue a regra da página Telas (aparelho pareado e sinal há menos de 3 min)', () => {
    const agora = Date.parse('2026-10-31T12:00:00Z');
    expect(situacaoDaTela({ bound_device_id: 'x', last_ping_at: '2026-10-31T11:59:00Z' }, agora).situacao).toBe('no ar');
    expect(situacaoDaTela({ bound_device_id: 'x', last_ping_at: '2026-10-31T11:50:00Z' }, agora)).toEqual({ situacao: 'fora do ar', minutos: 10 });
    expect(situacaoDaTela({ bound_device_id: null, last_ping_at: '2026-10-31T11:59:30Z' }, agora).situacao).toBe('sem aparelho');
    expect(tempoDesde(null)).toBe('nunca enviou sinal');
    expect(tempoDesde(3000)).toBe('há 2 dias');
  });

  it('situação da cobrança entende os nomes do banco (PAGO/PAGA, CANCELADO/CANCELADA, ATRASADO)', () => {
    expect(situacaoDaCobranca('PAGA', '2026-10-01', '2026-10-31')).toBe('paga');
    expect(situacaoDaCobranca('CANCELADO', '2026-10-01', '2026-10-31')).toBe('cancelada');
    expect(situacaoDaCobranca('ATRASADO', '2026-11-30', '2026-10-31')).toBe('vencida');
    expect(situacaoDaCobranca('PENDENTE', '2026-10-30', '2026-10-31')).toBe('vencida');
    expect(situacaoDaCobranca('PENDENTE', '2026-11-30', '2026-10-31')).toBe('aberta');
  });

  it('cobrança proposta precisa de valor positivo, vencimento válido e não passado', () => {
    const hoje = '2026-10-31';
    expect(validarCobranca({ valor: 150, vencimento: '2026-11-20' }, hoje)).toEqual([]);
    expect(validarCobranca({ valor: 0, vencimento: '2026-11-20' }, hoje).length).toBe(1);
    expect(validarCobranca({ valor: 10, vencimento: '20/11/2026' }, hoje)[0]).toContain('AAAA-MM-DD');
    expect(validarCobranca({ valor: 10, vencimento: '2026-10-01' }, hoje)[0]).toContain('passado');
    expect(validarCobranca({ valor: 500000, vencimento: '2026-11-20' }, hoje)[0]).toContain('Central de Cobranças');
  });

  it('criar cobrança só existe para quem pode cobrar, e só como PROPOSTA', () => {
    const nomes = (pode: boolean) => ferramentas(pode).map((f) => f.function.name);
    expect(nomes(false)).not.toContain('propor_cobranca');
    expect(nomes(true)).toContain('propor_cobranca');
    expect(ferramentas(true).find((f) => f.function.name === 'propor_cobranca')!.function.description).toContain('NÃO cria');
    expect(instrucoes({ hoje: '2026-10-31', papel: 'ADMIN', podeCobrar: true, nome: 'X' })).toContain('Confirmar');
    expect(instrucoes({ hoje: '2026-10-31', papel: 'GESTOR', podeCobrar: false, nome: 'X' })).toContain('não tem permissão');
    expect(hojeSP(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10-31');
  });

  it('a função cria a cobrança com o LOGIN da pessoa, só depois de confirmar, e registra na auditoria', () => {
    const fn = fs.readFileSync('supabase/functions/agente-ia/index.ts', 'utf8');
    expect(fn).toMatch(/c\.usuario\.from\('contas_receber'\)\.insert/);
    expect(fn).not.toMatch(/srv\.from\('contas_receber'\)/);
    expect(fn).toContain("financeiro_auditoria");
    expect(fn).toContain("'Esta ação já foi decidida.'");
    const sql = fs.readFileSync('supabase/migrations/20261355_agente_ia.sql', 'utf8');
    expect(sql).toContain("in ('OWNER', 'ADMIN', 'FINANCEIRO')");
    expect(sql).toContain('using (usuario_id = auth.uid())');
  });
});

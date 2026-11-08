// F-268 (MG-AUT-12) — memória de estilo por cliente, com consentimento (prova no banco: scripts/ops/teste-preferencias.sql, 14/14).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { aplicarEstilo, pedidoDaConversa } from '../../../supabase/functions/_shared/agente/studio';
import { ferramentas, instrucoes } from '../../../supabase/functions/_shared/agente/ferramentas';

const ESTILO = { tom: 'Alegre e popular', estabelecimento: 'Mercado Bom Preço', formato: '9:16', paleta: ['#0A9A50', '#FFD21F'], observacoes: 'logo sempre no canto' };
const BASE = { titulo: 'Ofertas', ideia: 'Ofertas do fim de semana', categoria: 'Supermercado' };

describe('estilo guardado do cliente', () => {
  it('preenche só o que a pessoa não disse agora e conta o que usou', () => {
    const r = aplicarEstilo({ ...BASE, tom: 'Impactante' }, ESTILO);
    expect(r.args.tom).toBe('Impactante'); // o pedido atual vale mais
    expect(r.args).toMatchObject({ estabelecimento: 'Mercado Bom Preço', formato: '9:16' });
    expect(r.args.ideia).toMatch(/Estilo guardado do cliente: cores da marca #0A9A50, #FFD21F; logo sempre no canto/);
    expect(r.usados).toEqual(expect.arrayContaining(['nome da loja', 'formato 9:16', 'cores da marca']));
    expect(r.usados.join(' ')).not.toMatch(/tom/);
    expect(pedidoDaConversa(r.args, '').pedido).toMatchObject({ formato: '9:16', briefing: { estabelecimento: 'Mercado Bom Preço' } });
  });

  it('sem estilo (ou ignorado) nada muda; valor fora da lista é descartado', () => {
    expect(aplicarEstilo(BASE, null)).toEqual({ args: BASE, usados: [] });
    expect(aplicarEstilo(BASE, { tom: 'Tom inventado', formato: '4:3' }).usados).toEqual([]);
  });

  it('a migração exige consentimento, limita campos, não abre a tabela e só o dono do dado grava/apaga', () => {
    const sql = fs.readFileSync('supabase/migrations/20261362_preferencias_do_cliente.sql', 'utf8');
    expect(sql).toMatch(/if coalesce\(p_consentimento, false\) is not true then/);
    expect(sql).toMatch(/'consentimento', jsonb_build_object\('aceito', true, 'em', now\(\), 'por', auth\.uid\(\)/);
    expect(sql).toMatch(/c ~ '\^#\[0-9A-Fa-f\]\{6\}\$' limit 6/);
    expect(sql).not.toMatch(/create table|grant (insert|update|delete)/i);
    expect(sql).toMatch(/Esse estilo é de outro cliente/);
    expect(sql).toMatch(/Cliente de outra empresa/);
    expect(sql).toMatch(/delete from public\.studio_conhecimento where escopo = 'cliente' and cliente_id = a\.cliente and tipo = 'preferencia'/);
  });

  it('a Central só guarda com consentimento explícito e oferece apagar', () => {
    const g = ferramentas(false).find((f) => f.function.name === 'guardar_estilo')!;
    expect((g.function.parameters as { required: string[] }).required).toContain('consentimento_explicito');
    expect(ferramentas(false).map((f) => f.function.name)).toEqual(expect.arrayContaining(['estilo_do_cliente', 'guardar_estilo', 'apagar_estilo']));
    expect(instrucoes({ hoje: '2026-11-08', papel: 'OWNER', podeCobrar: true, nome: '' })).toMatch(/Só use guardar_estilo quando a pessoa pedir para guardar e autorizar/);
  });
});

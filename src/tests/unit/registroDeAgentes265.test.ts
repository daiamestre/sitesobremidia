// F-265 (MG-AUT-03/04) — o registro central de agentes corresponde ao código real (nem agente fantasma, nem agente fora).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { AGENTES, CONTRATOS, PLANEJADOS, agentePorId } from '../../../supabase/functions/_shared/agentes/registro';
import { PROVEDORES } from '../../../supabase/functions/_shared/ia/provedores';
import { ferramentas } from '../../../supabase/functions/_shared/agente/ferramentas';

const ler = (f: string) => fs.readFileSync(f, 'utf8');

describe('registro central de agentes', () => {
  it('ids únicos e todos os campos de governança preenchidos', () => {
    expect(new Set(AGENTES.map((a) => a.id)).size).toBe(AGENTES.length);
    for (const a of AGENTES) {
      for (const k of ['nome', 'motor', 'versao', 'finalidade', 'escopo', 'limites', 'qualidade', 'falha', 'auditoria'] as const) expect(a[k], `${a.id}.${k}`).toBeTruthy();
      expect(a.ferramentas.length, a.id).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(a.nivel);
      for (const p of a.provedores) expect(p === 'local' || PROVEDORES.some((x) => x.id === p), `${a.id} → ${p}`).toBe(true);
    }
  });

  it('cada agente do Studio no código está registrado (tipo RegistroAgente + etapas gravadas pelo orquestrador)', () => {
    const tipo = ler('supabase/functions/_shared/studio/agentes.ts').match(/agente: ((?:'[a-z-]+'\s*\|?\s*)+);/)![1];
    const doTipo = [...tipo.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    const doOrquestrador = [...ler('supabase/functions/studio-orquestrador/index.ts').matchAll(/agente: '([a-z-]+)'/g)].map((m) => m[1]);
    for (const id of new Set([...doTipo, ...doOrquestrador])) expect(agentePorId(id), `agente "${id}" usado no código e ausente do registro`).not.toBeNull();
  });

  it('as ferramentas do agente-ia no registro são EXATAMENTE as que o modelo recebe', () => {
    const reais = ferramentas(true).map((f) => f.function.name).sort();
    expect([...agentePorId('agente-ia')!.ferramentas].sort()).toEqual(reais);
    const executar = ler('supabase/functions/agente-ia/index.ts');
    for (const f of reais) expect(executar, `ferramenta ${f} sem implementação`).toMatch(new RegExp(`\\b${f}:`));
  });

  it('contratos de execução usam os estados que o BANCO aceita (CHECK das tabelas)', () => {
    expect(CONTRATOS['agente-ia'].estados).toEqual(['PENDENTE', 'EXECUTADA', 'CANCELADA', 'FALHA', 'EXPIRADA']);
    const mig = ler('supabase/migrations/20261349_studio_ia_producoes.sql');
    for (const e of CONTRATOS['studio-orquestrador'].estados) expect(mig, `estado ${e}`).toContain(`'${e}'`);
  });

  it('planejados não aparecem como implementados', () => {
    for (const p of PLANEJADOS) expect(AGENTES.some((a) => a.id === p || a.nome.toLowerCase() === p.toLowerCase())).toBe(false);
  });
});

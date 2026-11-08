// F-260 — MEMÓRIA DO SISTEMA no repositório: qualquer IA, IDE ou janela nova acha onde o trabalho parou, o que falta,
// as regras do dono e o padrão de encartes e palcos. Este teste impede que a memória apodreça: caminhos citados existem,
// os atalhos de cada ferramenta apontam para ela, as pendências são lidas e nada secreto entra (o repositório é público).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pendencias, ultimasEntregas } from '../../../scripts/ops/onde-paramos.mjs';
import { textoDoDna, PADRAO_DOS_OFICIAIS, REFERENCIA_FARMACIA } from '../../../supabase/functions/_shared/studio/core/dna';

const ler = (f: string) => fs.readFileSync(f, 'utf8');
// F-262: os documentos da SOBRE MÍDIA Autônoma também são memória (caminhos válidos, nada secreto)
const MEMORIA = ['docs/ESTADO_DO_SISTEMA.md', 'docs/DECISOES_DO_DONO.md', 'docs/studio/PADRAO_DE_ENCARTES_E_PALCOS.md',
  'docs/autonomia/SOBRE_MIDIA_AUTONOMIA_RELATORIO_MESTRE.md', 'docs/autonomia/REGISTRO_DE_AGENTES.md',
  'docs/autonomia/PROVEDORES_DE_IA.md', 'docs/autonomia/JARVIS_INTEGRACAO.md'];
const ATALHOS = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.windsurfrules', '.github/copilot-instructions.md', '.cursor/rules/sobremidia.mdc'];

describe('memória do sistema', () => {
  it('os documentos existem e todo atalho de ferramenta aponta para o estado e as decisões', () => {
    for (const f of [...MEMORIA, ...ATALHOS, 'scripts/ops/onde-paramos.mjs']) expect(fs.existsSync(f), f).toBe(true);
    for (const f of ATALHOS) {
      const t = ler(f);
      expect(t, f).toContain('docs/ESTADO_DO_SISTEMA.md');
      expect(t, f).toContain('docs/DECISOES_DO_DONO.md');
    }
    expect(ler('.cursor/rules/sobremidia.mdc')).toMatch(/^---\ndescription: .+\nalwaysApply: true\n---/);
  });

  it('todo caminho citado nos documentos de memória existe no repositório', () => {
    const faltando: string[] = [];
    for (const f of [...MEMORIA, 'docs/MAPA_DO_PROJETO.md']) {
      for (const [, p] of ler(f).matchAll(/`((?:src|docs|scripts|supabase|public|native-android-player|\.claude|\.github)\/[^`\s]+)`/g)) {
        if (/[<{*…]/.test(p)) continue; // modelos de caminho (<id>, {v,h})
        const caminho = p.replace(/:\d+$/, '').replace(/\/$/, '');
        if (!fs.existsSync(caminho)) faltando.push(`${f}: ${p}`);
      }
    }
    expect(faltando).toEqual([]);
  });

  it('as skills citadas existem', () => {
    for (const s of ['deploy-producao', 'release-player', 'migracao-segura', 'conteudo-automatico', 'conferir-painel', 'encartes-e-palcos', 'retomar-trabalho']) {
      expect(fs.existsSync(`.claude/skills/${s}/SKILL.md`), s).toBe(true);
    }
  });

  it('as pendências são lidas com número único, situação e passos', () => {
    const lista = pendencias(ler('docs/ESTADO_DO_SISTEMA.md'));
    expect(lista.length).toBeGreaterThan(5);
    expect(new Set(lista.map((p) => p.id)).size).toBe(lista.length);
    for (const p of lista) expect(p.situacao, p.id).toMatch(/🟥|🟧|🟨|✅/);
    expect(lista.find((p) => p.id === 'P-06')!.texto).toContain('semear-conhecimento');
    expect(ultimasEntregas('### F-1 — a\n### F-2 — b', 1)).toEqual(['F-2 — b']);
  });

  it('nada secreto nem pessoal nos documentos de memória (repositório público)', () => {
    for (const f of [...MEMORIA, ...ATALHOS]) {
      const t = ler(f);
      expect(t, f).not.toMatch(/gsk_|sk-or-v1|sk-proj-|sbp_[0-9a-f]|AQ\.Ab8|eyJhbGci/);
      expect(t, f).not.toMatch(/@gmail\.com/);
    }
  });

  it('decisões de arquitetura (F-262): uma por linha, JSON válido, com os campos que o dono exigiu', () => {
    const linhas = ler('docs/autonomia/decisoes_de_arquitetura.jsonl').trim().split('\n');
    expect(linhas.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const l of linhas) {
      const d = JSON.parse(l);
      for (const campo of ['id', 'data', 'estado', 'responsavel', 'contexto', 'problema', 'decisao', 'justificativa', 'impacto', 'arquivos', 'evidencia']) expect(d[campo], `${d.id}.${campo}`).toBeTruthy();
      expect(ids.has(d.id), d.id).toBe(false);
      ids.add(d.id);
    }
    expect(ler('docs/autonomia/decisoes_de_arquitetura.jsonl')).not.toMatch(/gsk_|sk-or-v1|sk-proj-|sbp_[0-9a-f]|eyJhbGci|@gmail\.com/);
    expect(fs.existsSync('scripts/ops/teste-isolamento.sql')).toBe(true);
  });

  it('os agentes do Studio recebem o padrão dos encartes e palcos e a regra da farmácia', () => {
    const dna = textoDoDna();
    expect(PADRAO_DOS_OFICIAIS.length).toBeGreaterThan(3);
    expect(dna).toContain('Padrão dos encartes e palcos oficiais');
    expect(dna).toContain('A PERSISTIREM OS SINTOMAS');
    expect(REFERENCIA_FARMACIA.regras.join(' ')).toMatch(/isento de prescrição/);
  });
});

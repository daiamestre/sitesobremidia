/**
 * F-158 — Painel compacto: os cartões ficam LADO A LADO em celular, tablet e PC (nunca um em cima do outro) e o mapa de
 * contagem ("Onde a rede está") aparece só na tela inicial pública, abaixo das opções de acesso — o painel do
 * gestor não repete mapa.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('cartões do painel lado a lado em qualquer tela', () => {
  const painel = ler('src/components/dashboard/PainelCompleto.tsx');

  it('as três fileiras usam colunas fixas, sem quebrar para uma coluna em tela pequena', () => {
    expect(painel).toContain('<div className="grid grid-cols-3 gap-2 sm:gap-3">'); // indicadores
    expect(painel).toContain('<div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2 sm:gap-3">'); // mapa + sincronização
    const fileiras = painel.match(/<div className="grid grid-cols-3 gap-2 sm:gap-3">/g) ?? [];
    expect(fileiras).toHaveLength(2); // indicadores e a fileira de baixo (ligadas, status, desatualizado)
    // nenhuma grade do painel começa em 1 coluna nem depende de lg/md para ficar lado a lado
    expect(painel).not.toMatch(/className="grid (gap-\d+ )?(md|lg|xl):grid-cols/);
    expect(painel).not.toMatch(/className="grid grid-cols-1/);
  });

  it('o texto encolhe no celular em vez de empilhar', () => {
    expect(painel).toContain('text-xl font-bold sm:text-3xl');
    expect(painel).toContain('p-2 pb-1 sm:p-4 sm:pb-2'); // cartão com menos folga
    expect(painel).toContain('h-24 w-24 -rotate-90 sm:h-36 sm:w-36'); // rosca menor
  });
});

describe('só um mapa por tela', () => {
  it('o painel do gestor/owner tem o mapa da sincronização e NÃO repete o mapa de contagem', () => {
    const rede = ler('src/components/rede/RedePorEstabelecimento.tsx');
    expect(rede).not.toContain('MapaDaRede');
    expect(rede).not.toContain('Onde a rede está');
    expect(ler('src/components/dashboard/PainelCompleto.tsx')).toContain('data-testid="mapa-sincronizacao"');
  });

  it('o mapa de contagem fica na tela inicial pública, depois das opções de acesso', () => {
    const inicio = ler('src/pages/Index.tsx');
    const acessos = inicio.indexOf('data-testid="opcao-acesso"');
    const mapa = inicio.indexOf('<RedePublica />');
    expect(acessos).toBeGreaterThan(-1);
    expect(mapa).toBeGreaterThan(acessos);
    expect(ler('src/components/rede/RedePublica.tsx')).toContain('<MapaDaRede linhas={presenca} />');
  });

  it('nenhuma outra tela do painel usa o mapa de contagem', () => {
    const quem = ['src/pages/dashboard/DashboardHome.tsx', 'src/components/central/CentralDoDiaGestor.tsx', 'src/components/central/CentralDoDiaMidiasOwner.tsx']
      .filter((f) => ler(f).includes('MapaDaRede'));
    expect(quem).toEqual([]);
  });
});

describe('o resto do painel inicial também fica compacto', () => {
  const home = ler('src/pages/dashboard/DashboardHome.tsx');
  it('saúde da frota em 4 colunas e ações rápidas ao lado da atividade recente', () => {
    expect(home).toContain('<div className="grid grid-cols-4 gap-2 sm:gap-3">');
    expect(home).toContain('<div className="grid grid-cols-2 gap-3 sm:gap-6">');
  });
});

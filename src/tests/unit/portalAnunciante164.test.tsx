import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { emBoasVindas, aberturaDoPortal, JANELA_DE_BOAS_VINDAS_MS } from '@/lib/boasVindas';

// F-164 — portal do anunciante: boas-vindas só no 1º dia, cartões do painel funcionais, mapa em pontos parceiros, menu reordenado.
const lerArquivo = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.com', name: 'Anunciante Teste' }, usuario: { cargo: 'Anunciante', cliente_id: 'c1', nome: 'Anunciante Teste' }, signOut: vi.fn() }),
}));
vi.mock('@/hooks/useCentral', () => ({ useCentralUnread: () => ({ total: 3 }) }));
vi.mock('@/modules/crm/hooks/useClienteModalidade', () => ({
  useClienteModalidade: () => ({ modalidade: 'ANUNCIANTE', cliente: { nome_fantasia: 'Cliente X' }, isLoading: false, hasActiveContract: true, isHost: false, isHibrido: false, isAnunciante: true }),
}));

import CustomerPortalLayout from '@/modules/crm/layout/CustomerPortalLayout';

// 08/10/2026 em horários de Brasília (UTC-3)
const BRT = (h: number, m = 0) => Date.UTC(2026, 9, 8, h + 3, m);

describe('Boas-vindas só no primeiro dia', () => {
  const primeiro = new Date(BRT(9)).toISOString();

  it('até 24 h depois do primeiro acesso: Bem-vindo(a)', () => {
    expect(emBoasVindas(primeiro, BRT(9))).toBe(true);
    expect(emBoasVindas(primeiro, BRT(9) + JANELA_DE_BOAS_VINDAS_MS - 1)).toBe(true);
    expect(aberturaDoPortal({ nome: 'Padaria Sol', primeiroAcessoEm: primeiro, agoraMs: BRT(15) })).toEqual({ tipo: 'boas-vindas', texto: 'Bem-vindo(a), Padaria Sol!' });
  });

  it('depois de 24 h: Olá, <estabelecimento> — Bom dia / Boa tarde / Boa noite (hora de Brasília)', () => {
    const depois = BRT(9) + JANELA_DE_BOAS_VINDAS_MS; // exatamente 24 h
    expect(emBoasVindas(primeiro, depois)).toBe(false);
    expect(aberturaDoPortal({ nome: 'Padaria Sol', primeiroAcessoEm: primeiro, agoraMs: BRT(8) + 2 * 86_400_000 }).texto).toBe('Olá, Padaria Sol — Bom dia!');
    expect(aberturaDoPortal({ nome: 'Padaria Sol', primeiroAcessoEm: primeiro, agoraMs: BRT(14) + 2 * 86_400_000 }).texto).toBe('Olá, Padaria Sol — Boa tarde!');
    expect(aberturaDoPortal({ nome: 'Padaria Sol', primeiroAcessoEm: primeiro, agoraMs: BRT(21) + 2 * 86_400_000 }).texto).toBe('Olá, Padaria Sol — Boa noite!');
    expect(aberturaDoPortal({ nome: 'Padaria Sol', primeiroAcessoEm: primeiro, agoraMs: BRT(2) + 2 * 86_400_000 }).texto).toBe('Olá, Padaria Sol — Boa noite!');
  });

  it('sem data do primeiro acesso (ou inválida) não mostra boas-vindas', () => {
    expect(emBoasVindas(null, BRT(9))).toBe(false);
    expect(emBoasVindas(undefined, BRT(9))).toBe(false);
    expect(emBoasVindas('lixo', BRT(9))).toBe(false);
    expect(aberturaDoPortal({ nome: ' Loja X ', primeiroAcessoEm: null, agoraMs: BRT(10) }).texto).toBe('Olá, Loja X — Bom dia!');
  });

  it('relógio do aparelho levemente adiantado ainda conta como primeiro dia; muito adiantado não', () => {
    expect(emBoasVindas(new Date(BRT(10, 0.5)).toISOString(), BRT(10))).toBe(true);
    expect(emBoasVindas(new Date(BRT(12)).toISOString(), BRT(10))).toBe(false);
  });
});

describe('Cartões do painel levam a telas que existem', () => {
  const dash = lerArquivo('src/modules/crm/pages/CustomerPortalDashboard.tsx');
  const app = lerArquivo('src/App.tsx');
  const caminhos = [...dash.matchAll(/path: '(\/portal\/[a-z-]+)(?:\?[^']*)?'/g)].map(m => m[1]);

  it('todo cartão tem destino e cada destino é uma rota do portal', () => {
    expect(caminhos.length).toBeGreaterThanOrEqual(10);
    for (const c of new Set(caminhos)) {
      const rota = c.replace('/portal/', '');
      expect(app, `rota ${c}`).toContain(`path="${rota}"`);
    }
  });

  it('os sete cartões principais apontam para o assunto certo', () => {
    for (const [rotulo, destino] of [
      ['Meus Pontos', '/portal/pontos'], ['Campanhas Ativas', '/portal/campanhas'], ['Minhas Mídias', '/portal/assets'],
      ['Playlists', '/portal/playlists'], ['Inserções (30 dias)', '/portal/insercoes'], ['Pontos para Anunciar', '/portal/pontos-parceiros'],
      ['Contratos Vigentes', '/portal/financeiro'],
    ]) {
      const trecho = dash.slice(dash.indexOf(`label: '${rotulo}'`));
      expect(trecho.slice(0, 220), rotulo).toContain(`path: '${destino}'`);
    }
  });

  it('o cartão vira link de verdade e a abertura vem do banco (primeiro acesso)', () => {
    expect(dash).toContain('data-testid="kpi-do-portal"');
    expect(dash).toContain('data-testid="abertura-do-portal"');
    expect(dash).toContain("portal_registrar_primeiro_acesso");
    expect(dash).toContain("'/portal/playlists?novo=1'");
  });

  it('Criar Playlist chega com ?novo=1 e a tela de playlists já abre a criação', () => {
    const pl = lerArquivo('src/modules/crm/pages/portal/PlaylistsClientePage.tsx');
    expect(pl).toContain("parametros.get('novo') !== '1'");
    expect(pl).toContain("resto.delete('novo')");
  });
});

describe('Pontos parceiros termina com o mapa da rede', () => {
  it('o mesmo mapa da tela inicial vem depois da lista de pontos', () => {
    const pg = lerArquivo('src/modules/crm/pages/portal/PontosParceirosPage.tsx');
    expect(pg).toContain("import { MapaDaRede } from '@/components/rede/MapaDaRede';");
    expect(pg.lastIndexOf('<MapaDaRede />')).toBeGreaterThan(pg.indexOf('Pontos'));
    expect(pg.indexOf('<MapaDaRede />')).toBeGreaterThan(pg.length / 2);
  });
});

describe('Menu lateral do anunciante na ordem pedida', () => {
  it('Início, Minhas Mídias, Publicidade, Meus Pontos, Comércio, Mensagens e Contratos, Conta', () => {
    render(
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="/portal" element={<CustomerPortalLayout />}>
            <Route index element={<div>conteudo</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const links = screen.getAllByRole('link').map(a => a.getAttribute('href')).filter((h): h is string => !!h && h.startsWith('/portal'));
    const unicos = links.filter((h, i) => links.indexOf(h) === i);
    const ordem = ['/portal', '/portal/assets', '/portal/campanhas', '/portal/insercoes', '/portal/playlists', '/portal/pontos', '/portal/pontos-parceiros',
      '/portal/produtos', '/portal/central', '/portal/financeiro', '/portal/configuracoes'];
    const posicoes = ordem.map(h => unicos.indexOf(h));
    expect(posicoes.every(p => p >= 0), `rotas ausentes: ${ordem.filter((h, i) => posicoes[i] < 0)}`).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// F-121 — tablet (M10 em pé 800 px e deitado 1280 px) igual ao celular: tabela que não cabe empilha, nada parte nem invade.
const ler = (arquivo: string) => readFileSync(path.join(process.cwd(), arquivo), 'utf8').replace(/\r\n/g, '\n');
const ObservadorOriginal = global.ResizeObserver;

const montar = (larguraTabela: number, larguraArea: number) => {
  const disparos: Array<() => void> = [];
  global.ResizeObserver = class {
    constructor(cb: () => void) { disparos.push(cb); }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  const sw = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
  const cw = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
  const medidas = { tabela: larguraTabela, area: larguraArea };
  Object.defineProperty(Element.prototype, 'scrollWidth', { configurable: true, get() { return (this as Element).tagName === 'TABLE' ? medidas.tabela : 0; } });
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return medidas.area; } });
  const { container } = render(
    <Table>
      <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Valor</TableHead></TableRow></TableHeader>
      <TableBody><TableRow><TableCell>Golden</TableCell><TableCell>R$ 100,00</TableCell></TableRow></TableBody>
    </Table>,
  );
  const desfazer = () => {
    if (sw) Object.defineProperty(Element.prototype, 'scrollWidth', sw);
    if (cw) Object.defineProperty(Element.prototype, 'clientWidth', cw);
  };
  return { tabela: container.querySelector('table')!, medidas, redimensionar: () => disparos.forEach((d) => d()), desfazer };
};

describe('Tablet igual ao celular (F-121)', () => {
  afterEach(() => { global.ResizeObserver = ObservadorOriginal; });

  it('tabela mais larga que a área ganha "sem-espaco" e volta a ser tabela quando o espaço dá', () => {
    const t = montar(1100, 950);
    expect(t.tabela.classList.contains('sem-espaco')).toBe(true);
    expect(t.tabela.querySelector('td')?.getAttribute('data-label')).toBe('Cliente');
    t.medidas.area = 1200;
    t.redimensionar();
    expect(t.tabela.classList.contains('sem-espaco')).toBe(false);
    t.desfazer();
  });

  it('tabela que cabe não muda', () => {
    const t = montar(900, 950);
    expect(t.tabela.classList.contains('sem-espaco')).toBe(false);
    t.desfazer();
  });

  it('navegador que não deixa observar o tamanho não derruba a página', () => {
    global.ResizeObserver = (() => ({})) as unknown as typeof ResizeObserver;
    expect(() => render(<Table><TableBody><TableRow><TableCell>x</TableCell></TableRow></TableBody></Table>)).not.toThrow();
  });

  it('CSS: empilhamento vale até 1023 px; "sem-espaco" e as quebras de linha só até 1280 px (computador intacto)', () => {
    const css = ler('src/index.css');
    expect(css).toContain('@media (max-width: 1023px) {\n  table.tabela-empilhada { min-width: 0');
    expect(css).toContain('@media (max-width: 1280px) {\n  table.tabela-empilhada.sem-espaco { min-width: 0 !important; width: 100% !important; }');
    expect(css).toContain('@media (max-width: 1280px) {\n  .flex.justify-between:not(.flex-nowrap):not(.flex-col) { flex-wrap: wrap; row-gap: 0.5rem; }');
    expect(css).toContain('@media (max-width: 1280px) {\n  [role="tablist"]:not(.grid):not(.overflow-x-auto) { flex-wrap: wrap;');
    expect(css).not.toMatch(/^\.flex\.justify-between:not\(\.flex-nowrap\)/m);
    expect(css).not.toContain('.flex-col.sm:flex-row >');
  });

  it('cobranças e clientes: cartões até o tablet em pé, tabela só a partir de 1024 px; botões da tabela numa linha', () => {
    const cobrancas = ler('src/modules/crm/pages/BillingDashboard.tsx');
    expect(cobrancas).toContain('className="space-y-3 p-3 lg:hidden" data-testid="cobrancas-cartoes"');
    expect(cobrancas).toContain('{renderAcoes(c, true)}');
    expect(cobrancas).toContain("umaLinha ? ' flex-nowrap' : ''");
    expect(ler('src/modules/crm/pages/ClientesListPage.tsx')).toMatch(/lg:hidden[^\n]*data-testid="clientes-cartoes"|data-testid="clientes-cartoes"[^\n]*lg:hidden/);
  });

  it('valores em reais nunca passam de 2 casas (não estouram o cartão)', () => {
    for (const arquivo of ['src/modules/crm/pages/BIExecutiveDashboard.tsx', 'src/modules/crm/pages/OccupancyDashboard.tsx', 'src/modules/crm/pages/RepresentativeDashboard.tsx']) {
      expect(ler(arquivo)).toContain('maximumFractionDigits: 2');
    }
  });
});

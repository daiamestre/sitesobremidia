import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-132 — editor de contrato no celular e no tablet: folha no tamanho do computador (ajustada à largura, com zoom)
// e "Campos Disponíveis" abrindo e fechando por botão.
const editor = readFileSync(path.join(process.cwd(), 'src/modules/crm/components/contracts/ReadableContractEditor.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Editor de contrato: folha original e painel de campos (F-132)', () => {
  it('a folha tem sempre o formato do computador: 896 px, margem interna e altura originais (sem versão encolhida)', () => {
    expect(editor).toContain('const LARGURA_FOLHA = 896;');
    expect(editor.match(/style=\{estiloFolha\} data-testid="folha-contrato"/g)).toHaveLength(2);
    expect(editor).not.toContain('p-4 sm:p-8 md:p-14');
    expect(editor).not.toContain('min-h-[70vh]');
    expect(editor.match(/ p-14 rounded-lg/g)).toHaveLength(2);
    expect(editor.match(/min-h-\[1400px\]/g)).toHaveLength(2);
  });

  it('celular/tablet (até 1280 px): folha inteira ajustada à largura; computador: como sempre foi (100 %)', () => {
    expect(editor).toContain('const zoom = zoomManual ?? (telaLarga ? 1 : ajuste);');
    expect(editor).toContain("? { width: '100%', maxWidth: LARGURA_FOLHA, zoom }");
    expect(editor).toContain(": { width: LARGURA_FOLHA, maxWidth: 'none', zoom };");
    expect(editor).toContain('window.innerWidth > 1280');
    expect(editor).toContain('setAjuste(Math.min(1,');
  });

  it('zoom: diminuir, aumentar e "Ajustar" à largura; a área rola nos dois sentidos quando aproximado', () => {
    expect(editor).toContain('data-testid="zoom-folha"');
    expect(editor).toContain('onClick={() => mudarZoom(-0.1)}');
    expect(editor).toContain('onClick={() => mudarZoom(0.1)}');
    expect(editor).toContain('onClick={() => setZoomManual(null)}');
    expect(editor.match(/className="flex-1 overflow-auto p-2 sm:p-4 md:p-8 scroll-smooth" data-testid="area-folha"/g)).toHaveLength(2);
  });

  it('"Campos Disponíveis" abre e fecha em qualquer tela: botão, X e (no celular/tablet) toque fora', () => {
    expect(editor).toContain('onClick={() => setCamposAberto((v) => !v)} aria-expanded={camposAberto} data-testid="abrir-campos"');
    expect(editor).toContain("{camposAberto ? 'Fechar campos' : 'Campos'}");
    expect(editor).toContain('data-testid="fechar-campos"');
    expect(editor).toContain('{camposAberto && !telaLarga && <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setCamposAberto(false)}');
    expect(editor).not.toMatch(/data-testid="abrir-campos"[^>]*md:hidden|md:hidden[^>]*data-testid="abrir-campos"/);
  });

  it('computador começa com o painel aberto ao lado; celular/tablet começam fechados e o painel abre por cima', () => {
    expect(editor).toContain('const [camposAberto, setCamposAberto] = useState(telaLargaInicial);');
    expect(editor).toContain("${camposAberto ? 'flex' : 'hidden'} z-10 h-full min-h-0 w-80 shrink-0 flex-col");
    expect(editor).toContain("style={telaLarga ? undefined : { width: 'min(88vw, 384px)', maxWidth: 'none' }}");
    expect(editor).toContain('if (!telaLarga) setCamposAberto(false);');
  });

  it('barra legível no tema escuro: aba ativa e controles com cor de texto própria', () => {
    expect(editor).toContain("'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'");
    expect(editor).toContain('bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100');
  });
});

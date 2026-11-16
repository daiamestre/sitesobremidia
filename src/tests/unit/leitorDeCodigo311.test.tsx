/**
 * F-311 (pedido do dono, 12/11/2026): leitor de código de barras funcionando — câmera (nativo ou ZXing), PISTOLA de qualquer
 * ramo (com ou sem o campo selecionado), digitando à mão, e BIPE de pistola a cada leitura gravada.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeitorDeCodigo } from '@/components/tabloide/LeitorDeCodigo';

/** EAN-13 com o dígito verificador certo */
function ean13(base12: string) {
  const s = base12.split('').reduce((t, d, i) => t + Number(d) * (i % 2 ? 3 : 1), 0);
  return base12 + ((10 - (s % 10)) % 10);
}

describe('F-311: leitor de código de barras', () => {
  it('o site libera a câmera para ele mesmo (antes "camera=()" bloqueava a câmera em todas as páginas)', () => {
    const v = fs.readFileSync('vercel.json', 'utf8');
    expect(v).toContain('camera=(self)');
    expect(v).not.toContain('camera=()');
  });

  it('PISTOLA sem o campo selecionado: teclas rápidas + Enter viram uma leitura', () => {
    const aoLer = vi.fn(() => true);
    render(<LeitorDeCodigo aoLer={aoLer} />);
    const codigo = ean13('789100010010');
    for (const d of codigo) fireEvent.keyDown(window, { key: d });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(aoLer).toHaveBeenCalledWith(codigo);
  });

  it('pistola que termina com Tab também vale', () => {
    const aoLer = vi.fn(() => true);
    render(<LeitorDeCodigo aoLer={aoLer} />);
    const codigo = ean13('789610001234');
    for (const d of codigo) fireEvent.keyDown(window, { key: d });
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(aoLer).toHaveBeenCalledWith(codigo);
  });

  it('com o campo selecionado (pistola ou à mão): Enter ou o botão Adicionar; código inválido não entra', () => {
    const aoLer = vi.fn(() => true);
    render(<LeitorDeCodigo aoLer={aoLer} />);
    const campo = screen.getByTestId('tabloide-codigo');
    fireEvent.change(campo, { target: { value: '7891000100100' } }); // dígito verificador errado
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(aoLer).not.toHaveBeenCalled();
    const certo = ean13('789100010010');
    fireEvent.change(campo, { target: { value: certo } });
    fireEvent.click(screen.getByTestId('tabloide-codigo-adicionar'));
    expect(aoLer).toHaveBeenCalledWith(certo);
  });

  it('câmera: leitor nativo e, sem ele, o ZXing servido pelo próprio site; leitura contínua com bipe', () => {
    const leitor = fs.readFileSync('src/components/tabloide/LeitorDeCodigo.tsx', 'utf8');
    expect(leitor).toContain("import('barcode-detector/pure')");
    expect(leitor).toContain("import('zxing-wasm/reader/zxing_reader.wasm?url')");
    expect(leitor).toContain("formatos.includes('ean_13')");
    expect(leitor).toContain('data-testid="leitor-concluir"');
    expect(leitor).toMatch(/if \(entrou\) bipe\(\); else bipeDeErro\(\);/);
    const bipe = fs.readFileSync('src/lib/tabloide/bipe.ts', 'utf8');
    expect(bipe).toContain("o.type = 'square'");
    expect(bipe).toMatch(/tom\(c, 2730/);
  });

  it('F-313: a CÂMERA DO APARELHO (app de câmera) tira a foto do código e o sistema lê da foto', () => {
    const leitor = fs.readFileSync('src/components/tabloide/LeitorDeCodigo.tsx', 'utf8');
    expect(leitor).toContain('capture="environment"');
    expect(leitor).toContain('export async function lerCodigoDaFoto(');
    expect(leitor).toContain('data-testid="leitor-camera-do-aparelho"');
    render(<LeitorDeCodigo aoLer={() => true} />);
    expect(screen.getByTestId('tabloide-foto-aparelho').getAttribute('capture')).toBe('environment');
  });

  it('produto repetido devolve false (bipe de erro) no Studio e no Cartaz Digital', () => {
    expect(fs.readFileSync('src/components/studio/ProdutosComFotos.tsx', 'utf8')).toContain("toast.info('Este produto já está na lista.'); return false; }");
    expect(fs.readFileSync('src/components/tabloide/TabloideEditor.tsx', 'utf8')).toContain("toast.info('Este produto já está no cartaz.'); return false; }");
  });
});

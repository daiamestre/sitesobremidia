/**
 * F-298 (pedido do dono, 11/11/2026):
 * - o MODELO se escolhe ANTES da edição: abrir a pasta (ou tocar no cartão de amostra) mostra só os modelos; tocou num,
 *   vai para a edição (?modelo=). A edição NÃO tem mais a galeria nem a frase "toque no modelo que quer editar";
 * - sem o cartão informativo "Editar elemento" (nem o de dica do produto) na lateral;
 * - a lateral emoldurada, mais larga no celular, com textos que cabem nos botões (nada passando nem quebrando torto).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
const encartes = fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8');
const galeria = fs.readFileSync('src/components/studio/GaleriaDeModelos.tsx', 'utf8');

describe('F-298: escolher o modelo antes de editar', () => {
  it('a pasta abre na escolha de modelo e o escolhido vai no endereço', () => {
    expect(galeria).toContain('export function EscolhaDeModelo');
    expect(galeria).not.toContain('toque no modelo que quer editar');
    expect(palco).toContain("if (escolhendoModelo) {");
    expect(palco).toContain("p.set('modelo', id || 'desenhado')");
    expect(encartes).toContain('if (escolhendoModelo) return (');
    expect(encartes).toContain("p.set('modelo', id)");
    expect(fs.readFileSync('src/components/studio/EncarteOficial.tsx', 'utf8')).toContain('?modelo=${encodeURIComponent(e.id)}');
  });
  it('a edição não mostra a galeria nem a lista de fundos; "Modelos" volta para a escolha', () => {
    expect(palco).not.toContain('<GaleriaDeModelos');
    expect(encartes).not.toContain('<GaleriaDeModelos');
    expect(palco).not.toContain('aria-label="Fundo do palco"');
    expect(palco).toContain('data-testid="palco-voltar-aos-modelos"');
    expect(encartes).toContain('data-testid="encarte-voltar-aos-modelos"');
  });
  it('sem cartão informativo na lateral', () => {
    expect(palco).not.toContain('Toque em qualquer elemento da tela:');
    expect(palco).not.toContain('Toque num produto da fila, embaixo da tela');
    expect(palco).toContain('{camadaSel && <div ref={edicao}>');
    expect(palco).toContain('{sel && <div>');
  });
  it('lateral emoldurada, mais larga no celular e com botões que cabem', () => {
    expect(palco).toContain('grid-cols-[minmax(0,9fr)_minmax(0,11fr)]');
    expect(palco).toContain('rounded-2xl border border-[#8A2EFF]/35');
    expect(palco).toContain('<div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Troca de cena deste produto"');
    expect(palco).toContain('[grid-template-columns:repeat(auto-fit,minmax(165px,1fr))]');
  });
});

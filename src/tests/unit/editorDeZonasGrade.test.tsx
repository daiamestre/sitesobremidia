/**
 * F-154 — Editor de zonas no estilo do modelo de referência: grade em células, porcentagem em cada zona, fechar no
 * canto, lista lateral colorida e giro da mídia dentro da zona.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { doBanco, naCelula, novaZona, paraSalvar, rotuloPercentual, tamanhoDaCelula } from '@/lib/layoutZonas';
import { mapLayoutPayload } from '@/components/player/playerLayout';
import { ZonasDoPlayer } from '@/components/player/ZonasDoPlayer';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('grade em células', () => {
  it('tamanho da célula e encaixe (24 × 24 numa tela 1920 × 1080)', () => {
    const c = tamanhoDaCelula(1920, 1080, 24, 24);
    expect(c).toEqual({ x: 80, y: 45 });
    expect(naCelula(1450, c.x)).toBe(1440); // 18 colunas
    expect(naCelula(1490, c.x)).toBe(1520);
    expect(naCelula(100, c.y)).toBe(90);   // 2 linhas
    expect(naCelula(487, 0)).toBe(487);    // sem grade
    expect(tamanhoDaCelula(1920, 1080, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('grade fracionária continua dando pixels inteiros', () => {
    const c = tamanhoDaCelula(1366, 768, 23, 20); // 59,39 × 38,4
    for (const v of [0, 100, 777, 1366]) expect(Number.isInteger(naCelula(v, c.x))).toBe(true);
  });
});

describe('texto de cada zona', () => {
  it('porcentagem da largura × altura, como "82% × 92%"', () => {
    expect(rotuloPercentual({ x: 0, y: 0, largura: 1440, altura: 1080 }, 1920, 1080)).toBe('75% × 100%');
    expect(rotuloPercentual({ x: 0, y: 0, largura: 1520, altura: 110 }, 1920, 1080)).toBe('79,2% × 10,2%');
  });
});

describe('giro da mídia na zona', () => {
  it('vai para o banco e volta; valor inválido vira 0', () => {
    const z = { ...novaZona({ x: 0, y: 0, largura: 480, altura: 270 }, [], 1920, 1080), rotacao: 90 as const };
    expect(paraSalvar([z])[0].rotacao).toBe(90);
    expect(doBanco({ id: 'a', numero: 1, x: 0, y: 0, largura: 1, altura: 1, rotacao: 270 }).rotacao).toBe(270);
    expect(doBanco({ id: 'a', numero: 1, x: 0, y: 0, largura: 1, altura: 1, rotacao: 45 }).rotacao).toBe(0);
    expect(doBanco({ id: 'a', numero: 1, x: 0, y: 0, largura: 1, altura: 1 }).rotacao).toBe(0);
  });

  const resposta = (rotacao: number) => ({ status: 'SUCCESS', layout: { id: 'L', versao: 1, largura: 1920, altura: 1080, cor_fundo: '#000000', zonas: [
    { id: 'z1', numero: 1, x: 0, y: 0, largura: 960, altura: 1080, principal: true, playlist: null },
    { id: 'z2', numero: 2, x: 960, y: 0, largura: 960, altura: 540, rotacao, principal: false, playlist: { id: 'p', playlist_items: [] } },
  ] } });

  it('o Player web lê o giro; 90 e 270 trocam largura e altura do quadro interno', () => {
    const l90 = mapLayoutPayload(resposta(90), [], 'https://base')!;
    expect(l90.zonas.map((z) => z.rotacao)).toEqual([0, 90]);
    render(<ZonasDoPlayer layout={l90} screenId="t" somLiberado={false} />);
    const zonas = screen.getAllByTestId('zona-do-player');
    expect(zonas[1].dataset.rotacao).toBe('90');
    const quadros = screen.getAllByTestId('quadro-girado');
    expect(quadros[0].style.transform).toBe('');                       // sem giro: ocupa a zona toda
    expect(quadros[1].style.transform).toContain('rotate(90deg)');
    // zona 960 × 540: girada, o quadro interno tem 540/960 da largura e 960/540 da altura da zona (troca de eixos)
    expect(quadros[1].style.width).toBe('56.25%');
    expect(quadros[1].style.height).toBe('177.77777777777777%');
  });

  it('180° não troca os eixos', () => {
    const l = mapLayoutPayload(resposta(180), [], 'https://base')!;
    render(<ZonasDoPlayer layout={l} screenId="t" somLiberado={false} />);
    const q = screen.getAllByTestId('quadro-girado')[1];
    expect(q.style.transform).toContain('rotate(180deg)');
    expect(q.style.width).toBe('100%');
    expect(q.style.height).toBe('100%');
  });

  it('o banco já entrega e grava o giro (contrato inalterado)', () => {
    const sql = ler('supabase/migrations/20261306_preco_por_zona_som_radio_e_presenca.sql');
    expect(sql).toContain("CASE WHEN (z->>'rotacao') IN ('90', '180', '270') THEN (z->>'rotacao')::integer ELSE 0 END");
    expect(ler('supabase/migrations/20261305_zonas_relatorio_anuncio_rede_e_clientes.sql')).toContain("'rotacao', z.rotacao");
  });
});

describe('editor no estilo do modelo', () => {
  const editor = ler('src/components/screens/EditorDeZonas.tsx');
  it('grade de células por padrão (colunas × linhas editáveis) e desenhada sobre a tela', () => {
    expect(editor).toContain('const [grade, setGrade] = useState(-1);');
    expect(editor).toContain('const [colunas, setColunas] = useState(24);');
    expect(editor).toContain('data-testid="tipo-de-grade"');
    expect(editor).toContain('id="grade-colunas"');
    expect(editor).toContain('linear-gradient(to right, rgba(255,255,255,.10) 1px, transparent 1px)');
  });
  it('cada zona mostra nome e porcentagem, tem o botão de fechar no canto e a alça de tamanho', () => {
    expect(editor).toContain('data-testid="zona-percentual"');
    expect(editor).toContain('data-testid="fechar-zona"');
    expect(editor).toMatch(/data-testid="fechar-zona"[\s\S]{0,260}excluir\(z\.chave\)/);
    expect(editor).toContain('data-testid="alca-tamanho"');
  });
  it('lista lateral de zonas com quadrado colorido e giro por zona', () => {
    expect(editor).toContain('data-testid="lista-de-zonas"');
    expect(editor).toContain('data-testid="giro-da-zona"');
  });
});

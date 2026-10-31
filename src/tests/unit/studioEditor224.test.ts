// F-224 — editor do Studio no tablet: formatos andam juntos, cores guardadas, carrossel e mapa no toque.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { modeloParaDocumento, type CamadaTexto } from '@/lib/studio/documento';
import { MODELOS } from '@/lib/studio/modelos';
import { correspondente, herdarEstilo, levarMudanca } from '@/lib/studio/sincronizar';
import { coresDoDocumento, coresRecentes, lembrarCor } from '@/lib/studio/cores';
import { CRUZEIRO, impulsoDoGesto, passoDoCarrossel } from '@/lib/studio/carrossel';
import { abasDe } from '@/components/studio/editor/Paineis';

const m = MODELOS[0];
const h = () => modeloParaDocumento(m, '16:9');
const v = () => modeloParaDocumento(m, '9:16');
const titulo = (d: ReturnType<typeof h>) => d.camadas.find((c) => c.nome === 'Título') as CamadaTexto;

describe('os dois formatos andam juntos (cor do texto não se perde ao trocar 16:9 ↔ 9:16)', () => {
  it('a cor e o texto mudados no 16:9 chegam ao título do 9:16, sem mexer na posição', () => {
    const a = h(); const b = v();
    const t = titulo(a);
    const depois = levarMudanca(a, t.id, { cor: '#ff3df2', texto: 'NOVO TEXTO', x: 999, w: 10 }, b);
    const tb = titulo(depois);
    expect(tb.cor).toBe('#ff3df2');
    expect(tb.texto).toBe('NOVO TEXTO');
    expect(tb.x).toBe(titulo(b).x);
    expect(tb.w).toBe(titulo(b).w);
  });
  it('arrastar (só posição) não altera o outro formato', () => {
    const a = h(); const b = v();
    expect(levarMudanca(a, titulo(a).id, { x: 10, y: 20 }, b)).toBe(b);
  });
  it('caixa/pílula leva só a cor (margem e cantos são de cada formato)', () => {
    const a = h(); const b = v();
    const botaoA = a.camadas.find((c) => c.nome === 'Botão') as CamadaTexto | undefined;
    if (!botaoA?.fundo) return;
    const botaoB = correspondente(a, botaoA.id, b) as CamadaTexto;
    const d = levarMudanca(a, botaoA.id, { fundo: { ...botaoA.fundo, cor: '#123456', margem: 1 } }, b);
    const novo = d.camadas.find((c) => c.id === botaoB.id) as CamadaTexto;
    expect(novo.fundo?.cor).toBe('#123456');
    expect(novo.fundo?.margem).toBe(botaoB.fundo?.margem);
  });
  it('o formato que nasce depois herda o fundo e as cores já editadas', () => {
    const a = h();
    const editado = { ...a, fundo: '#101010', camadas: a.camadas.map((c) => (c.nome === 'Título' ? { ...c, cor: '#00ff00' } : c)) };
    const novo = herdarEstilo(editado, v());
    expect(novo.fundo).toBe('#101010');
    expect(titulo(novo).cor).toBe('#00ff00');
  });
});

describe('cores guardadas', () => {
  beforeEach(() => localStorage.clear());
  it('a última cor escolhida fica no topo, sem repetir, até 12', () => {
    lembrarCor('#AA0000'); lembrarCor('#00bb00'); lembrarCor('#aa0000');
    expect(coresRecentes()).toEqual(['#aa0000', '#00bb00']);
    for (let i = 0; i < 20; i++) lembrarCor(`#0000${String(i).padStart(2, '0')}`);
    expect(coresRecentes()).toHaveLength(12);
    lembrarCor('rgba(0,0,0,.5)');
    expect(coresRecentes()[0]).toBe('#000019');
  });
  it('lista as cores usadas na arte para repetir em outro elemento', () => {
    expect(coresDoDocumento(h()).length).toBeGreaterThan(1);
  });
});

describe('carrossel infinito', () => {
  it('anda devagar para sempre no sentido pedido (16:9 para a esquerda, 9:16 para a direita)', () => {
    let e = { x: 0, v: -CRUZEIRO };
    for (let i = 0; i < 100; i++) e = passoDoCarrossel(e, 16, -1, 5000);
    expect(e.v).toBeCloseTo(-CRUZEIRO, 5);
    let d = { x: -2500, v: CRUZEIRO };
    const x0 = d.x;
    d = passoDoCarrossel(d, 1000, 1, 5000);
    expect(d.x).toBeGreaterThan(x0);
  });
  it('o dedo acelera e pode inverter o sentido; depois volta ao cruzeiro nesse novo sentido', () => {
    const v = impulsoDoGesto(-CRUZEIRO, 1.5);
    expect(v).toBeGreaterThan(1);
    let e = { x: -100, v };
    for (let i = 0; i < 1000; i++) e = passoDoCarrossel(e, 16, -1, 5000);
    expect(e.v).toBeCloseTo(CRUZEIRO, 3);
    expect(impulsoDoGesto(-CRUZEIRO, 0.01)).toBe(-CRUZEIRO);
    expect(Math.abs(impulsoDoGesto(0, 50))).toBe(4);
  });
  it('a posição dá a volta sem fim (fica entre -total e 0)', () => {
    let e = { x: -10, v: 3 };
    for (let i = 0; i < 50; i++) { e = passoDoCarrossel(e, 64, -1, 3000); expect(e.x).toBeLessThan(0); expect(e.x).toBeGreaterThanOrEqual(-3000); }
  });
});

describe('editor no tablet', () => {
  it('cada elemento tem botões próprios; foto agrupa os ajustes num botão', () => {
    const doc = h();
    const foto = doc.camadas.find((c) => c.tipo === 'imagem')!;
    expect(abasDe(foto).map((a) => a.id)).toEqual(['ajustes', 'enquadrar', 'animar', 'efeitos', 'posicao', 'camadas']);
    expect(abasDe(titulo(doc)).map((a) => a.id)).toEqual(['texto', 'cor', 'formatar', 'animar', 'efeitos', 'posicao', 'camadas']);
    expect(abasDe(null).map((a) => a.id)).toEqual(['fundo', 'video', 'camadas']);
  });
  it('lista de itens que não cabe no 9:16 vira um item embaixo do outro (nada cortado)', () => {
    for (const x of MODELOS) {
      const d = modeloParaDocumento(x, '9:16');
      for (const c of d.camadas) if (c.tipo === 'itens') expect(c.x + c.w).toBeLessThanOrEqual(1080 + 1);
    }
  });
  it('o dedo só arrasta o elemento já escolhido; lixeira junto da seleção; publicar também salva o projeto', () => {
    const palco = fs.readFileSync('src/components/studio/editor/Palco.tsx', 'utf8');
    expect(palco).toContain("ev.pointerType !== 'mouse' && c.id !== sel");
    expect(palco).toContain("touchAction: c.id === sel ? 'none' : 'pan-y'");
    expect(palco).toContain('studio-lixeira-palco');
    const ed = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(ed).toContain("await gravar(); setPublicando('arte');");
    expect(ed).toContain('data-testid="studio-nome"');
  });
  it('mapas deixam a página rolar com o dedo', () => {
    for (const f of ['src/components/rede/MapaDaRede.tsx', 'src/components/dashboard/PainelCompleto.tsx']) {
      const s = fs.readFileSync(f, 'utf8');
      expect(s).toContain("touchAction: 'pan-y'");
      expect(s).not.toContain("touchAction: 'none'");
    }
  });
});

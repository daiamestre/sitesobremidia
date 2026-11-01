// F-249 — REGRA DO DONO: toda tela de edição tem as ferramentas completas (mover, aumentar, girar, trocar, texto, fonte, cor,
// movimento e trocar logo). No Palco, tocar em qualquer elemento abre o editor; as faixas têm letreiro em loop.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { camadaNoPonto, TAMANHO_DOC, type Camada, type CamadaTexto } from '@/lib/studio/documento';
import { FUNDOS_DO_PALCO, palcoDoProduto } from '@/lib/studio/palco';
import { abasDe } from '@/components/studio/editor/Paineis';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const produto = { nome: 'Arroz Camil 5kg', preco: 9.9, precoDe: 12.9, unidade: null, imagem: { url: 'https://x/a.png', fonte: 'OPENFOODFACTS' as const } };
const fundo = FUNDOS_DO_PALCO[0];
const FORMATOS = ['9:16', '16:9'] as const;

describe('faixas com letreiro em loop', () => {
  it.each(FORMATOS)('as 3 faixas no %s passam o texto, na cor da faixa', (f) => {
    const d = palcoDoProduto(produto, f, { fundo });
    const faixas = d.camadas.filter((c) => c.nome.startsWith('Faixa')) as CamadaTexto[];
    expect(faixas).toHaveLength(3);
    for (const x of faixas) {
      expect(x).toMatchObject({ tipo: 'texto', texto: 'ALERTA DE OFERTA', letreiro: { fundo: '#fde615' } });
      expect(x.letreiro!.velocidade).toBeGreaterThan(0);
      expect(Math.abs(x.rot)).toBeLessThan(60); // o texto nunca fica de cabeça para baixo
    }
    // as faixas ficam por baixo do produto e do balão
    const i = (n: string) => d.camadas.findIndex((c) => c.nome === n);
    expect(i('Faixa 3')).toBeLessThan(i('Produto'));
    expect(i('Fundo oficial')).toBeLessThan(i('Faixa 1'));
  });
  it('o desenho repete o texto de acordo com o tempo', () => {
    const d = fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8');
    expect(d).toMatch(/c\.letreiro\) desenharLetreiro\(ctx, c, tempo \?\? 0\)/);
    expect(d).toMatch(/\(tempo \* l\.velocidade\) % periodo/);
  });
});

describe('tocar em qualquer elemento', () => {
  it.each(FORMATOS)('no %s, cada elemento é encontrado pelo toque, inclusive girado; o fundo travado não', (f) => {
    const d = palcoDoProduto(produto, f, { fundo });
    for (const nome of ['Botão', 'Preço', 'Faixa 1', 'Nome do produto', 'Logo do palco', 'Produto']) {
      const c = d.camadas.find((x) => x.nome === nome)!;
      expect(camadaNoPonto(d, c.x + c.w / 2, c.y + c.h / 2)?.nome, `${f} ${nome}`).toBeTruthy();
    }
    const b = d.camadas.find((x) => x.nome === 'Botão')!;
    expect(camadaNoPonto(d, b.x + b.w / 2, b.y + b.h / 2)?.nome).toBe('Botão');
    expect(d.camadas.find((c) => c.nome === 'Fundo oficial')).toMatchObject({ bloqueada: true });
  });
  it('a identidade do elemento é o nome: a seleção não se perde entre produtos', () => {
    const a = palcoDoProduto(produto, '9:16', { fundo }), b = palcoDoProduto({ ...produto, nome: 'Outro 1kg' }, '9:16', { fundo });
    expect(a.camadas.map((c) => c.id)).toEqual(b.camadas.map((c) => c.id));
    expect(new Set(a.camadas.map((c) => c.id)).size).toBe(a.camadas.length);
  });
});

describe('o que o cliente edita vale para todos os produtos', () => {
  const ajustes = { '9:16': { 'Botão': { x: 40, rot: 12, texto: 'SÓ HOJE', cor: '#00ff00' }, 'Preço': { cor: '#00aa00', x: 100, topo: 'SÓ HOJE' }, Produto: { w: 300 } } } as never;
  it('posição, giro, cor e texto do botão', () => {
    expect(palcoDoProduto(produto, '9:16', { fundo, ajustes }).camadas.find((c) => c.nome === 'Botão')).toMatchObject({ x: 40, rot: 12, texto: 'SÓ HOJE', cor: '#00ff00' });
  });
  it('o balão muda em todos, mas o preço e o "DE x POR" continuam de cada produto', () => {
    const promo = palcoDoProduto(produto, '9:16', { fundo, ajustes }).camadas.find((c) => c.nome === 'Preço')!;
    expect(promo).toMatchObject({ cor: '#00aa00', x: 100, valor: '9', topo: 'DE 12,90 POR' });
    const semPromo = palcoDoProduto({ ...produto, precoDe: null, preco: 7.5 }, '9:16', { fundo, ajustes }).camadas.find((c) => c.nome === 'Preço')!;
    expect(semPromo).toMatchObject({ cor: '#00aa00', valor: '7', topo: 'SÓ HOJE' });
  });
  it('a foto continua sendo a de cada produto', () => {
    const c = palcoDoProduto(produto, '9:16', { fundo, ajustes }).camadas.find((x) => x.nome === 'Produto')!;
    expect(c).toMatchObject({ w: 300, src: 'https://x/a.png' });
  });
  it('vale só no formato editado', () => {
    expect(palcoDoProduto(produto, '16:9', { fundo, ajustes }).camadas.find((c) => c.nome === 'Botão')).not.toMatchObject({ texto: 'SÓ HOJE' });
  });
});

describe('REGRA: ferramentas completas em toda tela de edição', () => {
  it('todo tipo de elemento tem movimento, efeitos e posição', () => {
    const d = palcoDoProduto(produto, '9:16', { fundo });
    for (const c of d.camadas as Camada[]) {
      const ids = abasDe(c).map((a) => a.id);
      expect(ids, c.nome).toEqual(expect.arrayContaining(['animar', 'efeitos', 'posicao']));
    }
  });
  it('o balão edita forma, textos e todas as cores; o botão edita a cor dele', () => {
    const p = fs.readFileSync('src/components/studio/editor/Paineis.tsx', 'utf8');
    for (const x of ['selo-formato', 'Texto de cima', 'Moeda', 'Cor do valor', 'Cor do R$', 'Cor do balão', 'Cor do botão', 'Cor da faixa', 'Velocidade do texto']) expect(p, x).toContain(x);
  });
  it('o Palco usa o palco e os painéis do editor completo, com "ver o movimento" repetido', () => {
    const t = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
    expect(t).toMatch(/<PalcoDoEditor /);
    expect(t).toMatch(/<CartaoDaAba /);
    expect(t).toMatch(/2 \* \(ciclo \+ 0\.35\) \* 1000/);
    expect(t).toMatch(/aoTocar=\{/);
    expect(t).toMatch(/nome === 'Logo do palco'/);
  });
  it('tocar no produto, em qualquer edição: trocar pela lista, pela galeria ou com IA, e o nome acompanha', () => {
    const e = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(e).toContain("n: 'Trocar produto'");
    expect(e).toContain('<TrocarFoto');
    expect(e).toMatch(/salvarNoCatalogo\(nome, pronta, 'ESCOLHA', true\)/);
    const j = fs.readFileSync('src/components/tabloide/TrocarFoto.tsx', 'utf8');
    expect(j).toContain('Criar com IA'); expect(j).toContain('Enviar a minha'); expect(j).toMatch(/aoEscolher\(\{ url: publicUrl, fonte: 'UPLOAD' \}, termo\)/);
  });
  it('no editor de encartes e modelos: repetir o movimento e trocar a logo', () => {
    const e = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(e).toMatch(/2 \* \(ciclo \+ 0\.35\) \* 1000/);
    expect(e).toContain('<EscolherLogo');
    expect(TAMANHO_DOC['a3']).toBeTruthy();
  });
});

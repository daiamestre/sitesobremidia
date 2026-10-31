// F-225 — animações simples (como no Canva), vídeo da arte e galeria em pastas por segmento.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { modeloParaDocumento, type Camada } from '@/lib/studio/documento';
import { MODELOS } from '@/lib/studio/modelos';
import { ANIMACOES, animarTudo, duracaoDoVideo, estadoNoTempo, temAnimacao, tirarAnimacoes } from '@/lib/studio/animacao';
import { OUTRAS, agruparEmPastas } from '@/lib/galeria';

const doc = () => modeloParaDocumento(MODELOS[0], '16:9');
const comAnimacao = (c: Camada, tipo: Parameters<typeof estadoNoTempo>[0]['animacao']) => ({ ...c, animacao: tipo }) as Camada;

describe('animações dos elementos', () => {
  it('sem animação a arte fica parada (o PNG não muda)', () => {
    const c = doc().camadas[0];
    expect(estadoNoTempo(c, 0)).toMatchObject({ alfa: 1, dx: 0, dy: 0, escala: 1, rot: 0, zoom: 1 });
  });
  it('entradas começam no atraso e terminam no lugar original', () => {
    const t = doc().camadas.find((c) => c.tipo === 'texto')!;
    const sub = comAnimacao(t, { tipo: 'subir', atraso: 1, duracao: 0.5 });
    expect(estadoNoTempo(sub, 0.5).alfa).toBe(0);
    expect(estadoNoTempo(sub, 1.2).dy).toBeGreaterThan(0);
    expect(estadoNoTempo(sub, 2)).toMatchObject({ alfa: 1, dy: 0 });
    const esq = comAnimacao(t, { tipo: 'esquerda', atraso: 0, duracao: 1 });
    expect(estadoNoTempo(esq, 0.1).dx).toBeLessThan(0);
    expect(estadoNoTempo(comAnimacao(t, { tipo: 'zoom', atraso: 0, duracao: 1 }), 0.2).escala).toBeLessThan(1);
  });
  it('máquina de escrever mostra as letras aos poucos', () => {
    const t = doc().camadas.find((c) => c.tipo === 'texto')!;
    const dig = comAnimacao(t, { tipo: 'digitar', atraso: 0, duracao: 2 });
    const n = (t as { texto: string }).texto.length;
    expect(estadoNoTempo(dig, 1).letras).toBe(Math.floor(n / 2));
    expect(estadoNoTempo(dig, 3).letras).toBe(n);
  });
  it('efeitos contínuos repetem (pulsar, balançar) e a panorâmica aproxima a foto DENTRO da moldura', () => {
    const f = doc().camadas.find((c) => c.tipo === 'imagem')!;
    const pan = comAnimacao(f, { tipo: 'panoramica', atraso: 0, duracao: 1 });
    expect(estadoNoTempo(pan, 0, 8).zoom).toBe(1);
    expect(estadoNoTempo(pan, 8, 8).zoom).toBeCloseTo(1.15, 2);
    expect(estadoNoTempo(pan, 8, 8).escala).toBe(1);
    const pul = comAnimacao(f, { tipo: 'pulsar', atraso: 0, duracao: 1 });
    expect(new Set([0.1, 0.3, 0.6, 0.9].map((t) => estadoNoTempo(pul, t).escala.toFixed(3))).size).toBeGreaterThan(1);
  });
  it('"Animar tudo" anima foto, título e textos em sequência; "Tirar" volta à arte parada', () => {
    const a = animarTudo(doc());
    expect(temAnimacao(a)).toBe(true);
    expect(a.camadas.find((c) => c.tipo === 'imagem')?.animacao?.tipo).toBe('panoramica');
    expect(a.camadas.filter((c) => c.bloqueada).every((c) => !c.animacao)).toBe(true);
    expect(temAnimacao(tirarAnimacoes(a))).toBe(false);
    expect(duracaoDoVideo(a)).toBe(8);
    expect(duracaoDoVideo({ ...a, video: { duracao: 99 } })).toBe(30);
  });
  it('máquina de escrever só para texto e panorâmica só para foto', () => {
    expect(ANIMACOES.find((x) => x.id === 'digitar')?.so).toEqual(['texto']);
    expect(ANIMACOES.find((x) => x.id === 'panoramica')?.so).toEqual(['imagem']);
  });
});

describe('galeria em pastas', () => {
  const pastas = [{ chave: 'acougue', nome: 'Açougue – Carnes Selecionadas', capa_url: null }, { chave: 'padaria', nome: 'Padaria', capa_url: 'https://x/capa.jpg' }];
  const itens = [
    { id: 'a', nome: 'A', capa: 'https://x/a.jpg', criado: '2026-10-30' },
    { id: 'b', nome: 'B', capa: 'https://x/b.jpg', criado: '2026-10-31' },
    { id: 'c', nome: 'C', capa: null, criado: '2026-10-29' },
  ];
  it('cada mídia vai para a pasta do modelo; sem pasta → "Outras mídias" (por último)', () => {
    const g = agruparEmPastas(itens, new Map([['a', 'acougue'], ['b', 'padaria']]), pastas);
    expect(g.map((x) => x.chave)).toEqual(['padaria', 'acougue', OUTRAS]);
    expect(g[0].capa).toBe('https://x/capa.jpg');
    expect(g[0].capaPropria).toBe(true);
    expect(g[1].capa).toBe('https://x/a.jpg');
    expect(g[2].nome).toBe('Outras mídias');
  });
  it('a tabela da galeria é só de quem criou (RLS) e não mexe em media/cliente_assets', () => {
    const sql = fs.readFileSync('supabase/migrations/20261356_galeria_pastas.sql', 'utf8');
    expect(sql).toContain('using (usuario_id = auth.uid()) with check (usuario_id = auth.uid())');
    expect(sql).not.toMatch(/alter table public\.(media|cliente_assets)/i);
  });
  it('salvar/publicar do Studio põe a mídia (imagem ou vídeo) na pasta do modelo e usa a duração do vídeo na playlist', () => {
    const api = fs.readFileSync('src/lib/studioai/api.ts', 'utf8');
    expect(api).toContain('await guardarNaPasta(o.userId, salvo.tipo, salvo.id, o.pasta)');
    expect(api).toContain('adicionarMidia(playlistId, salvo.id, salvo.duracao)');
    expect(api).toContain("file_type: o.video ? 'video' : 'image'");
    const ed = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(ed).toContain('pasta={pastaGaleria}');
    expect(ed).toContain("saldo.data?.cliente ? 20 : 30");
  });
});

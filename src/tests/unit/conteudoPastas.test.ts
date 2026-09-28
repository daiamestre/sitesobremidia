/** F-95 — robô das pastas automáticas: calendário, conteúdo próprio, notícias e campeonatos. */
import { describe, it, expect } from 'vitest';
import { pascoa, datasDoAno, proximasDatas } from '../../../scripts/conteudo/produtores/datas.mjs';
import { produzirTextos } from '../../../scripts/conteudo/produtores/textos.mjs';
import { intercalar, creditoNoticia, htmlNoticia } from '../../../scripts/conteudo/produtores/noticias.mjs';
import { produzirCampeonatos, dataCurta, iniciais } from '../../../scripts/conteudo/produtores/campeonatos.mjs';
import { daSemana, cortar } from '../../../scripts/conteudo/arte-base.mjs';
import { lerFeed } from '../../../scripts/conteudo/rss.mjs';
import { CHARADAS, PIADAS, MEMES, CURIOSIDADES, NOSTALGIA } from '../../../scripts/conteudo/bancos.mjs';

describe('Datas Comemorativas', () => {
  it('datas móveis pela regra oficial', () => {
    expect(pascoa(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(pascoa(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
    const d = Object.fromEntries(datasDoAno(2026).map((x) => [x.nome, x.data]));
    expect(d['Carnaval']).toBe('2026-02-17');
    expect(d['Dia das Mães']).toBe('2026-05-10');
    expect(d['Dia dos Pais']).toBe('2026-08-09');
    expect(d['Black Friday']).toBe('2026-11-27');
    expect(d['Corpus Christi']).toBe('2026-06-04');
  });
  it('as próximas 10 a partir de hoje, virando o ano', () => {
    const p = proximasDatas('2026-12-20');
    expect(p).toHaveLength(10);
    expect(p[0].nome).toBe('Véspera de Natal');
    expect(p.some((x) => x.data.startsWith('2027'))).toBe(true);
  });
});

describe('Conteúdo próprio (troca semanal)', () => {
  it('bancos com volume para várias semanas', () => {
    expect(CHARADAS.length).toBeGreaterThanOrEqual(110);
    expect(PIADAS.length).toBeGreaterThanOrEqual(70);
    expect(MEMES.length).toBeGreaterThanOrEqual(85);
    expect(CURIOSIDADES.length).toBeGreaterThanOrEqual(85);
    expect(NOSTALGIA.length).toBeGreaterThanOrEqual(70);
    // nada repetido dentro de cada banco
    expect(new Set(CHARADAS.map((c: string[]) => c[0])).size).toBe(CHARADAS.length);
    expect(new Set(MEMES).size).toBe(MEMES.length);
    expect(new Set(CURIOSIDADES).size).toBe(CURIOSIDADES.length);
  });
  it('cada semana traz outro trecho do banco, sem repetir dentro da semana', () => {
    const a = daSemana(MEMES, 10, 202640);
    const b = daSemana(MEMES, 10, 202641);
    expect(new Set(a).size).toBe(10);
    expect(a).not.toEqual(b);
  });
  it('charadas não repetem por 14 trocas seguidas (42 dias, troca a cada 3 dias)', () => {
    const vistas = new Set<string>();
    for (let p = 1000; p < 1014; p++) for (const [q] of daSemana(CHARADAS, 8, p)) vistas.add(q);
    expect(vistas.size).toBe(14 * 8);
  });
  it('charada: pergunta e, logo depois, a resposta (8 por troca)', () => {
    const t = produzirTextos(202640);
    expect(t.charadas).toHaveLength(16);
    expect(t.charadas[0].chave.endsWith('-p')).toBe(true);
    expect(t.charadas[1].chave.endsWith('-r')).toBe(true);
    expect(t.charadas[1].html(1920, 1080)).toContain('RESPOSTA');
    expect(t.memes).toHaveLength(10);
  });
});

describe('Notícias', () => {
  it('fontes intercaladas e sem título repetido', () => {
    const n = (t: string, f: string) => ({ titulo: t, fonte: f });
    const r = intercalar([[n('A1', 'a'), n('A2', 'a'), n('Igual', 'a')], [n('B1', 'b'), n('igual', 'b')]], 10);
    expect(r.map((x: { titulo: string }) => x.titulo)).toEqual(['A1', 'B1', 'A2', 'igual']);
  });
  it('crédito sempre na tela e foto da notícia na arte', () => {
    expect(creditoNoticia({ credito: 'Rafael Ribeiro/CBF', fonte: 'Agência Brasil' })).toBe('Foto: Rafael Ribeiro/CBF · Agência Brasil');
    expect(creditoNoticia({ credito: null, fonte: 'g1' })).toBe('Imagem e notícia: g1');
    const html = htmlNoticia({ titulo: 'Título <b>', resumo: 'Resumo', imagem: 'https://x.com/f.jpg', credito: null, fonte: 'g1' }, 'CINEMA', 1920, 1080);
    expect(html).toContain('https://x.com/f.jpg');
    expect(html).toContain('Título &lt;b&gt;');
    expect(html).toContain('CINEMA');
  });
  it('feed: jogo ao vivo e enquete ficam de fora', () => {
    const xml = `<rss><channel>
      <item><title>Notícia boa</title><link>https://s.com/n/1</link><media:content url="https://s.com/1.jpg" medium="image"/><pubDate>Sat, 26 Sep 2026 10:00:00 -0300</pubDate></item>
      <item><title>A x B - Série B 2026 - Ao vivo - globoesporte.com</title><link>https://s.com/j</link></item>
      <item><title>Enquete: quem?</title><link>https://s.com/e/1</link></item></channel></rss>`;
    const itens = lerFeed(xml, 'teste');
    expect(itens.map((i: { titulo: string }) => i.titulo)).toEqual(['Notícia boa']);
    expect(itens[0].imagem).toBe('https://s.com/1.jpg');
  });
  it('cortar no fim da palavra', () => {
    expect(cortar('uma frase bem comprida para cortar', 15)).toBe('uma frase bem…');
  });
});

describe('Campeonatos e Apostas Esportivas (sem odds)', () => {
  const jogo = { mandante: 'Vasco', visitante: 'Coritiba', placarMandante: 5, placarVisitante: 0, data: '2026-09-19', hora: '18:30', escudoMandante: 'https://x/v.png', escudoVisitante: null };
  const dados = { competicoes: [{ slug: 'brasileirao', nome: 'Brasileirão Série A', fundoH: '/esportes/fundos/brasileirao-h.jpg?v=4', fundoV: null, fundoComTitulo: true, ultimos: [jogo], proximos: [{ ...jogo, placarMandante: null, placarVisitante: null }] }] };
  it('resultados, próximos e jogos da rodada', () => {
    const c = produzirCampeonatos(dados);
    expect(c['campeonato-brasileirao'].map((i: { chave: string }) => i.chave)).toEqual(['resultados', 'proximos']);
    expect(c['campeonato-premier-league']).toEqual([]);
    expect(c['jogos-rodada'].map((i: { chave: string }) => i.chave)).toEqual(['rodada-brasileirao']);
    const html = c['campeonato-brasileirao'][0].html(1920, 1080);
    expect(html).toContain('5 × 0');
    expect(html).toContain("url('https://sitesobremidia.vercel.app/esportes/fundos/brasileirao-h.jpg?v=4')");
    expect(html).toContain('<span class="esc ini">COR</span>'); // sem escudo conferido: iniciais, nunca outro escudo
    expect(c['jogos-rodada'][0].html(1080, 1920)).not.toMatch(/odd|cota[cç]/i);
  });
  it('data curta e iniciais', () => {
    expect(dataCurta('2026-09-19')).toBe('SÁB 19/09');
    expect(iniciais('Athletico-PR')).toBe('AP');
  });
});

describe('Vídeos (Pexels) — F-97', () => {
  it('escolhe MP4 HD na orientação certa, nunca arquivo gigante', async () => {
    const { escolherArquivo } = await import('../../../scripts/conteudo/produtores/videos.mjs');
    const v = { video_files: [
      { file_type: 'video/mp4', width: 3840, height: 2160, link: 'https://x/4k.mp4' },
      { file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://x/fhd.mp4' },
      { file_type: 'video/mp4', width: 1280, height: 720, link: 'https://x/hd.mp4' },
      { file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://x/vert.mp4' },
    ] };
    expect(escolherArquivo(v, 'landscape')!.link).toBe('https://x/fhd.mp4');
    expect(escolherArquivo(v, 'portrait')!.link).toBe('https://x/vert.mp4');
    expect(escolherArquivo({ video_files: [{ file_type: 'video/mp4', width: 3840, height: 2160, link: 'https://x/4k.mp4' }] }, 'portrait')).toBeNull();
  });
});

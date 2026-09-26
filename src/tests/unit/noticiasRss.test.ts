/** Motor de notícias — leitor do RSS da Agência Brasil. Amostras de TESTE no formato real do feed. */
import { describe, it, expect } from 'vitest';
import { parseRss, resumoDe, decodificar } from '../../../supabase/functions/_shared/noticias/rss';

const AGORA = new Date('2026-09-26T12:00:00Z');
const item = (o: { titulo?: string; link?: string; data?: string; desc?: string; guid?: string }) => `
  <item>
    <title>${o.titulo ?? 'Brasil empata com Austrália em amistoso'}  </title>
    <link>${o.link ?? 'https://agenciabrasil.ebc.com.br/esportes/noticia/2026-09/exemplo'}</link>
    <imagem-destaque>https://imagens.ebc.com.br/x/1170x700/smart/foto.jpg</imagem-destaque>
    <description>${o.desc ?? '&lt;p&gt;&lt;img src=&quot;logo.svg&quot; alt=&quot;Logo Agência Brasil&quot;&gt;&lt;/p&gt;&lt;strong&gt;A seleção brasileira empatou nesta sexta-feira (25) com a Austrália em amistoso disputado em Sydney.&lt;/strong&gt; &lt;img src=&quot;https://agenciabrasil.ebc.com.br/ebc.png?id=1&quot; /&gt;&lt;/p&gt;&lt;p&gt;Segundo parágrafo.&lt;/p&gt;&lt;h3&gt;Notícias relacionadas:&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;x&lt;/li&gt;&lt;/ul&gt;'}</description>
    <pubDate>${o.data ?? 'Fri, 25 Sep 2026 09:47:00 -0300'}</pubDate>
    <dc:creator>Juliano Justo - Repórter da Agência Brasil</dc:creator>
    <guid isPermaLink="false">${o.guid ?? '1703312 at https://agenciabrasil.ebc.com.br'}</guid>
  </item>`;
const feed = (...itens: string[]) => `<?xml version="1.0"?><rss><channel>${itens.join('')}</channel></rss>`;

describe('RSS Agência Brasil', () => {
  it('extrai título, resumo limpo (sem logo, pixel e "relacionadas"), data em UTC, autor e guid', () => {
    const { itens, recusados } = parseRss(feed(item({})), 'agenciabrasil.ebc.com.br', AGORA);
    expect(recusados).toEqual([]);
    expect(itens).toEqual([{
      guid: '1703312 at https://agenciabrasil.ebc.com.br',
      titulo: 'Brasil empata com Austrália em amistoso',
      resumo: 'A seleção brasileira empatou nesta sexta-feira (25) com a Austrália em amistoso disputado em Sydney.',
      link: 'https://agenciabrasil.ebc.com.br/esportes/noticia/2026-09/exemplo',
      publicadoEm: '2026-09-25T12:47:00.000Z',
      autor: 'Juliano Justo - Repórter da Agência Brasil',
    }]);
  });

  it('recusa link de outro domínio, data inválida, futura ou antiga, e item sem título', () => {
    const { itens, recusados } = parseRss(feed(
      item({ link: 'https://g1.globo.com/noticia' }),
      item({ data: 'ontem' }),
      item({ data: 'Sun, 27 Sep 2026 12:00:00 -0300' }),
      item({ data: 'Mon, 01 Jun 2026 12:00:00 -0300' }),
      item({ titulo: '' }),
    ), 'agenciabrasil.ebc.com.br', AGORA);
    expect(itens).toEqual([]);
    expect(recusados.map((r) => r.motivo)).toEqual(['link_fora_da_fonte', 'data_invalida', 'data_no_futuro', 'antiga_demais', 'sem_titulo']);
  });

  it('resumo longo é cortado em fim de frase ou palavra', () => {
    const longo = 'Frase um com bastante texto para ocupar espaço no resumo da notícia. '.repeat(6);
    const r = resumoDe(`&lt;p&gt;${longo}&lt;/p&gt;`);
    expect(r.length).toBeLessThanOrEqual(241);
    expect(r.endsWith('.') || r.endsWith('…')).toBe(true);
  });

  it('link removido do meio da frase não deixa espaço antes da pontuação', () => {
    expect(resumoDe('&lt;p&gt;A final será entre &lt;a href=&quot;x&quot;&gt;Corinthians e São Paulo&lt;/a&gt;. Jogo no sábado ( 26 ).&lt;/p&gt;'))
      .toBe('A final será entre Corinthians e São Paulo. Jogo no sábado (26).');
  });

  it('decodifica entidades numéricas e CDATA', () => {
    expect(decodificar('<![CDATA[S&#227;o Paulo &amp; Santos]]>')).toBe('São Paulo & Santos');
  });
});

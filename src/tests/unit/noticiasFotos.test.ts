/** Esportes News (F-90) — imagem da notícia: só foto que a fonte pode ceder. Amostras de TESTE no formato real das páginas. */
import { describe, it, expect } from 'vitest';
import { fotoPropriaDoArtigo, creditoProprio, normalizarCredito } from '../../../supabase/functions/_shared/noticias/fotos';
import { imagemDoItem } from '../../../supabase/functions/_shared/noticias/rss';

const FOTO = 'https://imagens.ebc.com.br/AbC=/1170x700/smart/https://agenciabrasil.ebc.com.br/sites/default/files/thumbnails/image/foto.jpg?itok=x1';
const materia = (credito: string, extra = '') => `<html><h1>Título</h1>${extra}
  <img src="/sites/default/files/thumbnails/image/loading_v2.gif" data-echo="${FOTO}" alt="Legenda" title="${credito}">
  <img src="${FOTO}" alt="Legenda" title="${credito}">
  <p>Texto…</p><img data-echo="https://imagens.ebc.com.br/Z=/390x240/smart/outra.jpg" title="Outra/Agência Brasil"></html>`;

describe('Foto própria da matéria (Agência Brasil, CC BY 4.0)', () => {
  it('aceita a foto principal com crédito do próprio veículo', () => {
    expect(fotoPropriaDoArtigo(materia('Tânia Rêgo/Agência Brasil'))).toEqual({ url: FOTO, credito: 'Tânia Rêgo/Agência Brasil' });
    expect(fotoPropriaDoArtigo(materia('Arte/EBC'))?.credito).toBe('Arte/EBC');
  });

  it('recoloca a barra que o site às vezes perde no crédito', () => {
    expect(fotoPropriaDoArtigo(materia('Marcello Casal JrAgência Brasil'))?.credito).toBe('Marcello Casal Jr/Agência Brasil');
    expect(normalizarCredito('Arte/Agência Brasil')).toBe('Arte/Agência Brasil');
  });

  it('recusa foto de terceiros publicada pela Agência Brasil (a licença não a cobre)', () => {
    for (const c of ['Rafael Ribeiro/CBF', 'Sofia Brito/CBDV', 'Reuters/Jakub Porzycki/Proibida reprodução',
      'Vitor Silva/Botafogo/Direitos Reservados', 'Rubens Chiri/São Paulo FC', 'CBG/Divulgação', '']) {
      expect(fotoPropriaDoArtigo(materia(c))).toBeNull();
    }
  });

  it('crédito "próprio" com marca de reserva de direitos também é recusado', () => {
    expect(creditoProprio('Fulano/Agência Brasil/Proibida reprodução')).toBe(false);
    expect(creditoProprio('Joédson Alves/Agência Brasil')).toBe(true);
    expect(creditoProprio('Reprodução/TV Brasil')).toBe(true);
  });

  it('matéria sem foto principal -> null (a notícia não entra no Esportes News)', () => {
    expect(fotoPropriaDoArtigo('<html><h1>Sem foto</h1><p>texto</p></html>')).toBeNull();
    // miniatura de outra matéria (390x240) não é a foto principal
    expect(fotoPropriaDoArtigo('<img data-echo="https://imagens.ebc.com.br/Z=/390x240/smart/x.jpg" title="A/Agência Brasil">')).toBeNull();
  });
});

describe('Imagem do item do feed (fonte com imagem = "feed")', () => {
  const IMG = 'https://img.exemplo.com/noticia/foto.jpg';
  it('media:content de imagem', () => {
    expect(imagemDoItem(`<item><media:content url="${IMG}" medium="image"/></item>`)).toBe(IMG);
    expect(imagemDoItem(`<item><media:content url="${IMG}" type="image/jpeg"></media:content></item>`)).toBe(IMG);
  });
  it('enclosure de imagem; enclosure de áudio/vídeo é ignorado', () => {
    expect(imagemDoItem(`<item><enclosure url="${IMG}" type="image/jpeg" length="1"/></item>`)).toBe(IMG);
    expect(imagemDoItem(`<item><enclosure url="https://x.com/a.mp3" type="audio/mpeg"/></item>`)).toBeNull();
  });
  it('1º <img> da descrição, sem logo nem pixel de rastreio', () => {
    const desc = `<description><![CDATA[<img src="https://x.com/logo.svg"><img src="https://x.com/p.gif" style="width:1px; height:1px"><img src="${IMG}" />]]></description>`;
    expect(imagemDoItem(`<item>${desc}</item>`)).toBe(IMG);
  });
  it('só https (http e caminhos relativos não servem)', () => {
    expect(imagemDoItem('<item><media:content url="http://x.com/a.jpg" medium="image"/></item>')).toBeNull();
    expect(imagemDoItem('<item><description>&lt;img src="/a.jpg"&gt;</description></item>')).toBeNull();
  });
});

describe('F-91 — foto da própria notícia (decisão do proprietário), qualquer crédito', () => {
  it('foto principal da Agência Brasil com crédito de terceiros é aceita, com o crédito original', async () => {
    const { fotoPrincipalDoArtigo } = await import('../../../supabase/functions/_shared/noticias/fotos');
    expect(fotoPrincipalDoArtigo(materia('Rafael Ribeiro/CBF'))).toEqual({ url: FOTO, credito: 'Rafael Ribeiro/CBF' });
    expect(fotoPrincipalDoArtigo(materia(''))).toEqual({ url: FOTO, credito: null });
    expect(fotoPrincipalDoArtigo('<html><h1>Sem foto</h1></html>')).toBeNull();
  });

  it('imagem da página de qualquer site: og:image/twitter:image, nunca a imagem genérica do site', async () => {
    const { imagemDaPagina } = await import('../../../supabase/functions/_shared/noticias/fotos');
    expect(imagemDaPagina('<meta property="og:image" content="https://site.com/fotos/jogo.jpg">')).toEqual({ url: 'https://site.com/fotos/jogo.jpg', credito: null });
    expect(imagemDaPagina('<meta content="https://site.com/a.jpg" property="og:image">')?.url).toBe('https://site.com/a.jpg');
    expect(imagemDaPagina('<meta name="twitter:image" content="https://site.com/b.jpg">')?.url).toBe('https://site.com/b.jpg');
    expect(imagemDaPagina('<meta property="og:image" content="https://cdn.x/thumbs/thumb_1200x600_agbrasil.png">')).toBeNull();
    expect(imagemDaPagina('<meta property="og:image" content="https://site.com/logo-share.png">')).toBeNull();
    expect(imagemDaPagina(materia('Rafael Ribeiro/CBF'))?.url).toBe(FOTO);
  });

  it('feed: página de jogo ao vivo, enquete e link da home não são notícia; emoji de vídeo sai do título', async () => {
    const { naoENoticia, parseRss } = await import('../../../supabase/functions/_shared/noticias/rss');
    expect(naoENoticia('Criciúma x Avaí - Campeonato Brasileiro Série B 2026 - Ao vivo - globoesporte.com', 'https://ge.globo.com/')).toBe(true);
    expect(naoENoticia('Alemanha x Grécia - Liga das Nações 2026/2027 - globoesporte.com', 'https://ge.globo.com/x/jogo.ghtml')).toBe(true);
    expect(naoENoticia('Enquete: quem é o melhor?', 'https://ge.globo.com/a/b.ghtml')).toBe(true);
    expect(naoENoticia('Picos bate o Flamengo', 'https://ge.globo.com/')).toBe(true);
    expect(naoENoticia('Picos bate o Flamengo e segue invicto', 'https://ge.globo.com/pi/noticia/x.ghtml')).toBe(false);
    const xml = `<rss><channel><item><title>▶️ Picos bate o Flamengo</title><link>https://ge.globo.com/pi/noticia/x.ghtml</link><pubDate>Sat, 26 Sep 2026 22:00:00 -0300</pubDate></item></channel></rss>`;
    expect(parseRss(xml, 'ge.globo.com', new Date('2026-09-27T12:00:00Z')).itens[0].titulo).toBe('Picos bate o Flamengo');
  });
});

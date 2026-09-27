package com.antigravity.player

import com.antigravity.player.widget.ImagemDaNoticia
import com.antigravity.player.widget.RssFeedParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** F-91 — notícia RSS sempre com a imagem da notícia: mesma regra do servidor (rss.ts / fotos.ts). Dados de TESTE. */
class ImagemDaNoticiaTest {
    private val img = "https://img.exemplo.com/noticia/foto.jpg"

    @Test fun `imagem do item - media content, enclosure de imagem e img da descricao sem logo nem pixel`() {
        assertEquals(img, ImagemDaNoticia.doItem("""<item><media:content url="$img" medium="image"/></item>"""))
        assertEquals(img, ImagemDaNoticia.doItem("""<item><enclosure url="$img" type="image/jpeg"/></item>"""))
        assertNull(ImagemDaNoticia.doItem("""<item><enclosure url="https://x.com/a.mp3" type="audio/mpeg"/></item>"""))
        val desc = """<item><description><![CDATA[<img src="https://x.com/logo.svg"><img src="https://x.com/p.gif" style="width:1px; height:1px"><img src="$img" />]]></description></item>"""
        assertEquals(img, ImagemDaNoticia.doItem(desc))
        assertNull(ImagemDaNoticia.doItem("""<item><media:content url="http://x.com/a.jpg" medium="image"/></item>"""))
    }

    @Test fun `imagem da pagina - foto principal da Agencia Brasil ou og image, nunca a generica`() {
        val ab = "https://imagens.ebc.com.br/AbC=/1170x700/smart/https://agenciabrasil.ebc.com.br/x/foto.jpg?itok=1"
        assertEquals(ab, ImagemDaNoticia.daPagina("""<h1>T</h1><img src="/loading.gif" data-echo="$ab" title="Rafael Ribeiro/CBF">"""))
        assertEquals("https://site.com/f.jpg", ImagemDaNoticia.daPagina("""<meta property="og:image" content="https://site.com/f.jpg">"""))
        assertEquals("https://site.com/g.jpg", ImagemDaNoticia.daPagina("""<meta content="https://site.com/g.jpg" property="og:image" />"""))
        assertNull(ImagemDaNoticia.daPagina("""<meta property="og:image" content="https://cdn.x/thumbs/thumb_1200x600_agbrasil.png">"""))
        assertNull(ImagemDaNoticia.daPagina("""<meta property="og:image" content="https://site.com/logo.png">"""))
        assertNull(ImagemDaNoticia.daPagina("<html><body>sem imagem</body></html>"))
    }

    @Test fun `parser do feed traz link e imagem de cada noticia`() {
        val xml = """<rss><channel>
            <item><title>Com foto</title><link>https://site.com/n1</link><media:content url="$img" medium="image"/></item>
            <item><title>Sem foto</title><link>https://site.com/n2</link><description>texto</description></item>
            </channel></rss>"""
        val itens = RssFeedParser.parse(xml, 10)
        assertEquals(listOf("https://site.com/n1", "https://site.com/n2"), itens.map { it.link })
        assertEquals(img, itens[0].imagem)
        assertNull(itens[1].imagem)
    }
}

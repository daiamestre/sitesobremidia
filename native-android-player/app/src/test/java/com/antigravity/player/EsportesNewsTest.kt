package com.antigravity.player

import com.antigravity.player.widget.EsportesNews
import com.antigravity.player.widget.EsportesText
import com.antigravity.player.widget.NoticiaEsporte
import com.antigravity.player.widget.WidgetKind
import com.antigravity.player.widget.WidgetSpecParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.net.URLEncoder

/** Esportes News (F-90): widget próprio; notícia sempre com a imagem da notícia. Dados de TESTE. */
class EsportesNewsTest {

    private fun url(tipo: String, config: String) = "native_widget://$tipo/w9?config=" + URLEncoder.encode(config, "UTF-8")

    private val config = """
        {"template":"esportes-news","maxItems":10,"esportesNews":{"geradoEm":"2026-09-27T16:00:00Z","itens":[
          {"id":"a1","titulo":"Seleção treina no Rio","resumo":"Treino aberto.","imagem":"https://imagens.ebc.com.br/a/1170x700/smart/f.jpg","creditoImagem":"Tânia Rêgo/Agência Brasil","fonte":"Agência Brasil","publicadoEm":"2026-09-27T15:30:00+00:00"},
          {"id":"b2","titulo":"Sem imagem","imagem":null,"fonte":"Agência Brasil"},
          {"id":"c3","titulo":"Imagem http","imagem":"http://x.com/a.jpg","fonte":"X"},
          {"id":"d4","titulo":"  ","imagem":"https://x.com/b.jpg","fonte":"X"},
          {"id":"e5","titulo":"Arte da transmissão","imagem":"https://imagens.ebc.com.br/e/1170x700/smart/g.jpg","creditoImagem":"Arte/EBC","fonte":"Agência Brasil","publicadoEm":"2026-09-26T12:05:00Z"}
        ]}}
    """.trimIndent()

    private fun n(id: String) = NoticiaEsporte(id, "T$id", null, "https://x.com/$id.jpg", null, "F", null)

    @Test fun `tipo sports_news vira SPORTS_NEWS (nao RSS nem SPORTS) e so entram noticias com imagem https`() {
        val s = WidgetSpecParser.parse(url("sports_news", config))
        assertEquals(WidgetKind.SPORTS_NEWS, s.kind)
        assertEquals(listOf("a1", "e5"), s.esportesNews!!.map { it.id })
        assertEquals("Tânia Rêgo/Agência Brasil", s.esportesNews!![0].creditoImagem)
        assertNull(s.esportes)
        assertNull(s.noticiasProntas)
        // outros tipos não leem esportesNews
        assertNull(WidgetSpecParser.parse(url("rss", config)).esportesNews)
        assertEquals(WidgetKind.SPORTS, WidgetSpecParser.parse(url("sports", "{}")).kind)
        assertEquals(WidgetKind.RSS, WidgetSpecParser.parse(url("rss", "{}")).kind)
    }

    @Test fun `sem dados do servidor nao quebra`() {
        val s = WidgetSpecParser.parse(url("sports_news", "{}"))
        assertEquals(WidgetKind.SPORTS_NEWS, s.kind)
        assertNull(s.esportesNews)
    }

    @Test fun `3 noticias por exibicao continuando da seguinte`() {
        val itens = listOf("a", "b", "c", "d", "e").map(::n)
        assertEquals(listOf(0, 1, 2), EsportesNews.indicesDaExibicao(itens, null))
        assertEquals("d", EsportesNews.proximaDepois(itens, 2))
        assertEquals(listOf(3, 4, 0), EsportesNews.indicesDaExibicao(itens, "d"))
        assertEquals(listOf(0, 1, 2), EsportesNews.indicesDaExibicao(itens, "expirou"))
        assertEquals(listOf(0), EsportesNews.indicesDaExibicao(listOf(n("x")), null))
        assertEquals(emptyList<Int>(), EsportesNews.indicesDaExibicao(emptyList(), null))
    }

    @Test fun `credito e horario iguais ao painel`() {
        val s = WidgetSpecParser.parse(url("sports_news", config)).esportesNews!!
        assertEquals("Foto: Tânia Rêgo/Agência Brasil", EsportesNews.credito(s[0]))
        assertEquals("Arte/EBC · Agência Brasil", EsportesNews.credito(s[1]))
        assertEquals("Imagem: F", EsportesNews.credito(n("z")))
        val agora = EsportesText.isoParaMs("2026-09-27T20:00:00Z")!!
        assertEquals("Hoje, 12:30", EsportesNews.quando(s[0].publicadoEmMs, agora))
        assertEquals("Ontem, 09:05", EsportesNews.quando(s[1].publicadoEmMs, agora))
        assertEquals("20/09, 20:10", EsportesNews.quando(EsportesText.isoParaMs("2026-09-20T23:10:00Z"), agora))
        assertEquals("", EsportesNews.quando(null, agora))
    }
}

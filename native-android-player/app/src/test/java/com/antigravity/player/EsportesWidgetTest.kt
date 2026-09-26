package com.antigravity.player

import com.antigravity.player.widget.EsportesText
import com.antigravity.player.widget.WidgetKind
import com.antigravity.player.widget.WidgetSpecParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.URLEncoder

/** Widget Esportes: o Player só desenha o que o servidor resolveu (config.esportes). Dados de TESTE. */
class EsportesWidgetTest {

    private fun url(tipo: String, config: String) = "native_widget://$tipo/w1?config=" + URLEncoder.encode(config, "UTF-8")

    private val config = """
        {"template":"sports-proximos","modo":"proximos","cores":{"c1":"#0A1F44","c2":"#1565C0","c3":"#1E88E5","brilho":"#64B5F6","selo":"#FFD400","seloTexto":"#0A1F44"},
         "esportes":{"modo":"proximos","creditos":"Dados: openfootball (CC0) · Wikipédia (CC BY-SA)","jogos":[
           {"competicao":"Brasileirão Série A","codigo":"BSA","slug":"brasileirao","mandante":"São Paulo","visitante":"Santos","placarMandante":null,"placarVisitante":null,"status":"SCHEDULED","data":"2026-10-02","hora":"20:00","kickoffUtc":"2026-10-02T23:00:00+00:00"},
           {"competicao":"Brasileirão Série A","codigo":"BSA","slug":"brasileirao","mandante":"Flamengo","visitante":"Bragantino","placarMandante":2,"placarVisitante":1,"status":"FINISHED","data":"2026-09-20","hora":"18:30","kickoffUtc":"2026-09-20 21:30:00+00"},
           {"competicao":"La Liga","codigo":"PD","slug":"la-liga","mandante":"Levante","visitante":"Athletic","status":"SCHEDULED","data":"2026-10-21","hora":null,"kickoffUtc":null},
           {"mandante":"Sem data","visitante":"X","data":"ontem"}
         ]}}
    """.trimIndent()

    @Test fun `tipo sports vira SPORTS e le os jogos confirmados`() {
        val s = WidgetSpecParser.parse(url("sports", config))
        assertEquals(WidgetKind.SPORTS, s.kind)
        val d = s.esportes!!
        assertEquals("proximos", d.modo)
        assertEquals(3, d.jogos.size) // o item sem data válida é descartado
        assertEquals("São Paulo", d.jogos[0].mandante)
        assertEquals(1790982000000L, d.jogos[0].kickoffUtcMs) // 2026-10-02T23:00:00Z
        assertEquals(1789939800000L, d.jogos[1].kickoffUtcMs) // formato do Postgres com espaço e +00
        assertNull(d.jogos[2].hora)
        assertEquals(0xFF1565C0.toInt(), s.cores!!.c2)
    }

    @Test fun `centro mostra placar do jogo encerrado e horario do futuro`() {
        val j = WidgetSpecParser.parse(url("sports", config)).esportes!!.jogos
        assertEquals("20:00" to false, EsportesText.centro(j[0]))
        assertEquals("2 × 1" to true, EsportesText.centro(j[1]))
        assertEquals("a definir" to false, EsportesText.centro(j[2]))
    }

    @Test fun `data curta em portugues sem trocar o dia`() {
        assertEquals("sex 02/10", EsportesText.dataCurta("2026-10-02"))
        assertEquals("sáb 03/10", EsportesText.dataCurta("2026-10-03"))
        assertEquals("dom 27/09", EsportesText.dataCurta("2026-09-27"))
        assertEquals("xx", EsportesText.dataCurta("xx"))
    }

    @Test fun `proximos tira o jogo que ja comecou mesmo com dado antigo`() {
        val d = WidgetSpecParser.parse(url("sports", config)).esportes!!
        val antesDoJogo = EsportesText.visiveis(d, 1790982000000L - 1)
        assertTrue(antesDoJogo.any { it.mandante == "São Paulo" })
        val depoisDoInicio = EsportesText.visiveis(d, 1790982000000L + 1)
        assertTrue(depoisDoInicio.none { it.mandante == "São Paulo" })
        assertTrue(depoisDoInicio.any { it.mandante == "Levante" }) // sem horário definido continua
    }

    @Test fun `noticias automaticas vem prontas e o feed nao e lido`() {
        val cfg = """{"origem":"agencia-brasil","categoria":"esportes","feedUrl":"https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml",
            "noticias":{"itens":[{"titulo":"Brasil empata com Austrália","resumo":"Amistoso em Sydney."},{"titulo":""}]}}"""
        val s = WidgetSpecParser.parse(url("rss", cfg))
        assertEquals(WidgetKind.RSS, s.kind)
        assertEquals(1, s.noticiasProntas!!.size)
        assertEquals("Brasil empata com Austrália", s.noticiasProntas!![0].title)
        // RSS comum (sem origem) continua lendo o feed
        assertNull(WidgetSpecParser.parse(url("rss", """{"feedUrl":"https://exemplo.com/rss"}""")).noticiasProntas)
    }
}

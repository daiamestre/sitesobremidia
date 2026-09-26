package com.antigravity.player

import com.antigravity.player.widget.CoresWidget
import com.antigravity.player.widget.WidgetSpecParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.net.URLEncoder

/** Cores do Relógio/Clima Futurista escolhidas no painel: aplicadas como vieram; inválidas -> padrão SOBRE MÍDIA. */
class CoresWidgetTest {

    private fun url(type: String, cfg: String) = "native_widget://$type/abc?config=" + URLEncoder.encode(cfg, "UTF-8")

    // Mesmo formato que o painel grava (src/lib/widgetPaletas.ts — paleta "Azul Oceano")
    private val oceano = """{"template":"clock-futurista","paleta":"oceano",
        "cores":{"c1":"#031B4E","c2":"#0A5BD8","c3":"#1A7FD0","brilho":"#4CC3FF","selo":"#FFD400","seloTexto":"#031B4E"}}"""

    @Test
    fun coresDoPainel_saoAplicadas() {
        val c = WidgetSpecParser.parse(url("clock", oceano)).cores!!
        assertEquals(0xFF031B4E.toInt(), c.c1)
        assertEquals(0xFF0A5BD8.toInt(), c.c2)
        assertEquals(0xFF4CC3FF.toInt(), c.brilho)
        assertEquals(0xFFFFD400.toInt(), c.selo)
        // o clima usa as mesmas regras
        assertEquals(c, WidgetSpecParser.parse(url("weather", oceano)).cores)
    }

    @Test
    fun semCoresOuInvalidas_usaPadrao() {
        assertNull(WidgetSpecParser.parse(url("clock", """{"template":"clock-classic"}""")).cores) // widget antigo: padrão
        assertNull(CoresWidget.parse(null))
        // uma cor inválida (sem #, curta, texto) invalida o conjunto -> padrão, nunca cor quebrada na tela
        assertNull(WidgetSpecParser.parse(url("clock", """{"cores":{"c1":"031B4E","c2":"#0A5BD8","c3":"#1A7FD0","brilho":"#4CC3FF","selo":"#FFD400","seloTexto":"#031B4E"}}""")).cores)
        assertNull(WidgetSpecParser.parse(url("clock", """{"cores":{"c1":"#031B4E","c2":"#0A5","c3":"#1A7FD0","brilho":"#4CC3FF","selo":"#FFD400","seloTexto":"#031B4E"}}""")).cores)
        assertNull(WidgetSpecParser.parse(url("clock", """{"cores":{"c1":"#031B4E","c2":"#0A5BD8","c3":"#1A7FD0","brilho":"#4CC3FF","selo":"#FFD400"}}""")).cores)
        assertEquals(0xFF22004A.toInt(), CoresWidget.PADRAO.c1)
        assertEquals(0xFF5D1BFF.toInt(), CoresWidget.PADRAO.c2)
    }

    @Test
    fun comAlfa_mantemACorETrocaATransparencia() {
        assertEquals(0x96031B4E.toInt(), CoresWidget.comAlfa(0xFF031B4E.toInt(), 150))
        assertEquals(0x00031B4E, CoresWidget.comAlfa(0xFF031B4E.toInt(), 0))
    }
}

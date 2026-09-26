package com.antigravity.player

import com.antigravity.player.widget.BrasiliaTime
import com.antigravity.player.widget.CampanhaText
import com.antigravity.player.widget.WidgetKind
import com.antigravity.player.widget.WidgetSpecParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.URLEncoder

/** W8 — widget de Publicidade: o Player só apresenta os criativos que o servidor mandou da campanha, e só no ar. */
class CampanhaWidgetTest {

    private fun url(type: String, cfg: String) = "native_widget://$type/abc?config=" + URLEncoder.encode(cfg, "UTF-8")

    // Formato de fn_widget_campanha_dados (migração 20261243)
    private val cfg = """{"template":"advertising-campanha","campanhaId":"c1","cta":"Compre já","qrConteudo":"loja.com.br",
        "campanha":{"id":"c1","titulo":"Black Friday","status":"ACTIVE","data_inicio":"2026-09-20","data_fim":"2026-09-25","vigente":true,
        "criativos":["https://x/campanhas_midia/c1/a.jpg","file:///sdcard/x.png","https://x/campanhas_midia/c1/a.jpg","https://x/campanhas_midia/c1/b.png"]}}"""

    @Test
    fun spec_campanhaLidaDoPayloadDoServidor() {
        val s = WidgetSpecParser.parse(url("advertising", cfg))
        assertEquals(WidgetKind.ADVERTISING, s.kind)
        val c = s.campanha!!
        assertEquals("Black Friday", c.titulo)
        // só http(s), sem repetidos, na ordem
        assertEquals(listOf("https://x/campanhas_midia/c1/a.jpg", "https://x/campanhas_midia/c1/b.png"), c.criativos)
        assertEquals("Compre já", s.cta)
        assertNull(WidgetSpecParser.parse(url("offer", cfg)).campanha)
        assertNull(WidgetSpecParser.parse(url("advertising", """{"campanhaId":"c1"}""")).campanha)
    }

    @Test
    fun noAr_peloDiaDeBrasilia() {
        val c = WidgetSpecParser.parse(url("advertising", cfg)).campanha!!
        val noite25 = java.time.Instant.parse("2026-09-26T02:30:00Z").toEpochMilli()
        val meiaNoite26 = java.time.Instant.parse("2026-09-26T03:00:00Z").toEpochMilli()
        assertTrue(CampanhaText.vigente(c, BrasiliaTime.isoDate(noite25)))
        assertFalse(CampanhaText.vigente(c, BrasiliaTime.isoDate(meiaNoite26)))
        assertFalse(CampanhaText.vigente(c.copy(vigenteNoServidor = false), "2026-09-22"))
        assertFalse(CampanhaText.vigente(c.copy(criativos = emptyList()), "2026-09-22"))
    }
}

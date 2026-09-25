package com.antigravity.player

import com.antigravity.player.widget.BrasiliaTime
import com.antigravity.player.widget.OfertaText
import com.antigravity.player.widget.WidgetKind
import com.antigravity.player.widget.WidgetSpecParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.URLEncoder

/** W7 — widget de Oferta: o Player só apresenta o que o servidor mandou do cadastro, e nunca preço vencido. */
class OfertaWidgetTest {

    private fun url(type: String, cfg: String) = "native_widget://$type/abc?config=" + URLEncoder.encode(cfg, "UTF-8")

    // Exatamente o formato de fn_widget_oferta_dados (migração 20261242)
    private val oferta = """{"template":"offer-destaque","ofertaId":"o1","qrConteudo":"loja.com.br",
        "oferta":{"id":"o1","titulo":"Semana do Café","descricao":null,"status":"PUBLISHED","data_inicio":"2026-09-20","data_fim":"2026-09-25","vigente":true,
        "itens":[{"nome":"Café Tradicional 500g","marca":"Serra","unidade":"UN","imagem_url":"https://cdn/x.png","preco_original":19.90,"preco_oferta":14.90,"desconto":0,"destaque":true},
                 {"nome":"Sem preço"},
                 {"nome":"Leite 1L","imagem_url":"file:///sdcard/x.png","preco_original":6,"preco_oferta":4.99,"desconto":20,"destaque":false}]}}"""

    @Test
    fun spec_ofertaLidaDoPayloadDoServidor() {
        val s = WidgetSpecParser.parse(url("offer", oferta))
        assertEquals(WidgetKind.OFFER, s.kind)
        val o = s.oferta!!
        assertEquals("Semana do Café", o.titulo)
        assertNull(o.descricao)
        assertEquals(2, o.itens.size) // item sem preço é descartado
        assertEquals(14.90, o.itens[0].precoOferta, 0.0001)
        assertEquals("https://cdn/x.png", o.itens[0].imagemUrl)
        assertNull(o.itens[1].imagemUrl) // só http(s)
        assertEquals("loja.com.br", s.qrConteudo)
        assertNull(WidgetSpecParser.parse(url("clock", oferta)).oferta)
        assertNull(WidgetSpecParser.parse(url("offer", """{"ofertaId":"o1"}""")).oferta) // Player antigo/sem dados
    }

    @Test
    fun validade_peloDiaDeBrasilia_naoPeloUtc() {
        val o = WidgetSpecParser.parse(url("offer", oferta)).oferta!!
        val noite25Brt = java.time.Instant.parse("2026-09-26T02:30:00Z").toEpochMilli() // 23:30 do dia 25 em Brasília
        val meiaNoite26 = java.time.Instant.parse("2026-09-26T03:00:00Z").toEpochMilli()
        assertEquals("2026-09-25", BrasiliaTime.isoDate(noite25Brt))
        assertTrue(OfertaText.vigente(o, BrasiliaTime.isoDate(noite25Brt)))
        assertFalse(OfertaText.vigente(o, BrasiliaTime.isoDate(meiaNoite26)))
        assertFalse(OfertaText.vigente(o, "2026-09-19"))
        assertFalse(OfertaText.vigente(o.copy(vigenteNoServidor = false), "2026-09-22"))
        assertFalse(OfertaText.vigente(o.copy(itens = emptyList()), "2026-09-22"))
    }

    @Test
    fun formatos_igualAoPainel() {
        assertEquals("R$ 14,90", OfertaText.precoBR(14.9))
        assertEquals("1.234" to "50", OfertaText.partes(1234.5))
        assertEquals("14" to "90", OfertaText.partes(14.9))
        val o = WidgetSpecParser.parse(url("offer", oferta)).oferta!!
        assertEquals(25, OfertaText.desconto(o.itens[0]))
        assertEquals(20, OfertaText.desconto(o.itens[1]))
        assertEquals("Válido até 30/09", OfertaText.validade("2026-09-30", "2026-09-25"))
        assertEquals("Válido só hoje", OfertaText.validade("2026-09-25", "2026-09-25"))
    }
}

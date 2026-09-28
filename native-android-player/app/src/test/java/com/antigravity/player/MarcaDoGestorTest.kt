package com.antigravity.player

import com.antigravity.player.util.MarcaDoGestor
import com.antigravity.sync.dto.MarcaPlayerDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** F-103 — marca do Gestor de Mídias no Player. */
class MarcaDoGestorTest {

    @Test
    fun `cor só vale em hexadecimal de 6 dígitos`() {
        assertTrue(MarcaDoGestor.corValida("#0F172A"))
        assertTrue(MarcaDoGestor.corValida("#ff6600"))
        assertFalse(MarcaDoGestor.corValida("0F172A"))
        assertFalse(MarcaDoGestor.corValida("#FFF"))
        assertFalse(MarcaDoGestor.corValida(null))
    }

    @Test
    fun `só baixa o logo quando é novo ou o arquivo sumiu, e só por https`() {
        val url = "https://cdn.exemplo.com/u1/marca/logo-1.png"
        assertTrue(MarcaDoGestor.precisaBaixar(null, url, false))
        assertFalse(MarcaDoGestor.precisaBaixar(url, url, true))
        assertTrue(MarcaDoGestor.precisaBaixar(url, url, false))
        assertTrue(MarcaDoGestor.precisaBaixar(url, "https://cdn.exemplo.com/u1/marca/logo-2.png", true))
        assertFalse(MarcaDoGestor.precisaBaixar(null, "http://inseguro.com/logo.png", false))
        assertFalse(MarcaDoGestor.precisaBaixar(url, null, true))
    }

    @Test
    fun `contrato da RPC fn_player_minha_marca é lido com campos opcionais`() {
        val json = Json { ignoreUnknownKeys = true }
        val ok = json.decodeFromString<MarcaPlayerDto>(
            """{"status":"OK","nome_marca":"Mídia Norte","logo_url":"https://x/l.png","cor_primaria":"#FF6600","cor_secundaria":"#0F172A","slogan":null,"atualizado_em":"2026-09-28T05:36:47Z","campo_novo":1}"""
        )
        assertEquals("OK", ok.status)
        assertEquals("Mídia Norte", ok.nomeMarca)
        assertEquals("#0F172A", ok.corSecundaria)
        val padrao = json.decodeFromString<MarcaPlayerDto>("""{"status":"PADRAO"}""")
        assertEquals("PADRAO", padrao.status)
        assertNull(padrao.logoUrl)
    }
}

package com.antigravity.player

import com.antigravity.player.radio.RadioParser
import com.antigravity.player.radio.RadioResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** F-150 — Rádio Comércio: leitura do contrato get_player_radio_for_screen. */
class RadioParserTest {
    private val resposta = """{"status":"SUCCESS","radio":{"playlist_id":"p1","volume":140,"embaralhar":true,"campo_novo":1,"faixas":[
        {"id":"a","media_id":"m1","nome":"Promoção","url":"https://cdn/x/promo.mp3","duracao":32},
        {"id":"b","url":null},{"id":"c","url":"javascript:alert(1)"},{"url":"https://cdn/x/sem-id.mp3"},
        {"id":"d","url":"https://cdn/x/musica.mp3"}]}}"""

    @Test fun `le a radio - so faixas com endereco valido e volume dentro do limite`() {
        val r = (RadioParser.parse(resposta) as RadioResult.Ok).radio
        assertEquals("p1", r.playlistId)
        assertEquals(listOf("a", "d"), r.faixas.map { it.id })
        assertEquals(100, r.volume)
        assertTrue(r.embaralhar)
    }

    @Test fun `sem radio, sem acesso ou sem faixas e silencio`() {
        assertTrue(RadioParser.parse("""{"status":"SEM_RADIO"}""") is RadioResult.None)
        assertTrue(RadioParser.parse("""{"status":"SEM_ACESSO"}""") is RadioResult.None)
        assertTrue(RadioParser.parse("""{"status":"SUCCESS","radio":{"playlist_id":"p","faixas":[]}}""") is RadioResult.None)
    }

    @Test fun `resposta que nao da para entender mantem o que esta tocando`() {
        assertTrue(RadioParser.parse(null) is RadioResult.Invalid)
        assertTrue(RadioParser.parse("lixo") is RadioResult.Invalid)
        assertTrue(RadioParser.parse("""{"status":"OUTRA"}""") is RadioResult.Invalid)
        assertTrue(RadioParser.parse("""{"status":"SUCCESS"}""") is RadioResult.Invalid)
    }

    @Test fun `mudar o volume nao reinicia a radio, mudar as faixas sim`() {
        val a = (RadioParser.parse(resposta) as RadioResult.Ok).radio
        val outroVolume = (RadioParser.parse(resposta.replace("140", "30")) as RadioResult.Ok).radio
        val outraFaixa = (RadioParser.parse(resposta.replace("musica.mp3", "outra.mp3")) as RadioResult.Ok).radio
        assertEquals(a.signature(), outroVolume.signature())
        assertNotEquals(a.signature(), outraFaixa.signature())
    }
}

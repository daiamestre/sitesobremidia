package com.antigravity.player

import com.antigravity.player.widget.BrasiliaTime
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.util.TimeZone

/**
 * Prova que o relógio dos widgets mostra SEMPRE o Horário de Brasília para um instante UTC conhecido, qualquer que seja
 * o fuso configurado no aparelho (UTC, Tóquio, Nova York, Lisboa, Manaus, São Paulo).
 */
class BrasiliaTimeTest {
    private lateinit var original: TimeZone

    @Before fun salva() { original = TimeZone.getDefault() }
    @After fun restaura() { TimeZone.setDefault(original) }

    // 2026-09-25T17:37:52Z = 14:37:52 em Brasília (UTC-3, sem horário de verão)
    private val instante = 1790357872000L
    private val fusosDoAparelho = listOf("UTC", "Asia/Tokyo", "America/New_York", "Europe/Lisbon", "America/Manaus", "America/Sao_Paulo")

    @Test fun instanteUtc_viraHorarioDeBrasilia_emQualquerFusoDoAparelho() {
        for (fuso in fusosDoAparelho) {
            TimeZone.setDefault(TimeZone.getTimeZone(fuso))
            assertEquals("aparelho em $fuso", "14:37:52", BrasiliaTime.time(instante, showSeconds = true))
            assertEquals("aparelho em $fuso", "14:37", BrasiliaTime.time(instante, showSeconds = false))
            assertEquals("aparelho em $fuso", "SEXTA-FEIRA · 25 DE SETEMBRO DE 2026", BrasiliaTime.dateLong(instante))
            assertEquals("aparelho em $fuso", "25/09/2026", BrasiliaTime.dateShort(instante))
            assertEquals("aparelho em $fuso", 14, BrasiliaTime.hourOfDay(instante))
        }
    }

    @Test fun viradaDoDia_segueBrasilia_naoUtc() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"))
        // 2026-09-26T02:59:59Z ainda é 25/09 23:59:59 em Brasília; 1 s depois vira 26/09 00:00:00
        val antes = 1790391599000L
        assertEquals("23:59:59", BrasiliaTime.time(antes, true))
        assertEquals("25/09/2026", BrasiliaTime.dateShort(antes))
        assertEquals("SEXTA-FEIRA · 25 DE SETEMBRO DE 2026", BrasiliaTime.dateLong(antes))
        assertEquals("00:00:00", BrasiliaTime.time(antes + 1_000, true))
        assertEquals("26/09/2026", BrasiliaTime.dateShort(antes + 1_000))
        assertEquals("SÁBADO · 26 DE SETEMBRO DE 2026", BrasiliaTime.dateLong(antes + 1_000))
    }

    @Test fun viradaDeMinutoESegundo_agendaExatamenteNaVirada() {
        // 14:37:52.250 -> próximo segundo em 750 ms; próximo minuto em 7.750 ms
        assertEquals(750L, BrasiliaTime.msUntilNextTick(instante + 250, showSeconds = true))
        assertEquals(7_750L, BrasiliaTime.msUntilNextTick(instante + 250, showSeconds = false))
        // exatamente na virada: espera o passo inteiro (nunca 0, nunca negativo)
        assertEquals(1_000L, BrasiliaTime.msUntilNextTick(instante, showSeconds = true))
        assertEquals("14:38:00", BrasiliaTime.time(instante + 8_000, true))
        assertEquals("14:38", BrasiliaTime.time(instante + 8_000, false))
    }

    @Test fun formato12h_tambemEmBrasilia() {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Tokyo"))
        assertEquals("02:37 PM", BrasiliaTime.time(instante, showSeconds = false, format24h = false).uppercase())
    }
}

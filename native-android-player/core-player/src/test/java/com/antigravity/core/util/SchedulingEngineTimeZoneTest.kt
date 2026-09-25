package com.antigravity.core.util

import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

/**
 * F-45: o agendamento (horario/dias) era avaliado com `Calendar.getInstance()` no fuso do APARELHO, sobre um relogio
 * que ja soma o fuso de Brasilia. So batia certo com o aparelho em UTC (emulador); num tablet real em
 * America/Sao_Paulo a janela "08:00-12:00" valia de 05:00 a 09:00 (3 h antes).
 * O painel grava o horario em hora local do Brasil; o Player deve avaliar sempre nessa hora, em qualquer fuso do aparelho.
 */
class SchedulingEngineTimeZoneTest {
    private lateinit var originalTz: TimeZone

    @Before fun setUp() { originalTz = TimeZone.getDefault(); TimeManager.setTimeZoneOffset(-3) }
    @After fun tearDown() { TimeZone.setDefault(originalTz) }

    /** Hora local de Brasilia AGORA, calculada de forma independente do codigo sob teste. */
    private fun brtNow(): Calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
        timeInMillis = System.currentTimeMillis() - 3 * 3600_000L
    }

    private fun hhmm(minutesOfDay: Int): String {
        val m = ((minutesOfDay % 1440) + 1440) % 1440
        return "%02d:%02d".format(m / 60, m % 60)
    }

    private fun item(start: String? = null, end: String? = null, days: String? = null) = MediaItem(
        id = "x", name = "x", type = MediaType.IMAGE, durationSeconds = 10, remoteUrl = "u", localPath = null,
        hash = "h", orderIndex = 0, startTime = start, endTime = end, daysOfWeek = days
    )

    private fun windowAroundBrtNow(): Pair<String, String> {
        val now = brtNow()
        val nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
        return hhmm(nowMin - 30) to hhmm(nowMin + 30)
    }

    private fun assertWindowContainsNow() {
        val (s, e) = windowAroundBrtNow()
        assertTrue("janela $s-$e contem a hora local do Brasil e deve tocar", SchedulingEngine.shouldPlay(item(s, e)))
    }

    private fun assertWindowFarFromNowIsBlocked() {
        val now = brtNow()
        val nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
        val s = hhmm(nowMin + 120); val e = hhmm(nowMin + 180)
        assertFalse("janela $s-$e esta fora da hora local do Brasil", SchedulingEngine.shouldPlay(item(s, e)))
    }

    @Test fun deviceInSaoPaulo_windowAroundLocalNow_plays() {
        TimeZone.setDefault(TimeZone.getTimeZone("America/Sao_Paulo")); assertWindowContainsNow()
    }
    @Test fun deviceInUtc_windowAroundLocalNow_plays() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC")); assertWindowContainsNow()
    }
    @Test fun deviceInTokyo_windowAroundLocalNow_plays() {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Tokyo")); assertWindowContainsNow()
    }
    @Test fun deviceInSaoPaulo_windowFarFromNow_isBlocked() {
        TimeZone.setDefault(TimeZone.getTimeZone("America/Sao_Paulo")); assertWindowFarFromNowIsBlocked()
    }

    @Test fun daysOfWeek_useLocalBrazilianDay_inAnyDeviceZone() {
        for (tz in listOf("America/Sao_Paulo", "UTC", "Pacific/Auckland")) {
            TimeZone.setDefault(TimeZone.getTimeZone(tz))
            val today = brtNow().get(Calendar.DAY_OF_WEEK) - 1 // 0=Dom..6=Sab
            val other = (today + 3) % 7
            assertTrue("[$tz] dia atual deve tocar", SchedulingEngine.shouldPlay(item(days = "$today")))
            assertFalse("[$tz] outro dia nao toca", SchedulingEngine.shouldPlay(item(days = "$other")))
            assertTrue("[$tz] lista em colchetes tambem", SchedulingEngine.shouldPlay(item(days = "[$today, $other]")))
        }
    }

    @Test fun noRules_alwaysPlays() {
        TimeZone.setDefault(TimeZone.getTimeZone("America/Sao_Paulo"))
        assertEquals(true, SchedulingEngine.shouldPlay(item()))
    }
}

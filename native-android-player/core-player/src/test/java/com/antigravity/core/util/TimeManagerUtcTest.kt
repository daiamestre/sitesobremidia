package com.antigravity.core.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * F-32: timestamps enviados ao servidor com sufixo "Z" precisam ser UTC de verdade.
 * currentTimeMillis() soma o fuso de Brasilia (-3h) para exibicao/agenda local, entao gravava
 * last_screenshot_at 3h atras (o painel mostrava 09:12 para um print de 12:12).
 */
class TimeManagerUtcTest {

    @Test
    fun utcMillis_isRealUtc_notShiftedByTimezone() {
        val before = System.currentTimeMillis()
        val utc = TimeManager.utcMillis()
        val after = System.currentTimeMillis()
        assertTrue("utcMillis deve ser o relogio UTC real", utc in (before - 1)..(after + 1))
    }

    @Test
    fun currentTimeMillis_staysLocalForScheduling() {
        // Comportamento de agenda/exibicao preservado (nao mexemos nele): fuso de Brasilia (-3h).
        TimeManager.setTimeZoneOffset(-3)
        val diff = TimeManager.currentTimeMillis() - TimeManager.utcMillis()
        assertEquals(-3 * 3600_000.0, diff.toDouble(), 2000.0)
    }
}

package com.antigravity.player

import com.antigravity.player.util.AnalyticsFormat
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Date
import java.util.TimeZone

class AnalyticsFormatTest {

    @Test
    fun timestamp_isUtc_evenWhenDeviceIsInBrazil() {
        val original = TimeZone.getDefault()
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("America/Sao_Paulo"))
            // 2026-09-25T03:30:00Z = 00:30 em Brasília: antes saía "00:30:00Z" (3 h errado, dia errado à noite).
            val instant = Date(1790307000000L)
            assertEquals("2026-09-25T03:30:00Z", AnalyticsFormat.utcTimestamp(instant))
        } finally {
            TimeZone.setDefault(original)
        }
    }

    @Test
    fun mediaId_duplicatedItemsCountForTheOriginalMedia() {
        assertEquals("abc-123", AnalyticsFormat.normalizeMediaId("abc-123~1"))
        assertEquals("abc-123", AnalyticsFormat.normalizeMediaId("abc-123~12"))
        assertEquals("abc-123", AnalyticsFormat.normalizeMediaId("abc-123"))
    }
}

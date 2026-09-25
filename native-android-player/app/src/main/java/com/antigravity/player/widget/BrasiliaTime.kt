package com.antigravity.player.widget

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Hora oficial exibida pelos widgets: SEMPRE Horário de Brasília (America/Sao_Paulo), calculada a partir de um instante
 * UTC (no Player: TimeManager.utcMillis(), sincronizado por NTP). Independe do fuso configurado no aparelho, do fuso
 * descoberto por IP e do relógio local — antes o relógio usava o fuso do aparelho/IP e a hora do sistema.
 */
object BrasiliaTime {
    const val ZONE_ID = "America/Sao_Paulo"
    val ZONE: TimeZone = TimeZone.getTimeZone(ZONE_ID)
    private val PT_BR = Locale("pt", "BR")

    fun time(utcMillis: Long, showSeconds: Boolean, format24h: Boolean = true): String {
        val pattern = when {
            format24h && showSeconds -> "HH:mm:ss"
            format24h -> "HH:mm"
            showSeconds -> "hh:mm:ss a"
            else -> "hh:mm a"
        }
        return fmt(pattern).format(Date(utcMillis))
    }

    /** "SEXTA-FEIRA · 25 DE SETEMBRO DE 2026" */
    fun dateLong(utcMillis: Long): String =
        (fmt("EEEE").format(Date(utcMillis)) + " · " + fmt("d 'de' MMMM 'de' yyyy").format(Date(utcMillis))).uppercase(PT_BR)

    /** "25/09/2026" */
    fun dateShort(utcMillis: Long): String = fmt("dd/MM/yyyy").format(Date(utcMillis))

    fun hourOfDay(utcMillis: Long): Int =
        Calendar.getInstance(ZONE, PT_BR).apply { timeInMillis = utcMillis }.get(Calendar.HOUR_OF_DAY)

    /** Milissegundos até a próxima virada de segundo (ou de minuto), para o texto mudar exatamente na virada. */
    fun msUntilNextTick(utcMillis: Long, showSeconds: Boolean): Long {
        val step = if (showSeconds) 1_000L else 60_000L
        val rem = Math.floorMod(utcMillis, step)
        return (step - rem).coerceAtLeast(1L)
    }

    private fun fmt(pattern: String) = SimpleDateFormat(pattern, PT_BR).apply { timeZone = ZONE }
}

package com.antigravity.core.util

import com.antigravity.core.domain.model.MediaItem
import java.util.Calendar

/**
 * Engine responsável por decidir se um item deve tocar AGORA.
 * Suporta Dayparting (Hora) e Agendamento (Dias da Semana).
 */
object SchedulingEngine {

    fun shouldPlay(item: MediaItem): Boolean {
        // Se não tem regras, toca sempre.
        if (item.startTime.isNullOrEmpty() && item.endTime.isNullOrEmpty() && item.daysOfWeek.isNullOrEmpty()) {
            return true
        }

        val now = TimeManager.getSyncedCalendar()
        
        // 1. Verificar Dias da Semana (1=Dom, 2=Seg ... 7=Sab)
        if (!item.daysOfWeek.isNullOrEmpty()) {
            val currentDay = now.get(Calendar.DAY_OF_WEEK) // 1-7
            val allowedDays = item.daysOfWeek.split(",").mapNotNull { it.trim().toIntOrNull() }
            
            if (!allowedDays.contains(currentDay)) {
                return false
            }
        }

        // 2. Verificar Horário (HH:mm)
        val currentHour = now.get(Calendar.HOUR_OF_DAY)
        val currentMinute = now.get(Calendar.MINUTE)
        val currentTimeValue = currentHour * 60 + currentMinute // Minutos desde meia-noite

        val start = parseTime(item.startTime)
        val end = parseTime(item.endTime)

        if (start != null && end != null) {
            // Regra Comum: 08:00 as 12:00
            if (end > start) {
                if (currentTimeValue < start || currentTimeValue > end) return false
            } else {
                // Regra Virada: 22:00 as 06:00
                if (currentTimeValue < start && currentTimeValue > end) return false
            }
        } else if (start != null) {
            // Só inicio: Toca depois de X
            if (currentTimeValue < start) return false
        } else if (end != null) {
             // Só fim: Toca antes de Y
             if (currentTimeValue > end) return false
        }

        return true
    }

    private fun parseTime(timeStr: String?): Int? {
        if (timeStr.isNullOrEmpty()) return null
        return try {
            val parts = timeStr.split(":")
            val h = parts[0].toInt()
            val m = parts.getOrNull(1)?.toInt() ?: 0
            h * 60 + m
        } catch (e: Exception) {
            null
        }
    }
}

package com.antigravity.core.util

import com.antigravity.core.domain.model.MediaItem
import java.util.Calendar

/**
 * Engine responsável por decidir se um item deve tocar AGORA.
 * Suporta Dayparting (Hora) e Agendamento (Dias da Semana).
 */
object SchedulingEngine {

    fun shouldPlay(item: MediaItem): Boolean {
        // Se as regras são strings literais "null", limpar.
        val days = if (item.daysOfWeek == "null" || item.daysOfWeek.isNullOrEmpty()) null else item.daysOfWeek
        val startStr = if (item.startTime == "null" || item.startTime.isNullOrEmpty()) null else item.startTime
        val endStr = if (item.endTime == "null" || item.endTime.isNullOrEmpty()) null else item.endTime

        // Se não tem regras, toca sempre.
        if (startStr == null && endStr == null && days == null) {
            return true
        }

        val now = TimeManager.getSyncedCalendar()
        
        // 1. Verificar Dias da Semana (0=Dom, 1=Seg ... 6=Sab no padrão JS/Dashboard)
        if (days != null) {
            val currentDayJava = now.get(Calendar.DAY_OF_WEEK) // 1-7
            val currentDayJs = currentDayJava - 1 // 0-6
            // Remove cochetes ['[' ou ']'] caso a string venha formatada como JSON array (ex: "[1, 2, 3]")
            val cleanDays = days.replace("[", "").replace("]", "")
            val allowedDays = cleanDays.split(",").mapNotNull { it.trim().toIntOrNull() }
            
            if (allowedDays.isNotEmpty() && !allowedDays.contains(currentDayJs)) {
                return false
            }
        }

        // 2. Verificar Horário (HH:mm)
        val currentHour = now.get(Calendar.HOUR_OF_DAY)
        val currentMinute = now.get(Calendar.MINUTE)
        val currentTimeValue = currentHour * 60 + currentMinute // Minutos desde meia-noite

        val start = parseTime(startStr)
        val end = parseTime(endStr)

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
        if (timeStr == "null" || timeStr.isNullOrEmpty()) return null
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

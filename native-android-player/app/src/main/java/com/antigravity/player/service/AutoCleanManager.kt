package com.antigravity.player.service

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.antigravity.player.MainActivity
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.SmartCacheCleaner
import kotlinx.coroutines.launch

/**
 * 🧹 AutoCleanManager - Limpeza Periódica
 * 
 * Executa manutenção a cada 4 horas para:
 * 1. Forçar Garbage Collection (Java Heap)
 * 2. Prevenir vazamentos de memória nativa (ExoPlayer/MediaCodec)
 * 3. Garantir longa duração (24/7) sem crash por OOM.
 */
class AutoCleanManager(private val context: Context) {

    private val handler = Handler(Looper.getMainLooper())
    private val CLEAN_INTERVAL_MS = 4 * 60 * 60 * 1000L // 4 Horas

    // Callback para notificar a UI/Player para reiniciar o motor
    var onRestartRequested: (() -> Unit)? = null

    fun startCycle() {
        handler.postDelayed(cleanRunnable, CLEAN_INTERVAL_MS)
    }

    private val cleanRunnable = object : Runnable {
        override fun run() {
            performCleanup()
            // Re-agendar
            handler.postDelayed(this, CLEAN_INTERVAL_MS)
        }
    }

    private fun performCleanup() {
        println("AUTOCLEAN: Executing 4H Maintenance Cycle...")

        // 1. Force Java GC
        System.gc()
        Runtime.getRuntime().gc()

        // 2. Reiniciar Motor de Reprodução (Soft Restart)
        // Isso libera os decodificadores de hardware e recria a instância do ExoPlayer.
        onRestartRequested?.invoke()

        // 3. [INDUSTRIAL] Manutenção Profunda (03:00 AM - 05:00 AM)
        val calendar = java.util.Calendar.getInstance()
        val hour = calendar.get(java.util.Calendar.HOUR_OF_DAY)
        if (hour in 3..5) {
            // Executa limpeza em background sem bloquear o Handler
            // Importante: Usamos o ServiceLocator para pegar um escopo global se necessário,
            // ou coroutines no contexto do worker se disponível.
            ServiceLocator.getCoroutineScope().launch {
                SmartCacheCleaner.purgeOrphanedMedia(context)
            }
        }
    }
}

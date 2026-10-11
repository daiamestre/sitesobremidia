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
 * Verifica a cada 4 horas e, SÓ quando convém (madrugada, memória apertada ou 12 h sem reiniciar), recria o motor de
 * reprodução para:
 * 1. Prevenir vazamentos de memória nativa (ExoPlayer/MediaCodec)
 * 2. Garantir longa duração (24/7) sem crash por OOM.
 * F-183: fora disso não mexe na reprodução (antes voltava a tela de sincronização no meio do expediente e forçava GC).
 */
class AutoCleanManager(private val context: Context) {

    private val handler = Handler(Looper.getMainLooper())
    private val CLEAN_INTERVAL_MS = 4 * 60 * 60 * 1000L // 4 Horas
    private var ultimoReinicioMs = System.currentTimeMillis() // a abertura do aplicativo conta como o último reinício

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
        val agora = System.currentTimeMillis()
        val hora = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        val memoriaBaixa = try {
            val info = android.app.ActivityManager.MemoryInfo()
            (context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager).getMemoryInfo(info)
            info.lowMemory
        } catch (e: Exception) { false }
        if (!com.antigravity.player.util.ManutencaoPolicy.deveReiniciarMotor(hora, agora - ultimoReinicioMs, memoriaBaixa)) {
            println("AUTOCLEAN: manutenção adiada (hora=$hora): a reprodução não é interrompida em horário de uso.")
            return
        }
        ultimoReinicioMs = agora
        println("AUTOCLEAN: Executing Maintenance Cycle (hora=$hora, memóriaBaixa=$memoriaBaixa)...")

        // 1. Reiniciar Motor de Reprodução (Soft Restart)
        // Isso libera os decodificadores de hardware e recria a instância do ExoPlayer.
        onRestartRequested?.invoke()

        // 2. [INDUSTRIAL] Manutenção Profunda (03:00 AM - 05:00 AM)
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

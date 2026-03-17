package com.antigravity.player.util

import android.content.Context
import android.app.ActivityManager
import com.antigravity.core.util.Logger

/**
 * [HARDWARE RESILIENCE]
 * O Guardian atua como um zelador silencioso para TV Boxes de baixo custo.
 * TV Boxes antigas sofrem com a fragmentação da memória RAM (OOM - Out of Memory).
 * Ele força o Garbage Collector do Android no momento exato em que a playlist "dá a volta"
 * (Wrap Around), evitando interferir no crossfade visual das Texturas.
 */
object MemoryLeakGuardian {
    
    // Configura limite crítico (ex: 300MB de RAM livre) para agir agressivamente
    private const val CRITICAL_MEMORY_MB = 300L

    /**
     * Inspeciona a sanidade da memória RAM e executa a faxina se necessário.
     * Retorna true se uma limpeza profunda foi forçada.
     */
    fun performSanityCheck(context: Context): Boolean {
        try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memoryInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memoryInfo)
            
            val availMemMB = memoryInfo.availMem / (1024 * 1024)
            val isLowMem = memoryInfo.lowMemory
            
            Logger.i("MEMORY_GUARDIAN", "Telemetria RAM: Livre=${availMemMB}MB | EstadoCrítico=$isLowMem")

            // Faxina Preventiva Profunda
            if (availMemMB < CRITICAL_MEMORY_MB || isLowMem) {
                Logger.w("MEMORY_GUARDIAN", "Alerta de Sufocamento! (RAM < ${CRITICAL_MEMORY_MB}MB). Forçando GC() Síncrono.")
                
                // Força o Garbage Collector a rodar e consolidar a Heap fragmentada pelas animações de view
                System.gc()
                Runtime.getRuntime().gc()
                
                return true
            }
            
            // Faxina Passiva Leve (Opcional, mas mantém a Heap enxuta em longo prazo)
            // Chamamos mesmo com memória sobrando para evitar picos surpresas no futuro
            System.gc()
            return false

        } catch (e: Exception) {
            Logger.e("MEMORY_GUARDIAN", "Falha ao ler sensores de memória: ${e.message}")
            return false
        }
    }
}

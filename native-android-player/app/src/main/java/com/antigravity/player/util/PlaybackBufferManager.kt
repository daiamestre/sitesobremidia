package com.antigravity.player.util

import android.content.Context
import com.antigravity.core.domain.repository.PlayerRepository
import com.antigravity.player.di.ServiceLocator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * PlaybackBufferManager
 * Atua como o coordenador dos logs pendentes, garantindo que sejam enviados
 * assim que a conexão estiver estável.
 */
class PlaybackBufferManager(private val context: Context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val repository: PlayerRepository by lazy {
        ServiceLocator.getRepository(context)
    }

    /**
     * Envia todos os logs pendentes para o servidor.
     * Ideal para ser chamado pelo NetworkMonitor.
     */
    fun flushPendingLogs() {
        scope.launch {
            try {
                com.antigravity.core.util.Logger.i("BUFFER", "Iniciando Flush reativo de logs...")
                val result = repository.syncLogs()
                if (result.isSuccess) {
                    com.antigravity.core.util.Logger.i("BUFFER", "Flush concluído com sucesso!")
                } else {
                    com.antigravity.core.util.Logger.w("BUFFER", "Flush falhou ou sem logs pendentes.")
                }
            } catch (e: Exception) {
                com.antigravity.core.util.Logger.e("BUFFER", "Erro fatal durante o Flush: ${e.message}")
            }
        }
    }
}

package com.antigravity.player.util

import android.content.Context
import com.antigravity.player.di.ServiceLocator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 🧹 SmartCacheCleaner - Limpeza Cirúrgica de Disco
 * 
 * Este utilitário garante que o armazenamento da TV Box não se esgote com arquivos obsoletos.
 * Ele utiliza o motor de manutenção industrial do PlayerRepository para identificar
 * e remover arquivos que não pertencem mais à playlist ativa.
 */
object SmartCacheCleaner {

    /**
     * Remove mídias órfãs de forma segura, preservando o que é necessário para o modo Offline-First.
     */
    suspend fun purgeOrphanedMedia(context: Context) = withContext(Dispatchers.IO) {
        try {
            com.antigravity.core.util.Logger.i("CACHE_CLEANER", "Iniciando varredura inteligente de disco...")
            
            val repository = ServiceLocator.getRepository(context)
            
            // O Repository já possui a lógica de limpeza baseada em IDs reais (mediaId.dat),
            // o que é mais seguro do que nomes extraídos de URLs que podem sofrer alterações.
            repository.performMaintenanceCleanup()
            
            com.antigravity.core.util.Logger.i("CACHE_CLEANER", "Limpeza concluída com sucesso.")
        } catch (e: Exception) {
            com.antigravity.core.util.Logger.e("CACHE_CLEANER", "Erro durante a limpeza: ${e.message}")
        }
    }
}

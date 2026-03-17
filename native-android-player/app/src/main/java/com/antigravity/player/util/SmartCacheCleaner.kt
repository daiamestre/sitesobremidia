package com.antigravity.player.util

import android.content.Context
import com.antigravity.player.di.ServiceLocator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.firstOrNull

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
            val currentPlaylist = repository.getActivePlaylist().firstOrNull()
            
            if (currentPlaylist != null) {
                val activeIds = currentPlaylist?.items?.map { it.id } ?: emptyList()
                CleanupManager.executarFaxina(context, activeIds)
            } else {
                com.antigravity.core.util.Logger.w("CACHE_CLEANER", "Playlist não encontrada para faxina automática.")
            }
            
            com.antigravity.core.util.Logger.i("CACHE_CLEANER", "Limpeza concluída com sucesso.")
        } catch (e: Exception) {
            com.antigravity.core.util.Logger.e("CACHE_CLEANER", "Erro durante a limpeza: ${e.message}")
        }
    }
}

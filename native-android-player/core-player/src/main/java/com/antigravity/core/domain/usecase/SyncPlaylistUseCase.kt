package com.antigravity.core.domain.usecase

import com.antigravity.core.domain.repository.PlayerRepository
import kotlinx.coroutines.flow.firstOrNull

/**
 * Caso de Uso Principal: Sincronização de Playlist.
 * Implementa a lógica de comparação de Hash e decisão de download.
 * Spec Section 4 (Fluxo de Dados).
 */
class SyncPlaylistUseCase(
    private val repository: PlayerRepository
) {
    suspend operator fun invoke(): Result<Unit> {
        return try {
            // 1. Fetch & Compare & Download are handled by the Repository in this architecture
            // mainly because the repository orchestrates the Local/Remote sync.
            // However, business rules like "Stop playback if emergency" could live here.
            
            // For this specific implementation plan, we delegate to repository sync,
            // which encapsulates the logic of:
            // Fetch Remote -> Compare Hash -> Download Files -> Update Local DB
            
            val result = repository.syncWithRemote()
            
            if (result.isSuccess) {
                 // Check if we have a valid playlist after sync
                 val currentPlaylist = repository.getActivePlaylist().firstOrNull()
                 if (currentPlaylist == null || !currentPlaylist.isValid()) {
                     return Result.failure(IllegalStateException("Sync success but playlist invalid"))
                 }
            }
            
            result
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

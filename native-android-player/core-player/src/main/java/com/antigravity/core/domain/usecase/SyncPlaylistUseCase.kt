package com.antigravity.core.domain.usecase

import com.antigravity.core.domain.repository.PlayerRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.withTimeoutOrNull

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
                  // [RACE CONDITION FIX] Wait for the first valid emission (max 10s)
                  val currentPlaylist = withTimeoutOrNull(10000) {
                      repository.getActivePlaylist()
                          .filter { it != null && it.items.isNotEmpty() }
                          .first()
                  }

                  if (currentPlaylist == null) {
                      return Result.failure(IllegalStateException("Tempo esgotado aguardando playlist sincronizada."))
                  }
            }
            
            result
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

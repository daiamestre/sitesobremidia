package com.antigravity.core.domain.repository

import com.antigravity.core.domain.model.Playlist
import kotlinx.coroutines.flow.Flow

/**
 * Contrato para acesso a dados (Repository Pattern).
 * A implementação (Data Layer) decidirá se busca do Room (Cache) ou Rede.
 */
interface PlayerRepository {
    
    // Observa a playlist ativa (Single Source of Truth -> Local DB)
    fun getActivePlaylist(): Flow<Playlist?>

    // Força uma sincronização com a nuvem
    suspend fun syncWithRemote(): Result<Unit>

    // Marca uma mídia como "Tocada" para o PlayProof
    suspend fun registerPlayProof(mediaId: String, durationMs: Long)

    // Reporta batimento cardíaco (Heartbeat)
    suspend fun sendHeartbeat(status: String)
}

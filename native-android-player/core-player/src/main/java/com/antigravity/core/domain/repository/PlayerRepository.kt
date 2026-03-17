package com.antigravity.core.domain.repository

import com.antigravity.core.domain.model.Playlist
import com.antigravity.core.domain.model.RegionalConfig
import kotlinx.coroutines.flow.Flow

/**
 * Contrato para acesso a dados (Repository Pattern).
 * A implementação (Data Layer) decidirá se busca do Room (Cache) ou Rede.
 */
interface PlayerRepository {
    
    val deviceId: String
    
    // Observa a playlist ativa (Single Source of Truth -> Local DB)
    fun getActivePlaylist(): Flow<Playlist?>

    // Observa o progresso da sincronização (Ex: "Baixando 2 de 5")
    fun getSyncProgress(): Flow<String>

    // Força uma sincronização com a nuvem
    suspend fun syncWithRemote(): Result<Unit>

    // [YELOO] Nova abordagem de sincronização baseada em Flow
    suspend fun syncPlaylist(screenToken: String): Flow<PlaylistState>

    // [YELOO] Escuta mudanças em Tempo Real (Broadcast)
    fun listenToChanges(screenToken: String): Flow<Unit>

    // Carrega a playlist do banco de dados local (Offline-First)
    suspend fun loadLocalCache(): Result<Unit>
    
    // [AUTO-LOGIN] Memória de credenciais
    suspend fun salvarCredenciais(token: String, playerId: String)
    suspend fun getStoredCredentials(): Pair<String, String>?
    
    // [REGIONAL CONTEXT] Gerencia a localização
    suspend fun getLocalizacao(): RegionalConfig?
    suspend fun salvarLocalizacao(config: RegionalConfig)

    // [AUDIT LOG] Gerenciamento de logs de exibição
    suspend fun salvarLogAuditoria(nome: String, tipo: String, duracao: Int, cidade: String)
    suspend fun buscarLogsAuditoria(): List<com.antigravity.core.domain.model.LogAuditoria>
    suspend fun limparLogsAuditoriaAntigos(limiteTempo: Long)

    // Marca uma mídia como "Tocada" para o PlayProof
    suspend fun registerPlayProof(mediaId: String, durationMs: Long)


    // Reporta batimento cardíaco (Heartbeat) com Health Stats
    suspend fun sendHeartbeat(
        status: String, 
        freeSpace: Long? = null, 
        ramUsage: Long? = null,
        cpuTemp: Float? = null,
        uptimeHours: Int? = null,
        ipAddress: String? = null
    )

    // [DYNAMIC RECEIVER] Feedback Loop: Confirma aplicação de orientação/playlist
    suspend fun reportActionApplied(action: String, value: String)

    // [INDUSTRIAL] Maintenance & Log Scaling
    suspend fun performMaintenanceCleanup()
    
    // [INDUSTRIAL] Visibility & Remote Management
    suspend fun reportDownloadProgress(deviceId: String, mediaId: String, progress: Int)
    suspend fun acknowledgeCommand(commandId: String, status: String)
    suspend fun updateDevicesHeartbeat(deviceId: String)

    suspend fun syncLogs(): Result<Unit>
    suspend fun reportRemoteError(type: String, message: String, stackTrace: String, stats: Map<String, Any> = emptyMap())
    suspend fun updateMediaLocalPath(mediaId: String, path: String)
    suspend fun hasLocalMedia(): Boolean
}

package com.antigravity.sync.repository

import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.domain.repository.CacheManager
import com.antigravity.core.domain.repository.PlayerRepository
import com.antigravity.core.domain.repository.PlaylistState
import com.antigravity.sync.dto.DeviceRemoteDTO
import com.antigravity.sync.service.MediaDownloader
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.broadcastFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import java.io.File
import com.antigravity.core.util.Logger

class PlayerRepositoryImpl(
    private val supabasePostgrest: Postgrest,
    private val realtime: Realtime,
    private val cacheManager: CacheManager,
    private val downloader: MediaDownloader,
    override val deviceId: String
) : PlayerRepository {

    override suspend fun syncPlaylist(screenToken: String): Flow<PlaylistState> = flow {
        emit(PlaylistState.Loading)

        try {
            // 1. Buscar o Device e a Playlist Ativa (Igual ao Yeloo)
            val deviceResponse = supabasePostgrest.from("screens")
                .select(columns = Columns.raw("""
                    id, 
                    name,
                    custom_id,
                    playlist_id,
                    playlists (
                        id,
                        name,
                        playlist_items (
                            id, position, duration,
                            medias:media!playlist_items_media_id_fkey (id, name, file_url, file_type)
                        )
                    )
                """.trimIndent())) {
                    filter {
                        or {
                            eq("custom_id", screenToken.trim())
                            eq("custom_id", screenToken.trim().uppercase())
                            eq("custom_id", screenToken.trim().lowercase())
                            if (screenToken.trim().length > 20) {
                                eq("id", screenToken.trim())
                            }
                        }
                    }
                }.decodeSingleOrNull<DeviceRemoteDTO>()

            if (deviceResponse == null) {
                throw Exception("[PERMANENT] Tela não encontrada no painel. Verifique o ID: $screenToken")
            }

            val remoteItems = (deviceResponse.playlists ?: deviceResponse.playlist)?.items ?: emptyList()

            // 2. Lógica de "Hash Match" para cada mídia
            val domainItems = mutableListOf<MediaItem>()
            for (item in remoteItems) {
                val media = item.media
                if (media != null) {
                    val localPath = cacheManager.getLocalPathForId(media.id)
                    val expectedHash = media.fileHash ?: media.id
                    
                    // Se o arquivo não existe ou o Hash mudou
                    if (!File(localPath).exists() || cacheManager.calculateHash(localPath) != expectedHash) {
                        emit(PlaylistState.Downloading(media.name))
                        downloader.downloadFile(media.fileUrl, File(localPath))
                    }
                    
                    // Map to domain MediaItem
                    domainItems.add(
                        MediaItem(
                            id = media.id,
                            name = media.name,
                            type = when(media.mediaType) {
                                "video" -> MediaType.VIDEO
                                "image" -> MediaType.IMAGE
                                else -> MediaType.VIDEO
                            },
                            durationSeconds = item.duration / 1000,
                            remoteUrl = media.fileUrl,
                            localPath = localPath,
                            hash = expectedHash,
                            orderIndex = item.position,
                            startTime = item.startTime,
                            daysOfWeek = item.daysOfWeek
                        )
                    )
                } else {
                    domainItems.add(
                        MediaItem(
                            id = item.id,
                            name = "Item ${item.position}",
                            type = MediaType.VIDEO,
                            durationSeconds = item.duration / 1000,
                            remoteUrl = "",
                            localPath = null,
                            hash = "",
                            orderIndex = item.position
                        )
                    )
                }
            }

            // 3. Persistir no Room Local
            cacheManager.savePlaylistToRoom(domainItems)

            emit(PlaylistState.Success(domainItems))

        } catch (e: Exception) {
            Logger.e("REPOS", "Erro na sincronização: ${e.message}")
            emit(PlaylistState.Error(e.message ?: "Erro desconhecido na sincronização"))
        }
    }

    override fun listenToChanges(screenToken: String): Flow<Unit> {
        // Implementation using Broadcast as per Yeloo requirement
        val channel = realtime.channel("device_updates_$screenToken")
        return channel.broadcastFlow<Unit>(event = "sync_now").map { Unit }
    }

    // --- OTHER INTERFACE METHODS (Stubs or adaptations) ---
    override fun getActivePlaylist(): Flow<com.antigravity.core.domain.model.Playlist?> = flow { emit(null) }
    override fun getSyncProgress(): Flow<String> = flow { emit("") }
    override suspend fun syncWithRemote(): Result<Unit> = Result.success(Unit)
    override suspend fun loadLocalCache(): Result<Unit> = Result.success(Unit)
    override suspend fun salvarCredenciais(token: String, playerId: String) {}
    override suspend fun getStoredCredentials(): Pair<String, String>? = null
    override suspend fun getLocalizacao(): com.antigravity.core.domain.model.RegionalConfig? = null
    override suspend fun salvarLocalizacao(config: com.antigravity.core.domain.model.RegionalConfig) {}
    override suspend fun salvarLogAuditoria(nome: String, tipo: String, duracao: Int, cidade: String) {}
    override suspend fun buscarLogsAuditoria(): List<com.antigravity.core.domain.model.LogAuditoria> = emptyList()
    override suspend fun limparLogsAuditoriaAntigos(limiteTempo: Long) {}
    override suspend fun registerPlayProof(mediaId: String, durationMs: Long) {}
    override suspend fun sendHeartbeat(status: String, freeSpace: Long?, ramUsage: Long?, cpuTemp: Float?, uptimeHours: Int?, ipAddress: String?) {}
    override suspend fun reportActionApplied(action: String, value: String) {}
    override suspend fun performMaintenanceCleanup() {}
    override suspend fun reportDownloadProgress(deviceId: String, mediaId: String, progress: Int) {}
    override suspend fun acknowledgeCommand(commandId: String, status: String) {}
    override suspend fun updateDevicesHeartbeat(deviceId: String) {}
    override suspend fun syncLogs(): Result<Unit> = Result.success(Unit)
    override suspend fun reportRemoteError(type: String, message: String, stackTrace: String, stats: Map<String, Any>) {}
    override suspend fun updateMediaLocalPath(mediaId: String, path: String) {}
    override suspend fun hasLocalMedia(): Boolean = false
}

package com.antigravity.player.data

import com.antigravity.cache.dao.PlayerDao
import com.antigravity.cache.entity.toCache
import com.antigravity.cache.entity.toDomain
import com.antigravity.cache.storage.FileStorageManager
import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.Playlist
import com.antigravity.core.domain.repository.PlayerRepository
import com.antigravity.sync.service.MediaDownloader
import com.antigravity.sync.service.RemoteDataSource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map

/**
 * The Brain of Data.
 * Orchestrates Remote Fetch -> Download -> Local Cache -> Domain Emission.
 */
class PlayerRepositoryImpl(
    private val remoteDataSource: RemoteDataSource,
    private val mediaDownloader: MediaDownloader,
    private val playerDao: PlayerDao,
    private val fileStorageManager: FileStorageManager,
    private val deviceId: String
) : PlayerRepository {

    private val _activePlaylist = MutableStateFlow<Playlist?>(null)

    override fun getActivePlaylist(): Flow<Playlist?> {
        return _activePlaylist.asStateFlow()
    }

    override suspend fun syncWithRemote(): Result<Unit> {
        // Armazena a exceção original para reportar se o fallback offline falhar
        var remoteException: Exception? = null
        
        // 1. Tentar buscar do Remoto
        val remotePlaylist = try {
            remoteDataSource.getPlaylistForScreen(deviceId)
        } catch (e: Exception) {
            remoteException = e
            e.printStackTrace()
            null // Erro de rede/API, tentar modo offline
        }

        return if (remotePlaylist != null) {
            // MODO ONLINE: Sincronizar
            try {
                syncContent(remotePlaylist)
                // Salvar no Banco de Dados
                saveToLocalCache(remotePlaylist)
                // Atualizar Memória
                _activePlaylist.value = remotePlaylist
                Result.success(Unit)
            } catch (e: Exception) {
                // Erro durante o download ou salvamento
                e.printStackTrace()
                // Se falhar no download, ainda tentamos carregar o que tem local
                loadFromLocalCache(e) 
            }
        } else {
            // MODO OFFLINE (Erro remoto ou playlist nula)
            
            // Se remotePlaylist é null mas remoteException também é null,
            // significa que a API retornou sucesso mas sem playlist (ex: tela sem playlist associada).
            if (remoteException == null) {
                // Caso específico: Tela conectada, mas sem playlist definida no painel
                val noPlaylistError = Exception("Nenhuma playlist atribuída a esta tela no painel.")
                loadFromLocalCache(noPlaylistError)
            } else {
                // Caso de erro de rede real
                loadFromLocalCache(remoteException)
            }
        }
    }

    private suspend fun syncContent(playlist: Playlist) {
        val updatedItems = playlist.items.map { item ->
            // Check if file exists in storage
            if (fileStorageManager.doesFileExistAndMatchHash(item.id, item.hash)) {
                 // File exists, update path
                 val file = fileStorageManager.getFileForMedia(item.id)
                 item.copy(localPath = file.absolutePath)
            } else {
                // File missing, determine target and download
                val targetFile = fileStorageManager.getFileForMedia(item.id)
                println("SYNC: Downloading ${item.name} to ${targetFile.absolutePath}...")
                
                val result = mediaDownloader.downloadFile(item.remoteUrl, targetFile)
                
                if (result.isSuccess) {
                    item.copy(localPath = targetFile.absolutePath)
                } else {
                    println("SYNC: Failed to download ${item.name}")
                    item // Keep item without localPath
                }
            }
        }
        
        // Note: In a real implementation we should return updatedItems or update the playlist object.
        // For now, this download logic side-effect ensures files are on disk.
        // The saveToLocalCache below re-verifies file existence to update DB.
    }

    private suspend fun saveToLocalCache(playlist: Playlist) {
        val cachedItems = playlist.items.map { item ->
            // 1. Ensure File (Double check or get path)
            // Since we just ran syncContent, files should be there.
            val file = fileStorageManager.getFileForMedia(item.id)
            val localPath = if (file.exists()) file.absolutePath else null
            
            // 2. Map to Cache Entity
            item.copy(localPath = localPath).toCache(playlist.id)
        }
        
        playerDao.insertPlaylistWithItems(playlist.toCache(), cachedItems)
    }

    // Helper removed as logic is now inline or handled above.
    // private suspend fun ensureFile(item: MediaItem): String? { ... }

    private suspend fun loadFromLocalCache(cause: Exception? = null): Result<Unit> {
        val cachedPlaylist = playerDao.getActivePlaylist()
        if (cachedPlaylist != null) {
            val items = playerDao.getItemsForPlaylist(cachedPlaylist.id)
            val domainPlaylist = cachedPlaylist.toDomain(items)
            _activePlaylist.value = domainPlaylist
            // Estamos offline, mas com conteúdo.
            // Poderíamos retornar Success, mas talvez com um aviso de que está offline?
            // Por enquanto, consideramos Sucesso operacional.
            println("OFFLINE MODE: Using local cache for ${domainPlaylist.name}")
            return Result.success(Unit)
        } else {
            // Sem Cache E Sem Remoto
            val msg = if (cause != null) {
                "Falha de Sincronização: ${cause.message}"
            } else {
                "Sem playlist local e Offline."
            }
            return Result.failure(Exception(msg, cause))
        }
    }

    override suspend fun registerPlayProof(mediaId: String, durationMs: Long) {
        // TODO: Offline Queue for Proof of Play
    }

    override suspend fun sendHeartbeat(status: String) {
        try {
            // In the future, grab real IP and App Version from a SystemProvider
            val appVersion = "1.0.0" 
            val ipAddress = null // Let dashboard/supabase resolve or ignore
            
            remoteDataSource.updateScreenStatus(
                id = deviceId,
                status = status,
                version = appVersion,
                ipAddress = ipAddress
            )
        } catch (e: Exception) {
            // Heartbeat is fire-and-forget, don't crash
            e.printStackTrace()
        }
    }
}

package com.antigravity.player.data

import java.io.File

import com.antigravity.cache.dao.LogDao
import com.antigravity.cache.dao.PlayerDao
import com.antigravity.cache.dao.ConfiguracaoDao
import com.antigravity.cache.dao.LogAuditoriaDao
import com.antigravity.cache.entity.ConfiguracaoEntity
import com.antigravity.cache.entity.LogAuditoriaEntity
import com.antigravity.cache.entity.OfflinePlaybackLog
import com.antigravity.cache.entity.toCache
import com.antigravity.cache.entity.toDomain
import com.antigravity.cache.storage.FileStorageManager
import com.antigravity.core.config.PlayerConfig
import com.antigravity.core.domain.model.Playlist
import com.antigravity.core.domain.repository.PlayerRepository
import com.antigravity.core.domain.repository.PlaylistState
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.util.Logger
import com.antigravity.core.util.TimeManager
import com.antigravity.core.domain.model.RegionalConfig
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.PlaybackBufferManager
import com.antigravity.player.worker.MediaDownloadWorker
import com.antigravity.sync.dto.*
import com.antigravity.sync.service.MediaDownloader
import com.antigravity.sync.service.RemoteDataSource
import com.antigravity.sync.service.SessionManager
import androidx.work.OneTimeWorkRequestBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The Brain of Data.
 * Orchestrates Remote Fetch -> Download -> Local Cache -> Domain Emission.
 */
class PlayerRepositoryImpl(
    private val context: android.content.Context,
    private val remoteDataSource: RemoteDataSource,
    private val playerDao: PlayerDao,
    private val logDao: LogDao,
    private val fileStorageManager: FileStorageManager,
    private val configuracaoDao: ConfiguracaoDao,
    private val logAuditoriaDao: LogAuditoriaDao,
    override val deviceId: String
) : PlayerRepository {

    private val _activePlaylist = MutableStateFlow<Playlist?>(null)
    private val _syncProgress = MutableStateFlow<String>("Aguardando...")

    // [STABILIZATION] Mutex to serialize network operations (Heartbeat vs Logs)
    private val networkMutex = Mutex()
    private val repositoryScope = kotlinx.coroutines.CoroutineScope(Dispatchers.IO + kotlinx.coroutines.SupervisorJob())
    private var isRealtimeStarted = false
    private var isPostMortemDone = false
    private val syncMutex = Mutex()

    override fun getActivePlaylist(): Flow<Playlist?> {
        return _activePlaylist.asStateFlow()
    }
    override fun getSyncProgress(): Flow<String> = _syncProgress.asStateFlow()

    override suspend fun syncPlaylist(screenToken: String): Flow<PlaylistState> = flow {
        emit(PlaylistState.Loading)
        try {
            // 1. Fetch Device and Active Playlist (Yeloo Blueprint + Golden Tip)
            val deviceResponse = remoteDataSource.postgrest.from("devices")
                .select(columns = Columns.raw("""
                    id, 
                    current_playlist_id, 
                    version_signature,
                    playlists (
                        id, name,
                        playlist_items (
                            id, position, duration, start_time, end_time, days_of_week,
                            medias (id, name, file_url, file_hash, media_type),
                            widgets (id, type, configuration)
                        )
                    )
                """.trimIndent())) {
                    filter { eq("screen_token", screenToken) }
                }.decodeSingle<DeviceRemoteDTO>()

            val remoteItems = deviceResponse.playlist?.items ?: emptyList()

            // 2. Hash Match Logic for each media item
            val domainItems = remoteItems.map { item ->
                val media = item.media
                if (media != null) {
                    val file = fileStorageManager.getFileForMedia(media.id)
                    val expectedHash = media.fileHash
                    
                    // [PROFESSIONAL HASH MATCH] Decisão de download baseada em integridade MD5
                    if (file.exists()) {
                        val localHash = fileStorageManager.calculateHash(file.absolutePath)
                        if (localHash == expectedHash) {
                            Logger.i("SYNC", "Hash Match: ${media.name} já está íntegro no cache.")
                        } else {
                            Logger.w("SYNC", "Hash Mismatch: ${media.name} corrompido ou desatualizado. Re-baixando...")
                            file.delete()
                            emit(PlaylistState.Downloading(media.name))
                            remoteDataSource.reportDownloadProgress(deviceId, media.id, 0)
                            val mediaDownloader = com.antigravity.sync.service.MediaDownloader()
                            mediaDownloader.downloadFile(media.fileUrl, file)
                        }
                    } else {
                        Logger.i("SYNC", "Novo Arquivo: ${media.name} baixando pela primeira vez.")
                        emit(PlaylistState.Downloading(media.name))
                        remoteDataSource.reportDownloadProgress(deviceId, media.id, 0)
                        val mediaDownloader = com.antigravity.sync.service.MediaDownloader()
                        mediaDownloader.downloadFile(media.fileUrl, file)
                    }
                    
                    val localPath = file.absolutePath
                    
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
                        endTime = item.endTime,
                        daysOfWeek = item.daysOfWeek
                    )
                } else {
                    // Handle Widgets
                    val widget = item.widget
                    val itemUrl = if (widget != null) {
                         val baseWidgetUrl = "native_widget://${widget.type.lowercase()}/${widget.id}"
                         val configJson = widget.configuration
                         if (!configJson.isNullOrBlank()) {
                             "$baseWidgetUrl?config=${java.net.URLEncoder.encode(configJson, "UTF-8")}"
                         } else {
                             baseWidgetUrl
                         }
                    } else ""

                    MediaItem(
                        id = item.id,
                        name = "Widget ${item.position}",
                        type = if (widget != null) MediaType.WEB_WIDGET else MediaType.VIDEO,
                        durationSeconds = item.duration / 1000,
                        remoteUrl = itemUrl,
                        localPath = null,
                        hash = itemUrl.hashCode().toString(),
                        orderIndex = item.position,
                        startTime = item.startTime,
                        endTime = item.endTime,
                        daysOfWeek = item.daysOfWeek
                    )
                }
            }

            // 3. Persist to Room
            savePlaylistToRoomInternal(domainItems)

            emit(PlaylistState.Success(domainItems))

        } catch (e: Exception) {
            Logger.e("REPOS", "Sync Flow Crash: ${e.message}")
            emit(PlaylistState.Error(e.message ?: "Erro na sincronização flow"))
        }
    }

    override fun listenToChanges(screenToken: String): Flow<Unit> {
        val channel = remoteDataSource.realtime.channel("device_broadcast_$screenToken")
        return channel.broadcastFlow<Unit>(event = "sync_now").map { Unit }
    }

    private suspend fun savePlaylistToRoomInternal(items: List<MediaItem>) {
        val cachedPlaylist = com.antigravity.cache.entity.CachedPlaylist(
            id = deviceId,
            name = "Sync: ${java.text.SimpleDateFormat("dd/MM HH:mm", java.util.Locale.getDefault()).format(java.util.Date())}",
            version = System.currentTimeMillis(),
            isEmergency = false,
            orientation = SessionManager.currentOrientation,
            resolution = "16x9"
        )
        val cachedItems = items.map { it.toCache(deviceId) }
        playerDao.insertPlaylistWithItems(cachedPlaylist, cachedItems)
    }

    override suspend fun syncWithRemote(): Result<Unit> = withContext(Dispatchers.IO) {
        if (syncMutex.isLocked) {
            Logger.w("SYNC", "Sync already in progress. Skipping redundant request.")
            return@withContext Result.success(Unit)
        }
        
        syncMutex.withLock {
            try {
                Logger.i("SYNC", "--- Starting Industrial Sync Cycle ---")
                
                // 1. Fetch Remote Data with Resilience
                val remotePlaylist = try {
                    remoteDataSource.getPlaylistForScreen(deviceId)
                } catch (e: Exception) {
                    val msg = e.message ?: "Unknown Connection Error"
                    Logger.e("SYNC", "Remote fetch failed: $msg. Triggering Silent Local Fallback.")
                    // [RESILIENCE] Silent Fallback: if network fails, we trust our local cache
                    return@withLock loadLocalCacheInternal(e)
                }

                if (remotePlaylist != null) {
                    // [HYGIENE] JSON Validation placeholder - if we have an ID, we assume it's valid enough to proceed
                    if (remotePlaylist.id.isBlank()) {
                        Logger.e("SYNC", "Invalid Remote Playlist: ID is blank. Fallback to cache.")
                        return@withLock loadLocalCacheInternal(Exception("Invalid remote playlist ID"))
                    }

                    // 0. Check if screen is active
                    if (!SessionManager.isScreenActive) {
                        Logger.w("SYNC", "Screen is BLOCKED by admin. Skipping playback.")
                        _syncProgress.value = "Sistema Temporariamente Suspenso."
                        sendHeartbeat("ONLINE | BLOCKED", null, null)
                        if (!isRealtimeStarted) {
                            initRealtimeSync(remotePlaylist.id)
                            initRemoteCommands()
                            isRealtimeStarted = true
                        }
                        return@withLock Result.success(Unit)
                    }

                    val newConfigSignature = calculateConfigSignature(remotePlaylist)
                    val isCacheValid = verifyCacheIntegrity(remotePlaylist)

                    if (newConfigSignature == SessionManager.lastConfigHash && isCacheValid) {
                        Logger.i("SYNC", "Config Unchanged and Cache Valid. Signature: $newConfigSignature")
                        
                        // [PURIFICATION] Even if config is same, ensure no orphan files exist
                        val validIds = remotePlaylist.items.map { it.id }
                        fileStorageManager.purgeOrphanedFiles(validIds)
                        
                        emitPlaylistFromCache()
                        sendHeartbeat("ONLINE | IDLE", null, null)
                        
                        if (!isRealtimeStarted) {
                            initRealtimeSync(remotePlaylist.id)
                            initRemoteCommands()
                            isRealtimeStarted = true
                        }
                        return@withLock Result.success(Unit)
                    }

                    if (!isCacheValid) {
                        Logger.w("SYNC", "Cache integrity failure detected. Forcing re-sync.")
                        _syncProgress.value = "Corrigindo mídias ausentes..."
                    } else {
                        Logger.i("SYNC", "New Config Detected! Signature: $newConfigSignature")
                        _syncProgress.value = "Novas configurações detectadas..."
                    }

                    // [DEEP CLEANUP] Se o ID da playlist mudou completamente (ex: deletou e criou outra no painel), limpe tudo.
                    val cachedPlaylist = playerDao.getActivePlaylist()
                    if (cachedPlaylist != null && cachedPlaylist.id != remotePlaylist.id) {
                        Logger.w("SYNC", "Nova Playlist detectada! Aplicando Limpeza Profunda (Hard Reset)...")
                        // Mata fisicamente a pasta de arquivos
                        fileStorageManager.deleteAll()
                        // Mata as tabelas de rastreamento do Room para forçar Download do Zero
                        playerDao.deleteAllPlaylists()
                        playerDao.deleteAllMediaItems()
                    }

                    // 2. Hot-Swap Orientation
                    val oldOrientation = SessionManager.currentOrientation
                    if (remotePlaylist.orientation != oldOrientation) {
                        SessionManager.triggerRotation(remotePlaylist.orientation)
                        reportActionApplied("OrientationChange", remotePlaylist.orientation)
                    }

                    // [INDUSTRIAL] Save playlist structure FIRST (This triggers the Hard Reset in DAO)
                    _syncProgress.value = "Salvando configurações..."
                    saveToLocalCache(remotePlaylist)

                    // 4. Download only new/missing media
                    _syncProgress.value = "Sincronizando novas mídias..."
                    syncContent(remotePlaylist)
                    
                    // [PROFESSIONAL REPRODUCTION MODE] 
                    // BLOQUEIO DE REDE: Não sai da tela de sincronia se o cache não estiver 100% íntegro pós-download.
                    val isSyncComplete = verifyCacheIntegrity(remotePlaylist)
                    if (!isSyncComplete) {
                        Logger.e("SYNC", "Falha Crítica de Sincronia: Faltam arquivos ou arquivos estão corrompidos após o Sync.")
                        throw Exception("Download Incompleto. Retentando...")
                    }

                    // 5. Garbage Collection (Physical Removal)
                    // [CACHE_CLEANER] 1. Purgar os orfãos usando StorageManager local
                    val validIds = remotePlaylist.items.map { it.id }
                    fileStorageManager.purgeOrphanedFiles(validIds)
                    
                    // [CACHE_CLEANER] 2. Nova estratégia de varredura profunda (Limpeza Obsoleta Anti-TVBox Full)
                    // Extrai a lista de nomes físicos exatos (.dat) que a playlist atual exige
                    val nomesArquivosOficiais = remotePlaylist.items.map { "${it.id}.dat" }
                    com.antigravity.player.util.CacheManager.limparCacheObsoleto(context, nomesArquivosOficiais)

                    // 7. Emit & Handshake
                    emitPlaylistFromCache()
                    SessionManager.lastConfigHash = newConfigSignature
                    _syncProgress.value = "Pronto!"
                    sendHeartbeat("ONLINE | UPDATED", null, null)
                    reportActionApplied("PlaylistUpdate", remotePlaylist.id)

                    if (!isRealtimeStarted) {
                        initRealtimeSync(remotePlaylist.id)
                        initRemoteCommands()
                        isRealtimeStarted = true
                    }
                    Result.success(Unit)
                } else {
                    Logger.w("SYNC", "Playlist null from server. Falling back to cache.")
                    loadLocalCacheInternal(Exception("Remote playlist null"))
                }
            } catch (e: Exception) {
                Logger.e("SYNC", "Critical crash in syncWithRemote: ${e.message}")
                loadLocalCacheInternal(e)
            }
        }
    }

    private fun initRemoteCommands() {
        repositoryScope.launch {
            try {
                // [HARDENING] Realtime Filter: We MUST use the Supabase UUID, not the Custom ID
                // Wait until SessionManager has the UUID (either from disk or network)
                while (SessionManager.currentUUID == null) {
                    Logger.w("REPOS", "Waiting for UUID resolution before subscribing to commands...")
                    delay(2000)
                }
                
                val uuid = SessionManager.currentUUID!!
                Logger.i("REPOS", "UUID Resolved: $uuid. Subscribing to Remote Commands...")
                remoteDataSource.subscribeToRemoteCommands(uuid, repositoryScope)
            } catch (e: Exception) {
                Logger.e("REPOS", "Remote Command Listener Failed: ${e.message}")
            }
        }
    }

    private fun initRealtimeSync(playlistId: String) {
        repositoryScope.launch {
            try {
                // [YELOO] Realtime subscribe uses the screenToken (deviceId)
                Logger.i("REPOS", "Starting Realtime Sync for Screen Token: $deviceId")

                // 1. Subscribe to Websockets using the Screen Token
                remoteDataSource.subscribeToRealtimeSync(deviceId, playlistId, repositoryScope)
                
                // 2. Listen for Nudges (from Realtime)
                SessionManager.syncEvents.collect {
                    Logger.i("REPOS", "Sync Nudge Received! Forcing Yeloo-Style Update...")
                    syncWithRemote()
                }
            } catch (e: Exception) {
                Logger.e("REPOS", "Realtime Connection Failed: ${e.message}")
                // Retry after 30s
                delay(30000)
                isRealtimeStarted = false
                initRealtimeSync(playlistId)
            }
        }
    }

    private fun calculateConfigSignature(playlist: Playlist): String {
        // [PRECISION] Signature MUST capture ID order to trigger re-sort instantly
        val itemsPart = playlist.items.joinToString("|") { 
            "${it.id}:${it.hash ?: it.remoteUrl.hashCode()}:${it.orderIndex}" 
        }
        return "${playlist.id}:${playlist.orientation}:${playlist.heartbeatIntervalSeconds}:$itemsPart".hashCode().toString()
    }

    private fun verifyCacheIntegrity(playlist: Playlist): Boolean {
        return playlist.items.all { item ->
            if (item.type != com.antigravity.core.domain.model.MediaType.VIDEO && 
                item.type != com.antigravity.core.domain.model.MediaType.IMAGE) {
                return@all true // Widgets and Links don't have local files
            }
            val file = fileStorageManager.getFileForMedia(item.id)
            file.exists() && file.length() > 0
        }
    }

    private suspend fun syncContent(playlist: Playlist) = coroutineScope {
        val workManager = androidx.work.WorkManager.getInstance(context)
        
        // [INDUSTRIAL] PRO Delta Sync: Only sync what changed or is missing
        // EXTREMELY IMPORTANT: Widgets and Links are handled by WebViews, DO NOT try to download them as files.
        val itemsToSync = playlist.items.filter { item ->
            (item.type == com.antigravity.core.domain.model.MediaType.VIDEO || 
             item.type == com.antigravity.core.domain.model.MediaType.IMAGE) &&
            !fileStorageManager.doesFileExistAndMatchHash(item.id, item.hash ?: "")
        }

        if (itemsToSync.isEmpty()) {
            Logger.i("SYNC", "Delta Sync: All media already optimized and present. 0 bandwidth used.")
            return@coroutineScope
        }

        val total = itemsToSync.size
        Logger.i("SYNC", "Orquestrando $total mídias pendentes via WorkManager...")
        
        val workIds = itemsToSync.map { item ->
            val downloadRequest = OneTimeWorkRequestBuilder<MediaDownloadWorker>()
                .setInputData(androidx.work.workDataOf(
                    "media_id" to item.id,
                    "url" to item.remoteUrl,
                    "hash" to (item.hash ?: "")
                ))
                .setBackoffCriteria(
                    androidx.work.BackoffPolicy.EXPONENTIAL,
                    androidx.work.WorkRequest.MIN_BACKOFF_MILLIS,
                    java.util.concurrent.TimeUnit.MILLISECONDS
                )
                .addTag("media_sync")
                .build()
            
            workManager.enqueue(downloadRequest)
            downloadRequest.id
        }

        // Wait for all downloads to finish (with timeout to prevent infinite loop)
        var completed = 0
        val startTime = System.currentTimeMillis()
        val timeoutMs = 60 * 1000L // [CONTINGENCY] Reduced to 1 minute for faster fallback
        
        while (completed < total) {
            val elapsed = System.currentTimeMillis() - startTime
            if (elapsed > timeoutMs) {
                Logger.w("SYNC", "Timeout de sincronização (5min). $completed/$total concluídos. Prosseguindo...")
                break
            }
            
            val infos = workIds.map { id -> workManager.getWorkInfoById(id).get() }
            completed = infos.count { it.state.isFinished }
            
            val failedCount = infos.count { it.state == androidx.work.WorkInfo.State.FAILED }
            if (failedCount > 0) {
                 Logger.e("SYNC", "$failedCount downloads falharam no WorkManager.")
            }
            
            // If all remaining are either finished or failed, break out
            val doneOrFailed = infos.count { it.state.isFinished }
            if (doneOrFailed >= total) break

            _syncProgress.value = "Sincronizando: $completed de $total"
            if (completed < total) delay(2000)
        }
        
        Logger.i("SYNC", "Delta Sync concluído. $completed/$total mídias baixadas.")
    }

    private suspend fun saveToLocalCache(playlist: Playlist) {
        // Preserve existing localPaths from cache for items already downloaded
        val existingItems = try {
            playerDao.getItemsForPlaylist(playlist.id).associateBy { it.id }
        } catch (_: Exception) { emptyMap() }

        val cachedItems = playlist.items.map { item ->
            val file = fileStorageManager.getFileForMedia(item.id)
            val localPath = when {
                // File exists on disk → use its path
                file.exists() && file.length() > 0 -> file.absolutePath
                // File not on disk but was in previous cache → preserve (download may be in progress)
                else -> existingItems[item.id]?.localPath
            }
            item.copy(localPath = localPath).toCache(playlist.id)
        }
        playerDao.insertPlaylistWithItems(playlist.toCache(), cachedItems)
    }

    /**
     * Re-reads the playlist from Room (with verified localPaths) and emits it.
     * This ensures the active playlist always has correct file references.
     */
    private suspend fun emitPlaylistFromCache() {
        val cachedPlaylist = playerDao.getActivePlaylist() ?: return
        val items = playerDao.getItemsForPlaylist(cachedPlaylist.id)
        val playlist = cachedPlaylist.toDomain(items)

        // Restore settings
        SessionManager.currentOrientation = playlist.orientation
        SessionManager.heartbeatIntervalSeconds = playlist.heartbeatIntervalSeconds
        SessionManager.seamlessTransition = playlist.seamlessTransition
        SessionManager.cacheNextMedia = playlist.cacheNextMedia

        // [INDUSTRIAL] Emit the FULL playlist. 
        // MainActivity.startPlaybackLoop handles skipping items that are not yet downloaded
        // via its own validateResource() logic. Filtering here causes SyncPlaylistUseCase
        // to return "Empty Playlist" failure during initial sync, blocking the UI.
        val verifiedItems = playlist.items

        Logger.i("SYNC", "Emitting FULL playlist: ${verifiedItems.size} items (some may still be downloading).")
        _activePlaylist.value = playlist.copy(items = verifiedItems)
    }

    override suspend fun loadLocalCache(): Result<Unit> = loadLocalCacheInternal(null)

    private suspend fun loadLocalCacheInternal(cause: Exception? = null): Result<Unit> {
        val cachedPlaylist = playerDao.getActivePlaylist()
        return if (cachedPlaylist != null) {
            val items = playerDao.getItemsForPlaylist(cachedPlaylist.id)
            val playlist = cachedPlaylist.toDomain(items)
            
            // [HARDENING] Restore Professional Settings from Cache
            SessionManager.currentOrientation = playlist.orientation
            SessionManager.heartbeatIntervalSeconds = playlist.heartbeatIntervalSeconds
            SessionManager.seamlessTransition = playlist.seamlessTransition
            SessionManager.cacheNextMedia = playlist.cacheNextMedia
            
            // [HARDENING] Emit FULL list to avoid blocking SyncUseCase
            // Individual items will be validated by the UI playback loop
            val verifiedItems = playlist.items
            
            _activePlaylist.value = playlist.copy(items = verifiedItems)
            Result.success(Unit)

            // [INDUSTRIAL] Post-Mortem Detection: Identify unexpected power loss
            if (!isPostMortemDone) {
                checkAndReportPowerLoss()
                isPostMortemDone = true
            }
            
            // [HARDENING] If items are missing, nudge a sync cycle
            // This check is now based on the full playlist, not filtered items
            if (verifiedItems.size < playlist.items.size) {
                Logger.w("REPOS", "Cache incompleto (${verifiedItems.size}/${playlist.items.size}). Sincronismo Delta solicitado.")
            }
            
            Result.success(Unit)
        } else {
            Result.failure(cause ?: Exception("Sem cache disponível"))
        }
    }

    private fun checkAndReportPowerLoss() {
        val prefs = context.getSharedPreferences("autopsy_prefs", android.content.Context.MODE_PRIVATE)
        val wasDirty = prefs.getBoolean("dirty_shutdown", false)
        
        if (wasDirty) {
            Logger.w("AUTOPSY", "Detectado desligamento inesperado! (Power Loss?)")
            repositoryScope.launch {
                reportRemoteError("REBOOT_BY_POWER_LOSS", "Equipamento reiniciado por possível queda de energia ou remoção da tomada.", "", emptyMap())
            }
        }
        
        // Mark as dirty for the current session. MainActivity will clean it on graceful onStop (or keep it if it crashes).
        prefs.edit().putBoolean("dirty_shutdown", true).apply()
    }

    override suspend fun registerPlayProof(mediaId: String, durationMs: Long) = withContext(Dispatchers.IO) {
        try {
            Logger.d("PLAYBACK_LOGS", "Registering Play Proof: Media=$mediaId, Size=${durationMs}ms")
            
            // [HARDENING] Rigid UTC Sync: Use TimeManager instead of System Clock
            val syncedDate = TimeManager.getSyncedDate()
            val isoDate = java.text.`SimpleDateFormat`("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.format(syncedDate)

            // [AUTOPSY] VERBOSE LOCAL SNIFFER
            Logger.i("PLAYBACK_AUTOPSY", ">>> REGISTERING PROOF: Media=$mediaId, Duration=${durationMs}ms")
            
            // [STABILIZATION] Pre-flight Validation: Reject garbage logs before they hit Room
            if (mediaId.isBlank() || mediaId == "null") {
                Logger.w("PLAYBACK_LOGS", ">>> REJECTED: MediaId is blank or 'null'")
                return@withContext
            }

            // Industrial Buffer (Precision Architecture)
            val offlineLogDao = ServiceLocator.getOfflineLogDao(context)
            offlineLogDao.insertLog(OfflinePlaybackLog(
                screen_id = deviceId,
                media_id = mediaId,
                duration = (durationMs / 1000).toInt(),
                started_at = isoDate
            ))
            
            Logger.d("PLAYBACK_AUTOPSY", ">>> LOG SAVED LOCALLY: Date=$isoDate, Screen=$deviceId")

            // [STABILIZATION] Flash Flush: Se acumular mais de 2 logs, força o envio imediato
            // Evita a espera de 15 minutos do WorkManager
            val pendingCount = offlineLogDao.getAllPendingLogs().size
            if (pendingCount >= 2) {
                Logger.i("PLAYBACK_LOGS", "Pending buffer full ($pendingCount). Triggering immediate flush...")
                PlaybackBufferManager(context).flushPendingLogs()
            }
        } catch (e: Exception) { 
            Logger.e("PLAYBACK_LOGS", "Failed to save local proof: ${e.message}")
            e.printStackTrace() 
        }
    }

    override suspend fun sendHeartbeat(
        status: String, 
        freeSpace: Long?, 
        ramUsage: Long?,
        cpuTemp: Float?,
        uptimeHours: Int?,
        ipAddress: String?
    ) = withContext(Dispatchers.IO) {
        networkMutex.withLock {
            try {
                remoteDataSource.updateScreenStatus(
                    id = deviceId,
                    status = status,
                    version = PlayerConfig.APP_VERSION,
                    ipAddress = ipAddress,
                    freeSpace = freeSpace?.toString(),
                    ramUsage = ramUsage?.toString(),
                    cpuTemp = cpuTemp?.toString(),
                    uptime = uptimeHours?.let { "${it}h" }
                )
            } catch (e: Exception) { 
                Logger.e("HEARTBEAT", "Serialized Heartbeat Failed: ${e.message}")
                e.printStackTrace() 
            }
        }
    }

    override suspend fun updateDevicesHeartbeat(deviceId: String) {
        remoteDataSource.updateDevicesHeartbeat(deviceId)
    }

    override suspend fun reportDownloadProgress(deviceId: String, mediaId: String, progress: Int) {
        remoteDataSource.reportDownloadProgress(deviceId, mediaId, progress)
    }

    override suspend fun acknowledgeCommand(commandId: String, status: String) {
        remoteDataSource.acknowledgeCommand(commandId, status)
    }

    override suspend fun reportActionApplied(action: String, value: String) {
        try {
            remoteDataSource.updateScreenActionStatus(deviceId, action, value)
        } catch (e: Exception) { e.printStackTrace() }
    }

    override suspend fun performMaintenanceCleanup() = withContext(Dispatchers.IO) {
        try {
            Logger.i("MAINTENANCE", "Starting 03:00 AM Maintenance Cycle...")
            
            // 1. Purge Orphaned Files
            val cachedPlaylist = playerDao.getActivePlaylist()
            if (cachedPlaylist != null) {
                val items = playerDao.getItemsForPlaylist(cachedPlaylist.id)
                val validIds = items.map { it.id }
                fileStorageManager.purgeOrphanedFiles(validIds)
            }

            // 2. Storage Safety: Prune logs if > 95% full
            if (fileStorageManager.isStorageCritical(95)) {
                Logger.w("MAINTENANCE", "Storage critical! Pruning oldest logs...")
                logDao.deleteOldestLogs(100)
            }

            // 3. Clear Stale Audit Logs (7-day retention for Zero-Egress database health)
            val sevenDaysAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000L)
            logAuditoriaDao.limparLogsAntigos(sevenDaysAgo)
            Logger.i("MAINTENANCE", "Audit Logs pruned (7-day retention).")

            Logger.i("MAINTENANCE", "Cycle Completed Successfully.")
        } catch (e: Exception) {
            Logger.e("MAINTENANCE", "Cycle Failed: ${e.message}")
        }
    }

    override suspend fun syncLogs(): Result<Unit> = withContext(Dispatchers.IO) {
        networkMutex.withLock {
            try {
                val offlineLogDao = ServiceLocator.getOfflineLogDao(context)
                val logs = offlineLogDao.getAllPendingLogs()
                
                if (logs.isEmpty()) {
                    Logger.d("SYNC_LOGS", "No pending logs found in industrial buffer. Skipping.")
                    return@withLock Result.success(Unit)
                }

                Logger.i("SYNC_LOGS", "Preparing sealed upload of ${logs.size} logs for Screen ID: $deviceId")

                val dtos = logs.filter { 
                    // [HYGIENE] Never send garbage to Supabase
                    it.media_id.isNotBlank() && it.screen_id.isNotBlank() && it.media_id != "null"
                }.map { log ->
                    PlayLogDto(
                        screenId = log.screen_id,
                        mediaId = log.media_id,
                        duration = log.duration,
                        startedAt = log.started_at,
                        status = "COMPLETED"
                    )
                }

                if (dtos.isEmpty()) {
                    Logger.w("SYNC_LOGS", "Batch filtered to zero valid logs. Purging garbage.")
                    offlineLogDao.clearAll()
                    return@withLock Result.success(Unit)
                }

                Logger.d("SYNC_LOGS", "First DTO Sample: Screen=${dtos.first().screenId}, Media=${dtos.first().mediaId}, Date=${dtos.first().startedAt}")
                
                remoteDataSource.insertPlayLogs(dtos)
                
                offlineLogDao.clearAll()
                
                Logger.i("SYNC_LOGS", "Sync Complete. ${logs.size} logs purged from industrial buffer.")
                Result.success(Unit)
            } catch (e: Exception) {
                Logger.e("SYNC_LOGS", "Serialized Sync Failed: ${e.message}")
                Result.failure(e)
            }
        }
    }

    override suspend fun reportRemoteError(type: String, message: String, stackTrace: String, stats: Map<String, Any>) {
        remoteDataSource.insertErrorLog(deviceId, type, message, stackTrace, stats)
    }

    override suspend fun updateMediaLocalPath(mediaId: String, path: String) {
        withContext(Dispatchers.IO) {
            // 1. Update Room DB
            playerDao.updateMediaLocalPath(mediaId, path)
            
            // 2. Trigger reactive emission to observers (MainActivity)
            emitPlaylistFromCache()
            
            Logger.i("REPOS", "Local path updated for $mediaId -> $path. Emission triggered.")
        }
    }

    // [REGIONAL CONTEXT]
    override suspend fun getLocalizacao(): RegionalConfig? = withContext(Dispatchers.IO) {
        val config = configuracaoDao.getLocalizacaoSalva()
        if (config != null) RegionalConfig(config.cidade, config.estado, config.timezone) else null
    }

    override suspend fun salvarLocalizacao(config: RegionalConfig) = withContext(Dispatchers.IO) {
        val antiga = configuracaoDao.getLocalizacaoSalva()
        configuracaoDao.salvarLocalizacao(ConfiguracaoEntity(
            id = 1,
            tokenAcesso = antiga?.tokenAcesso,
            playerID = antiga?.playerID,
            cidade = config.cidade,
            estado = config.estado,
            timezone = config.timezone
        ))
    }

    override suspend fun salvarCredenciais(token: String, playerId: String) = withContext(Dispatchers.IO) {
        val antiga = configuracaoDao.getLocalizacaoSalva()
        configuracaoDao.salvarLocalizacao(ConfiguracaoEntity(
            id = 1,
            tokenAcesso = token,
            playerID = playerId,
            cidade = antiga?.cidade ?: "Desconhecido",
            estado = antiga?.estado ?: "Desconhecido",
            timezone = antiga?.timezone ?: "America/Sao_Paulo"
        ))
    }

    override suspend fun getStoredCredentials(): Pair<String, String>? = withContext(Dispatchers.IO) {
        val config = configuracaoDao.getLocalizacaoSalva()
        if (!config?.tokenAcesso.isNullOrEmpty() && !config?.playerID.isNullOrEmpty()) {
            Pair(config!!.tokenAcesso!!, config.playerID!!)
        } else {
            null
        }
    }

    override suspend fun salvarLogAuditoria(nome: String, tipo: String, duracao: Int, cidade: String) = withContext(Dispatchers.IO) {
        logAuditoriaDao.inserirLog(LogAuditoriaEntity(
            midiaNome = nome,
            midiaTipo = tipo,
            duracaoExibida = duracao,
            cidadeNoMomento = cidade
        ))
    }

    override suspend fun buscarLogsAuditoria(): List<com.antigravity.core.domain.model.LogAuditoria> = withContext(Dispatchers.IO) {
        logAuditoriaDao.buscarTodosLogs().map { entity ->
            com.antigravity.core.domain.model.LogAuditoria(
                id = entity.id,
                midiaNome = entity.midiaNome,
                midiaTipo = entity.midiaTipo,
                dataHora = entity.dataHora,
                cidadeNoMomento = entity.cidadeNoMomento,
                duracaoExibida = entity.duracaoExibida
            )
        }
    }

    override suspend fun limparLogsAuditoriaAntigos(limiteTempo: Long) = withContext(Dispatchers.IO) {
        logAuditoriaDao.limparLogsAntigos(limiteTempo)
    }

    override suspend fun hasLocalMedia(): Boolean = withContext(Dispatchers.IO) {
        val dir = File(context.filesDir, "media_content")
        if (!dir.exists()) return@withContext false
        val files = dir.listFiles()
        return@withContext files?.any { file -> file.isFile && file.length() > 0 } ?: false
    }
}

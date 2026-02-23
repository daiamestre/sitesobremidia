package com.antigravity.player.data

import com.antigravity.cache.dao.LogDao
import com.antigravity.cache.dao.PlayerDao
import com.antigravity.cache.entity.OfflinePlaybackLog
import com.antigravity.cache.entity.toCache
import com.antigravity.cache.entity.toDomain
import com.antigravity.cache.storage.FileStorageManager
import com.antigravity.core.config.PlayerConfig
import com.antigravity.core.domain.model.Playlist
import com.antigravity.core.domain.repository.PlayerRepository
import com.antigravity.core.util.Logger
import com.antigravity.core.util.TimeManager
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.PlaybackBufferManager
import com.antigravity.player.worker.MediaDownloadWorker
import com.antigravity.sync.dto.PlayLogDto
import com.antigravity.sync.service.MediaDownloader
import com.antigravity.sync.service.RemoteDataSource
import com.antigravity.sync.service.SessionManager
import androidx.work.OneTimeWorkRequestBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
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

                    // 2. Hot-Swap Orientation
                    val oldOrientation = SessionManager.currentOrientation
                    if (remotePlaylist.orientation != oldOrientation) {
                        SessionManager.triggerRotation(remotePlaylist.orientation)
                        reportActionApplied("OrientationChange", remotePlaylist.orientation)
                    }

                    // 3. Save playlist structure FIRST
                    _syncProgress.value = "Salvando configurações..."
                    saveToLocalCache(remotePlaylist)

                    // 4. Download only new/missing media
                    _syncProgress.value = "Sincronizando novas mídias..."
                    syncContent(remotePlaylist)

                    // 5. Finalize
                    _syncProgress.value = "Finalizando..."
                    saveToLocalCache(remotePlaylist)

                    // 6. Garbage Collection
                    val validIds = remotePlaylist.items.map { it.id }
                    fileStorageManager.purgeOrphanedFiles(validIds)

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
                // [HARDENING] Realtime requires UUID for Postgres filter to work correctly
                while (SessionManager.currentUUID == null) {
                    Logger.w("REPOS", "Waiting for UUID to initialize Realtime Sync...")
                    delay(2000)
                }
                
                val uuid = SessionManager.currentUUID!!
                Logger.i("REPOS", "Starting Realtime Sync for UUID: $uuid")

                // 1. Subscribe to Websockets using the resolved UUID
                remoteDataSource.subscribeToRealtimeSync(uuid, playlistId, repositoryScope)
                
                // 2. Listen for Nudges (from Realtime)
                SessionManager.syncEvents.collect {
                    Logger.i("REPOS", "Sync Nudge Received! Forcing Background Update...")
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
        // Simple signature based on key fields
        val itemsPart = playlist.items.joinToString("|") { "${it.id}:${it.remoteUrl}" }
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
        val timeoutMs = 45 * 1000L // Reduced to 45s for better initial UX. Background sync will finish the rest anyway.
        
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
}

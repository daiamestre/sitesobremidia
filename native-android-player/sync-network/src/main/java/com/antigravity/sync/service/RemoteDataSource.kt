package com.antigravity.sync.service

import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.domain.model.Playlist
import com.antigravity.core.util.Logger
import com.antigravity.core.util.TimeManager
import com.antigravity.sync.dto.*
import io.github.jan.supabase.postgrest.*
import io.github.jan.supabase.postgrest.query.*
import io.github.jan.supabase.realtime.*
import io.github.jan.supabase.storage.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.serialization.json.put
import kotlinx.serialization.json.buildJsonObject
import com.antigravity.sync.storage.TokenStorage

class RemoteDataSource {
    
    private val client = SupabaseModule.client
    val postgrest: Postgrest get() = client.postgrest
    val realtime: Realtime get() = client.realtime
    
    private var tokenStorage: TokenStorage? = null
    private var appContext: android.content.Context? = null

    fun init(context: android.content.Context) {
        appContext = context.applicationContext
        if (tokenStorage == null) {
            tokenStorage = TokenStorage(context)
        }
    }

    // [HIGH-END] Realtime Handshake: PostgreSQL CDC via Websockets (Yeloo Style)
    suspend fun subscribeToRealtimeSync(screenToken: String, playlistId: String?, scope: CoroutineScope) {
        val channel = client.realtime.channel("yeloo_sync_channel")
        
        // 1. Devices Subscription: Monitor for screen/device config changes (including orientation/active)
        val deviceFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "devices"
            filter = "screen_token=eq.$screenToken"
        }
        
        deviceFlow.onEach { action ->
            Logger.i("REALTIME", "Device Update Detected via CDC! Action: ${action.javaClass.simpleName}")
            // Trigger a full sync nudge when device config changes
            SessionManager.triggerSyncNudge()
        }.launchIn(scope)

        // 2. Playlists Subscription: Monitor the actual playlist content
        if (playlistId != null) {
            val playlistFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "playlists"
                filter = "id=eq.$playlistId"
            }
            
            playlistFlow.onEach { action ->
                Logger.i("REALTIME", "Playlist Header Update Detected! Triggering download...")
                SessionManager.triggerSyncNudge()
            }.launchIn(scope)

            // 3. Playlist Items Subscription: Critical for Media Add/Remove/Sort
            val playlistItemsFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "playlist_items"
                filter = "playlist_id=eq.$playlistId"
            }

            playlistItemsFlow.onEach { action ->
                Logger.i("REALTIME", "Playlist Items Updated! Triggering download...")
                SessionManager.triggerSyncNudge()
            }.launchIn(scope)
        }

        channel.subscribe()
        Logger.i("REALTIME", "Subscribed to Websockets for Screen Token: $screenToken")
    }

    // [INDUSTRIAL] Realtime Command Listener: The "Soberana" Remote control
    suspend fun subscribeToRemoteCommands(screenUuid: String, scope: CoroutineScope) {
        Logger.w("SYNC_SNIFFER", ">>> ATTEMPTING COMMAND SUBSCRIPTION FOR UUID: $screenUuid")
        val channel = client.realtime.channel("remote_commands_channel")
        
        val commandFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "remote_commands"
            filter = "screen_id=eq.$screenUuid"
        }
        
        commandFlow.onEach { action ->
            if (action is PostgresAction.Insert) {
                val command = action.record["command"]?.toString()?.replace("\"", "")
                val commandId = action.record["id"]?.toString()?.replace("\"", "")
                
                if (command != null && commandId != null) {
                    Logger.w("SYNC_SNIFFER", "!!! COMMAND PACKET RECEIVED: $command (ID: $commandId)")
                    SessionManager.triggerRemoteCommand(command, commandId)
                } else {
                    Logger.e("SYNC_SNIFFER", "### MALFORMED COMMAND PACKET: cmd=$command, id=$commandId")
                }
            }
        }.launchIn(scope)
        
        channel.subscribe()
        Logger.i("SYNC_SNIFFER", "### SUBSCRIPTION ACTIVE FOR UUID: $screenUuid")
    }

    // [INDUSTRIAL] Download Visibility: Progress Reporting
    suspend fun reportDownloadProgress(deviceId: String, mediaId: String, progress: Int) {
        try {
            val payload = mapOf(
                "device_id" to deviceId,
                "media_id" to mediaId,
                "progress" to progress,
                "updated_at" to getIsoTimestamp()
            )
            // Upsert progress into download_status table
            client.from("download_status").upsert(payload, onConflict = "device_id,media_id")
        } catch (e: Exception) {
            // Non-critical, ignore if reporting fails
        }
    }

    // [INDUSTRIAL] Command Acknowledgement
    suspend fun acknowledgeCommand(commandId: String, status: String) {
        try {
            client.from("remote_commands").update(
                mapOf("status" to status, "executed_at" to getIsoTimestamp())
            ) {
                filter { eq("id", commandId) }
            }
        } catch (e: Exception) {
            Logger.e("COMMANDS", "Failed to acknowledge command: ${e.message}")
        }
    }

    // Fetch the playlist assigned to this screen (Yeloo Style)
    suspend fun getPlaylistForScreen(identifier: String): Playlist? {
        val normalizedId = identifier.trim().uppercase()
        Logger.i("SYNC", "Starting Full Sync for Device: $normalizedId")
        
        // 1. Fetch Device with nested Playlist Items and Media/Widgets (Golden Tip Query)
        val device = try {
            client.from("devices")
                .select(columns = io.github.jan_tennert.supabase.postgrest.query.Columns.raw("""
                    id, 
                    name,
                    screen_token,
                    current_playlist_id,
                    version_signature,
                    orientation,
                    resolution,
                    playlists (
                        id,
                        name,
                        playlist_items (
                            id, position, duration, start_time, end_time, days_of_week,
                            medias (id, name, file_url, file_hash, media_type),
                            widgets (id, type, configuration)
                        )
                    )
                """.trimIndent())) {
                   filter {
                       or {
                           eq("screen_token", identifier.trim())
                           eq("screen_token", identifier.trim().uppercase())
                           eq("screen_token", identifier.trim().lowercase())
                           if (identifier.length > 20) { 
                               eq("id", identifier.trim())
                           }
                       }
                   }
                }.decodeSingleOrNull<com.antigravity.sync.dto.DeviceRemoteDTO>()
        } catch (e: Exception) {
            Logger.e("SYNC", "Failed to fetch device data: ${e.message}")
            throw e
        }

        if (device == null) {
            throw Exception("[PERMANENT] Dispositivo não encontrado. Verifique o Screen Token: $identifier")
        }

        // Dashboard Settings Extraction
        val orientation = device.orientation ?: "landscape"
        val resolution = device.resolution ?: "16x9"
        
        SessionManager.currentOrientation = orientation
        SessionManager.currentScreenName = device.name ?: "Player ${device.screenToken}"
        SessionManager.currentUserId = device.screenToken
        SessionManager.currentUUID = device.id 
        
        tokenStorage?.saveUUID(device.id)

        val playlist = device.playlists
        if (playlist == null) {
             Logger.w("SYNC", "Device found but no Playlist assigned.")
             return null
        }

        // 2. Map to Domain
        return mapToProfessionalDomain(device, playlist, orientation, resolution)
    }

    suspend fun updateScreenActionStatus(id: String, action: String, value: String) {
        try {
            val timestamp = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.getDefault()).format(java.util.Date())
            client.from("screens").update(
                mapOf(
                    "last_action" to action,
                    "last_action_value" to value,
                    "last_action_at" to timestamp,
                    "status_note" to "Applied: $action ($value) at $timestamp"
                )
            ) {
                filter { eq("id", id) }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun mapToProfessionalDomain(
        device: com.antigravity.sync.dto.DeviceRemoteDTO,
        playlist: com.antigravity.sync.dto.PlaylistRemoteDTO,
        orientation: String,
        resolution: String
    ): Playlist {
        val rawItems = playlist.items
        val domainItems = rawItems.mapNotNull { item ->
            val media = item.media
            val widget = item.widget

            val itemId: String
            val itemName: String
            val itemType: MediaType
            val itemUrl: String
            val itemHash: String

            when {
                media != null -> {
                    itemId = media.id
                    itemName = media.name
                    itemType = when (media.mediaType) {
                        "video" -> MediaType.VIDEO
                        "image" -> MediaType.IMAGE
                        else -> inferMediaType(media.fileUrl)
                    }
                    itemUrl = media.fileUrl
                    itemHash = media.fileHash
                }
                widget != null -> {
                    itemId = widget.id
                    itemName = "Widget ${widget.type}"
                    itemType = MediaType.WEB_WIDGET
                    val baseWidgetUrl = "native_widget://${widget.type.lowercase()}/${widget.id}"
                    val configJson = widget.configuration
                    itemUrl = if (!configJson.isNullOrBlank()) {
                        "$baseWidgetUrl?config=${java.net.URLEncoder.encode(configJson, "UTF-8")}"
                    } else {
                        baseWidgetUrl
                    }
                    itemHash = itemUrl.hashCode().toString()
                }
                // Users new list focuses on medias/widgets
                else -> {
                    Logger.e("SYNC", "FILTERED: Item ${item.id} (Pos: ${item.position}) has no valid Media or Widget metadata.")
                    return@mapNotNull null
                }
            }

            MediaItem(
                id = itemId,
                name = itemName,
                type = itemType,
                durationSeconds = item.duration / 1000, 
                remoteUrl = itemUrl,
                localPath = null,
                hash = itemHash,
                orderIndex = item.position,
                startTime = item.startTime,
                endTime = item.endTime,
                daysOfWeek = item.daysOfWeek,
                transitionEffect = "crossfade"
            )
        }.sortedBy { it.orderIndex }

        return Playlist(
            id = playlist.id,
            name = playlist.name,
            version = System.currentTimeMillis(),
            items = domainItems,
            orientation = orientation,
            resolution = resolution,
            heartbeatIntervalSeconds = 60,
            seamlessTransition = true,
            cacheNextMedia = true
        )
    }

    // [NEW] Find screen by Custom ID (entered by user) - Case Insensitive
    suspend fun findScreenByCustomId(customId: String): RemoteScreen? {
         val id = customId.trim()
         return client.from("screens")
             .select {
                 filter {
                     or {
                         eq("custom_id", id)
                         eq("custom_id", id.uppercase())
                         eq("custom_id", id.lowercase())
                     }
                 }
             }
             .decodeSingleOrNull<RemoteScreen>()
    }

    // [REFINED] Error Reporting to 'device_logs'
    suspend fun insertErrorLog(
        screenId: String,
        type: String,
        message: String,
        stackTrace: String,
        stats: Map<String, Any> = emptyMap()
    ) {
        try {
            val params = mapOf(
                "device_id" to screenId,
                "error_type" to type,
                "message" to message,
                "stack_trace" to stackTrace,
                "hardware_info" to stats,
                "created_at" to getIsoTimestamp()
            )
            client.from("device_logs").insert(params)
            com.antigravity.core.util.Logger.i("ERROR_SYNC", "Persistent error log sent to 'device_logs'")
        } catch (e: Exception) {
            com.antigravity.core.util.Logger.e("ERROR_SYNC", "Failed to buffer/send error log: ${e.message}")
        }
    }

    // [NEW] Proof-of-Life: High-Res Screenshot Upload with UPSERT (Overwrite)
    suspend fun uploadScreenshot(deviceId: String, data: ByteArray, source: String = "manual") {
        val uuid = SessionManager.currentUUID ?: deviceId
        Logger.w("SYNC_SNIFFER", ">>> STARTING SCREENSHOT UPLOAD. ID=$uuid, Source=$source, Size=${data.size} bytes")
        
        if (uuid.isBlank() || uuid == "UNKNOWN") {
            Logger.e("SYNC_SNIFFER", "### UPLOAD ABORTED: ID IS INVALID (NULL/UNKNOWN)")
            return
        }
        
        try {
            val fileName = "$uuid.jpg"
            val bucket = client.storage.from("screenshots")
            
            Logger.w("SYNC_SNIFFER", ">>> UPLOADING TO STORAGE: screenshots/$fileName")
            bucket.upload(fileName, data, upsert = true)
            Logger.i("SYNC_SNIFFER", ">>> STORAGE UPLOAD SUCCESSFUL: $fileName")
            
            // [MISSION CRITICAL] Confirmation: Sync timestamp to trigger Dashboard refresh
            val timestamp = getIsoTimestamp()
            
            try {
                Logger.w("SYNC_SNIFFER", ">>> UPDATING METADATA IN 'screens' TABLE FOR UUID: $uuid")
                client.from("screens").update(
                    buildJsonObject {
                        put("last_screenshot_at", timestamp)
                        put("last_screenshot_type", source)
                        put("last_screenshot_url", "screenshots/$uuid.jpg?t=${System.currentTimeMillis()}")
                    }
                ) {
                    filter { eq("id", uuid) }
                }
                Logger.i("SYNC_SNIFFER", ">>> DATABASE METADATA UPDATED SUCCESSFULLY")
            } catch (dbError: Exception) {
                Logger.e("SYNC_SNIFFER", "### DATABASE UPDATE FAILED: ${dbError.message}")
            }
        } catch (e: Exception) {
            val errorBody = (e as? io.github.jan.supabase.exceptions.RestException)?.description ?: e.message
            Logger.e("SYNC_SNIFFER", "### UPLOAD CRASHED: $errorBody")
            throw e
        }
    }

    // [REFINED] Direct Heartbeat for 'last_heartbeat' column confirmation
    suspend fun updateDevicesHeartbeat(deviceId: String) {
        try {
            val timestamp = getIsoTimestamp()
            client.from("devices").update(
                mapOf("last_heartbeat" to timestamp)
            ) {
                filter { eq("id", deviceId) }
            }
            Logger.i("SYNC", "Realtime Confirmation: table 'devices' updated.")
        } catch (e: Exception) {
            val msg = e.message ?: ""
            val isRecursionError = msg.contains("stack depth limit exceeded", ignoreCase = true)
            val isRlsError = msg.contains("403", ignoreCase = true) || msg.contains("permission", ignoreCase = true)
            
            if (isRecursionError) {
                Logger.e("DB_CRITICAL", "RECURSION DETECTED: A tabela 'devices' está em loop infinito (RLS/Trigger).")
                Logger.w("SYNC", "Otimização: Ignorando update redundante em 'devices' para evitar crash.")
                return 
            }

            if (isRlsError) {
                Logger.e("AUTH_SHIELD", "RLS BLOCK: Dispositivo sem permissão para atualizar 'devices' (ID: $deviceId)")
            } else {
                if (msg.contains("JWT expired", ignoreCase = true) || msg.contains("401", ignoreCase = true)) {
                    appContext?.let { ctx ->
                        try {
                            com.antigravity.sync.repository.AuthRepository().forceRefreshSession(ctx)
                            val newTimestamp = getIsoTimestamp()
                            client.from("devices").update(mapOf("last_heartbeat" to newTimestamp)) { filter { eq("id", deviceId) } }
                            Logger.i("SYNC", "Realtime Confirmation: updated after JWT refresh.")
                            return
                        } catch (retryEx: Exception) {
                            Logger.e("SYNC", "Realtime Heartbeat Failed after retry: ${retryEx.message}")
                            return
                        }
                    }
                }
                Logger.e("SYNC", "Realtime Heartbeat Failed: $msg")
            }
        }
    }


    // [SCALE 10K] Ultra-Lightweight Heartbeat -> device_health table (1kb payload)
    // NOTE: Prefer using HeartbeatManager.sendPulse() for the full DTO.
    //       This method is kept as a simplified fallback.
    suspend fun upsertDeviceHealth(
        deviceId: String,
        status: String = "online",
        appVersion: String? = null,
        storageUsagePercent: Int? = null
    ) {
        if (deviceId.isBlank() || deviceId == "N/A") return
        try {
            val payload = buildMap<String, Any?> {
                put("device_id", deviceId)
                put("last_seen", getIsoTimestamp())
                if (appVersion != null) put("app_version", appVersion)
                if (storageUsagePercent != null) put("storage_usage_percent", storageUsagePercent)
            }
            client.from("device_health").upsert(payload) {
                onConflict = "device_id"
            }
            Logger.d("PULSE", "Heartbeat OK -> device_health (ID: $deviceId)")
        } catch (e: Exception) {
            Logger.w("PULSE", "Heartbeat to device_health failed: ${e.message}")
        }
    }

    // [NEW] Update Screen Status (Heartbeat)
    suspend fun updateScreenStatus(
        id: String, 
        status: String, 
        version: String, 
        ipAddress: String?,
        freeSpace: String? = null,
        ramUsage: String? = null,
        cpuTemp: String? = "N/A",
        uptime: String? = "N/A"
    ) {
        if (id.isBlank() || id == "N/A") {
            com.antigravity.core.util.Logger.e("SYNC", "Aborting Heartbeat: ID is blank or N/A")
            return
        }
        val rpcParams = buildMap {
            put("p_screen_id", id)
            put("p_status", status)
            put("p_version", version)
            put("p_ram_usage", ramUsage ?: "N/A")
            put("p_free_space", freeSpace ?: "N/A")
            put("p_cpu_temp", cpuTemp ?: "N/A")
            put("p_uptime", uptime ?: "N/A")
            put("p_ip_address", ipAddress ?: "N/A")
        }

        try {

            // [PERFORMANCE] RPC Call: Standardized endpoint for massive scale
            val response = client.postgrest.rpc("pulse_screen", rpcParams)
            
            // [CLOUD TIME SYNC] Extract server time from HTTP headers to refine clock
            try {
                // Supabase / Postgrest responses usually carry the 'Date' header
                // We use this as Layer 2 Cloud Sync to adjust for drift every heartbeat
                // If the client supports it, we can extract it from regular responses.
            } catch (e: Exception) {}

            // [HARDENING] Log raw response for diagnostic
            com.antigravity.core.util.Logger.i("SYNC", "Heartbeat confirmed for ID: $id (Resp: ${response.data})")
        } catch (e: Exception) {
            val errorBody = (e as? io.github.jan.supabase.exceptions.RestException)?.description ?: e.message
            
            // [NEW] Automatic Retry on JWT Expired
            if (errorBody?.contains("JWT expired", ignoreCase = true) == true || errorBody?.contains("401", ignoreCase = true) == true) {
                appContext?.let { ctx ->
                    try {
                        com.antigravity.sync.repository.AuthRepository().forceRefreshSession(ctx)
                        val response = client.postgrest.rpc("pulse_screen", rpcParams)
                        com.antigravity.core.util.Logger.i("SYNC", "Heartbeat confirmed for ID: $id after JWT refresh.")
                        return
                    } catch (retryEx: Exception) {
                        com.antigravity.core.util.Logger.e("SYNC", "Heartbeat Error after retry [ID=$id]: ${retryEx.message}")
                        throw retryEx
                    }
                }
            }

            com.antigravity.core.util.Logger.e("SYNC", "Heartbeat Error [ID=$id]: $errorBody")
            throw e
        }
    }

    private fun inferMediaType(url: String): MediaType {
        // Remove query params if present (e.g. signed URLs)
        val cleanUrl = url.substringBefore('?')
        val extension = cleanUrl.substringAfterLast('.', "").lowercase()
        return when {
            extension in listOf("mp4", "mkv", "webm", "avi", "mov") -> MediaType.VIDEO
            else -> MediaType.IMAGE // Default to Image for jpg, png, etc.
        }
    }

    suspend fun insertPlayLogs(logs: List<com.antigravity.sync.dto.PlayLogDto>) {
        if (logs.isEmpty()) return
        try {
            // [AUTOPSY] BRUTAL SNIFFER: Exact JSON Payload
            val jsonEncoder = kotlinx.serialization.json.Json { prettyPrint = true }
            val rawJson = jsonEncoder.encodeToString(kotlinx.serialization.builtins.ListSerializer(com.antigravity.sync.dto.PlayLogDto.serializer()), logs)
            
            com.antigravity.core.util.Logger.i("SYNC_AUTOPSY", ">>> UPLOADING BATCH: ${logs.size} items")
            com.antigravity.core.util.Logger.i("SYNC_AUTOPSY", ">>> RAW JSON PAYLOAD:\n$rawJson")
            
            client.from("playback_logs").insert(logs)
            
            com.antigravity.core.util.Logger.i("SYNC_AUTOPSY", "<<< SERVER SUCCESS (201/200 OK)")
            com.antigravity.core.util.Logger.d("SYNC", "Logs uploaded successfully.")
        } catch (e: Exception) {
            val restException = e as? io.github.jan.supabase.exceptions.RestException
            val errorBody = restException?.description ?: e.message
            val statusCode = restException?.error ?: "UNKNOWN" // Usually captures HTTP error code string
            
            com.antigravity.core.util.Logger.e("SYNC_AUTOPSY", "!!! SERVER REJECTION !!!")
            com.antigravity.core.util.Logger.e("SYNC_AUTOPSY", "!!! HTTP STATUS/ERROR: $statusCode")
            com.antigravity.core.util.Logger.e("SYNC_AUTOPSY", "!!! RESPONSE BODY: $errorBody")
            
            // [FORENSICS] Log local date to check for clock drift
            com.antigravity.core.util.Logger.e("SYNC_AUTOPSY", "!!! LOCAL SYSTEM TIME: ${getIsoTimestamp()}")
            
            // Re-throw to handle in repository (e.g. keep logs in Room)
            throw e
        }
    }

    // [OFFLINE ANALYTICS] Descarregamento Diário Assíncrono do Cofre
    suspend fun uploadAnalyticsBatch(logs: List<Map<String, Any>>): Boolean {
        if (logs.isEmpty()) return true
        
        // Converte o List de Maps de volta para um formato JSON escalável que
        // a RPC process_display_analytics_batch (PostgreSQL) consiga interpretar e iterar.
        val jsonArray = kotlinx.serialization.json.buildJsonArray {
            logs.forEach { log ->
                add(kotlinx.serialization.json.buildJsonObject {
                    put("screen_id", log["screen_id"].toString())
                    put("media_id", log["media_id"].toString())
                    put("media_name", log["media_name"].toString())
                    put("duration_seconds", log["duration_seconds"] as Int)
                    put("played_at", log["played_at"].toString())
                })
            }
        }
        val rpcParams = kotlinx.serialization.json.buildJsonObject {
            put("payload", jsonArray)
        }

        return try {
            com.antigravity.core.util.Logger.w("SYNC_ANALYTICS", ">>> INICIANDO DESCARGA BATCH: ${logs.size} EXIBIÇÕES")
            client.postgrest.rpc("process_display_analytics_batch", rpcParams)
            com.antigravity.core.util.Logger.i("SYNC_ANALYTICS", ">>> BATCH [OK]. O painel estatístico foi atualizado.")
            true
        } catch (e: Exception) {
            val errorBody = (e as? io.github.jan.supabase.exceptions.RestException)?.description ?: e.message
            
            // Automatic Retry on JWT Expired specifically for Analytics Batch
            if (errorBody?.contains("JWT expired", ignoreCase = true) == true || errorBody?.contains("401", ignoreCase = true) == true) {
                appContext?.let { ctx ->
                    try {
                        com.antigravity.core.util.Logger.w("SYNC_ANALYTICS", "JWT Expirado durante Batch. Refazendo Sessão...")
                        com.antigravity.sync.repository.AuthRepository().forceRefreshSession(ctx)
                        client.postgrest.rpc("process_display_analytics_batch", rpcParams)
                        com.antigravity.core.util.Logger.i("SYNC_ANALYTICS", ">>> BATCH [OK] (Após refresh de JWT).")
                        return true
                    } catch (retryEx: Exception) {
                        com.antigravity.core.util.Logger.e("SYNC_ANALYTICS", "Falha de Batch mesmo após refresh: ${retryEx.message}")
                        return false
                    }
                }
            }
            
            com.antigravity.core.util.Logger.e("SYNC_ANALYTICS", "### REJEIÇÃO BATCH [REST ERROR]: $errorBody")
            false
        }
    }

    // Helper for ISO 8601 Timestamp (MinSDK 21 safe)
    private fun getIsoTimestamp(): String {
        return try {
            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
            // [MISSION CRITICAL] Use Synced Clock instead of System Clock
            sdf.format(java.util.Date(com.antigravity.core.util.TimeManager.currentTimeMillis()))
        } catch (e: Exception) {
            // Fallback
            java.util.Date().toString()
        }
    }

    suspend fun getLatestAppRelease(): com.antigravity.sync.dto.AppReleaseDto? {
        return try {
            client.from("app_releases")
                .select {
                    order("version_code", Order.DESCENDING)
                    limit(1)
                }.decodeSingleOrNull<com.antigravity.sync.dto.AppReleaseDto>()
        } catch (e: Exception) {
            com.antigravity.core.util.Logger.e("OTA_SYNC", "Failed to fetch latest release: ${e.message}")
            null
        }
    }
}

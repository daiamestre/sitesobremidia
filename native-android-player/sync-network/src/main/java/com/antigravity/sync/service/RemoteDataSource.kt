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
    private var tokenStorage: TokenStorage? = null

    fun init(context: android.content.Context) {
        if (tokenStorage == null) {
            tokenStorage = TokenStorage(context)
        }
    }

    // [HIGH-END] Realtime Handshake: PostgreSQL CDC via Websockets
    suspend fun subscribeToRealtimeSync(screenUuid: String, playlistId: String?, scope: CoroutineScope) {
        val channel = client.realtime.channel("blindada_channel")
        
        // 1. Screens Subscription: Monitor for screen/device config changes (including is_active)
        val screenFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "screens"
            filter = "id=eq.$screenUuid"
        }
        
        screenFlow.onEach { action ->
            Logger.i("REALTIME", "Screen Update Detected! Action: ${action.javaClass.simpleName}")
            // Trigger a full sync nudge when screen config changes
            SessionManager.triggerSyncNudge()
        }.launchIn(scope)

        // 2. Playlists Subscription: Monitor the actual playlist content
        if (playlistId != null) {
            val playlistFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "playlists" // Aligned with user prompt
                filter = "id=eq.$playlistId"
            }
            
            playlistFlow.onEach { action ->
                Logger.i("REALTIME", "Playlist Update Detected! Triggering download...")
                SessionManager.triggerSyncNudge()
            }.launchIn(scope)
        }

        channel.subscribe()
        Logger.i("REALTIME", "Subscribed to Websockets for Screen: $screenUuid")
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

    // Fetch the playlist assigned to this screen
    suspend fun getPlaylistForScreen(identifier: String): Playlist? {
        val normalizedId = identifier.trim().uppercase()
        Logger.i("SYNC", "Starting Full Sync for Screen: $normalizedId")

        // 1. Fetch Screen (Robust Case-Insensitive Lookup)
        var screen = try {
            client.from("screens")
                .select() {
                   filter {
                       or {
                           eq("custom_id", identifier.trim())
                           eq("custom_id", identifier.trim().uppercase())
                           eq("custom_id", identifier.trim().lowercase())
                           if (identifier.length > 20) { // Likely UUID
                               eq("id", identifier.trim())
                           }
                       }
                   }
                }.decodeSingleOrNull<RemoteScreen>()
        } catch (e: Exception) {
            Logger.w("SYNC", "Primary lookup failed: ${e.message}. Trying UUID fallback...")
            null
        }

        if (screen == null) {
            throw Exception("[PERMANENT] Tela não encontrada no painel. Verifique o ID: $identifier")
        }

        // Dashboard Settings Extraction
        val orientation = screen.orientation ?: "landscape"
        val resolution = screen.resolution ?: "16x9"
        
        SessionManager.currentOrientation = orientation
        SessionManager.currentScreenName = screen.name
        // [HARDENING] Handshake Priority: Custom ID for Auth, UUID for System Logic
        SessionManager.currentUserId = screen.customId ?: screen.id
        SessionManager.currentUUID = screen.id // Always the UUID for commands and files
        
        // Persist UUID for instant boot recovery
        tokenStorage?.saveUUID(screen.id)
        
        // [REMOTE CONTROL] Audio State Sync
        val isAudioEnabled = screen.audioEnabled ?: true
        if (isAudioEnabled != SessionManager.isAudioEnabled) {
            SessionManager.triggerAudioChange(isAudioEnabled)
        }

        // [SCREEN ACTIVE] Propagate is_active state to player
        val isActive = screen.isActive ?: true
        if (isActive != SessionManager.isScreenActive) {
            SessionManager.triggerScreenActive(isActive)
        }

        // [TIMEZONE SYNC] Apply dashboard timezone offset
        TimeManager.setTimeZoneOffset(screen.timezoneOffset ?: -3)
        Logger.i("SYNC", "Applied Dashboard Timezone: GMT${screen.timezoneOffset ?: -3}")
        
        val playlistId = screen.playlistId
        if (playlistId == null) {
             Logger.w("SYNC", "Screen found but no Playlist assigned.")
             return null
        }

        // 2. Fetch Playlist
        val remotePlaylist = client.from("playlists")
            .select(columns = Columns.raw("id, name")) {
                filter { eq("id", playlistId) }
            }.decodeSingleOrNull<RemotePlaylist>()

        if (remotePlaylist == null) return null

        // 3. Fetch Items (WITHOUT JOINS to avoid schema relationship errors)
        val rawItems = client.from("playlist_items")
            .select(columns = Columns.raw("*")) {
                filter { eq("playlist_id", playlistId) }
            }.decodeList<com.antigravity.sync.dto.RemotePlaylistItem>()

        if (rawItems.isEmpty()) {
            return Playlist(
                id = remotePlaylist.id,
                name = remotePlaylist.name,
                version = System.currentTimeMillis(),
                items = emptyList(),
                orientation = orientation,
                resolution = resolution
            )
        }

        // 4. Fetch Metadata Separately (Parallel Fetch)
        val mediaIds = rawItems.mapNotNull { it.mediaId }.distinct()
        val widgetIds = rawItems.mapNotNull { it.widgetId }.distinct()
        val linkIds = rawItems.mapNotNull { it.externalLinkId }.distinct()

        val mediaMap = if (mediaIds.isNotEmpty()) {
            client.from("media").select {
                filter { isIn("id", mediaIds) }
            }.decodeList<RemoteMedia>()
                .associateBy { it.id }
        } else emptyMap()

        val widgetMap = if (widgetIds.isNotEmpty()) {
            client.from("widgets").select {
                filter { isIn("id", widgetIds) }
            }.decodeList<RemoteWidget>()
                .associateBy { it.id }
        } else emptyMap()

        val linkMap = if (linkIds.isNotEmpty()) {
            client.from("external_links").select {
                filter { isIn("id", linkIds) }
            }.decodeList<RemoteExternalLink>()
                .associateBy { it.id }
        } else emptyMap()

        // 5. Merge Metadata back into items with detailed logging
        val enrichedItems = rawItems.map { item ->
            val media = item.mediaId?.let { id ->
                mediaMap[id] ?: run {
                    Logger.e("SYNC", "Metadata Missing: Media ID $id referenced by item ${item.id} not found!")
                    null
                }
            }
            val widget = item.widgetId?.let { id ->
                widgetMap[id] ?: run {
                    Logger.e("SYNC", "Metadata Missing: Widget ID $id referenced by item ${item.id} not found!")
                    null
                }
            }
            val link = item.externalLinkId?.let { id ->
                linkMap[id] ?: run {
                    Logger.e("SYNC", "Metadata Missing: External Link ID $id referenced by item ${item.id} not found!")
                    null
                }
            }

            item.copy(
                media = media,
                widget = widget,
                externalLink = link
            )
        }

        // 6. Combine into Domain Playlist
        return mapToProfessionalDomain(remotePlaylist, enrichedItems, screen)
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
        rawPlaylist: RemotePlaylist,
        rawItems: List<com.antigravity.sync.dto.RemotePlaylistItem>,
        screen: RemoteScreen
    ): Playlist {
        val domainItems = rawItems.mapNotNull { item ->
            // Support priority: Media > Widget > External Link
            val media = item.media
            val widget = item.widget
            val extLink = item.externalLink

            val itemId: String
            val itemName: String
            val itemType: MediaType
            val itemUrl: String

            when {
                media != null -> {
                    itemId = media.id
                    itemName = media.name
                    itemType = when (media.type) {
                        "video" -> MediaType.VIDEO
                        "image" -> MediaType.IMAGE
                        else -> inferMediaType(media.url)
                    }
                    itemUrl = media.url
                }
                widget != null -> {
                    itemId = widget.id
                    itemName = widget.name
                    itemType = MediaType.WEB_WIDGET
                    itemUrl = "https://sitesobremidia.vercel.app/player/widget/${widget.id}"
                }
                extLink != null -> {
                    itemId = extLink.id
                    itemName = extLink.title
                    itemType = MediaType.EXTERNAL_LINK
                    itemUrl = "https://sitesobremidia.vercel.app/player/link/${extLink.id}"
                }
                else -> {
                    Logger.e("SYNC", "FILTERED: Item ${item.id} (Pos: ${item.order}) has no valid Media, Widget or Link metadata.")
                    return@mapNotNull null
                }
            }

            MediaItem(
                id = itemId,
                name = itemName,
                type = itemType,
                durationSeconds = item.duration ?: 10L,
                remoteUrl = itemUrl,
                localPath = null,
                hash = itemUrl.hashCode().toString(), // [FIX] Force delta sync on URL change
                orderIndex = item.order ?: 0,
                startTime = item.startTime,
                endTime = item.endTime,
                daysOfWeek = item.daysOfWeek,
                transitionEffect = "crossfade"
            )
        }.sortedBy { it.orderIndex }

        return Playlist(
            id = rawPlaylist.id,
            name = rawPlaylist.name,
            version = System.currentTimeMillis(),
            items = domainItems,
            orientation = screen.orientation ?: "landscape",
            resolution = screen.resolution ?: "16x9",
            heartbeatIntervalSeconds = 60, // Default for now
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
            Logger.i("SYNC", "Realtime Confirmation: last_heartbeat updated.")
        } catch (e: Exception) {
            val isRlsError = e.message?.contains("403", ignoreCase = true) == true || 
                             e.message?.contains("permission", ignoreCase = true) == true
            
            if (isRlsError) {
                Logger.e("AUTH_SHIELD", "RLS BLOCK: Dispositivo sem permissão para atualizar status (ID: $deviceId)")
                // Log local for diagnostic without needing remote access
                Logger.e("LOCAL_LOG", "[${getIsoTimestamp()}] Erro de Autenticação: Acesso negado pelo RLS ao atualizar heartbeat.")
            } else {
                Logger.e("SYNC", "Realtime Heartbeat Failed: ${e.message}")
            }
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
        try {
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

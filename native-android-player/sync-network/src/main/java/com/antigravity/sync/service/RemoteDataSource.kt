@file:OptIn(kotlinx.serialization.InternalSerializationApi::class)
package com.antigravity.sync.service

import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.domain.model.Playlist
import com.antigravity.core.util.Logger
import com.antigravity.sync.dto.*
import io.github.jan.supabase.postgrest.*
import io.github.jan.supabase.postgrest.query.*
import io.github.jan.supabase.postgrest.query.filter.FilterOperation
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.*
import io.github.jan.supabase.storage.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.serialization.json.put
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
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

    // [IDEMPOTENCY] Cache de IDs de comandos já processados para evitar re-execução em reconnects
    private val processedCommandIds = java.util.Collections.synchronizedSet(mutableSetOf<String>())

    // [HIGH-END] Realtime Handshake: PostgreSQL CDC via Websockets (Yeloo Style)
    suspend fun subscribeToRealtimeSync(screenToken: String, playlistId: String?, scope: CoroutineScope) {
        val channel = client.realtime.channel("yeloo_sync_channel")
        
        // 1. Screens Subscription: O canal oficial do Dashboard (is_active, audio_enabled, orientation, playlist_id)
        val screenUuid = SessionManager.currentUUID ?: tokenStorage?.getUUID()
        if (screenUuid != null) {
            val screenFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "screens"
                filter(FilterOperation("id", FilterOperator.EQ, screenUuid))
            }
            
            screenFlow.onEach { action ->
                Logger.i("REALTIME", "Screen Update Detected via CDC! Action: ${action.javaClass.simpleName}")
                if (action is PostgresAction.Update) {
                    try {
                        // A. Checa Tela Ativa (is_active)
                        val isActiveStr = action.record["is_active"]?.toString()?.replace("\"", "")
                        val isActive = isActiveStr?.toBooleanStrictOrNull()
                        if (isActive != null && isActive != SessionManager.isScreenActive) {
                            Logger.w("REALTIME", ">>> Screen active changed via Realtime: $isActive")
                            SessionManager.triggerScreenActive(isActive)
                        }

                        // B. Checa Rotação (orientation) e Playlist na tabela screens
                        val remoteOrientation = action.record["orientation"]?.toString()?.replace("\"", "")
                        val remotePlaylistId = action.record["playlist_id"]?.toString()?.replace("\"", "")
                        if (!remotePlaylistId.isNullOrBlank() || (!remoteOrientation.isNullOrBlank() && remoteOrientation != SessionManager.currentOrientation)) {
                            Logger.i("REALTIME", ">>> Screen configuration or orientation changed via Realtime ($remoteOrientation). Triggering sync nudge...")
                            SessionManager.triggerSyncNudge()
                        }
                    } catch (e: Exception) {
                        Logger.e("REALTIME", "Erro ao processar alteração em screens: ${e.message}")
                    }
                }
            }.launchIn(scope)
        }

        // 2. Devices Subscription (Fallback / Compatibilidade)
        val deviceFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "devices"
            filter(FilterOperation("screen_token", FilterOperator.EQ, screenToken))
        }
        
        deviceFlow.onEach { action ->
            Logger.i("REALTIME", "Device Update Detected via CDC! Action: ${action.javaClass.simpleName}")
            SessionManager.triggerSyncNudge()
        }.launchIn(scope)

        // 3. Playlists Subscription: Monitor the actual playlist content
        if (playlistId != null) {
            val playlistFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "playlists"
                filter(FilterOperation("id", FilterOperator.EQ, playlistId))
            }
            
            playlistFlow.onEach { _ ->
                Logger.i("REALTIME", "Playlist Header Update Detected! Triggering download...")
                SessionManager.triggerSyncNudge()
            }.launchIn(scope)

            // 4. Playlist Items Subscription: Critical for Media Add/Remove/Sort
            val playlistItemsFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "playlist_items"
                filter(FilterOperation("playlist_id", FilterOperator.EQ, playlistId))
            }

            playlistItemsFlow.onEach { _ ->
                Logger.i("REALTIME", "Playlist Items Updated! Triggering download...")
                SessionManager.triggerSyncNudge()
            }.launchIn(scope)
        }

        channel.subscribe()
        Logger.i("REALTIME", "Subscribed to Websockets for Screen Token: $screenToken (UUID: $screenUuid)")
    }

    // [INDUSTRIAL] Realtime Command Listener: The "Soberana" Remote control (com Idempotência)
    suspend fun subscribeToRemoteCommands(screenUuid: String, scope: CoroutineScope) {
        Logger.w("SYNC_SNIFFER", ">>> ATTEMPTING COMMAND SUBSCRIPTION FOR UUID: $screenUuid")
        val channel = client.realtime.channel("remote_commands_channel")
        
        val commandFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "remote_commands"
            filter(FilterOperation("screen_id", FilterOperator.EQ, screenUuid))
        }
        
        commandFlow.onEach { action ->
            val record = when (action) {
                is PostgresAction.Insert -> action.record
                is PostgresAction.Update -> action.record
                else -> null
            } ?: return@onEach

            val status = record["status"]?.toString()?.replace("\"", "")
            val command = record["command"]?.toString()?.replace("\"", "")
            val commandId = record["id"]?.toString()?.replace("\"", "")
            
            // Verifica se o comando possui um dispositivo de destino específico (ex: unpair direcionado ao aparelho antigo)
            val payloadElement = record["payload"]
            val targetDeviceId = when (payloadElement) {
                is kotlinx.serialization.json.JsonObject -> payloadElement["target_device_id"]?.jsonPrimitive?.contentOrNull
                is Map<*, *> -> (payloadElement["target_device_id"] ?: payloadElement["targetDeviceId"])?.toString()?.replace("\"", "")
                else -> null
            }

            if (targetDeviceId != null && SessionManager.boundDeviceId != null && targetDeviceId != SessionManager.boundDeviceId) {
                Logger.w("UNPAIR", "[UNPAIR] Comando $command (ID: $commandId) direcionado ao aparelho $targetDeviceId, ignorado por este dispositivo (${SessionManager.boundDeviceId})")
                return@onEach
            }
            
            // Processa apenas comandos pendentes e com identificadores válidos
            if (command != null && commandId != null && (status == null || status == "pending")) {
                if (processedCommandIds.contains(commandId)) {
                    Logger.w("SYNC_SNIFFER", "Ignorando comando duplicado (já processado): $commandId ($command)")
                    return@onEach
                }
                processedCommandIds.add(commandId)
                // Limpa histórico para evitar leak de memória (mantém os últimos 200)
                if (processedCommandIds.size > 200) {
                    val iterator = processedCommandIds.iterator()
                    repeat(50) { if (iterator.hasNext()) { iterator.next(); iterator.remove() } }
                }
                
                Logger.w("SYNC_SNIFFER", "!!! COMMAND PACKET RECEIVED: $command (ID: $commandId)")
                SessionManager.triggerRemoteCommand(command, commandId)
            } else if (command == null || commandId == null) {
                Logger.e("SYNC_SNIFFER", "### MALFORMED COMMAND PACKET: cmd=$command, id=$commandId")
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

    // [INDUSTRIAL] Command Acknowledgement (Normalizado e Seguro com Payload)
    suspend fun acknowledgeCommand(
        commandId: String, 
        status: String, 
        errorMessage: String? = null,
        extraPayload: Map<String, Any>? = null
    ) {
        try {
            val payloadMap = mutableMapOf<String, Any>()
            if (!errorMessage.isNullOrBlank()) {
                payloadMap["error_message"] = errorMessage
                payloadMap["status_note"] = errorMessage
            }
            extraPayload?.let { payloadMap.putAll(it) }

            val updateData = mutableMapOf<String, Any>(
                "status" to status,
                "executed_at" to getIsoTimestamp()
            )
            if (payloadMap.isNotEmpty()) {
                updateData["payload"] = payloadMap
            }

            client.from("remote_commands").update(updateData) {
                filter { eq("id", commandId) }
            }
            Logger.i("COMMANDS", "Command $commandId acknowledged with status '$status'")
        } catch (e: Exception) {
            Logger.e("COMMANDS", "Failed to acknowledge command $commandId: ${e.message}")
        }
    }

    // Fetch authorized screens for the logged-in user
    suspend fun getAuthorizedScreens(): List<com.antigravity.sync.dto.AuthorizedScreenDto> {
        Logger.i("SYNC", "SCREEN DISCOVERY START: Fetching authorized screens for session...")
        val response = try {
            client.postgrest.rpc(
                "get_authorized_screens_for_player"
            ).decodeAs<com.antigravity.sync.dto.AuthorizedScreensResponse>()
        } catch (e: Exception) {
            Logger.e("SYNC", "SCREEN DISCOVERY ERROR: Failed to fetch authorized screens via RPC: ${e.message}")
            throw e
        }

        if (response.status == "SUCCESS") {
            Logger.i("SYNC", "SCREEN DISCOVERY SUCCESS: Found ${response.data.size} authorized screen(s).")
            return response.data
        } else {
            Logger.e("SYNC", "SCREEN DISCOVERY DENIED: Status=${response.status}, Message=${response.message}")
            throw Exception(response.message ?: response.status)
        }
    }

    // Unpair a screen
    suspend fun unpairScreen(screenId: String, deviceId: String) {
        val response = try {
            client.postgrest.rpc(
                "player_unpair_screen",
                mapOf("p_screen_id" to screenId, "p_device_id" to deviceId)
            ).decodeAs<com.antigravity.sync.dto.RpcStatusResponse>()
        } catch (e: Exception) {
            Logger.e("SYNC", "Failed to unpair screen via RPC: ${e.message}")
            throw e
        }

        if (response.status != "SUCCESS") {
            Logger.w("SYNC", "Unpair failed or wasn't bound: ${response.status}")
        }
    }

    // Fetch the playlist assigned to this screen (Yeloo Style)
    suspend fun getPlaylistForScreen(identifier: String, deviceId: String): Pair<com.antigravity.sync.dto.DeviceRemoteDTO, Playlist>? {
        val normalizedId = identifier.trim()
        Logger.i("SYNC", "Starting Full Sync for Device: $normalizedId with Binding ID: $deviceId")
        
        val response = try {
            client.postgrest.rpc(
                "get_player_playlist_for_screen",
                mapOf("p_identifier" to normalizedId, "p_device_id" to deviceId)
            ).decodeAs<com.antigravity.sync.dto.RpcResponseDTO>()
        } catch (e: Exception) {
            Logger.e("SYNC", "Failed to fetch device data via RPC: ${e.message}")
            throw e
        }

        when (response.status) {
            "SCREEN_NOT_FOUND" -> throw Exception("SCREEN_NOT_FOUND")
            "SCREEN_SUSPENDED" -> throw Exception("SCREEN_SUSPENDED")
            "SCREEN_ACCESS_DENIED" -> throw Exception("SCREEN_ACCESS_DENIED")
            "DEVICE_ACCESS_DENIED" -> throw Exception("DEVICE_ACCESS_DENIED")
            "DEVICE_ALREADY_BOUND" -> throw Exception("DEVICE_ALREADY_BOUND")
            "PLAYLIST_ACCESS_DENIED" -> throw Exception("PLAYLIST_ACCESS_DENIED")
            "NO_PLAYLIST_ASSIGNED" -> throw Exception("NO_PLAYLIST_ASSIGNED")
            "PLAYLIST_NOT_FOUND" -> throw Exception("PLAYLIST_NOT_FOUND")
            "PLAYLIST_EMPTY" -> throw Exception("PLAYLIST_EMPTY")
            "SUCCESS" -> {
                val device = response.data ?: throw Exception("PAYLOAD_INVALID")
                val playlist = device.playlists ?: throw Exception("PAYLOAD_INVALID")
                
                // Dashboard Settings Extraction: Playlist Resolution is the Sovereign Canvas Contract
                val effectivePlaylistRes = playlist.playlistResolution ?: playlist.resolutionFallback
                
                // [VERDADE OPERACIONAL]: A orientação física da Activity (Android) é ditada exclusivamente pelo hardware/device.
                // A playlist_resolution NÃO DEVE governar a requestedOrientation.
                val orientation = device.orientation ?: "landscape"
                
                val resolution = effectivePlaylistRes ?: device.resolution ?: "16x9"
                
                tokenStorage?.saveUUID(device.id)

                return Pair(device, mapToProfessionalDomain(device, playlist, orientation, resolution))
            }
            else -> throw Exception("RPC_ERROR")
        }
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
            val externalLink = item.externalLink

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
                    itemHash = media.fileHash ?: media.id
                }
                widget != null -> {
                    itemId = widget.id
                    itemName = widget.name ?: "Widget ${widget.type}"
                    itemType = MediaType.WEB_WIDGET
                    val baseWidgetUrl = "native_widget://${widget.type.lowercase()}/${widget.id}"
                    val configJson = widget.configJson
                    itemUrl = if (!configJson.isNullOrBlank()) {
                        "$baseWidgetUrl?config=${java.net.URLEncoder.encode(configJson, "UTF-8")}"
                    } else {
                        baseWidgetUrl
                    }
                    itemHash = itemUrl.hashCode().toString()
                }
                externalLink != null -> {
                    itemId = externalLink.id
                    itemName = externalLink.title
                    itemType = MediaType.WEB_WIDGET
                    itemUrl = externalLink.url
                    itemHash = itemUrl.hashCode().toString()
                }
                // Users new list focuses on medias/widgets/links
                else -> {
                    Logger.e("SYNC", "FILTERED: Item ${item.id} (Pos: ${item.position}) has no valid Media, Widget, or ExternalLink metadata.")
                    return@mapNotNull null
                }
            }

            MediaItem(
                id = itemId,
                name = itemName,
                type = itemType,
                durationSeconds = item.duration.toLong(), // duration in DB is already in seconds
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
            cacheNextMedia = true,
            audioEnabled = playlist.audioEnabled
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
    // [P0 FIX] Schema real: device_id (uuid, FK devices.id), log_type,
    // message, occurrence_time. O payload antigo usava colunas inexistentes
    // (error_type/stack_trace/hardware_info) e o INSERT falhava sempre.
    // device_id DEVE ser o UUID do device vinculado (devices.id), resolvido
    // pelo fn_device_bind — a RLS exige devices do próprio tenant.
    suspend fun insertErrorLog(
        deviceId: String,
        type: String,
        message: String,
        stackTrace: String
    ) {
        // Fail-safe: sem device vinculado (devices.id), não há como registrar
        // um log válido (FK + RLS). O erro fica apenas no logcat local.
        val boundDeviceId = SessionManager.boundDeviceId
        if (boundDeviceId.isNullOrBlank() || deviceId.isBlank()) {
            com.antigravity.core.util.Logger.w("ERROR_SYNC", "Error log skipped (sem device vinculado): $type")
            return
        }
        try {
            val params = mapOf(
                "device_id" to boundDeviceId,
                "log_type" to type,
                "message" to (message + "\n" + stackTrace).take(4000),
                "occurrence_time" to getIsoTimestamp()
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
            client.from("device_health").upsert(payload, onConflict = "device_id")
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
        val updateParams = buildMap {
            put("status", status)
            put("version", version)
            put("last_ping_at", getIsoTimestamp())
            ramUsage?.let { if (it.isNotBlank() && it != "N/A") put("ram_usage", it) }
            freeSpace?.let { if (it.isNotBlank() && it != "N/A") put("free_space", it) }
            cpuTemp?.let { if (it.isNotBlank() && it != "N/A") put("cpu_temp", it) }
            uptime?.let { if (it.isNotBlank() && it != "N/A") put("uptime", it) }
            ipAddress?.let { if (it.isNotBlank() && it != "N/A") put("ip_address", it) }
        }

        try {
            client.from("screens").update(updateParams) {
                filter {
                    eq("id", id)
                }
            }
            com.antigravity.core.util.Logger.i("SYNC", "Heartbeat (Direct Table Update) confirmed for ID: $id")
        } catch (e: Exception) {
            val errorBody = (e as? io.github.jan.supabase.exceptions.RestException)?.description ?: e.message
            
            if (errorBody?.contains("JWT expired", ignoreCase = true) == true || errorBody?.contains("401", ignoreCase = true) == true) {
                appContext?.let { ctx ->
                    try {
                        com.antigravity.sync.repository.AuthRepository().forceRefreshSession(ctx)
                        client.from("screens").update(updateParams) {
                            filter {
                                eq("id", id)
                            }
                        }
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
    // [P1 FIX] A RPC process_display_analytics_batch NÃO existe no banco
    // (nem a tabela display_stats). O painel lê playback_logs — o cofre é
    // roteado para insertPlayLogs (mesmo canal offline-first do buffer Room).
    suspend fun uploadAnalyticsBatch(logs: List<Map<String, Any>>): Boolean {
        if (logs.isEmpty()) return true

        val dtos = logs.mapNotNull { log ->
            val screenId = log["screen_id"]?.toString()
                ?.takeIf { it.isNotBlank() && it != "null" } ?: return@mapNotNull null
            val mediaId = log["media_id"]?.toString()
                ?.takeIf { it.isNotBlank() && it != "null" } ?: return@mapNotNull null
            val duration = (log["duration_seconds"] as? Number)?.toInt() ?: 0
            val startedAt = log["played_at"]?.toString() ?: getIsoTimestamp()
            PlayLogDto(
                screenId = screenId,
                mediaId = mediaId,
                duration = duration,
                startedAt = startedAt,
                status = "COMPLETED"
            )
        }
        if (dtos.isEmpty()) {
            com.antigravity.core.util.Logger.w("SYNC_ANALYTICS", "Batch filtrado a zero logs válidos. Purged.")
            return true
        }

        return try {
            com.antigravity.core.util.Logger.w("SYNC_ANALYTICS", ">>> INICIANDO DESCARGA BATCH: ${dtos.size} EXIBIÇÕES -> playback_logs")
            insertPlayLogs(dtos)
            com.antigravity.core.util.Logger.i("SYNC_ANALYTICS", ">>> BATCH [OK]. O painel estatístico foi atualizado (playback_logs).")
            true
        } catch (e: Exception) {
            val errorBody = (e as? io.github.jan.supabase.exceptions.RestException)?.description ?: e.message

            // Automatic Retry on JWT Expired specifically for Analytics Batch
            if (errorBody?.contains("JWT expired", ignoreCase = true) == true || errorBody?.contains("401", ignoreCase = true) == true) {
                appContext?.let { ctx ->
                    try {
                        com.antigravity.core.util.Logger.w("SYNC_ANALYTICS", "JWT Expirado durante Batch. Refazendo Sessão...")
                        com.antigravity.sync.repository.AuthRepository().forceRefreshSession(ctx)
                        insertPlayLogs(dtos)
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

    // [DEVICE IDENTITY - FIX] Sucesso detectado por PARSE JSON, nao por substring.
    // O corpo pode conter espacos ("ok": true) e a substring "\"ok\":true"
    // nunca casava: boundDeviceId ficava null (firstBind eterno) e o attest
    // nunca era executado pelo app.
    private fun parseRpcOkResult(body: String?): Pair<Boolean, kotlinx.serialization.json.JsonObject?> {
        if (body.isNullOrBlank()) return false to null
        return try {
            val obj = kotlinx.serialization.json.Json.parseToJsonElement(body)
                as? kotlinx.serialization.json.JsonObject
            val okVal = obj?.get("ok")
            val ok = when (okVal) {
                is kotlinx.serialization.json.JsonPrimitive -> okVal.booleanOrNull ?: (okVal.contentOrNull == "true")
                else -> false
            }
            ok to obj
        } catch (e: Exception) {
            Logger.w("DEVICE_ID", "RPC result parse failed: ${e.message}")
            false to null
        }
    }

    // [DEVICE IDENTITY] Bind/activate hardware identity to screen (tenant-safe RPC)
    suspend fun bindDevice(identityHash: String, screenUuid: String): Boolean {
        if (identityHash.isBlank() || screenUuid.isBlank()) return false
        return try {
            val result = client.postgrest.rpc(
                "fn_device_bind",
                buildJsonObject {
                    put("p_identity_hash", identityHash)
                    put("p_screen_id", screenUuid)
                }
            )
            val body = result.data.toString()
            val (ok, obj) = parseRpcOkResult(body)
            if (ok) {
                // [P0 FIX] boundDeviceId DEVE ser o UUID real (devices.id),
                // não o JSON inteiro da resposta. device_logs.device_id é FK
                // -> devices(id) e a RLS exige o device do próprio tenant.
                val deviceId = obj?.get("device_id")?.jsonPrimitive?.contentOrNull
                SessionManager.boundDeviceId = deviceId ?: body
                SessionManager.isDeviceRevoked = false
                Logger.i("DEVICE_ID", "Device bound successfully to screen $screenUuid (device_id=$deviceId)")
            } else {
                val err = body
                Logger.e("DEVICE_ID", "Device bind rejected: $err")
                if (err.contains("revoked", ignoreCase = true)) {
                    SessionManager.isDeviceRevoked = true
                }
            }
            ok
        } catch (e: Exception) {
            Logger.w("DEVICE_ID", "Device bind failed: ${e.message}")
            false
        }
    }

    // [DEVICE IDENTITY] Attest periodic identity; revoked device -> blocked
    suspend fun attestDevice(identityHash: String, screenUuid: String): Boolean {
        if (identityHash.isBlank() || screenUuid.isBlank()) return false
        return try {
            val result = client.postgrest.rpc(
                "fn_device_attest",
                buildJsonObject {
                    put("p_identity_hash", identityHash)
                    put("p_screen_id", screenUuid)
                }
            )
            val body = result.data?.toString().orEmpty()
            val (ok, _) = parseRpcOkResult(body)
            if (!ok) {
                Logger.e("DEVICE_ID", "Device attestation rejected: $body")
                if (body.contains("revoked", ignoreCase = true)) {
                    SessionManager.isDeviceRevoked = true
                }
            } else {
                SessionManager.isDeviceRevoked = false
            }
            ok
        } catch (e: Exception) {
            Logger.w("DEVICE_ID", "Device attest failed: ${e.message}")
            false
        }
    }

    // [TELEMETRY] Caminho OFICIAL de telemetria: player_heartbeats via RPC
    // SECURITY DEFINER (fn_player_report_telemetry). Tenant/player são
    // resolvidos server-side pela screen — o player nunca escreve em
    // tabelas de outros tenants. Substitui o antigo sendHeartbeat duplicado.
    suspend fun reportPlayerTelemetry(
        screenId: String,
        cpuUsage: Float?,
        memoryUsage: Float?,
        tempCelsius: Float?,
        storageFreeMb: Long?,
        appVersion: String?,
        ipAddress: String?
    ): Boolean {
        if (screenId.isBlank() || screenId == "N/A") return false
        return try {
            val json = buildJsonObject {
                put("p_screen_id", screenId)
                if (cpuUsage != null) put("p_cpu_usage", cpuUsage)
                if (memoryUsage != null) put("p_memory_usage", memoryUsage)
                if (tempCelsius != null) put("p_temp_celsius", tempCelsius)
                if (storageFreeMb != null) put("p_storage_free_mb", storageFreeMb)
                if (appVersion != null) put("p_versao_app", appVersion)
                if (ipAddress != null) put("p_ip_address", ipAddress)
            }
            val result = client.postgrest.rpc("fn_player_report_telemetry", json)
            result.data?.toString()?.contains("\"ok\":true") == true
        } catch (e: Exception) {
            Logger.w("TELEMETRY", "Telemetry report failed: ${e.message}")
            false
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

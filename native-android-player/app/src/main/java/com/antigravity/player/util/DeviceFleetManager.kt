@file:Suppress("UNUSED_PARAMETER")
package com.antigravity.player.util

import android.content.Context
import android.os.SystemClock
import com.antigravity.core.util.Logger
import com.antigravity.sync.service.RemoteDataSource
import com.antigravity.sync.service.SessionManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import io.github.jan.supabase.postgrest.rpc
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * DeviceFleetManager - Orquestra Device Fleet no Android Player
 * 
 * Responsabilidades:
 * 1. Registro estendido do dispositivo (fn_device_register_extended)
 * 2. Heartbeat v2 com health evaluation (fn_device_heartbeat_v2)
 * 3. Telemetry batch para offline-first (fn_device_telemetry_batch)
 * 4. Integração com SessionManager e RemoteDataSource existentes
 * 
 * REGRA: Falha em QUALQUER operação de fleet NÃO derruba o Player
 */
class DeviceFleetManager(
    private val context: Context,
    private val remoteDataSource: RemoteDataSource
) {

    companion object {
        private const val HEARTBEAT_INTERVAL_MS = 60_000L // 60 segundos
        private const val TELEMETRY_BATCH_INTERVAL_MS = 5 * 60_000L // 5 minutos
        private const val MAX_BATCH_SIZE = 50
        private const val REGISTRATION_RETRY_DELAY_MS = 10_000L
        private const val MAX_REGISTRATION_RETRIES = 3
    }

    // Estado reativo
    private val _fleetState = MutableStateFlow<FleetState>(FleetState.UNREGISTERED)
    val fleetState: kotlinx.coroutines.flow.StateFlow<FleetState> = _fleetState.asStateFlow()

    private val telemetryQueue = ConcurrentLinkedQueue<TelemetryCollector.TelemetryData>()
    private var registrationRetries = 0
    private var heartbeatJob: Job? = null
    private var batchJob: Job? = null
    private var isInitialized = false

    enum class FleetState {
        UNREGISTERED,
        REGISTERING,
        REGISTERED,
        HEARTBEAT_ACTIVE,
        ERROR
    }

    private val deviceInfoCollector = DeviceInfoCollector(context)
    private val telemetryCollector = TelemetryCollector(context)
    private val healthEvaluator = HealthEvaluator

    /**
     * Inicializa o Device Fleet - deve ser chamado após login/pairing bem-sucedido
     */
    fun initialize(screenId: String) {
        if (isInitialized) return
        isInitialized = true

        Logger.i("DEVICE_FLEET", "Inicializando Device Fleet para screen: $screenId")

        // Registra dispositivo com informações estendidas
        registerDevice(screenId)

        // Inicia heartbeat v2 loop
        startHeartbeatLoop(screenId)

        // Inicia telemetry batch loop
        startTelemetryBatchLoop(screenId)
    }

    /**
     * Registra o dispositivo com informações estendidas
     */
    private fun registerDevice(screenId: String) {
        _fleetState.value = FleetState.REGISTERING

        CoroutineScope(Dispatchers.IO).launch {
            var retries = 0
            while (retries < MAX_REGISTRATION_RETRIES) {
                try {
                    val deviceInfo = deviceInfoCollector.collect()
                    val identityHash = SessionManager.deviceIdentityHash
                    
                    if (identityHash.isNullOrBlank()) {
                        Logger.w("DEVICE_FLEET", "Identity hash não disponível, aguardando...")
                        delay(REGISTRATION_RETRY_DELAY_MS)
                        retries++
                        continue
                    }

                    val result = remoteDataSource.registerDeviceExtended(
                        identityHash = identityHash,
                        screenId = screenId,
                        deviceInfo = deviceInfo
                    )

                    if (result) {
                        _fleetState.value = FleetState.REGISTERED
                        Logger.i("DEVICE_FLEET", "Dispositivo registrado com sucesso (tipo: ${deviceInfo.deviceType})")
                        return@launch
                    } else {
                        Logger.w("DEVICE_FLEET", "Falha no registro estendido, retry $retries")
                    }
                } catch (e: Exception) {
                    Logger.w("DEVICE_FLEET", "Erro no registro: ${e.message}")
                }

                retries++
                if (retries < MAX_REGISTRATION_RETRIES) {
                    delay(REGISTRATION_RETRY_DELAY_MS)
                }
            }

            _fleetState.value = FleetState.ERROR
            Logger.e("DEVICE_FLEET", "Falha no registro após $MAX_REGISTRATION_RETRIES tentativas")
        }
    }

    /**
     * Heartbeat v2 loop - envia saúde completa a cada 60s
     */
    private fun startHeartbeatLoop(screenId: String) {
        heartbeatJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                try {
                    sendHeartbeatV2(screenId)
                } catch (e: Exception) {
                    Logger.w("DEVICE_FLEET", "Erro no heartbeat v2: ${e.message}")
                }
                
                // Dorme exatamente o intervalo configurado
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    /**
     * Envia heartbeat v2 com health evaluation completa
     */
    private suspend fun sendHeartbeatV2(screenId: String) {
        val identityHash = SessionManager.deviceIdentityHash
        if (identityHash.isNullOrBlank()) return

        try {
            // Coleta telemetria
            val telemetry = telemetryCollector.collect()
            
            // Avalia saúde
            val health = healthEvaluator.evaluate(telemetry)
            
            // Envia heartbeat v2
            val identityHashFinal = identityHash
            val screenIdFinal = screenId
            val result = remoteDataSource.sendHeartbeatV2(
                identityHash = identityHashFinal,
                screenId = screenIdFinal,
                telemetry = telemetry,
                healthStatus = health.status
            )

            // Adiciona à fila de batch se health mudou ou sample aleatório
            if (!result || health.status != HealthEvaluator.HealthStatus.ONLINE || (Math.random() < 0.1)) {
                telemetryQueue.add(telemetry)
            }

            // Log periódico
            if (System.currentTimeMillis() % 300_000 < HEARTBEAT_INTERVAL_MS) { // ~cada 5 min
                Logger.d("DEVICE_FLEET", "Heartbeat v2: ${health.status.name}, issues=${health.issues.size}")
            }

            _fleetState.value = FleetState.HEARTBEAT_ACTIVE

        } catch (e: Exception) {
            Logger.w("DEVICE_FLEET", "Heartbeat v2 falhou: ${e.message}")
        }
    }

    /**
     * Telemetry batch loop - envia lote a cada 5 min
     */
    private fun startTelemetryBatchLoop(screenId: String) {
        batchJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                delay(TELEMETRY_BATCH_INTERVAL_MS)
                
                if (telemetryQueue.isNotEmpty()) {
                    sendTelemetryBatch(screenId)
                }
            }
        }
    }

    /**
     * Envia batch de telemetria (offline-first)
     */
    private suspend fun sendTelemetryBatch(screenId: String) {
        val identityHash = SessionManager.deviceIdentityHash
        if (identityHash.isNullOrBlank()) return

        val batch = mutableListOf<TelemetryCollector.TelemetryData>()
        var count = 0
        
        // Drena até MAX_BATCH_SIZE
        while (count < MAX_BATCH_SIZE) {
            val item = telemetryQueue.poll()
            if (item == null) break
            batch.add(item)
            count++
        }

        if (batch.isEmpty()) return

        try {
            val json = buildTelemetryJson(batch)
            val result = remoteDataSource.sendTelemetryBatch(
                identityHash = identityHash,
                screenId = screenId,
                telemetryJson = json
            )

            if (!result) {
                // Re-enfileira se falhou
                batch.forEach { telemetryQueue.add(it) }
                Logger.w("DEVICE_FLEET", "Batch telemetry falhou, re-enfileirados ${batch.size} itens")
            } else {
                Logger.d("DEVICE_FLEET", "Batch telemetry enviado: ${batch.size} itens")
            }
        } catch (e: Exception) {
            Logger.w("DEVICE_FLEET", "Batch telemetry erro: ${e.message}")
            batch.forEach { telemetryQueue.add(it) }
        }
    }

    private fun buildTelemetryJson(batch: List<TelemetryCollector.TelemetryData>): String {
        val elements = batch.map { t ->
            buildJsonObject {
                t.cpuUsagePercent?.let { put("cpu_usage_percent", it) }
                t.cpuTemperatureCelsius?.let { put("cpu_temperature_celsius", it) }
                t.cpuFrequencyMhz?.let { put("cpu_frequency_mhz", it) }
                t.memoryUsagePercent?.let { put("memory_usage_percent", it) }
                t.memoryUsedMb?.let { put("memory_used_mb", it) }
                t.memoryFreeMb?.let { put("memory_free_mb", it) }
                t.memoryTotalMb?.let { put("memory_total_mb", it) }
                t.storageUsedMb?.let { put("storage_used_mb", it) }
                t.storageFreeMb?.let { put("storage_free_mb", it) }
                t.storageTotalMb?.let { put("storage_total_mb", it) }
                t.temperatureCelsius?.let { put("temperature_celsius", it) }
                t.temperatureSource?.let { put("temperature_source", it) }
                t.thermalStatus?.let { put("thermal_status", it) }
                t.batteryLevel?.let { put("battery_level", it) }
                t.batteryTemperatureCelsius?.let { put("battery_temperature_celsius", it) }
                t.batteryStatus?.let { put("battery_status", it) }
                t.batteryHealth?.let { put("battery_health", it) }
                t.networkType?.let { put("network_type", it) }
                t.wifiSignalDbm?.let { put("wifi_signal_dbm", it) }
                t.ipAddress?.let { put("ip_address", it) }
                t.connectionStatus?.let { put("connection_status", it) }
                t.uptimeSeconds?.let { put("uptime_seconds", it) }
                t.syncStatus?.let { put("sync_status", it) }
                t.playbackStatus?.let { put("playback_status", it) }
                t.currentPlaylistId?.let { put("current_playlist_id", it) }
                t.currentMediaId?.let { put("current_media_id", it) }
                t.lastPlaybackAt?.let { put("last_playback_at", it) }
                t.lastSyncAt?.let { put("last_sync_at", it) }
                t.playbackErrorCount?.let { put("playback_error_count", it) }
                t.lastPlaybackError?.let { put("last_playback_error", it) }
                t.mediaCount?.let { put("media_count", it) }
                t.pendingMediaCount?.let { put("pending_media_count", it) }
                put("telemetry_protocol_version", "1.0")
            }
        }
        val jsonArray = kotlinx.serialization.json.JsonArray(elements)
        return jsonArray.toString()
    }

    /**
     * Para todos os jobs
     */
    fun shutdown() {
        heartbeatJob?.cancel()
        batchJob?.cancel()
        _fleetState.value = FleetState.UNREGISTERED
        isInitialized = false
        Logger.i("DEVICE_FLEET", "Device Fleet Manager encerrado")
    }

    /**
     * Força envio de telemetria imediato (ex: erro crítico)
     */
    fun flushTelemetry(screenId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            sendTelemetryBatch(screenId)
        }
    }
}

/**
 * Extensão para RemoteDataSource com novos métodos Device Fleet
 */
private val OK_TRUE = Regex("\"ok\"\\s*:\\s*true")

/** O Postgres devolve {"ok": true} (com espaco); a substring "\"ok\":true" nunca casava. */
fun rpcResponseOk(body: String?): Boolean = body != null && OK_TRUE.containsMatchIn(body)

suspend fun com.antigravity.sync.service.RemoteDataSource.registerDeviceExtended(
            identityHash: String,
            screenId: String,
            deviceInfo: DeviceInfoCollector.DeviceInfo
        ): Boolean {
            return try {
                val json = buildJsonObject {
                    put("p_identity_hash", identityHash)
                    put("p_screen_id", screenId)
                    deviceInfo.manufacturer?.let { put("p_manufacturer", it) }
                    deviceInfo.brand?.let { put("p_brand", it) }
                    deviceInfo.model?.let { put("p_model", it) }
                    deviceInfo.serialNumber?.let { put("p_serial_number", it) }
                    deviceInfo.androidId?.let { put("p_android_id", it) }
                    put("p_os_version", deviceInfo.osVersion)
                    put("p_os_sdk", deviceInfo.osSdk)
                    deviceInfo.architecture?.let { put("p_architecture", it) }
                    deviceInfo.cpuModel?.let { put("p_cpu_model", it) }
                    deviceInfo.cpuCores?.let { put("p_cpu_cores", it) }
                    deviceInfo.ramTotalMb?.let { put("p_ram_total_mb", it) }
                    deviceInfo.storageTotalMb?.let { put("p_storage_total_mb", it) }
                    deviceInfo.gpu?.let { put("p_gpu", it) }
                    deviceInfo.screenWidth?.let { put("p_screen_width", it) }
                    deviceInfo.screenHeight?.let { put("p_screen_height", it) }
                    deviceInfo.screenDensity?.let { put("p_screen_density", it) }
                    deviceInfo.screenRefreshRate?.let { put("p_screen_refresh_rate", it) }
                    put("p_device_type", deviceInfo.deviceType.name)
                    put("p_player_version", deviceInfo.playerVersion)
                    put("p_telemetry_protocol_version", "1.0")
                }
                
                val result = postgrest.rpc("fn_device_register_extended", json)
                rpcResponseOk(result.data.toString())
            } catch (e: Exception) {
                Logger.w("DEVICE_FLEET", "registerDeviceExtended falhou: ${e.message}")
                false
            }
        }

        /**
         * Envia heartbeat v2 com health evaluation
         */
        suspend fun com.antigravity.sync.service.RemoteDataSource.sendHeartbeatV2(
            identityHash: String,
            screenId: String,
            telemetry: TelemetryCollector.TelemetryData,
            healthStatus: HealthEvaluator.HealthStatus
        ): Boolean {
            return try {
                val json = buildJsonObject {
                    put("p_identity_hash", identityHash)
                    put("p_screen_id", screenId)
                    telemetry.uptimeSeconds?.let { put("p_uptime_seconds", it) }
                    telemetry.cpuUsagePercent?.let { put("p_cpu_usage_percent", it) }
                    telemetry.cpuTemperatureCelsius?.let { put("p_cpu_temperature_celsius", it) }
                    telemetry.memoryUsagePercent?.let { put("p_memory_usage_percent", it) }
                    telemetry.memoryUsedMb?.let { put("p_memory_used_mb", it) }
                    telemetry.memoryFreeMb?.let { put("p_memory_free_mb", it) }
                    telemetry.memoryTotalMb?.let { put("p_memory_total_mb", it) }
                    telemetry.storageUsedMb?.let { put("p_storage_used_mb", it) }
                    telemetry.storageFreeMb?.let { put("p_storage_free_mb", it) }
                    telemetry.storageTotalMb?.let { put("p_storage_total_mb", it) }
                    telemetry.temperatureCelsius?.let { put("p_temperature_celsius", it) }
                    telemetry.temperatureSource?.let { put("p_temperature_source", it) }
                    telemetry.thermalStatus?.let { put("p_thermal_status", it) }
                    telemetry.batteryLevel?.let { put("p_battery_level", it) }
                    telemetry.batteryTemperatureCelsius?.let { put("p_battery_temperature", it) }
                    telemetry.batteryStatus?.let { put("p_battery_status", it) }
                    telemetry.batteryHealth?.let { put("p_battery_health", it) }
                    telemetry.networkType?.let { put("p_network_type", it) }
                    telemetry.wifiSignalDbm?.let { put("p_wifi_signal_dbm", it) }
                    telemetry.ipAddress?.let { put("p_ip_address", it) }
                    telemetry.connectionStatus?.let { put("p_connection_status", it) }
                    telemetry.syncStatus?.let { put("p_sync_status", it) }
                    telemetry.currentPlaylistId?.let { put("p_current_playlist_id", it) }
                    telemetry.currentMediaId?.let { put("p_current_media_id", it) }
                    telemetry.lastPlaybackAt?.let { put("p_last_playback_at", it) }
                    telemetry.lastSyncAt?.let { put("p_last_sync_at", it) }
                    telemetry.playbackErrorCount?.let { put("p_playback_error_count", it) }
                    telemetry.lastPlaybackError?.let { put("p_last_playback_error", it) }
                    telemetry.mediaCount?.let { put("p_media_count", it) }
                    telemetry.pendingMediaCount?.let { put("p_pending_media_count", it) }
                    put("p_telemetry_protocol_version", "1.0")
                }
                
                val result = postgrest.rpc("fn_device_heartbeat_v2", json)
                rpcResponseOk(result.data.toString())
            } catch (e: Exception) {
                Logger.w("DEVICE_FLEET", "sendHeartbeatV2 falhou: ${e.message}")
                false
            }
        }

        /**
         * Envia batch de telemetria (offline-first)
         */
        suspend fun com.antigravity.sync.service.RemoteDataSource.sendTelemetryBatch(
            identityHash: String,
            screenId: String,
            telemetryJson: String
        ): Boolean {
            return try {
                val json = buildJsonObject {
                    put("p_identity_hash", identityHash)
                    put("p_screen_id", screenId)
                    put("p_telemetry", kotlinx.serialization.json.Json.parseToJsonElement(telemetryJson))
                }
                
                val result = postgrest.rpc("fn_device_telemetry_batch", json)
                rpcResponseOk(result.data.toString())
            } catch (e: Exception) {
                Logger.w("DEVICE_FLEET", "sendTelemetryBatch falhou: ${e.message}")
                false
            }
    }
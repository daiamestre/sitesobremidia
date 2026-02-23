package com.antigravity.sync.service

import com.antigravity.core.util.Logger
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.broadcastFlow
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.serialization.Serializable
import kotlinx.serialization.InternalSerializationApi

@OptIn(InternalSerializationApi::class)
@Serializable
data class RemoteCommand(
    val command: String, // "reload", "reboot", "screenshot"
    val payload: String? = null
)

/**
 * Gerencia a conexão Realtime via Supabase Broadcast.
 * Responsável por receber comandos remotos (reload, reboot, screenshot).
 */
class RealtimeManager(
    private val scope: CoroutineScope,
    private val onCommand: (RemoteCommand) -> Unit,
    private val onConnected: () -> Unit = {}
) {
    private val client = SupabaseModule.client
    private var channel: RealtimeChannel? = null

    suspend fun connect(deviceId: String) {
        if (channel != null) return

        var attempt = 0
        while (true) {
            try {
                ensureDeviceRegistered(deviceId)

                val channelName = "screen_$deviceId"
                Logger.i("REALTIME", "Connecting to channel $channelName...")

                channel = client.channel(channelName)

                val broadcastFlow = channel?.broadcastFlow<RemoteCommand>(event = "command")

                broadcastFlow?.onEach { command ->
                    Logger.d("REALTIME", "Received command: $command")
                    onCommand(command)
                }?.launchIn(scope)

                channel?.subscribe()
                Logger.i("REALTIME", "Subscribed! Listening for commands.")
                onConnected()

                attempt = 0
                break

            } catch (e: Exception) {
                attempt++
                val backoffSeconds = try {
                    val exp = java.lang.Math.pow(2.0, (attempt - 1).toDouble()).toLong() * 5
                    if (exp > 30) 30L else exp
                } catch (_: Exception) { 30L }

                Logger.w("REALTIME", "Connection failed (${e.message}). Retrying in ${backoffSeconds}s...")
                kotlinx.coroutines.delay(backoffSeconds * 1000L)
            }
        }
    }

    private suspend fun ensureDeviceRegistered(deviceId: String) {
        try {
            val result = client.from("screens").select {
                filter { eq("id", deviceId) }
            }.decodeSingleOrNull<Map<String, Any>>()

            if (result == null) {
                Logger.i("REALTIME", "Device $deviceId not found. Auto-registering...")
                val model = android.os.Build.MODEL ?: "Generic Android"
                val payload = mapOf(
                    "id" to deviceId,
                    "custom_id" to deviceId,
                    "name" to "Novo Player ($model)",
                    "status" to "pending_approval",
                    "version" to "1.0.0",
                    "last_ping_at" to java.text.SimpleDateFormat(
                        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                        java.util.Locale.US
                    ).apply {
                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                    }.format(java.util.Date())
                )
                client.from("screens").insert(payload)
                Logger.i("REALTIME", "Device registration successful.")
            }
        } catch (e: Exception) {
            Logger.e("REALTIME", "Verify/Register failed: ${e.message}")
            throw e
        }
    }

    suspend fun disconnect() {
        channel?.unsubscribe()
        channel = null
    }
}

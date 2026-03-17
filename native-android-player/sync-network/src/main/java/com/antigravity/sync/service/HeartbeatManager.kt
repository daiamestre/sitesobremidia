package com.antigravity.sync.service

import android.content.Context
import android.os.StatFs
import com.antigravity.core.util.Logger
import io.github.jan.supabase.postgrest.from
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * [SCALE 10K] HeartbeatManager - Ultra-Lightweight Pulse System
 * 
 * Envia um "batimento cardiaco" de <1KB para a tabela device_health a cada ciclo.
 * Usa UPSERT (onConflict = device_id) para garantir que cada tela
 * tenha APENAS UMA linha, sobrescrita a cada pulso.
 * 
 * 10.000 telas = 10.000 linhas fixas (nunca cresce).
 */
@Serializable
data class HeartbeatPayload(
    @SerialName("device_id") val deviceId: String,
    @SerialName("app_version") val appVersion: String,
    @SerialName("storage_usage_percent") val storageUsage: Int,
    @SerialName("last_seen") val lastSeen: String,
    @SerialName("current_media_id") val currentMediaId: String? = null
)

class HeartbeatManager(
    private val context: Context,
    private val deviceId: String
) {
    private val client = SupabaseModule.client

    /**
     * Envia um pulso ultra-leve para a tabela device_health.
     * Falha silenciosa: se a rede oscilar, o player continua rodando.
     */
    suspend fun sendPulse(
        appVersion: String = getAppVersion(),
        currentMediaId: String? = null
    ) {
        if (deviceId.isBlank() || deviceId == "N/A" || deviceId == "UNKNOWN") return

        val payload = HeartbeatPayload(
            deviceId = deviceId,
            appVersion = appVersion,
            storageUsage = getStorageUsagePercent(),
            lastSeen = getIsoTimestamp(),
            currentMediaId = currentMediaId
        )

        try {
            client.from("device_health").upsert(payload) {
                onConflict = "device_id"
            }
            Logger.d("PULSE", "Heartbeat OK (${payload.storageUsage}% disk, media: ${payload.currentMediaId})")
        } catch (e: Exception) {
            // Falha silenciosa para nao travar o player se a rede oscilar
            Logger.w("PULSE", "Heartbeat failed: ${e.message}")
        }
    }

    /**
     * Calcula a porcentagem de uso do armazenamento interno.
     * Usado pelo Dashboard para alertar o usuario se o disco estiver enchendo.
     */
    fun getStorageUsagePercent(): Int {
        return try {
            val stat = StatFs(context.filesDir.path)
            val available = stat.availableBlocksLong
            val total = stat.blockCountLong
            (((total - available).toDouble() / total.toDouble()) * 100).toInt()
        } catch (e: Exception) {
            -1 // Indica erro na leitura
        }
    }

    private fun getAppVersion(): String {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }

    private fun getIsoTimestamp(): String {
        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return sdf.format(java.util.Date())
    }
}

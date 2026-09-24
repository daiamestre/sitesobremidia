@file:Suppress("UNUSED_PARAMETER", "DEPRECATION")
package com.antigravity.player.util

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Debug
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import com.antigravity.core.util.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.FileReader

/**
 * TelemetryCollector - Coleta métricas de saúde do dispositivo para Device Health
 * 
 * Métricas coletadas (todas opcionais - falha silenciosa = null):
 * - CPU: usage%, temperature, frequency
 * - Memória: usage%, used/free/total MB
 * - Armazenamento: used/free/total MB
 * - Temperatura: °C, source, thermal_status
 * - Bateria: level%, temperature, status, health
 * - Rede: type, Wi-Fi RSSI, IP, connection_status
 * - Uptime: seconds
 * - Player: sync_status, playback_status, current_playlist/media
 * 
 * REGRA CRÍTICA: Falha na telemetria NUNCA derruba o Player
 */
class TelemetryCollector(private val context: Context) {

    companion object {
        private const val THERMAL_NORMAL_THRESHOLD = 60f
        private const val THERMAL_ELEVATED_THRESHOLD = 75f
        private const val THERMAL_HIGH_THRESHOLD = 85f
    }

    data class TelemetryData(
        // CPU
        val cpuUsagePercent: Float?,
        val cpuTemperatureCelsius: Float?,
        val cpuFrequencyMhz: Int?,

        // Memória
        val memoryUsagePercent: Float?,
        val memoryUsedMb: Long?,
        val memoryFreeMb: Long?,
        val memoryTotalMb: Long?,

        // Armazenamento
        val storageUsedMb: Long?,
        val storageFreeMb: Long?,
        val storageTotalMb: Long?,

        // Temperatura
        val temperatureCelsius: Float?,
        val temperatureSource: String?,
        val thermalStatus: String?,

        // Bateria
        val batteryLevel: Int?,
        val batteryTemperatureCelsius: Float?,
        val batteryStatus: String?,
        val batteryHealth: String?,

        // Rede
        val networkType: String?,
        val wifiSignalDbm: Int?,
        val ipAddress: String?,
        val connectionStatus: String?,

        // Sistema
        val uptimeSeconds: Long?,

        // Player (preenchido externamente)
        val syncStatus: String? = null,
        val playbackStatus: String? = null,
        val currentPlaylistId: String? = null,
        val currentMediaId: String? = null,
        val lastPlaybackAt: String? = null,
        val lastSyncAt: String? = null,
        val playbackErrorCount: Int? = null,
        val lastPlaybackError: String? = null,
        val mediaCount: Int? = null,
        val pendingMediaCount: Int? = null
    )

    /**
     * Coleta todas as métricas de forma segura - NUNCA lança exceção
     */
    suspend fun collect(): TelemetryData = withContext(Dispatchers.IO) {
        try {
            val cpuUsage = getCpuUsagePercent()
            val cpuTemp = getCpuTemperatureCelsius()
            val cpuFreq = getCpuFrequencyMhz()

            val memUsage = getMemoryUsagePercent()
            val memUsed = getMemoryUsedMb()
            val memFree = getMemoryFreeMb()
            val memTotal = getMemoryTotalMb()

            val storageUsed = getStorageUsedMb()
            val storageFree = getStorageFreeMb()
            val storageTotal = getStorageTotalMb()

            val temp = getTemperatureCelsius()
            val tempSource = getTemperatureSource()
            val thermal = getThermalStatus(temp)

            val batteryLevel = getBatteryLevel()
            val batteryTemp = getBatteryTemperatureCelsius()
            val batteryStatus = getBatteryStatus()
            val batteryHealth = getBatteryHealth()

            val netType = getNetworkType()
            val wifiSignal = getWifiSignalDbm()
            val ip = getIpAddress()
            val connStatus = getConnectionStatus()

            val uptime = getUptimeSeconds()

            TelemetryData(
                cpuUsagePercent = cpuUsage,
                cpuTemperatureCelsius = cpuTemp,
                cpuFrequencyMhz = cpuFreq,
                memoryUsagePercent = memUsage,
                memoryUsedMb = memUsed,
                memoryFreeMb = memFree,
                memoryTotalMb = memTotal,
                storageUsedMb = storageUsed,
                storageFreeMb = storageFree,
                storageTotalMb = storageTotal,
                temperatureCelsius = temp,
                temperatureSource = tempSource,
                thermalStatus = thermal,
                batteryLevel = batteryLevel,
                batteryTemperatureCelsius = batteryTemp,
                batteryStatus = batteryStatus,
                batteryHealth = batteryHealth,
                networkType = netType,
                wifiSignalDbm = wifiSignal,
                ipAddress = ip,
                connectionStatus = connStatus,
                uptimeSeconds = uptime
            )
        } catch (e: Exception) {
            Logger.e("TELEMETRY", "Falha ao coletar telemetria: ${e.message}")
            TelemetryData(
                cpuUsagePercent = null, cpuTemperatureCelsius = null, cpuFrequencyMhz = null,
                memoryUsagePercent = null, memoryUsedMb = null, memoryFreeMb = null, memoryTotalMb = null,
                storageUsedMb = null, storageFreeMb = null, storageTotalMb = null,
                temperatureCelsius = null, temperatureSource = null, thermalStatus = null,
                batteryLevel = null, batteryTemperatureCelsius = null, batteryStatus = null, batteryHealth = null,
                networkType = null, wifiSignalDbm = null, ipAddress = null, connectionStatus = null,
                uptimeSeconds = null
            )
        }
    }

    // ================================================================
    // CPU
    // ================================================================

    private fun getCpuUsagePercent(): Float? { return try {
        // Lê /proc/stat para calcular uso de CPU
        val reader = BufferedReader(FileReader("/proc/stat"))
        val line = reader.readLine() ?: return null
        reader.close()
        
        val parts = line.split(" ").filter { it.isNotBlank() }
        if (parts.size < 8) return null
        
        // Precisa de duas leituras para calcular delta
        // Para simplificar, retorna null se não tiver baseline
        // Implementação completa precisaria armazenar leitura anterior
        null
    } catch (e: Exception) { null }
    }

    private fun getCpuTemperatureCelsius(): Float? { return try {
        // Tenta múltiplas fontes de temperatura
        // 1. Thermal zones
        val thermalFiles = java.io.File("/sys/class/thermal").listFiles()
        thermalFiles?.forEach { zone ->
            val typeFile = java.io.File(zone, "type")
            val tempFile = java.io.File(zone, "temp")
            if (typeFile.exists() && tempFile.exists()) {
                val type = FileReader(typeFile).readText().trim()
                if (type.contains("cpu", ignoreCase = true) || type.contains("soc", ignoreCase = true)) {
                    val temp = FileReader(tempFile).readText().trim().toLongOrNull()
                    temp?.let { return (it / 1000f).takeIf { it > 0f } }
                }
            }
        }
        // 2. Battery temperature como fallback
        getBatteryTemperatureCelsius()
    } catch (e: Exception) { null }
    }

    private fun getCpuFrequencyMhz(): Int? { return try {
        val files = java.io.File("/sys/devices/system/cpu").listFiles { file -> file.name.startsWith("cpu") }
        files?.firstOrNull()?.let { cpuDir ->
            val freqFile = java.io.File(cpuDir, "cpufreq/scaling_cur_freq")
            if (freqFile.exists()) {
                FileReader(freqFile).readText().trim().toLongOrNull()?.let { (it / 1000).toInt() }
            } else null
        }
    } catch (e: Exception) { null }
    }

    // ================================================================
    // MEMÓRIA
    // ================================================================

    private fun getMemoryUsagePercent(): Float? { return try {
        val memInfo = Debug.MemoryInfo()
        Debug.getMemoryInfo(memInfo)
        val totalPss = memInfo.totalPss * 1024 // KB to bytes
        val totalMem = getMemoryTotalBytes() ?: return null
        ((totalPss.toFloat() / totalMem.toFloat()) * 100).takeIf { it >= 0f && it <= 100f }
    } catch (e: Exception) { null }
    }

    private fun getMemoryUsedMb(): Long? { return try {
        val memInfo = Debug.MemoryInfo()
        Debug.getMemoryInfo(memInfo)
        (memInfo.totalPss.toLong() / 1024).takeIf { it > 0 }
    } catch (e: Exception) { null }
    }

    private fun getMemoryFreeMb(): Long? { return try {
        val used = getMemoryUsedMb() ?: return null
        val total = getMemoryTotalMb() ?: return null
        (total - used).takeIf { it >= 0 }
    } catch (e: Exception) { null }
    }

    private fun getMemoryTotalMb(): Long? { return try {
        getMemoryTotalBytes()?.let { (it / (1024 * 1024)).takeIf { it > 0 } }
    } catch (e: Exception) { null }
    }

    private fun getMemoryTotalBytes(): Long? { return try {
        BufferedReader(FileReader("/proc/meminfo")).use { reader ->
            reader.readLines()
                .firstOrNull { it.startsWith("MemTotal:") }
                ?.let { line ->
                    val kb = line.substringAfter("MemTotal:").trim().removeSuffix("kB").trim().toLong()
                    (kb * 1024).takeIf { it > 0 }
                }
        }
    } catch (e: Exception) { null }
    }

    // ================================================================
    // ARMAZENAMENTO
    // ================================================================

    private fun getStorageUsedMb(): Long? { return try {
        val stat = StatFs(Environment.getDataDirectory().absolutePath)
        val total = stat.blockCountLong * stat.blockSizeLong
        val available = stat.availableBlocksLong * stat.blockSizeLong
        ((total - available) / (1024 * 1024)).takeIf { it >= 0 }
    } catch (e: Exception) { null }
    }

    private fun getStorageFreeMb(): Long? { return try {
        val stat = StatFs(Environment.getDataDirectory().absolutePath)
        (stat.availableBlocksLong * stat.blockSizeLong / (1024 * 1024)).takeIf { it >= 0 }
    } catch (e: Exception) { null }
    }

    private fun getStorageTotalMb(): Long? { return try {
        val stat = StatFs(Environment.getDataDirectory().absolutePath)
        (stat.blockCountLong * stat.blockSizeLong / (1024 * 1024)).takeIf { it > 0 }
    } catch (e: Exception) { null }
    }

    // ================================================================
    // TEMPERATURA
    // ================================================================

    private fun getTemperatureCelsius(): Float? { return try {
        // 1. Thermal zones (CPU/SOC)
        val thermalFiles = java.io.File("/sys/class/thermal").listFiles()
        thermalFiles?.forEach { zone ->
            val typeFile = java.io.File(zone, "type")
            val tempFile = java.io.File(zone, "temp")
            if (typeFile.exists() && tempFile.exists()) {
                val type = FileReader(typeFile).readText().trim().lowercase()
                if (type.contains("cpu") || type.contains("soc") || type.contains("gpu") || type.contains("skin")) {
                    val temp = FileReader(tempFile).readText().trim().toLongOrNull()
                    temp?.let { return (it / 1000f).takeIf { it > 0f && it < 200f } }
                }
            }
        }
        // 2. Battery temperature (muitas vezes disponível em TV Box)
        getBatteryTemperatureCelsius()
    } catch (e: Exception) { null }
    }

    private fun getTemperatureSource(): String? { return try {
        val thermalFiles = java.io.File("/sys/class/thermal").listFiles()
        thermalFiles?.firstOrNull { zone ->
            val typeFile = java.io.File(zone, "type")
            val tempFile = java.io.File(zone, "temp")
            typeFile.exists() && tempFile.exists()
        }?.let { zone ->
            FileReader(java.io.File(zone, "type")).readText().trim()
        }
    } catch (e: Exception) { null }
    }

    private fun getThermalStatus(temp: Float?): String = temp?.let { t ->
        when {
            t < THERMAL_NORMAL_THRESHOLD -> "NORMAL"
            t < THERMAL_ELEVATED_THRESHOLD -> "ELEVATED"
            t < THERMAL_HIGH_THRESHOLD -> "HIGH"
            else -> "CRITICAL"
        }
    } ?: "N/A"

    // ================================================================
    // BATERIA
    // ================================================================

    private fun getBatteryLevel(): Int? { return try {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryIntent = context.registerReceiver(null, filter)
        batteryIntent?.let { intent ->
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            if (level >= 0 && scale > 0) {
                ((level.toFloat() / scale.toFloat()) * 100).toInt().takeIf { it in 0..100 }
            } else null
        }
    } catch (e: Exception) { null }
    }

    private fun getBatteryTemperatureCelsius(): Float? { return try {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryIntent = context.registerReceiver(null, filter)
        batteryIntent?.let { intent ->
            val temp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE)
            if (temp != Integer.MIN_VALUE) {
                (temp / 10f).takeIf { it > 0f && it < 200f }
            } else null
        }
    } catch (e: Exception) { null }
    }

    private fun getBatteryStatus(): String? { return try {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryIntent = context.registerReceiver(null, filter)
        batteryIntent?.let { intent ->
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            when (status) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "CHARGING"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "DISCHARGING"
                BatteryManager.BATTERY_STATUS_FULL -> "FULL"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "NOT_CHARGING"
                else -> "UNKNOWN"
            }
        }
    } catch (e: Exception) { null }
    }

    private fun getBatteryHealth(): String? { return try {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryIntent = context.registerReceiver(null, filter)
        batteryIntent?.let { intent ->
            val health = intent.getIntExtra(BatteryManager.EXTRA_HEALTH, -1)
            when (health) {
                BatteryManager.BATTERY_HEALTH_GOOD -> "GOOD"
                BatteryManager.BATTERY_HEALTH_OVERHEAT -> "OVERHEAT"
                BatteryManager.BATTERY_HEALTH_DEAD -> "DEAD"
                BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "OVER_VOLTAGE"
                BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "UNSPECIFIED_FAILURE"
                BatteryManager.BATTERY_HEALTH_COLD -> "COLD"
                else -> "UNKNOWN"
            }
        }
    } catch (e: Exception) { null }
    }

    // ================================================================
    // REDE
    // ================================================================

    private fun getNetworkType(): String? { return try {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val activeNetwork = cm.activeNetwork ?: return null
        val caps = cm.getNetworkCapabilities(activeNetwork) ?: return null

        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "MOBILE"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "VPN"
            else -> "UNKNOWN"
        }
    } catch (e: Exception) { null }
    }

    private fun getWifiSignalDbm(): Int? { return try {
        val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val connectionInfo = wifiManager.connectionInfo
        connectionInfo?.rssi?.takeIf { it <= 0 && it >= -120 }
    } catch (e: Exception) { null }
    }

    private fun getIpAddress(): String? { return try {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val activeNetwork = cm.activeNetwork ?: return null
        val linkProps = cm.getLinkProperties(activeNetwork)
        linkProps?.linkAddresses?.firstOrNull { it.address.isSiteLocalAddress() }?.address?.hostAddress
    } catch (e: Exception) { null }
    }

    private fun getConnectionStatus(): String? { return try {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val activeNetwork = cm.activeNetwork ?: return "DISCONNECTED"
        val caps = cm.getNetworkCapabilities(activeNetwork)
        if (caps == null) return "DISCONNECTED"
        if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) "CONNECTED"
        else if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) "LIMITED"
        else "CONNECTING"
    } catch (e: Exception) { null }
    }

    // ================================================================
    // UPTIME
    // ================================================================

    private fun getUptimeSeconds(): Long? { return try {
        (SystemClock.elapsedRealtime() / 1000).takeIf { it > 0 }
    } catch (e: Exception) { null }
    }
}
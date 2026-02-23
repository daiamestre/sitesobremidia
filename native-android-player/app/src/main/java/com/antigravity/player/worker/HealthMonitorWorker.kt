package com.antigravity.player.worker

import android.app.ActivityManager
import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.antigravity.player.di.ServiceLocator
import java.io.File

class HealthMonitorWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val repository = ServiceLocator.getRepository(applicationContext)
            
            // 1. Storage
            val internalStorage = File(applicationContext.filesDir.absolutePath)
            val freeSpaceBytes = internalStorage.freeSpace

            // 2. RAM
            val actManager = applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            actManager.getMemoryInfo(memInfo)
            val usedRamBytes = memInfo.totalMem - memInfo.availMem

            // 3. CPU Temperature (Thermal Chipset)
            var tempCelsius = readCpuTemperature()
            if (tempCelsius == 0f) {
                // Fallback to Battery if CPU temp unreadable
                val batteryIntent = applicationContext.registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
                val tempInt = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
                tempCelsius = tempInt / 10f
            }
            
            // 4. App Version
            val pInfo = applicationContext.packageManager.getPackageInfo(applicationContext.packageName, 0)
            val version = pInfo.versionName

            // 5. Uptime
            val uptimeHours = (android.os.SystemClock.elapsedRealtime() / (1000 * 60 * 60)).toInt()

            // 6. Status String (Visible in Dashboard)
            // [HARDENING] Pilar de Telemetria: CPU, RAM, DISK, UPTIME
            val ramPercent = (usedRamBytes.toDouble() / memInfo.totalMem.toDouble() * 100).toInt()
            val diskFreeGb = freeSpaceBytes / (1024 * 1024 * 1024)
            val status = "ONLINE | TEMP: ${tempCelsius}°C | RAM: $ramPercent% | DISK: ${diskFreeGb}GB | UPTIME: ${uptimeHours}h"

            // [HARDENING] Alerta de Sobrecarga (ErrorBoundary Check)
            if (tempCelsius > 85f || ramPercent > 90) {
                com.antigravity.core.util.Logger.w("HEALTH", "CRITICAL OVERLOAD: $status")
                repository.reportActionApplied("HardwareAlert", status)
            }

            val repoId = repository.deviceId
            val shortId = if (repoId.length > 6) "...${repoId.takeLast(6)}" else repoId
            val time = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
            
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                android.widget.Toast.makeText(applicationContext, "📡 Heartbeat ($time) | ID: $shortId", android.widget.Toast.LENGTH_SHORT).show()
            }

            repository.sendHeartbeat(
                status = status,
                freeSpace = freeSpaceBytes,
                ramUsage = usedRamBytes,
                cpuTemp = tempCelsius,
                uptimeHours = uptimeHours,
                ipAddress = null // IP tracking could be added via a network utility if needed
            )
            
            // [HIGH-END] Realtime Active Confirmation
            repository.updateDevicesHeartbeat(repoId)

            // [DYNAMIC RECEIVER] Sync config/playlist if changed
            repository.syncWithRemote()
            
            com.antigravity.core.util.Logger.i("HealthMonitor", "Heartbeat triggered with status: $status for ID $repoId")

            android.os.Handler(android.os.Looper.getMainLooper()).post {
                android.widget.Toast.makeText(applicationContext, "✅ Heartbeat OK | ID: $shortId", android.widget.Toast.LENGTH_SHORT).show()
            }

            Result.success()
        } catch (e: Exception) {
            com.antigravity.core.util.Logger.e("HealthMonitor", "Heartbeat Job Failed: ${e.message}")
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                android.widget.Toast.makeText(applicationContext, "❌ Heartbeat: Erro!", android.widget.Toast.LENGTH_SHORT).show()
            }
            e.printStackTrace()
            Result.retry()
        }
    }

    private fun readCpuTemperature(): Float {
        val thermalPaths = listOf(
            "/sys/class/thermal/thermal_zone0/temp",
            "/sys/class/thermal/thermal_zone1/temp",
            "/sys/devices/virtual/thermal/thermal_zone0/temp"
        )
        for (path in thermalPaths) {
            try {
                val file = File(path)
                if (file.exists() && file.canRead()) {
                    val raw = file.readText().trim().toDoubleOrNull() ?: continue
                    return if (raw > 1000) (raw / 1000.0).toFloat() else raw.toFloat()
                }
            } catch (e: Exception) {
                continue
            }
        }
        return 0f
    }
}

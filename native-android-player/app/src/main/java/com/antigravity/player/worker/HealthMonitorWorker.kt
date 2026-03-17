package com.antigravity.player.worker

import android.app.ActivityManager
import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.antigravity.player.di.ServiceLocator
import java.io.File
import kotlinx.coroutines.launch

class HealthMonitorWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val authRepo = com.antigravity.sync.repository.AuthRepository()
            authRepo.ensureValidSession(applicationContext)
            
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
            


            // [HIGH-END] Master Telemetry Cycle
            // [RECURSION FIX] Executa sincronamente na Corrotina. Falhas de rede AQUI
            // não devem retornar Result.retry() para evitar inundar o Supabase
            // e estourar o "stack depth limit" dos Triggers do PostgreSQL.
            try {
                repository.sendHeartbeat(
                    status = status,
                    freeSpace = freeSpaceBytes,
                    ramUsage = usedRamBytes,
                    cpuTemp = tempCelsius,
                    uptimeHours = uptimeHours,
                    ipAddress = null
                )
                com.antigravity.core.util.Logger.i("HealthMonitor", "Telemetria consolidada enviada para ID $repoId")
            } catch (e: Exception) {
                com.antigravity.core.util.Logger.e("HealthMonitor", "Silencing heartbeat DB failure: ${e.message}")
                // NON-FATAL. Avoid endless retries.
            }
            
            return Result.success()
        } catch (e: Exception) {
            com.antigravity.core.util.Logger.e("HealthMonitor", "Critical Heartbeat Job Failed: ${e.message}")
            e.printStackTrace()
            // Retorna sucess para matar o loop vicioso do WorkManager
            return Result.success() 
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

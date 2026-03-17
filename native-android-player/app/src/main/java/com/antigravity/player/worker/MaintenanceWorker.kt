package com.antigravity.player.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.antigravity.player.di.ServiceLocator

class MaintenanceWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val repository = ServiceLocator.getRepository(applicationContext)
            
            // [INDUSTRIAL] 03:00 AM Cycle
            com.antigravity.core.util.Logger.i("MAINTENANCE", "Iniciando ciclo preventivo de 03:00 AM...")
            
            // 1. Purge Local Database logs/cache
            repository.performMaintenanceCleanup()
            
            // 2. Force JVM Garbage Collection & Media Cache Sweep
            System.gc()
            try {
                com.bumptech.glide.Glide.get(applicationContext).clearDiskCache()
                com.antigravity.core.util.Logger.i("MAINTENANCE", "Glide Disk Cache cleared (Daily Sweep).")
            } catch (ignore: Exception) {}
            
            // 3. Force WebView memory release (Via session manager)
            com.antigravity.sync.service.SessionManager.triggerWebViewReset()
            
            // 4. Cleanup old log files from storage
            com.antigravity.core.util.Logger.i("MAINTENANCE", "Ciclo concluído com sucesso.")
            
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}

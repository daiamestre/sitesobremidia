package com.antigravity.player

import android.app.Application
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.antigravity.core.config.PlayerConfig
import com.antigravity.core.util.Logger
import com.antigravity.core.util.TimeManager
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.service.SelfHealingService
import com.antigravity.player.util.GlobalErrorReporter
import com.antigravity.player.util.NetworkMonitor
import com.antigravity.player.util.PlaybackBufferManager
import com.antigravity.player.worker.AuditUploadWorker
import com.antigravity.player.worker.HealthMonitorWorker
import com.antigravity.player.worker.LogSyncWorker
import com.antigravity.cache.worker.MaintenanceWorker
import com.antigravity.cache.util.WorkScheduler
import com.antigravity.sync.service.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Calendar
import java.util.concurrent.TimeUnit

class UserApplication : Application() {

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()

        try {
            GlobalErrorReporter.install(this)

            val bufferManager = PlaybackBufferManager(this)
            val networkMonitor = NetworkMonitor(this)

            networkMonitor.onNetworkRestored = {
                bufferManager.flushPendingLogs()
            }
            networkMonitor.startMonitoring()

            // Initialize Background Workers with a small delay to avoid boot contention
            applicationScope.launch {
                delay(3000)
                try {
                    com.antigravity.core.util.TimeManager.syncTime()
                } catch (e: Exception) { e.printStackTrace() }
            }
        } catch (e: Exception) {
            Log.e("BOOT_CRITICAL", "Application.onCreate failed: ${e.message}")
        }

        setupHeartbeat()
        setupLogSync()
        setupIndustrialMaintenance()
        setupAuditUpload()

        // [SCALE 10K] Reboot-safe heartbeat via WorkManager (safety net)
        WorkScheduler.scheduleHeartbeat(this)

        setupCrashHandler()
        startSelfHealingService()
    }

    private fun setupCrashHandler() {
        // [ZERO-CRASH] Intercepta crashes da Main Thread sem matar o app
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            while (true) {
                try {
                    android.os.Looper.loop()
                } catch (e: Throwable) {
                    Log.e("SELF_HEALING", "Main Thread Crash Intercepted: ${e.message}")
                    relaunchMainActivitySilence()
                }
            }
        }

        // [ZERO-CRASH] Intercepta crashes de Background Threads
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e("SELF_HEALING", "Worker Thread Crash in ${thread.name}: ${throwable.message}")
            relaunchMainActivitySilence()
        }
    }

    private fun relaunchMainActivitySilence() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.e("SELF_HEALING", "Failed to relaunch on crash: ${e.message}")
        }
    }

    private fun startSelfHealingService() {
        val intent = Intent(this, SelfHealingService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun setupHeartbeat() {
        val workManager = WorkManager.getInstance(this)

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        // CUSTOM SCHEDULER: 2 Minute Interval (Bypassing Android's 15min minimum)
        applicationScope.launch {
            while (true) {
                val heartbeatRequest = OneTimeWorkRequest.Builder(HealthMonitorWorker::class.java)
                    .setConstraints(constraints)
                    .build()

                workManager.enqueueUniqueWork(
                    "HealthMonitorPulse",
                    ExistingWorkPolicy.REPLACE,
                    heartbeatRequest
                )

                val intervalMs = SessionManager.heartbeatIntervalSeconds * 1000L
                delay(intervalMs)
            }
        }
    }

    private fun setupLogSync() {
        val workManager = WorkManager.getInstance(this)

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        // Immediate One-Time Sync
        val immediateRequest = OneTimeWorkRequest.Builder(LogSyncWorker::class.java)
            .setConstraints(constraints)
            .build()

        workManager.enqueueUniqueWork(
            "LogSyncImmediate",
            ExistingWorkPolicy.REPLACE,
            immediateRequest
        )

        // Periodic Background Sync (Increased to 60 min to save egress)
        val logSyncRequest = PeriodicWorkRequestBuilder<LogSyncWorker>(
            60, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .build()

        workManager.enqueueUniquePeriodicWork(
            "LogSyncWorker",
            ExistingPeriodicWorkPolicy.KEEP,
            logSyncRequest
        )
    }

    private fun setupIndustrialMaintenance() {
        val workManager = WorkManager.getInstance(this)

        // Calculate delay until 03:00 AM
        val calendar = Calendar.getInstance()
        val now = calendar.timeInMillis
        calendar.set(Calendar.HOUR_OF_DAY, 3)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)

        if (calendar.timeInMillis <= now) {
            calendar.add(Calendar.DAY_OF_YEAR, 1)
        }
        val initialDelay = calendar.timeInMillis - now

        val maintenanceRequest = PeriodicWorkRequestBuilder<MaintenanceWorker>(
            24, TimeUnit.HOURS
        )
            .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
            .setConstraints(Constraints.Builder().build())
            .build()

        workManager.enqueueUniquePeriodicWork(
            "IndustrialMaintenance",
            ExistingPeriodicWorkPolicy.KEEP,
            maintenanceRequest
        )
    }

    private fun setupAuditUpload() {
        val workManager = WorkManager.getInstance(this)
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val auditRequest = PeriodicWorkRequestBuilder<AuditUploadWorker>(
            24, TimeUnit.HOURS
        )
            .setConstraints(constraints)
            .build()

        workManager.enqueueUniquePeriodicWork(
            "AuditUploadWorker",
            ExistingPeriodicWorkPolicy.KEEP,
            auditRequest
        )
    }

    companion object
}

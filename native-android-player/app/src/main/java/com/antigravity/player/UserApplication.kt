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
import com.antigravity.player.worker.HealthMonitorWorker
import com.antigravity.player.worker.LogSyncWorker
import com.antigravity.player.worker.MaintenanceWorker
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

        setupCrashHandler()
        startSelfHealingService()
    }

    private fun setupCrashHandler() {
        Thread.setDefaultUncaughtExceptionHandler { _, throwable ->
            Log.e("SELF_HEALING", "CRASH DETECTADO: ${throwable.message}")

            val intent = packageManager.getLaunchIntentForPackage(packageName)
            val pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )

            val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.set(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + 5000,
                pendingIntent
            )

            Logger.e("CRITICAL", "Auto-Restart Triggered. Exception: ${throwable.message}")

            android.os.Process.killProcess(android.os.Process.myPid())
            System.exit(10)
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

        // Periodic Background Sync
        val logSyncRequest = PeriodicWorkRequestBuilder<LogSyncWorker>(
            5, TimeUnit.MINUTES
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

    companion object
}

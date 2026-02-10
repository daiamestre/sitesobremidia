package com.antigravity.player

import android.app.Application

class UserApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialize DI and Core Player
        com.antigravity.player.di.ServiceLocator.init(this)
        
        // GLOBAL SHIELD: Catch all uncaught exceptions
        // We use the dedicated CrashHandler class which utilizes AlarmManager
        // for robust restarts even if the process dies immediately.
        com.antigravity.player.util.CrashHandler.init(this)

        // Schedule Heartbeat Worker (Periodic, every 15 minutes)
        setupHeartbeat()
    }

    private fun setupHeartbeat() {
        val workManager = androidx.work.WorkManager.getInstance(this)
        
        // Constraints: Network must be connected
        val constraints = androidx.work.Constraints.Builder()
            .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
            .build()

        // Create Periodic Request
        val heartbeatRequest = androidx.work.PeriodicWorkRequestBuilder<com.antigravity.player.worker.HeartbeatWorker>(
            15, java.util.concurrent.TimeUnit.MINUTES // Minimum interval allowed by Android
        )
            .setConstraints(constraints)
            .build()

        // Enqueue Unique Work (KEEP keeps existing work if already scheduled)
        workManager.enqueueUniquePeriodicWork(
            "HeartbeatWorker",
            androidx.work.ExistingPeriodicWorkPolicy.KEEP,
            heartbeatRequest
        )
    }
}

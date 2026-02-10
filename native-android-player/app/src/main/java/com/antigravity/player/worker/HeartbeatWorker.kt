package com.antigravity.player.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.antigravity.player.di.ServiceLocator

class HeartbeatWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            val repository = ServiceLocator.getRepository(applicationContext)
            // Sends "online" status. 
            // In the future we can pass flexible status via inputData if needed.
            repository.sendHeartbeat("online")
            Result.success()
        } catch (e: Exception) {
            e.printStackTrace()
            // We return retry so WorkManager can try again later if it was a network glitch
            Result.retry()
        }
    }
}

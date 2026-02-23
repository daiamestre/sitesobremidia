package com.antigravity.player.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.antigravity.player.di.ServiceLocator
import com.antigravity.sync.dto.PlayLogDto
import java.time.Instant

class LogSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            val repository = ServiceLocator.getRepository(applicationContext)
            
            // [INDUSTRIAL] Batch PoP Upload
            val result = repository.syncLogs()
            
            if (result.isSuccess) Result.success() else Result.retry()
        } catch (e: Exception) {
            e.printStackTrace()
            Result.retry()
        }
    }
}

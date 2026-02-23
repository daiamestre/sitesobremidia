package com.antigravity.player.worker

import android.content.Context
import android.media.MediaExtractor
import android.os.Process
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.antigravity.player.di.ServiceLocator
import com.antigravity.core.util.Logger
import com.antigravity.sync.service.SessionManager
import com.antigravity.sync.service.MediaDownloader

/**
 * Industrial-Grade Media Downloader.
 * Handles single file download with integrity checks and automatic retries.
 * Uses direct HTTP download via MediaDownloader (Ktor/OkHttp) for full URL support.
 * 
 * [PERFORMANCE] Runs with THREAD_PRIORITY_BACKGROUND to avoid stealing CPU from playback.
 * [INTEGRITY] Validates downloaded files with MediaExtractor before marking as complete.
 */
class MediaDownloadWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val mediaDownloader = MediaDownloader()

    override suspend fun doWork(): Result {
        // [CRITICAL] Set low thread priority so downloads NEVER interfere with playback
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND)
        
        val mediaId = inputData.getString("media_id") ?: return Result.failure()
        val url = inputData.getString("url") ?: return Result.failure()
        val expectedHash = inputData.getString("hash") ?: ""
        val deviceId = SessionManager.currentUserId ?: "UNKNOWN"

        val repository = ServiceLocator.getRepository(applicationContext)
        val storageManager = ServiceLocator.getFileStorageManager(applicationContext)
        
        val file = storageManager.getFileForMedia(mediaId)

        return try {
            // 1. Check if file already exists and matches hash (Delta Update logic)
            if (storageManager.doesFileExistAndMatchHash(mediaId, expectedHash)) {
                Logger.i("DOWNLOAD", "Media $mediaId already exists and valid. Skipping.")
                repository.reportDownloadProgress(deviceId, mediaId, 100)
                return Result.success(workDataOf("local_path" to file.absolutePath))
            }

            Logger.i("DOWNLOAD", "Starting download: $url")
            repository.reportDownloadProgress(deviceId, mediaId, 0)
            
            // 2. Download via HTTP direto (suporta URLs completas do Supabase Storage)
            val downloadResult = mediaDownloader.downloadFile(url, file)
            
            if (downloadResult.isFailure) {
                Logger.e("DOWNLOAD", "Download failed for $mediaId: ${downloadResult.exceptionOrNull()?.message}")
                repository.reportDownloadProgress(deviceId, mediaId, -1)
                return Result.retry()
            }

            val targetFile = downloadResult.getOrThrow()

            // 3. Integrity Shield: Checksum Validation
            if (expectedHash.isNotBlank()) {
                if (!storageManager.doesFileExistAndMatchHash(mediaId, expectedHash)) {
                    Logger.e("DOWNLOAD", "Hash mismatch for $mediaId! Expected: $expectedHash")
                    repository.reportDownloadProgress(deviceId, mediaId, -1)
                    return Result.retry()
                }
            }
            
            // 4. [NEW] Format Probe: Verify the file is decodable using MediaExtractor
            if (isVideoFile(url)) {
                if (!probeVideoFile(targetFile.absolutePath)) {
                    Logger.e("DOWNLOAD", "Downloaded video FAILED format probe: $mediaId. Re-queuing.")
                    targetFile.delete()
                    repository.reportDownloadProgress(deviceId, mediaId, -1)
                    return Result.retry()
                }
            }

            repository.reportDownloadProgress(deviceId, mediaId, 100)
            
            // [MISSION CRITICAL] Update Local DB with the official path
            repository.updateMediaLocalPath(mediaId, targetFile.absolutePath)
            
            Logger.i("DOWNLOAD", "Download complete, verified and persisted: $mediaId (${targetFile.length()} bytes)")
            Result.success(workDataOf("local_path" to targetFile.absolutePath))
            
        } catch (e: Exception) {
            Logger.e("DOWNLOAD", "Failed to download $mediaId: ${e.message}")
            Result.retry()
        }
    }
    
    /**
     * Uses MediaExtractor to verify the downloaded file has valid tracks.
     * Returns false if the file is corrupted or truncated.
     */
    private fun probeVideoFile(path: String): Boolean {
        val extractor = MediaExtractor()
        return try {
            extractor.setDataSource(path)
            val trackCount = extractor.trackCount
            if (trackCount <= 0) {
                Logger.w("DOWNLOAD", "Format probe: No tracks found in $path")
                return false
            }
            Logger.i("DOWNLOAD", "Format probe OK: $trackCount tracks in ${path.substringAfterLast('/')}")
            true
        } catch (e: Exception) {
            Logger.e("DOWNLOAD", "Format probe FAILED: ${e.message}")
            false
        } finally {
            extractor.release()
        }
    }
    
    private fun isVideoFile(url: String): Boolean {
        val lower = url.lowercase()
        return lower.contains(".mp4") || lower.contains(".mkv") || 
               lower.contains(".webm") || lower.contains(".avi") || 
               lower.contains(".mov") || lower.contains("video")
    }
}


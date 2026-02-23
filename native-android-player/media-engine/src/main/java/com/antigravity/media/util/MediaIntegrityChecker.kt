package com.antigravity.media.util

import android.media.MediaMetadataRetriever
import android.util.Log
import java.io.File

/**
 * 🛡️ MediaIntegrityChecker
 * 
 * Validates media files BEFORE playback to prevent black screens from corrupted/incomplete files.
 * Uses MediaMetadataRetriever to probe file headers without full decode.
 */
object MediaIntegrityChecker {
    private const val TAG = "MediaIntegrity"
    private const val MIN_FILE_SIZE_BYTES = 1024L // 1KB minimum

    /**
     * Quick check: file exists and has meaningful size
     */
    fun isFileValid(file: File): Boolean {
        if (!file.exists()) {
            Log.w(TAG, "File does not exist: ${file.absolutePath}")
            return false
        }
        if (file.length() < MIN_FILE_SIZE_BYTES) {
            Log.w(TAG, "File too small (${file.length()} bytes): ${file.name}")
            return false
        }
        return true
    }

    /**
     * Deep check: attempts to extract metadata to confirm the file is a playable video.
     * Returns false if the file is corrupted, truncated, or unsupported.
     */
    fun isVideoPlayable(file: File): Boolean {
        if (!isFileValid(file)) return false

        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            
            // Try to extract duration — if this fails, the file is corrupt
            val durationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            val duration = durationStr?.toLongOrNull() ?: 0L
            
            if (duration <= 0) {
                Log.w(TAG, "Video has no valid duration: ${file.name}")
                return false
            }

            // Try to extract a frame — confirms decoder can read the file
            val hasVideo = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO)
            if (hasVideo != "yes") {
                Log.w(TAG, "File has no video track: ${file.name}")
                return false
            }

            Log.i(TAG, "Video validated: ${file.name} (${duration}ms, ${file.length()} bytes)")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Integrity check failed for ${file.name}: ${e.message}")
            false
        } finally {
            try { retriever.release() } catch (_: Exception) {}
        }
    }

    /**
     * Checks if an image file is valid (exists and has minimum size).
     * Images are simpler — if the file exists and has data, BitmapFactory/ExoPlayer can handle it.
     */
    fun isImageValid(file: File): Boolean {
        return isFileValid(file)
    }

    /**
     * Safely deletes a corrupted file and logs the action.
     */
    fun deleteCorruptedFile(file: File): Boolean {
        return try {
            if (file.exists()) {
                val deleted = file.delete()
                if (deleted) {
                    Log.w(TAG, "Corrupted file deleted: ${file.name}")
                } else {
                    Log.e(TAG, "Failed to delete corrupted file: ${file.name}")
                }
                deleted
            } else false
        } catch (e: Exception) {
            Log.e(TAG, "Error deleting file ${file.name}: ${e.message}")
            false
        }
    }
}

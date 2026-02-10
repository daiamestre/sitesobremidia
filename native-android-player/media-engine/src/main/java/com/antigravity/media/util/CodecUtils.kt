package com.antigravity.media.util

import android.media.MediaCodecList
import android.media.MediaFormat
import android.util.Log

object CodecUtils {
    private const val TAG = "CodecUtils"

    fun isVideoSupported(mimeType: String, width: Int, height: Int): Boolean {
        try {
            val codecList = MediaCodecList(MediaCodecList.ALL_CODECS)
            val format = MediaFormat.createVideoFormat(mimeType, width, height)
            
            val decoderName = codecList.findDecoderForFormat(format)
            
            if (decoderName == null) {
                Log.e(TAG, "No hardware decoder found for $mimeType at ${width}x${height}")
                return false
            }

            Log.i(TAG, "Found decoder for $mimeType: $decoderName")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Error checking codec support", e)
            return false // Safe fail
        }
    }

    /**
     * Maps common file extensions to MIME types
     */
    fun getMimeType(path: String): String {
        return when {
            path.endsWith(".mp4", true) -> MediaFormat.MIMETYPE_VIDEO_AVC // Default assumption
            path.endsWith(".mkv", true) -> MediaFormat.MIMETYPE_VIDEO_HEVC // Often HEVC
            path.endsWith(".webm", true) -> MediaFormat.MIMETYPE_VIDEO_VP9
            else -> MediaFormat.MIMETYPE_VIDEO_AVC
        }
    }
}

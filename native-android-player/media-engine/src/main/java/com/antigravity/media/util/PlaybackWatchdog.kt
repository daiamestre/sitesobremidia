package com.antigravity.media.util

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi

/**
 * 🔍 PlaybackWatchdog
 * 
 * Monitors the ExoPlayer for freezes/stalls during playback.
 * If the playback position hasn't changed in >5 seconds while the player
 * reports STATE_READY + isPlaying, it triggers a recovery callback
 * that restarts ONLY the video engine (not the entire app).
 * 
 * Polling interval: 2 seconds
 * Freeze threshold: 3 checks without position change = ~6 seconds
 */
@UnstableApi
class PlaybackWatchdog(
    private val onFreezeDetected: () -> Unit
) {
    companion object {
        private const val TAG = "PlaybackWatchdog"
        private const val CHECK_INTERVAL_MS = 500L
        private const val FREEZE_THRESHOLD = 2 // 2 checks × 0.5s = 1s without position change
    }

    private val handler = Handler(Looper.getMainLooper())
    private var player: Player? = null
    private var lastPosition: Long = -1L
    private var frozenChecks = 0
    private var isActive = false

    private val checkRunnable = object : Runnable {
        override fun run() {
            if (!isActive) return

            val currentPlayer = player
            if (currentPlayer == null) {
                handler.postDelayed(this, CHECK_INTERVAL_MS)
                return
            }

            try {
                val currentPosition = currentPlayer.currentPosition
                val isPlaying = currentPlayer.isPlaying
                val state = currentPlayer.playbackState

                // Only monitor when player is supposed to be playing
                if (isPlaying && state == Player.STATE_READY) {
                    if (currentPosition == lastPosition && lastPosition >= 0) {
                        frozenChecks++
                        Log.w(TAG, "Position frozen at ${currentPosition}ms (check $frozenChecks/$FREEZE_THRESHOLD)")

                        if (frozenChecks >= FREEZE_THRESHOLD) {
                            Log.e(TAG, "⚠ FREEZE DETECTED! Position stuck at ${currentPosition}ms for ${frozenChecks * 2}s. Triggering recovery.")
                            frozenChecks = 0
                            lastPosition = -1L
                            onFreezeDetected()
                        }
                    } else {
                        // Position is advancing — all good
                        if (frozenChecks > 0) {
                            Log.i(TAG, "Playback resumed after $frozenChecks frozen checks.")
                        }
                        frozenChecks = 0
                    }
                    lastPosition = currentPosition
                } else {
                    // Not playing — reset tracking
                    frozenChecks = 0
                    lastPosition = -1L
                }
            } catch (e: Exception) {
                Log.e(TAG, "Watchdog check error: ${e.message}")
                frozenChecks = 0
            }

            handler.postDelayed(this, CHECK_INTERVAL_MS)
        }
    }

    /**
     * Start monitoring the given ExoPlayer instance.
     */
    fun watch(playerInstance: Player) {
        stop()
        player = playerInstance
        lastPosition = -1L
        frozenChecks = 0
        isActive = true
        handler.postDelayed(checkRunnable, CHECK_INTERVAL_MS)
        Log.i(TAG, "Watchdog STARTED monitoring playback.")
    }

    /**
     * Stop monitoring. Call this when player is released or playback ends.
     */
    fun stop() {
        isActive = false
        handler.removeCallbacks(checkRunnable)
        player = null
        lastPosition = -1L
        frozenChecks = 0
        Log.i(TAG, "Watchdog STOPPED.")
    }

    /**
     * Reset freeze counter (call after successful recovery or media transition).
     */
    fun reset() {
        frozenChecks = 0
        lastPosition = -1L
    }
}

package com.antigravity.player.util

import android.webkit.JavascriptInterface
import com.antigravity.core.util.TimeManager

/**
 * Bridge for WebViews to access the bulletproof NTP-synced time.
 * Exposed in JS as 'MasterClock'.
 */
class MasterClockBridge {

    @JavascriptInterface
    fun getCurrentTimeMillis(): Long {
        return TimeManager.currentTimeMillis()
    }

    @JavascriptInterface
    fun getOffsetMillis(): Long {
        // Return the current drift/offset if needed for client-side adjustments
        return TimeManager.currentTimeMillis() - System.currentTimeMillis()
    }
}

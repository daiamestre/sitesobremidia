package com.antigravity.core.config

/**
 * Global Player Configuration.
 * Defines versions, intervals, and default behaviors.
 */
object PlayerConfig {
    const val APP_VERSION = "1.0.0" // Clean Start
    const val BUILD_VARIANT = "native_kiosk"
    
    // Heartbeat
    const val HEARTBEAT_INTERVAL_MINUTES = 1L
    
    // Cache & Cleanup
    const val MAX_CACHE_SIZE_BYTES = 1024L * 1024L * 1024L // 1 GB Limit (Example)
    const val CLEANUP_INTERVAL_HOURS = 24L // Run once a day
    const val MAX_FILE_AGE_DAYS = 7L // Delete orphans older than 7 days
}

package com.antigravity.player.util

import android.app.Activity
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import com.antigravity.player.R
import com.antigravity.core.util.Logger

/**
 * [PROFESSIONAL REPRODUCTION MODE]
 * SyncGuard acts as the absolute UI gatekeeper. It forces a mandatory Wait Screen
 * over all player surfaces until `PlayerRepositoryImpl` confirms 100% of the media
 * is physically downloaded and structurally verified.
 */
class SyncGuard(private val activity: Activity) {

    private var overlayContainer: FrameLayout? = null
    private var titleText: TextView? = null
    private var statusText: TextView? = null
    private var deviceIdText: TextView? = null

    init {
        // Find the overlay inflated from activity_main.xml (which includes sync_guard_screen)
        // or ensure it's loaded.
        overlayContainer = activity.findViewById(R.id.sync_guard_overlay)
        titleText = activity.findViewById(R.id.sync_guard_title)
        statusText = activity.findViewById(R.id.sync_guard_status)
        deviceIdText = activity.findViewById(R.id.sync_guard_device_id)
        
        // Block all UI interactions below this layer
        overlayContainer?.setOnClickListener {}
    }

    fun lockScreen(message: String = "Sincronizando Mídias...", showDeviceId: String? = null) {
        activity.runOnUiThread {
            overlayContainer?.visibility = View.VISIBLE
            titleText?.text = "Sobre Mídia Player"
            statusText?.text = message
            
            showDeviceId?.let {
                deviceIdText?.visibility = View.VISIBLE
                deviceIdText?.text = "ID: $it"
            } ?: run {
                deviceIdText?.visibility = View.GONE
            }
        }
    }

    fun updateProgress(progressMessage: String) {
        activity.runOnUiThread {
            statusText?.text = progressMessage
        }
    }

    /**
     * Unlocks the screen ONLY when the first media is actually ready to render.
     */
    fun releaseLock() {
        activity.runOnUiThread {
            if (overlayContainer?.visibility == View.VISIBLE) {
                Logger.i("SYNC_GUARD", "Sync Complete. Releasing UI Lock.")
                overlayContainer?.visibility = View.GONE
            }
        }
    }
    
    fun isLocked(): Boolean {
        return overlayContainer?.visibility == View.VISIBLE
    }
}

package com.antigravity.player.util

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration

object DeviceTypeUtil {
    
    enum class DeviceProfile {
        MOBILE, TELEVISION
    }

    private const val PREFS_NAME = "device_prefs"
    private const val HEADER_PROFILE = "detected_profile"

    fun getDeviceProfile(context: Context): DeviceProfile {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(HEADER_PROFILE, null)
        
        if (saved != null) {
            return DeviceProfile.valueOf(saved)
        }

        // Auto Detection: Support Android TV, Leanback, Smart TVs and TV Boxes (MXQ, Allwinner, Rockchip)
        val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        val isTvUiMode = uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
        val pm = context.packageManager
        val hasLeanback = pm.hasSystemFeature("android.software.leanback")
        val hasTvFeature = pm.hasSystemFeature("android.hardware.type.television")
        val noTouch = !pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_TOUCHSCREEN)
        
        val isTvDevice = isTvUiMode || hasLeanback || hasTvFeature || noTouch
        val profile = if (isTvDevice) DeviceProfile.TELEVISION else DeviceProfile.MOBILE

        // Persist
        prefs.edit().putString(HEADER_PROFILE, profile.name).apply()
        return profile
    }

    fun isTelevision(context: Context): Boolean = getDeviceProfile(context) == DeviceProfile.TELEVISION
}

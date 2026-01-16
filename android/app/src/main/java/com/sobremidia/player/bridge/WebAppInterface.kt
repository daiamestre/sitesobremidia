package com.sobremidia.player.bridge

import android.content.Context
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONObject

/**
 * Interface for React to call Native Android functions.
 * Exposed as 'window.NativePlayer'
 */
class WebAppInterface(private val context: Context) {

    @JavascriptInterface
    fun getDeviceId(): String {
        val deviceId = android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        )
        return deviceId ?: "unknown"
    }

    @JavascriptInterface
    fun log(message: String) {
        android.util.Log.d("NativePlayerBridge", message)
    }

    @JavascriptInterface
    fun getPlayerConfig(): String {
        // Return JSON config
        return JSONObject().apply {
            put("kioskMode", true)
            put("version", "1.0.0")
        }.toString()
    }
    
    @JavascriptInterface
    fun showToast(message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }
}

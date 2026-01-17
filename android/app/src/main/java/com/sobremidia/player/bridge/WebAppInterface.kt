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

    @JavascriptInterface
    fun getDeviceStatus(): String {
        val overlayPermission = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            android.provider.Settings.canDrawOverlays(context)
        } else {
            true
        }

        val metrics = context.resources.displayMetrics
        val orientation = context.resources.configuration.orientation
        val orientationString = if (orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait"

        return JSONObject().apply {
            put("deviceId", getDeviceId())
            put("overlayGranted", overlayPermission)
            put("isOnline", isOnline())
            put("manufacturer", android.os.Build.MANUFACTURER)
            put("model", android.os.Build.MODEL)
            put("sdk", android.os.Build.VERSION.SDK_INT)
            put("widthPixels", metrics.widthPixels)
            put("heightPixels", metrics.heightPixels)
            put("density", metrics.density)
            put("orientation", orientationString)
        }.toString()
    }

    private fun isOnline(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val netInfo = cm.activeNetworkInfo
        return netInfo != null && netInfo.isConnectedOrConnecting
    }

    @JavascriptInterface
    fun clearAppCache() {
        android.util.Log.i("NativePlayer", "Clearing App Cache requested by WebView")
        // Run on UI Thread to access WebView (if needed) or Context
        android.os.Handler(android.os.Looper.getMainLooper()).post {
             // To clear WebView cache, we ideally need reference to it or just generic cleanup
             // Since we are in Interface, we might not have direct WebView ref easily without context casting or static
             // For now, simpler context based cache clearing:
             try {
                context.cacheDir.deleteRecursively()
                android.util.Log.i("NativePlayer", "Cache cleared successfully")
             } catch (e: Exception) {
                android.util.Log.e("NativePlayer", "Error clearing cache", e)
             }
        }
    }

    @JavascriptInterface
    fun requestOverlayPermission() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            if (!android.provider.Settings.canDrawOverlays(context)) {
                android.util.Log.i("NativePlayer", "Requesting Overlay Permission via Bridge")
                val intent = android.content.Intent(
                    android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    android.net.Uri.parse("package:" + context.packageName)
                )
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            } else {
                showToast("Permissão já concedida!")
            }
        }
    }
}

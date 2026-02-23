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
        val overlayPermission = true

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

    private var webView: android.webkit.WebView? = null
    
    fun setWebView(view: android.webkit.WebView) {
        this.webView = view
    }

    @JavascriptInterface
    fun captureScreenshot(callbackName: String) {
        val activity = context as? android.app.Activity ?: return
        activity.runOnUiThread {
            try {
                if (webView == null) return@runOnUiThread
                
                val view = activity.window.decorView.rootView
                val bitmap = android.graphics.Bitmap.createBitmap(view.width, view.height, android.graphics.Bitmap.Config.ARGB_8888)
                val canvas = android.graphics.Canvas(bitmap)
                view.draw(canvas)
                
                val stream = java.io.ByteArrayOutputStream()
                bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 60, stream) // 60% quality
                val byteArray = stream.toByteArray()
                val base64 = android.util.Base64.encodeToString(byteArray, android.util.Base64.NO_WRAP)
                
                val result = "data:image/jpeg;base64,$base64"
                
                // Send back to JS
                // We must use evaluateJavascript from UI Thread
                webView?.evaluateJavascript("$callbackName('$result')", null)
                
            } catch (e: Exception) {
                android.util.Log.e("NativePlayer", "Screenshot Failed", e)
                webView?.evaluateJavascript("$callbackName(null)", null)
            }
        }
    }

    @JavascriptInterface
    fun reboot() {
        val pm = context.packageManager
        val intent = pm.getLaunchIntentForPackage(context.packageName)
        if (intent != null) {
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val mPendingIntent = android.app.PendingIntent.getActivity(
                context,
                123456,
                intent,
                android.app.PendingIntent.FLAG_CANCEL_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
            val mgr = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            mgr.set(android.app.AlarmManager.RTC, System.currentTimeMillis() + 1000, mPendingIntent)
            System.exit(0)
        }
    }
}

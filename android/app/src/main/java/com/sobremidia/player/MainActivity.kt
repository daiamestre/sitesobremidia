package com.sobremidia.player

import android.annotation.SuppressLint
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.sobremidia.player.bridge.WebAppInterface
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // --- IMMORTAL PLAYER HARDENING ---
    private var wakeLock: android.os.PowerManager.WakeLock? = null
    private var wifiLock: android.net.wifi.WifiManager.WifiLock? = null
    private var audioManager: android.media.AudioManager? = null
    
    private val audioFocusChangeListener = android.media.AudioManager.OnAudioFocusChangeListener { focusChange ->
        // SENIOR ENGINEER FIX: IGNORE ALL FOCUS LOSS.
        // We are a Digital Signage Player. We DO NOT duck. We DO NOT pause.
        // If the OS wants us to stop, it must kill us.
        Log.w("MainActivity", "⚠️ Audio Focus Change detected: $focusChange. IGNORING.")
        if (focusChange == android.media.AudioManager.AUDIOFOCUS_LOSS) {
            // Aggressive Re-claim (Wait 1s and steal it back)
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                requestAudioFocus()
            }, 1000)
        }
    }

    // --- DIAGNOSTIC CONFIGURATION ---
    // Remote URL Failed (404). Reverting to LOCAL ASSETS (public/index.html).
    // This ensures the player works even if the website is offline.
    private val USE_REMOTE_DEBUG = false 
    private val REMOTE_DEBUG_URL = "https://sitesobremidia.vercel.app" 

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep Screen On
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        // Kiosk: Bypass Lock Screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                          android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }

        // checkOverlayPermission() // Moved to onResume/onWindowFocusChanged logic to ensure visibility
        hideSystemUI()

        webView = WebView(this)
        setContentView(webView)

        setupWebView()
        
        // CRITICAL FIX: CACHE CLEAR DISABLED TO PREVENT ANR (System UI Freeze)
        // webView.clearCache(true) 
        // webView.clearHistory()
        // android.webkit.WebStorage.getInstance().deleteAllData()
        
        // FORCE REDIRECT TO VERCEL IF ENABLED
        if (USE_REMOTE_DEBUG) {
            Log.w("MainActivity", "⚠️ RUNNING IN REMOTE DEBUG MODE: $REMOTE_DEBUG_URL")
            webView.loadUrl(REMOTE_DEBUG_URL)
            return
        }

        // Load the React App (Local)
        // Load the React App
        // Load the React App
        // FORCE LOAD REMOTE URL
        // Load the React App (Local)
        // Load the React App
        // Load the React App
        // FORCE LOAD REMOTE URL
        Log.i("MainActivity", "🚀 Loading Remote URL: $REMOTE_DEBUG_URL")
        webView.loadUrl(REMOTE_DEBUG_URL)

        // --- HARDWARE LOCKS (IMMORTAL MODE) ---
        acquireSystemLocks()
        requestAudioFocus()
        
        // --- AUTO-UPDATE (OTA) ---
        startUpdateChecker()
    }

    private fun startUpdateChecker() {
        val updater = com.sobremidia.player.update.UpdateManager(this)
        updater.checkForUpdate()
        
        // Check every 1 hour
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            startUpdateChecker()
        }, 60 * 60 * 1000)
    }

    private fun acquireSystemLocks() {
        try {
            // 1. CPU Lock (Partial) - Keep CPU running even if screen dims (unlikely with FLAG_KEEP_SCREEN_ON but safe)
            val pm = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            wakeLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "SobreMidia:ImmortalLock")
            wakeLock?.acquire()
            Log.i("MainActivity", "🔒 CPU WakeLock Acquired")

            // 2. WiFi Lock - Prevent Radio Power Save
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            // WIFI_MODE_FULL_HIGH_PERF is deprecated in Q but still useful for legacy/compat
            wifiLock = wm.createWifiLock(android.net.wifi.WifiManager.WIFI_MODE_FULL_HIGH_PERF, "SobreMidia:WiFiPerf")
            wifiLock?.acquire()
            Log.i("MainActivity", "🔒 WiFi Lock Acquired")

        } catch (e: Exception) {
            Log.e("MainActivity", "Failed to acquire System Locks", e)
        }
    }

    private fun requestAudioFocus() {
        try {
            audioManager = getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            val result = audioManager?.requestAudioFocus(
                audioFocusChangeListener,
                android.media.AudioManager.STREAM_MUSIC,
                android.media.AudioManager.AUDIOFOCUS_GAIN
            )
            if (result == android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                Log.i("MainActivity", "🔊 Audio Focus GAINED (Immortal)")
            } else {
                Log.w("MainActivity", "⚠️ Audio Focus REQUEST FAILED")
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Failed to request Audio Focus", e)
        }
    }


    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        // Fix: Allow Universal Access to prevent "Origin/Security" White Screen blocks
        settings.allowUniversalAccessFromFileURLs = true
        settings.allowFileAccessFromFileURLs = true // Critical for file:// DB access
        settings.allowContentAccess = true
        
        // Cache Strategy: Use disk cache aggressively if offline
        settings.cacheMode = WebSettings.LOAD_DEFAULT 
        // settings.setAppCacheEnabled(true) // Deprecated and removed in recent Android versions
        // settings.setAppCachePath(applicationContext.cacheDir.absolutePath)
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        // Native Interface
        val bridge = WebAppInterface(this)
        bridge.setWebView(webView)
        webView.addJavascriptInterface(bridge, "NativePlayer")

        // Debugging handled in Chrome Client
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                Log.d("WebView", consoleMessage?.message() ?: "")
                return super.onConsoleMessage(consoleMessage)
            }
        }
        
        webView.webViewClient = object : WebViewClient() {

            override fun onReceivedSslError(view: WebView?, handler: android.webkit.SslErrorHandler?, error: android.net.http.SslError?) {
                val message = "SSL Error: " + error?.primaryError
                Log.e("WebView", message)
                
                // CRITICAL FIX: IGNORE ALL SSL ERRORS TO ENSURE PLAYBACK
                // User requirement: "Play Anyway"
                handler?.proceed() 
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
            }
            
            override fun shouldOverrideUrlLoading(view: WebView?, request: android.webkit.WebResourceRequest?): Boolean {
                return false // Allow WebView to handle the URL
            }

            override fun onReceivedError(view: WebView?, request: android.webkit.WebResourceRequest?, error: android.webkit.WebResourceError?) {
                super.onReceivedError(view, request, error)
                val errorCode = error?.errorCode ?: -1
                
                // IGNORE "Intent" ERRORS (-10) OFTEN CAUSED BY DEEP LINKS
                if (errorCode == -10) return

                if (request?.isForMainFrame == true) {
                     android.util.Log.e("WebView", "FATAL ERROR: $errorCode")
                     // We DO NOT show error screen anymore. We try to reload silent.
                     // view?.reload()
                }
            }

            // 3. Vercel Connection / HTTP Errors
            override fun onReceivedHttpError(
                view: WebView?, 
                request: android.webkit.WebResourceRequest?, 
                errorResponse: android.webkit.WebResourceResponse?
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                
                if (request?.isForMainFrame == true) {
                    val statusCode = errorResponse?.statusCode ?: 0
                    val reason = errorResponse?.reasonPhrase ?: "HTTP Error"
                    
                    if (statusCode == 404 && USE_REMOTE_DEBUG) {
                         android.util.Log.w("WebView", "⚠️ 404 Deployment Not Found. Falling back to LOCAL ASSETS.")
                         // Fallback logic could go here, but let's show the diagnostic as requested first
                         showDiagnosticScreen(
                             "VERCEL_ERROR ($statusCode)",
                             "Server Error: $reason",
                             "O endereço $REMOTE_DEBUG_URL retornou 404. Verifique se o deploy na Vercel está com status Ready."
                         )
                    } else if (statusCode >= 400) {
                        showDiagnosticScreen(
                             "HTTP_ERROR ($statusCode)",
                             "Server Error: $reason",
                             "O servidor recusou a conexão. Verifique os logs da Vercel."
                         )
                    }
                }
            }
        }
    }

    // 2. Asset Integrity Check
    private fun checkAssetsIntegrity(): Boolean {
        try {
            val assetsList = assets.list("public")
            if (assetsList != null && assetsList.contains("index.html")) {
                Log.i("MainActivity", "✅ ASSET_CHECK: index.html found.")
                return true
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "ASSET_CHECK_FAIL", e)
        }
        return false
    }

    // 4. Developer Friendly Error Screen
    private fun showDiagnosticScreen(code: String, technical: String, cause: String) {
        val html = """
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { background-color: #000; color: #fff; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
                .icon { font-size: 64px; color: #ef4444; margin-bottom: 20px; }
                h1 { font-size: 20px; margin-bottom: 30px; font-weight: bold; }
                .box { background: #18181b; border: 1px solid #ef4444; padding: 20px; border-radius: 8px; max-width: 90%; width: 400px; text-align: left; }
                .label { color: #ef4444; font-weight: bold; font-size: 10px; margin-bottom: 4px; display: block; letter-spacing: 1px; }
                .code { color: #fff; font-size: 14px; font-weight: bold; margin-bottom: 12px; display: block; word-break: break-all; }
                .tech { color: #666; font-size: 11px; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px; }
                .cause-box { margin-top: 10px; }
                .cause-text { color: #a1a1aa; font-size: 13px; }
                button { margin-top: 30px; background: #333; color: white; border: 1px solid #555; padding: 10px 20px; border-radius: 4px; font-family: monospace; }
            </style>
        </head>
        <body>
            <div class="icon">⚠️</div>
            <h1>O Player encontrou um problema</h1>
            <div class="box">
                 <span class="label">DIAGNOSTIC CODE:</span>
                 <span class="code">$code</span>
                 <div class="tech">$technical</div>
                 
                 <div class="cause-box">
                    <span class="label" style="color: #fbbf24">CAUSA PROVÁVEL:</span>
                    <div class="cause-text">$cause</div>
                 </div>
            </div>
            <button onclick="location.reload()">TENTAR NOVAMENTE</button>
        </body>
        </html>
        """
        runOnUiThread {
            webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
        }
    }

    private fun hideSystemUI() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUI()
            // KIOSK PINNING REMOVED BY USER REQUEST
            // startLockTask() caused crash loops on some devices.
        }
    }

    override fun onResume() {
        super.onResume()
        
        hideSystemUI()

        // SAFE INIT: Delay risky operations to allow UI to render first
        // This prevents crash loops if the system is sluggish
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            // Post-render setup if needed
        }, 3000) // 3 Seconds Delay
    }

    override fun onPause() {
        super.onPause()
    }


    override fun onBackPressed() {
        // Handle back button if needed
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            wakeLock?.let { if (it.isHeld) it.release() }
            wifiLock?.let { if (it.isHeld) it.release() }
            audioManager?.abandonAudioFocus(audioFocusChangeListener)
            Log.i("MainActivity", "🔓 System Locks Released")
        } catch (e: Exception) {
            // Ignore
        }
    }
}

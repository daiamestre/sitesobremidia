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

    // --- DIAGNOSTIC CONFIGURATION ---
    // Remote URL Failed (404). Reverting to LOCAL ASSETS (public/index.html).
    // This ensures the player works even if the website is offline.
    private val USE_REMOTE_DEBUG = false 
    private val REMOTE_DEBUG_URL = "https://sobremidiadesigner.vercel.app/" 

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Prevent Sleep (Watchdog)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        // Kiosk: Bypass Lock Screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                          android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }

        checkOverlayPermission()
        hideSystemUI()

        webView = WebView(this)
        setContentView(webView)

        setupWebView()
        
        // FORCE REDIRECT TO VERCEL IF ENABLED
        if (USE_REMOTE_DEBUG) {
            Log.w("MainActivity", "⚠️ RUNNING IN REMOTE DEBUG MODE: $REMOTE_DEBUG_URL")
            webView.loadUrl(REMOTE_DEBUG_URL)
            return
        }

        // Load the React App (Local)
        try {
            val assetsList = assets.list("public")
            if (assetsList != null && assetsList.contains("index.html")) {
                Log.i("MainActivity", "✅ SUCCESS: Asset found at public/index.html")
                webView.loadUrl("file:///android_asset/public/index.html")
            } else {
                Log.e("MainActivity", "CRITICAL: 'public/index.html' NOT FOUND!")
                webView.loadData("<html><body style='background:black;color:red;padding:20px'><h1>Falha Fatal</h1><p>Arquivo index.html nao encontrado.</p></body></html>", "text/html", "UTF-8")
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Error checking assets", e)
             webView.loadUrl("file:///android_asset/public/index.html") 
        }
    }

    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        settings.databaseEnabled = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        // Fix: Allow Universal Access to prevent "Origin/Security" White Screen blocks
        settings.allowUniversalAccessFromFileURLs = true
        settings.allowFileAccessFromFileURLs = true // Critical for file:// DB access
        settings.allowContentAccess = true
        
        // Cache Strategy: Use disk cache aggressively if offline
        settings.cacheMode = WebSettings.LOAD_DEFAULT 
        settings.setAppCacheEnabled(true) // Deprecated but useful for legacy WebViews
        settings.setAppCachePath(applicationContext.cacheDir.absolutePath)
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        // Native Interface
        webView.addJavascriptInterface(WebAppInterface(this), "NativePlayer")

        // Debugging handled in Chrome Client
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                Log.d("WebView", consoleMessage?.message() ?: "")
                return super.onConsoleMessage(consoleMessage)
            }
        }
        
        webView.webViewClient = object : WebViewClient() {
            private val watchdog = android.os.Handler(android.os.Looper.getMainLooper())
            private val reloadRunnable = Runnable {
                android.util.Log.e("WebView", "Watchdog triggered: Reloading stuck page...")
                webView.reload()
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                // Start 30s timer
                watchdog.removeCallbacks(reloadRunnable)
                watchdog.postDelayed(reloadRunnable, 30000)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Cancel timer
                watchdog.removeCallbacks(reloadRunnable)
            }
            
            override fun onReceivedError(view: WebView?, request: android.webkit.WebResourceRequest?, error: android.webkit.WebResourceError?) {
                super.onReceivedError(view, request, error)
                 // If error is fatal, let Watchdog or ErrorBoundary handle, or retry immediately
                android.util.Log.e("WebView", "Error received: ${error?.description}")
            }

            // Fallback for 404 (Deployment Not Found)
            override fun onReceivedHttpError(
                view: WebView?, 
                request: android.webkit.WebResourceRequest?, 
                errorResponse: android.webkit.WebResourceResponse?
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                val statusCode = errorResponse?.statusCode ?: 0
                if (statusCode == 404 && USE_REMOTE_DEBUG) {
                     android.util.Log.w("WebView", "⚠️ 404 Deployment Not Found. Falling back to LOCAL ASSETS.")
                     view?.post {
                         view.loadUrl("file:///android_asset/public/index.html")
                     }
                }
            }
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
        if (hasFocus) hideSystemUI()
    }

    override fun onResume() {
        super.onResume()
        // Signal Watchdog: WE ARE ALIVE
        val intent = Intent(this, com.sobremidia.player.service.PlayerService::class.java)
        intent.action = com.sobremidia.player.service.PlayerService.ACTION_RESUMED
        startService(intent)
        
        hideSystemUI()
    }

    override fun onPause() {
        super.onPause()
        // Signal Watchdog: WE LOST FOCUS - HELP!
        val intent = Intent(this, com.sobremidia.player.service.PlayerService::class.java)
        intent.action = com.sobremidia.player.service.PlayerService.ACTION_PAUSED
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun checkOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            AlertDialog.Builder(this)
                .setTitle("Permissão Necessária")
                .setMessage("Para funcionar corretamente como player, este aplicativo precisa de permissão para exibir sobreposição a outros aplicativos.\n\nToque em 'Ativar' para ir às configurações e habilitar essa permissão.")
                .setPositiveButton("Ativar") { _, _ ->
                    val intent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                    startActivityForResult(intent, 101)
                }
                .setNegativeButton("Cancelar", null)
                .setCancelable(false)
                .setCancelable(false)
                .show()
        }
    }

    override fun onBackPressed() {
        // Pseudo-Kiosk: Block Back Button
        // super.onBackPressed()
    }
}

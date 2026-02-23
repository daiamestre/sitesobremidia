package com.antigravity.player.ui

import android.app.ActivityManager
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.antigravity.core.util.Logger
import com.antigravity.player.R
import com.antigravity.player.util.MasterClockBridge
import com.antigravity.sync.service.SessionManager

/**
 * [MOTOR WEB ISOLADO] Atividade que roda no processo :web_engine.
 * Responsável por Widgets e Links Externos sem afetar o player principal.
 */
class WidgetActivity : AppCompatActivity() {

    private lateinit var wv1: WebView
    private lateinit var wv2: WebView
    private var activeWv: WebView? = null
    
    private val handler = Handler(Looper.getMainLooper())
    private val memoryMonitorTask = object : Runnable {
        override fun run() {
            checkMemoryUsage()
            handler.postDelayed(this, 10000) // Check every 10s
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_widget)
        
        wv1 = findViewById(R.id.widget_wv_1)
        wv2 = findViewById(R.id.widget_wv_2)
        
        setupWebView(wv1)
        setupWebView(wv2)
        
        // Ocultar barras do sistema na UI isolada também
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN 
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION 
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
        
        processIntent()
        handler.post(memoryMonitorTask)
    }

    private fun setupWebView(wv: WebView) {
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            databaseEnabled = true
        }
        
        wv.isVerticalScrollBarEnabled = false
        wv.isHorizontalScrollBarEnabled = false
        wv.setBackgroundColor(Color.TRANSPARENT)
        
        // Bridge de tempo sincronizado
        wv.addJavascriptInterface(MasterClockBridge(), "MasterClock")
        
        wv.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                injectAuth(view)
                Logger.i("WIDGET_ENGINE", "Loaded: $url")
            }
        }
    }

    private fun processIntent() {
        val url = intent.getStringExtra("url") ?: return
        val standbyWv = if (activeWv == wv1) wv2 else wv1
        
        Logger.i("WIDGET_ENGINE", "Switching to: $url")
        standbyWv.loadUrl(url)
        
        // Transição Zero-Gap dentro da Atividade Isolada
        standbyWv.visibility = View.VISIBLE
        activeWv?.visibility = View.GONE
        activeWv = standbyWv
    }

    private fun injectAuth(view: WebView?) {
        val script = """
            (function() {
                localStorage.setItem('supabase.auth.token', '${SessionManager.currentAccessToken}');
                localStorage.setItem('sb-token', '${SessionManager.currentAccessToken}');
                localStorage.setItem('player_screen_id', '${SessionManager.currentUserId}');
            })();
        """.trimIndent()
        view?.evaluateJavascript(script, null)
    }

    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        val command = intent?.getStringExtra("command")
        if (command == "FINISH") {
            Logger.i("WIDGET_ENGINE", "Finish signal received. Destroying activity.")
            finish()
        } else {
            processIntent()
        }
    }

    private fun checkMemoryUsage() {
        val runtime = Runtime.getRuntime()
        val usedMem = (runtime.totalMemory() - runtime.freeMemory()) / 1024 / 1024
        
        if (usedMem > 150) {
            Logger.w("WIDGET_ENGINE", "Memory Threshold Alert ($usedMem MB). Self-restarting.")
            System.gc()
            // Se ainda estiver alto após GC, finalizamos para reinício via processo
            if (usedMem > 200) finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(memoryMonitorTask)
        wv1.destroy()
        wv2.destroy()
    }
}

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

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        checkOverlayPermission()
        
        // Hide System UI for Fullscreen
        hideSystemUI()

        webView = WebView(this)
        setContentView(webView)

        setupWebView()
        
        // Lock Task Mode (Kiosk) - Uncomment if you have Device Admin rights or are a dedicated device
        // startLockTask() 
        
        // Load the React App
        // NOTE: This assumes 'npm run build' has been run and asserts copied to assets/www
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        
        // Hardware Acceleration
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
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Inject initialization code if needed
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
                .show()
        }
    }
}

package com.antigravity.player.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.content.pm.ActivityInfo
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.antigravity.player.MainActivity
import com.antigravity.player.UserApplication
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.DeviceTypeUtil
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // [ADAPTIVE UI] Detect hardware and force appropriate orientation
        val isTV = DeviceTypeUtil.isTelevision(applicationContext)
        requestedOrientation = if (isTV) {
            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
        
        setContentView(com.antigravity.player.R.layout.activity_splash)
        
        // Ensure DI is ready
        ServiceLocator.init(applicationContext) 
        
        checkOverlayPermission()
    }

    private var isRequestingPermission = false
    private var routingStarted = false

    private val overlayPermissionLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) {
        // User returned from settings, check again
        isRequestingPermission = false
        checkOverlayPermission()
    }

    private fun checkOverlayPermission() {
        if (routingStarted) return

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            if (!android.provider.Settings.canDrawOverlays(this)) {
                if (!isRequestingPermission) {
                    isRequestingPermission = true
                    val intent = android.content.Intent(
                        android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        android.net.Uri.parse("package:$packageName")
                    )
                    overlayPermissionLauncher.launch(intent)
                }
                return
            }
        }
        
        // Permission granted or not needed, proceed with routing
        if (!routingStarted) {
            routingStarted = true
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                checkRouting()
            }, 1000)
        }
    }

    override fun onResume() {
        super.onResume()
        // Safety: If user returned and ActivityResult didn't fire, check again
        if (!routingStarted && !isRequestingPermission) {
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                checkOverlayPermission()
            }, 500)
        }
    }

    private fun checkRouting() {
        val auth = ServiceLocator.authRepository
        val prefs = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
        val savedScreenId = prefs.getString("saved_screen_id", null)

        // Make it async to allow network calls (refresh token)
        lifecycleScope.launch {
            // Restore Session from Secure Storage (Disk) -> Auto Refresh if needed
            // [HARDENING] Safety Timeout to prevent Splash Hang
            val isSessionValid = withTimeoutOrNull(15000) {
                auth.restoreSession(applicationContext)
            } ?: false
            
            com.antigravity.core.util.Logger.i("BOOT", "Routing Check: SessionValid=$isSessionValid, SavedScreen=$savedScreenId")

            val intent = if (!isSessionValid) {
                Intent(this@SplashActivity, LoginActivity::class.java)
            } else if (savedScreenId == null) {
                Intent(this@SplashActivity, ScreenSelectionActivity::class.java)
            } else {
                Intent(this@SplashActivity, com.antigravity.player.MainActivity::class.java)
            }
            
            startActivity(intent)
            finish()
        }
    }

    // Orientation is now locked in Manifest/Splash for initialization stability.
}

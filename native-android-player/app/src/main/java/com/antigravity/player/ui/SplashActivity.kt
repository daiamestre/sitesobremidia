package com.antigravity.player.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.antigravity.player.MainActivity
import com.antigravity.player.di.ServiceLocator

class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(com.antigravity.player.R.layout.activity_splash)
        
        // Ensure DI is ready
        ServiceLocator.init(applicationContext) 
        
        // Delay 2s then Check Permissions
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            checkOverlayPermission()
        }, 2000)
    }

    private fun checkOverlayPermission() {
        if (!android.provider.Settings.canDrawOverlays(this)) {
            android.widget.Toast.makeText(this, "Permissão necessária: Sobreposição de tela", android.widget.Toast.LENGTH_LONG).show()
            
            val intent = Intent(
                android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:$packageName")
            )
            // Add flag to ensure it opens a new task
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            
            // Close app so user restarts after granting
            finish() 
        } else {
            checkRouting()
        }
    }

    private fun checkRouting() {
        val auth = ServiceLocator.authRepository
        val prefs = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
        
        // Restore Session from Disk
        val savedToken = prefs.getString("auth_token", null)
        val savedUserId = prefs.getString("auth_user_id", null)
        
        if (savedToken != null) {
            com.antigravity.sync.service.SessionManager.currentAccessToken = savedToken
            com.antigravity.sync.service.SessionManager.currentUserId = savedUserId
        }

        val savedScreenId = prefs.getString("saved_screen_id", null)

        val intent = if (!auth.isUserLoggedIn()) {
            Intent(this, LoginActivity::class.java)
        } else if (savedScreenId == null) {
            Intent(this, ScreenSelectionActivity::class.java)
        } else {
            Intent(this, MainActivity::class.java)
        }
        
        startActivity(intent)
        finish()
    }
}

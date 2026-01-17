package com.sobremidia.player.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.sobremidia.player.MainActivity

class PlayerService : Service() {

    companion object {
        const val CHANNEL_ID = "PlayerServiceChannel"
        const val NOTIFICATION_ID = 1
        const val ACTION_PAUSED = "com.sobremidia.player.PAUSED"
        const val ACTION_RESUMED = "com.sobremidia.player.RESUMED"
    }

    private var isAppInForeground = false
    private var retryCount = 0
    private val handler = Handler(Looper.getMainLooper())
    private var windowManager: WindowManager? = null
    private var overlayView: View? = null

    // Configuration
    private val MAX_RETRIES = 3 // Adjusted for Fire OS Stability
    private val RETRY_INTERVAL_MS = 3000L
    private val BACKOFF_INTERVAL_MS = 60000L

    private val rescueRunnable = object : Runnable {
        override fun run() {
            if (isAppInForeground) {
                removeOverlay()
                retryCount = 0
                return
            }

            android.util.Log.w("PlayerService", "Watchdog Rescue Attempt: $retryCount")
            
            // 1. Show Blocking Overlay if not visible
            showOverlay()

            // 2. Try to launch App
            bringAppToFront()

            // 3. Schedule next attempt
            retryCount++
            
            if (retryCount <= MAX_RETRIES) {
                handler.postDelayed(this, RETRY_INTERVAL_MS)
            } else {
                android.util.Log.e("PlayerService", "Max retries reached. Entering Backoff Mode (60s).")
                // Keep overlay, wait 60s, then restart cycle
                handler.postDelayed({
                    retryCount = 0
                    handler.post(this) // Restart immediately after backoff
                }, BACKOFF_INTERVAL_MS)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSED -> {
                android.util.Log.d("PlayerService", "App Paused. Starting Watchdog...")
                isAppInForeground = false
                retryCount = 0
                handler.removeCallbacks(rescueRunnable)
                // Relaxed Grace Period: 5 minutes (was 60s) to allow Vercel deploy propagation
                handler.postDelayed(rescueRunnable, 300000)
            }
            ACTION_RESUMED -> {
                android.util.Log.d("PlayerService", "App Resumed. Stopping Watchdog.")
                isAppInForeground = true
                retryCount = 0
                handler.removeCallbacks(rescueRunnable)
                removeOverlay()
            }
        }
        return START_STICKY
    }

    private fun bringAppToFront() {
        try {
            val intent = Intent(this, MainActivity::class.java)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT) // Try to bring existing task
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            startActivity(intent)
        } catch (e: Exception) {
            android.util.Log.e("PlayerService", "Failed to launch app: ${e.message}")
        }
    }

    private fun showOverlay() {
        if (overlayView != null) return // Already shown
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !android.provider.Settings.canDrawOverlays(this)) {
            android.util.Log.w("PlayerService", "Cannot draw overlay: Permission missing")
            return
        }

        try {
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                else
                    WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                        WindowManager.LayoutParams.FLAG_FULLSCREEN,
                PixelFormat.TRANSLUCENT
            )
            // Fix: Force Landscape to prevent "Orientation Conflict" crash on some TV Boxes
            params.screenOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            params.gravity = Gravity.CENTER

            // Create a simple black view with text
            val layout = FrameLayout(this)
            layout.setBackgroundColor(Color.BLACK)
            
            val text = TextView(this)
            text.text = "🔒 SISTEMA PROTEGIDO 🔒\nRetornando ao Player..."
            text.setTextColor(Color.WHITE)
            text.textSize = 24f
            text.gravity = Gravity.CENTER
            
            layout.addView(text, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            ))

            windowManager?.addView(layout, params)
            overlayView = layout
        } catch (e: Exception) {
            android.util.Log.e("PlayerService", "Error showing overlay: ${e.message}")
        }
    }

    private fun removeOverlay() {
        if (overlayView != null) {
            try {
                windowManager?.removeView(overlayView)
                overlayView = null
            } catch (e: Exception) {
                // Ignore
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SobreMidia Watchdog")
            .setContentText("Serviço de Proteção Ativo")
            .setSmallIcon(android.R.drawable.ic_secure)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Watchdog Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }
}

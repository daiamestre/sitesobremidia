
package com.antigravity.player.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import com.antigravity.player.MainActivity

class KeepAliveService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private val checkInterval = 5000L // Check every 5 seconds

    private val checkRunnable = object : Runnable {
        override fun run() {
            checkAndRelaunch()
            handler.postDelayed(this, checkInterval)
        }
    }

    override fun onCreate() {
        super.onCreate()
        startForeground(1, createNotification())
        handler.post(checkRunnable)
    }

    private var launchCount = 0
    private var lastLaunchTime = 0L
    private val SAFETY_WINDOW_MS = 60000L // 1 Minute
    private val MAX_RETRIES = 3

    private fun checkAndRelaunch() {
        val now = System.currentTimeMillis()
        if (now - lastLaunchTime > SAFETY_WINDOW_MS) {
            // Reset counter after 1 minute of stability
            launchCount = 0
            lastLaunchTime = now
        }

        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val myPackage = packageName
        
        // Smart Check: Are we already on top?
        var isForeground = false
        try {
            val appProcesses = activityManager.runningAppProcesses
            if (appProcesses != null) {
                for (appProcess in appProcesses) {
                    if (appProcess.processName == myPackage) {
                        if (appProcess.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
                            isForeground = true
                        }
                        break
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("KeepAlive", "Error checking process state", e)
        }

        if (!isForeground) {
            // CIRCUIT BREAKER TRIGGER
            if (launchCount >= MAX_RETRIES) {
                Log.e("KeepAlive", "KIOSK PANIC: Boot loop detected. Disabling Kiosk Mode.")
                stopSelf() // Kill service to stop loop
                return
            }
            
            launchCount++
            Log.d("KeepAlive", "App backgrounded ($launchCount/$MAX_RETRIES). Bringing to front...")
            
            try {
                val intent = Intent(applicationContext, MainActivity::class.java)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) 
                intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP) 
                startActivity(intent)
            } catch (e: Exception) {
                Log.e("KeepAlive", "Failed to relaunch: ${e.message}")
            }
        } else {
            // Healthy, reset slightly more aggressively if we are staying stable? 
            // No, strictly time based is safer.
        }
    }

    private fun createNotification(): Notification {
        val channelId = "kiosk_channel"
        val channelName = "Kiosk Service"
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_LOW)
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        return android.app.Notification.Builder(this, channelId)
            .setContentTitle("Sobre Mídia Player")
            .setContentText("Serviço de Player Ativo")
            .setSmallIcon(android.R.drawable.ic_media_play) 
            .build()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY // Restart if killed
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        handler.removeCallbacks(checkRunnable)
        super.onDestroy()
        // If destroyed (e.g. by system), try to restart immediately
        val broadcastIntent = Intent("com.antigravity.player.RESTART_SERVICE")
        sendBroadcast(broadcastIntent)
    }
}

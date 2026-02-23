package com.antigravity.player.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.content.IntentFilter
import androidx.core.app.NotificationCompat
import com.antigravity.core.util.Logger
import android.content.BroadcastReceiver
import android.annotation.SuppressLint
import com.antigravity.player.R

class SelfHealingService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private val bootTime = System.currentTimeMillis()
    private var hasVerifiedInitialFocus = false
    private var isMaintenanceMode = false
    private var focusLossCounter = 0

    private val maintenanceReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.antigravity.player.ACTION_MAINTENANCE_MODE") {
                isMaintenanceMode = intent.getBooleanOfDefault("is_active", false)
                if (isMaintenanceMode) {
                    Logger.w("SELF_HEALING", "Blindagem Suspensa: Modo Manutenção Ativo.")
                } else {
                    Logger.i("SELF_HEALING", "Blindagem Retomada: Modo Manutenção Encerrado.")
                    focusLossCounter = 0
                }
            }
        }
        
        // Helper to avoid Boolean mapping issues
        private fun Intent.getBooleanOfDefault(key: String, default: Boolean): Boolean {
            return getBooleanExtra(key, default)
        }
    }

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            if (!isMaintenanceMode) {
                // [ADVANCED KIOSK] Foreground Guarantee (Initial 10s)
                if (!hasVerifiedInitialFocus && System.currentTimeMillis() - bootTime > 10_000L) {
                    Logger.i("KIOSK", "Verificação de foco pós-boot (10s).")
                    checkFocus()
                    hasVerifiedInitialFocus = true
                } else {
                    checkFocus()
                }
            }
            handler.postDelayed(this, 2000L) // Polling a cada 2s (Protocolo Retorno Soberano)
        }
    }

    private fun checkFocus() {
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        @Suppress("DEPRECATION")
        val tasks = am.getRunningTasks(1)
        
        if (tasks.isNotEmpty()) {
            val topActivity = tasks[0].topActivity
            if (topActivity?.packageName != packageName) {
                focusLossCounter++
                Logger.w("KIOSK", "Foco ausente (${focusLossCounter * 2}s). Detectado: ${topActivity?.packageName}")
                
                // [RETORNO SOBERANO] Gatilho de 8 segundos (4 ciclos de 2s)
                if (focusLossCounter >= 4) {
                    Logger.e("KIOSK", "RETORNO SOBERANO: Forçando foco após 8s de ausência.")
                    forceFocusToFront(am)
                    focusLossCounter = 0
                }
            } else {
                // Reset counter if app is in focus
                if (focusLossCounter > 0) {
                    Logger.i("KIOSK", "Foco recuperado.")
                    focusLossCounter = 0
                }
            }
        }
    }

    private fun forceFocusToFront(am: ActivityManager) {
        val tasks = am.appTasks
        for (task in tasks) {
            val taskInfo = task.taskInfo
            
            // baseActivity/topActivity in RecentTaskInfo require API 23
            val componentName = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                taskInfo.baseActivity
            } else {
                null // Fallback for API < 23
            }

            if (componentName == null || componentName.packageName == packageName) {
                Logger.i("KIOSK", "Movendo Sobre Mídia Player para o topo (REORDER_TO_FRONT)")
                task.moveToFront()
                return
            }
        }
        
        // Fallback: Full relaunch with aggressive flags
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        }
        if (intent != null) startActivity(intent)
    }

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    override fun onCreate() {
        super.onCreate()
        startForegroundService()
        
        // Register maintenance listener with exported/non-exported flags for Android 13+
        val filter = IntentFilter("com.antigravity.player.ACTION_MAINTENANCE_MODE")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(maintenanceReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(maintenanceReceiver, filter)
        }
        
        handler.post(heartbeatRunnable)
        Logger.i("SELF_HEALING", "Protocolo Retorno Soberano Ativo (Polling 2s)")
    }

    private fun startForegroundService() {
        val channelId = "self_healing_service"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Auto-Recuperação (Self-Healing)",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Sobre Mídia Player")
            .setContentText("Sistema de auto-recuperação ativo.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        startForeground(102, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(maintenanceReceiver)
        handler.removeCallbacks(heartbeatRunnable)
        Logger.w("SELF_HEALING", "Sistema de auto-recuperação encerrado.")
    }
}

package com.antigravity.player.service

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.antigravity.core.util.Logger
import java.io.File

/**
 * [ADVANCED KIOSK] Thermal Watchdog
 * Monitors CPU temperature to prevent 'keeps stopping' errors on overheated TV Boxes.
 */
class ThermalGuard(private val context: Context) {

    private val handler = Handler(Looper.getMainLooper())
    private var isMonitoring = false
    private val checkInterval = 30_000L // 30s
    private val criticalTemp = 75.0f

    private val monitorRunnable = object : Runnable {
        override fun run() {
            if (!isMonitoring) return
            val temp = readCpuTemperature()
            if (temp >= criticalTemp) {
                handleOverheating(temp)
            } else if (isOverheating) {
                restoreNormalOperation()
            }
            handler.postDelayed(this, checkInterval)
        }
    }

    fun startMonitoring() {
        if (isMonitoring) return
        isMonitoring = true
        handler.post(monitorRunnable)
        Logger.i("THERMAL", "Monitor de temperatura iniciado (Limite: ${criticalTemp}°C)")
    }

    fun stopMonitoring() {
        isMonitoring = false
        handler.removeCallbacks(monitorRunnable)
    }

    private var isOverheating = false

    private fun handleOverheating(temp: Float) {
        if (isOverheating) return
        isOverheating = true
        Logger.w("THERMAL", "ALERTA: Temperatura crítica detectada: ${temp}°C. Reduzindo brilho para cooling...")
        
        val activity = context as? android.app.Activity
        activity?.runOnUiThread {
            try {
                val window = activity.window
                val layoutParams = window.attributes
                layoutParams.screenBrightness = 0.2f // 20% brightness
                window.attributes = layoutParams
            } catch (e: Exception) {
               Logger.e("THERMAL", "Failed to reduce brightness: ${e.message}") 
            }
        }
    }

    private fun restoreNormalOperation() {
        if (!isOverheating) return
        isOverheating = false
        Logger.i("THERMAL", "Temperatura normalizada. Restaurando brilho original.")
        
        val activity = context as? android.app.Activity
        activity?.runOnUiThread {
            try {
                val window = activity.window
                val layoutParams = window.attributes
                layoutParams.screenBrightness = android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE // Restore System brightness
                window.attributes = layoutParams
            } catch (e: Exception) {
               Logger.e("THERMAL", "Failed to restore brightness: ${e.message}") 
            }
        }
    }

    private fun readCpuTemperature(): Float {
        val thermalPaths = listOf(
            "/sys/class/thermal/thermal_zone0/temp",
            "/sys/class/thermal/thermal_zone1/temp",
            "/sys/devices/virtual/thermal/thermal_zone0/temp"
        )
        for (path in thermalPaths) {
            try {
                val file = File(path)
                if (file.exists() && file.canRead()) {
                    val raw = file.readText().trim().toDoubleOrNull() ?: continue
                    return if (raw > 1000) (raw / 1000.0).toFloat() else raw.toFloat()
                }
            } catch (e: Exception) {
                continue
            }
        }
        return 0f
    }
}

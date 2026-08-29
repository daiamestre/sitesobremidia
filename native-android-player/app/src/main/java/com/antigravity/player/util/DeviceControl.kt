package com.antigravity.player.util

import android.app.Activity
import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.UserManager
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

object DeviceControl {

    /**
     * [EXIT COUNTER P0] Janela temporal em que saidas NAO devem ser contadas
     * como abandono do usuario (ex.: abertura do instalador OTA, retorno de
     * configuracao necessaria do proprio Player). 0 = sem supressao.
     */
    @JvmStatic
    @Volatile
    var suppressExitCountUntilMs: Long = 0L

    fun enableKioskMode(activity: Activity) {
        // 1. Keep Screen On
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 2. Immersive Mode (Hide Bars)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity.window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            activity.window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            )
        }

        // 3. Lock Task Mode (if Device Owner) - True Kiosk
        if (isDeviceOwner(activity)) {
            try {
                activity.startLockTask()
            } catch (e: Exception) {
                // Lock task mode not available or already active
            }
        }
    }


    fun disableKioskMode(activity: Activity) {
        // 1. Clear Keep Screen On
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 2. Restore System Bars
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity.window.insetsController?.let { controller ->
                controller.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
            }
        } else {
            @Suppress("DEPRECATION")
            activity.window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            )
        }

        // 3. Stop Lock Task Mode
        if (isDeviceOwner(activity)) {
            try {
                activity.stopLockTask()
            } catch (e: Exception) {
                // Ignore
            }
        }
    }

    /**
     * Check if this app is the Device Owner (required for true Lock Task Mode)
     */
    fun isDeviceOwner(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return false
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        val componentName = ComponentName(context, com.antigravity.player.receiver.AdminReceiver::class.java)
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    /**
     * Check if Lock Task Mode is supported and permitted
     */
    fun isLockTaskPermitted(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return false
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        return dpm.isLockTaskPermitted(context.packageName)
    }

    /**
     * Enable Lock Task Mode programmatically (requires Device Owner)
     */
    fun enableLockTaskMode(activity: Activity): Boolean {
        if (isDeviceOwner(activity)) {
            try {
                activity.startLockTask()
                return true
            } catch (e: Exception) {
                return false
            }
        }
        return false
    }

    fun isAllFilesAccessGranted(context: android.content.Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.os.Environment.isExternalStorageManager()
        } else {
            true
        }
    }

    fun requestAllFilesAccess(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val intent = android.content.Intent(
                android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                android.net.Uri.parse("package:${activity.packageName}")
            )
            activity.startActivityForResult(intent, 1002)
        }
    }

    // ========================================================================
    // [SIGNAGE NOTIFICATION SHIELD - FASE NOTIFICACOES]
    // Mecanismo OFICIAL (NotificationManager.InterruptionFilter / "Nao Perturbe").
    // Escopado a operacao signage deste aparelho: o filtro anterior e sempre
    // restaurado ao entrar em modo manutencao/desvincular. NAO altera nada
    // global de forma permanente e nao exige servicos invasivos.
    // Requer consentimento UNICO do operador (Notification Policy Access).
    // ========================================================================

    fun isNotificationPolicyAccessGranted(context: Context): Boolean {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        return nm.isNotificationPolicyAccessGranted
    }

    fun requestNotificationPolicyAccess(activity: Activity) {
        try {
            activity.startActivity(Intent(android.provider.Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
        } catch (e: Exception) {
            android.util.Log.w("DeviceControl", "Notification policy settings unavailable: ${e.message}")
        }
    }

    /** Bloqueia heads-up notifications enquanto o Player opera. Retorna false se sem consentimento. */
    fun suppressHeadsUpNotifications(activity: Activity): Boolean {
        val nm = activity.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        if (!nm.isNotificationPolicyAccessGranted) return false
        return try {
            nm.setInterruptionFilter(android.app.NotificationManager.INTERRUPTION_FILTER_NONE)
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Restaura um filtro previamente capturado (UNKNOWN -> ALL). */
    fun restoreInterruptionFilter(activity: Activity, previousFilter: Int): Boolean {
        val nm = activity.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        if (!nm.isNotificationPolicyAccessGranted) return false
        val target = if (previousFilter == android.app.NotificationManager.INTERRUPTION_FILTER_UNKNOWN) {
            android.app.NotificationManager.INTERRUPTION_FILTER_ALL
        } else {
            previousFilter
        }
        return try {
            nm.setInterruptionFilter(target)
            true
        } catch (e: Exception) {
            false
        }
    }

    fun getOrCreateDeviceId(context: android.content.Context): String {        val prefs = context.getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
        val saved = prefs.getString("saved_screen_id", null)
        
        // 1. Return existing if valid (and not UNKNOWN)
        if (!saved.isNullOrEmpty() && saved != "UNKNOWN_DEVICE" && saved != "UNKNOWN") {
            return saved
        }

        // 2. Try ANDROID_ID
        var uniqueId = try {
            android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID)
        } catch (e: Exception) {
            null
        }

        // 3. Fallback to UUID if ANDROID_ID is null/bad/emulator-bug
        if (uniqueId.isNullOrEmpty() || uniqueId == "9774d56d682e549c" || uniqueId.length < 5) {
            // "9774d56d682e549c" is a known broken ID on some emulators
            uniqueId = java.util.UUID.randomUUID().toString()
            android.util.Log.w("DeviceControl", "Generated UUID fallback: $uniqueId")
        }

        // 4. Return without saving to allow SplashActivity to route to ScreenSelection
        return uniqueId!!
    }

    /**
     * [DEVICE IDENTITY - HARDENING P0]
     * Identidade de hardware estável e não reversível, derivada de
     * ANDROID_ID + fingerprint do build via SHA-256.
     *
     * Diferente do getOrCreateDeviceId (que resolve o screen_id lógico),
     * esta identidade identifica o APARELHO FÍSICO e é vinculada a
     * screen+tenant no backend (tabela devices / fn_device_bind).
     *
     * NUNCA logar este valor.
     */
    fun getHardwareIdentity(context: android.content.Context): String {
        val androidId = try {
            android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID)
        } catch (e: Exception) {
            null
        } ?: "unknown"
        val fingerprint = android.os.Build.FINGERPRINT ?: "unknown"
        val raw = "sobremidia::device::$androidId::$fingerprint"
        return try {
            val digest = java.security.MessageDigest.getInstance("SHA-256")
                .digest(raw.toByteArray(Charsets.UTF_8))
            digest.joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            // Fallback determinístico nunca expõe o ANDROID_ID bruto
            raw.hashCode().toString(16).padStart(16, '0')
        }
    }
}

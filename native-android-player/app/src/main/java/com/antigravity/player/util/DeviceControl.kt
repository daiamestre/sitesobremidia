package com.antigravity.player.util

import android.app.Activity
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager

object DeviceControl {

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

    fun getOrCreateDeviceId(context: android.content.Context): String {
        val prefs = context.getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
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

        // 4. Save
        prefs.edit().putString("saved_screen_id", uniqueId).apply()
        return uniqueId!!
    }
}

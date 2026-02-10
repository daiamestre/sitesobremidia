package com.antigravity.player.util

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Process
import com.antigravity.player.MainActivity
import java.lang.Thread.UncaughtExceptionHandler
import kotlin.system.exitProcess

/**
 * Watchdog: Intercepts fatal crashes and restarts the app automatically.
 * Ensures 24/7 availability even if a bug occurs.
 */
class CrashHandler(private val context: Context) : UncaughtExceptionHandler {

    private val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        // 1. Log the crash (In real app, save to file/Sentry)
        throwable.printStackTrace()

        // 2. Restart the application after 2 seconds
        triggerRestart()

        // 3. Kill the current broken process
        Process.killProcess(Process.myPid())
        exitProcess(10)
    }

    private fun triggerRestart() {
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        }
        
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent, 
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.set(AlarmManager.RTC, System.currentTimeMillis() + 2000, pendingIntent)
    }

    companion object {
        fun init(context: Context) {
            Thread.setDefaultUncaughtExceptionHandler(CrashHandler(context))
        }
    }
}

package com.antigravity.player.util

import android.content.Context
import com.antigravity.player.di.ServiceLocator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object GlobalErrorReporter {
    
    fun install(context: Context) {
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            // Capture Error
            report(context, throwable)
            
            // Allow default crash behavior (so Android restarts the app)
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }

    fun report(context: Context, throwable: Throwable, type: String = "CRASH") {
        val repository = ServiceLocator.getRepository(context)
        val message = throwable.message ?: "Unknown Error"
        val stackTrace = throwable.stackTraceToString()
        
        // [FORENSIC] 1. HUGE LOGCAT BREADCRUMB (Always visible in Logcat)
        android.util.Log.e("ANTIGRAVITY_FORENSIC", "\n\n" + """
            **************************************************************
            !!! CRITICAL CRASH DETECTED !!!
            TYPE: $type
            MSG: $message
            --------------------------------------------------------------
            $stackTrace
            **************************************************************
        """.trimIndent() + "\n\n")

        // [FORENSIC] 2. MULTI-PATH DISK LOGGING
        val logContent = """
            =========================================
            REPORT TIMESTAMP: ${java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())}
            TYPE: $type
            MSG: $message
            -----------------------------------------
            $stackTrace
            =========================================
            
        """.trimIndent()

        val pathsToTry = listOf(
            context.getExternalFilesDir(null), // Android/data/...
            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOCUMENTS),
            context.filesDir // /data/user/0/... (Internal)
        )

        for (dir in pathsToTry) {
            if (dir == null) continue
            try {
                if (!dir.exists()) dir.mkdirs()
                val logFile = java.io.File(dir, "log_erro.txt")
                logFile.appendText(logContent)
                android.util.Log.i("ANTIGRAVITY_FORENSIC", "Log saved successfully to: ${logFile.absolutePath}")
            } catch (e: Exception) {
                android.util.Log.w("ANTIGRAVITY_FORENSIC", "Failed to save log to ${dir.absolutePath}: ${e.message}")
            }
        }

        // Asynchronous remote report
        CoroutineScope(Dispatchers.IO).launch {
            try {
                repository.reportRemoteError(
                    type = type,
                    message = message,
                    stackTrace = stackTrace,
                    stats = mapOf(
                        "thread" to Thread.currentThread().name,
                        "sdk_version" to android.os.Build.VERSION.SDK_INT
                    )
                )
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}

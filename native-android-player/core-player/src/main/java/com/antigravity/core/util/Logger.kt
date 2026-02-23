package com.antigravity.core.util

import android.util.Log

/**
 * Centralized Logger for the Player.
 * Wraps Android Log and allows for future remote logging (Sentry/Supabase).
 */
object Logger {
    private const val TAG_PREFIX = "Antigravity_"

    fun d(tag: String, message: String) {
        Log.d("$TAG_PREFIX$tag", message)
    }

    fun i(tag: String, message: String) {
        Log.i("$TAG_PREFIX$tag", message)
    }

    fun w(tag: String, message: String, e: Throwable? = null) {
        Log.w("$TAG_PREFIX$tag", message, e)
    }

    fun e(tag: String, message: String, e: Throwable? = null) {
        Log.e("$TAG_PREFIX$tag", message, e)
        // TODO: Send to Remote Crash Reporting (Sentry/Supabase)
    }
}

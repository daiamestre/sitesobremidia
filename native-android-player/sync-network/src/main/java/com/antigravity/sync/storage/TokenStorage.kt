package com.antigravity.sync.storage

import android.content.Context
import android.content.SharedPreferences

/**
 * Persists Auth Tokens securely (Mode Private).
 * In a real banking app, use EncryptedSharedPreferences.
 */
class TokenStorage(context: Context) {
    
    private val prefs: SharedPreferences = context.getSharedPreferences("secure_auth_prefs", Context.MODE_PRIVATE)
    
    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_UUID = "system_uuid"
        private const val KEY_EXPIRES_AT = "expires_at"
    }

    fun saveSession(accessToken: String, refreshToken: String?, userId: String, expiresIn: Long) {
        val expiresAt = System.currentTimeMillis() + (expiresIn * 1000)
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putString(KEY_USER_ID, userId)
            .putLong(KEY_EXPIRES_AT, expiresAt)
            .apply()
    }

    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)
    
    fun getRefreshToken(): String? = prefs.getString(KEY_REFRESH_TOKEN, null)
    
    fun getUserId(): String? = prefs.getString(KEY_USER_ID, null)

    fun saveUUID(uuid: String) {
        prefs.edit().putString(KEY_UUID, uuid).apply()
    }

    fun getUUID(): String? = prefs.getString(KEY_UUID, null)
    
    fun isTokenExpired(): Boolean {
        val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0)
        // Buffer of 5 minutes
        return System.currentTimeMillis() > (expiresAt - 300_000)
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}

package com.antigravity.sync.storage

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * [SECURITY HARDENING P0/P1]
 * Persists Auth Tokens com criptografia AES-GCM via Android Keystore
 * (EncryptedSharedPreferences). Substitui as SharedPreferences planas.
 *
 * Requisitos: minSdk 23 (Android 6.0+).
 * Se a criptografia falhar, os tokens NÃO são persistidos (falha segura —
 * nunca fazemos fallback para armazenamento em claro).
 */
class TokenStorage(context: Context) {

    private val prefs = createEncryptedPrefs(context)

    companion object {
        private const val PREFS_NAME = "secure_auth_prefs_v2"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_UUID = "system_uuid"
        private const val KEY_SCREEN_UUID = "screen_uuid"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val TAG = "TokenStorage"

        private fun createEncryptedPrefs(context: Context): android.content.SharedPreferences {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            return EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }
    }

    fun saveSession(accessToken: String, refreshToken: String?, userId: String, expiresIn: Long) {
        val expiresAt = System.currentTimeMillis() + (expiresIn * 1000)
        try {
            prefs.edit()
                .putString(KEY_ACCESS_TOKEN, accessToken)
                .putString(KEY_REFRESH_TOKEN, refreshToken)
                .putString(KEY_USER_ID, userId)
                .putLong(KEY_EXPIRES_AT, expiresAt)
                .apply()
        } catch (e: Exception) {
            Log.e(TAG, "Encrypted saveSession FAILED. Tokens NOT persisted (fail-safe).", e)
        }
    }

    fun getAccessToken(): String? = safeRead { prefs.getString(KEY_ACCESS_TOKEN, null) }

    fun getRefreshToken(): String? = safeRead { prefs.getString(KEY_REFRESH_TOKEN, null) }

    fun getUserId(): String? = safeRead { prefs.getString(KEY_USER_ID, null) }

    fun saveUUID(uuid: String) {
        safeWrite { prefs.edit().putString(KEY_UUID, uuid).apply() }
    }

    fun getUUID(): String? = safeRead { prefs.getString(KEY_UUID, null) }

    /** Vincula a identidade lógica (screen UUID) ao device, criptografado. */
    fun saveScreenBinding(screenUuid: String) {
        safeWrite { prefs.edit().putString(KEY_SCREEN_UUID, screenUuid).apply() }
    }

    fun getScreenUuid(): String? = safeRead { prefs.getString(KEY_SCREEN_UUID, null) }

    fun isTokenExpired(): Boolean {
        val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0)
        // Buffer of 5 minutes
        return System.currentTimeMillis() > (expiresAt - 300_000)
    }

    fun clear() {
        try {
            prefs.edit().clear().apply()
        } catch (e: Exception) {
            Log.e(TAG, "Encrypted clear FAILED.", e)
        }
    }

    // Fail-safe: qualquer falha de leitura criptográfica retorna null
    // (nunca expõe dados; a sessão é tratada como inexistente).
    private inline fun <T> safeRead(block: () -> T): T? {
        return try {
            block()
        } catch (e: Exception) {
            Log.e(TAG, "Encrypted read FAILED (returning null).", e)
            null
        }
    }

    private inline fun safeWrite(block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            Log.e(TAG, "Encrypted write FAILED.", e)
        }
    }
}
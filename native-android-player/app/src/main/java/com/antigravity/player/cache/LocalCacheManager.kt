package com.antigravity.player.cache

import android.content.Context
import android.content.SharedPreferences

class LocalCacheManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREF_NAME = "antigravity_cache"
        private const val KEY_CLIMA = "ultimo_clima_json"
    }

    /**
     * Salva o JSON completo do clima (do Dashboard ou Open-Meteo)
     */
    fun salvarClima(json: String) {
        prefs.edit().putString(KEY_CLIMA, json).apply()
    }

    /**
     * Recupera o último estado salvo
     */
    fun getUltimoClima(): String? {
        return prefs.getString(KEY_CLIMA, null)
    }
}

package com.antigravity.player.util

import org.json.JSONObject

object JsonParserUtil {

    /**
     * Extrai uma string de forma segura do JSON.
     * @param json O objeto JSON de origem.
     * @param key A chave a ser buscada.
     * @param fallback O valor retornado em caso nulo ou erro.
     * @return String limpa.
     */
    fun getString(json: JSONObject, key: String, fallback: String): String {
        return if (json.has(key) && !json.isNull(key)) {
            json.optString(key, fallback)
        } else {
            fallback
        }
    }

    /**
     * Extrai um Double de forma segura do JSON.
     * @param json O objeto JSON de origem.
     * @param key A chave a ser buscada.
     * @param fallback O valor retornado em caso de erro ou nulo.
     * @return Double validado.
     */
    fun getDouble(json: JSONObject, key: String, fallback: Double): Double {
        return if (json.has(key) && !json.isNull(key)) {
            json.optDouble(key, fallback)
        } else {
            fallback
        }
    }
    
    /**
     * Extrai um Boolean de forma segura do JSON.
     * @param json O objeto JSON de origem.
     * @param key A chave a ser buscada.
     * @param fallback O valor retornado em caso de erro.
     * @return Boolean validado.
     */
    fun getBoolean(json: JSONObject, key: String, fallback: Boolean): Boolean {
         return if (json.has(key) && !json.isNull(key)) {
            json.optBoolean(key, fallback)
        } else {
            fallback
        }
    }
}

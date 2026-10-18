package com.antigravity.player.util

import com.antigravity.core.util.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * [REGIONAL CONTEXT MANAGER]
 * Fetches geolocation data (City, State/Region, Timezone) based on the device's IP.
 * Crucial for Android TV boxes that lack physical GPS chips.
 * Caches the result in memory to provide offline fallback during 24/7 widget rotation.
 */
object RegionalContextManager {
    
    var city: String = "Unknown"
        private set
        
    var state: String = "Unknown"
        private set
        
    var timezone: String = "UTC"
        private set
        
    var isContextLoaded: Boolean = false
        private set

    /**
     * Instantly populates the working memory singleton from the Room Database cache.
     * Crucial for Zero-Delay Boot Sequences.
     */
    fun loadFromCache(cachedCity: String, cachedState: String, cachedTimezone: String) {
        city = cachedCity
        state = cachedState
        timezone = cachedTimezone
        isContextLoaded = true
    }

    /**
     * F-197 — serviços de localização por IP com HTTPS gratuito. O antigo (ip-api.com) só aceita HTTPS no plano pago:
     * respondia 403 / certificado inválido e a cidade da tela (clima, widgets) nunca era descoberta nos aparelhos.
     */
    val SERVICOS_DE_LOCALIZACAO = listOf(
        "https://ipwho.is/?fields=success,city,region,timezone",
        "https://ipapi.co/json/"
    )

    /** Lê a resposta de qualquer um dos serviços: (cidade, estado, fuso) ou null se não serviu. */
    fun lerResposta(texto: String): Triple<String, String, String>? = try {
        val json = JSONObject(texto)
        if (json.has("success") && !json.optBoolean("success")) null
        else if (json.optBoolean("error", false)) null
        else {
            val cidade = json.optString("city").takeIf { it.isNotBlank() }
            val estado = json.optString("region").ifBlank { json.optString("regionName") }.takeIf { it.isNotBlank() }
            val fuso = json.optJSONObject("timezone")?.optString("id")?.takeIf { it.isNotBlank() }
                ?: json.optString("timezone").takeIf { it.isNotBlank() && !it.startsWith("{") } ?: "America/Sao_Paulo"
            if (cidade == null || estado == null) null else Triple(cidade, estado, fuso)
        }
    } catch (e: Exception) { null }

    /**
     * Suspend function to fetch context from IP geolocation asynchronously.
     * Fires [onContextFetched] on success.
     */
    suspend fun fetchRegionalContext(onContextFetched: (String, String, String) -> Unit) {
        withContext(Dispatchers.IO) {
            for (apiUrl in SERVICOS_DE_LOCALIZACAO) {
                try {
                    // [SECURITY HARDENING] HTTPS obrigatório (P0: HTTP -> DENY)
                    val connection = URL(apiUrl).openConnection() as HttpURLConnection
                    connection.requestMethod = "GET"
                    connection.connectTimeout = 5000
                    connection.readTimeout = 5000
                    connection.setRequestProperty("User-Agent", "SobreMidiaPlayer")
                    if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                        Logger.w("REGIONAL_CONTEXT", "Localização indisponível em ${URL(apiUrl).host} (HTTP ${connection.responseCode})")
                        continue
                    }
                    val resposta = connection.inputStream.bufferedReader().use { it.readText() }
                    val lido = lerResposta(resposta)
                    if (lido == null) {
                        Logger.w("REGIONAL_CONTEXT", "Resposta sem cidade em ${URL(apiUrl).host}")
                        continue
                    }
                    city = lido.first
                    state = lido.second
                    timezone = lido.third
                    isContextLoaded = true
                    // Passa para a ViewModel persistir
                    onContextFetched(city, state, timezone)
                    Logger.i("REGIONAL_CONTEXT", "Successfully mapped and cached Geolocation: $city - $state ($timezone)")
                    return@withContext
                } catch (e: Exception) {
                    Logger.w("REGIONAL_CONTEXT", "Falha ao consultar ${URL(apiUrl).host}: ${e.message}")
                }
            }
            Logger.e("REGIONAL_CONTEXT", "Nenhum serviço de localização respondeu; mantendo a última cidade conhecida.")
        }
    }
}

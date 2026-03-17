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
     * Suspend function to fetch context from IP-API asynchronously.
     * Fires [onContextFetched] on success.
     */
    suspend fun fetchRegionalContext(onContextFetched: (String, String, String) -> Unit) {
        withContext(Dispatchers.IO) {
            try {
                // Fields required: status, regionName, city, timezone
                val apiUrl = "http://ip-api.com/json/?fields=status,regionName,city,timezone"
                val url = URL(apiUrl)
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = 5000
                connection.readTimeout = 5000

                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    val response = connection.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(response)
                    
                    if (json.optString("status") == "success") {
                        city = json.optString("city", "Unknown")
                        state = json.optString("regionName", "Unknown") 
                        timezone = json.optString("timezone", "UTC")
                        isContextLoaded = true
                        
                        // Passa para a ViewModel persistir
                        onContextFetched(city, state, timezone)

                        Logger.i("REGIONAL_CONTEXT", "Successfully mapped and cached Geolocation: $city - $state ($timezone)")
                    } else {
                        Logger.w("REGIONAL_CONTEXT", "API Returned non-success status: $response")
                    }
                } else {
                    Logger.e("REGIONAL_CONTEXT", "HTTP Error: ${connection.responseCode}")
                }
            } catch (e: Exception) {
                Logger.e("REGIONAL_CONTEXT", "Failed to resolve IP location: ${e.message}")
            }
        }
    }
}

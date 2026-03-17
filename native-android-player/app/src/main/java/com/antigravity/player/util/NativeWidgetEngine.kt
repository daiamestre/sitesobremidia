package com.antigravity.player.util

import android.content.Context
import android.graphics.Color
import com.antigravity.player.cache.LocalCacheManager
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextClock
import android.widget.TextView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import androidx.core.view.setPadding
import android.animation.ObjectAnimator
import android.animation.ValueAnimator

object NativeWidgetEngine {

    suspend fun renderWidget(context: Context, container: FrameLayout, remoteUrl: String) {
        val widgetType = if (remoteUrl.startsWith("native_widget://")) {
            remoteUrl.substringAfter("native_widget://").substringBefore("?")
        } else {
            remoteUrl.substringBefore("?")
        }
        
        val widgetTypeParsed = widgetType.substringBefore("/")

        // Extrai as configurações do Painel Dashboard (Safe Parse)
        var jsonConfig = JSONObject()
        if (remoteUrl.contains("?config=")) {
            try {
                val encodedConfig = remoteUrl.substringAfter("?config=")
                val decodedConfig = java.net.URLDecoder.decode(encodedConfig, "UTF-8")
                jsonConfig = JSONObject(decodedConfig)
            } catch (e: Exception) {
                com.antigravity.core.util.Logger.e("WIDGET", "Falha ao decodificar JSON do Dashboard: ${e.message}")
            }
        }

        withContext(Dispatchers.Main) {
            container.removeAllViews()
            
            if (widgetTypeParsed.contains("clock", ignoreCase = true)) {
                // Relógio Nativo de Alta Performance (XML)
                val clockView = android.view.LayoutInflater.from(context).inflate(com.antigravity.player.R.layout.widget_relogio, container, false)
                
                val textClock = clockView.findViewById<TextClock>(com.antigravity.player.R.id.textClock)
                val txtData = clockView.findViewById<TextView>(com.antigravity.player.R.id.txtData)
                
                // Formatação Baseada no Dashboard
                val is24h = JsonParserUtil.getBoolean(jsonConfig, "formato24h", true)
                if (is24h) {
                    textClock.format24Hour = "HH:mm"
                    textClock.format12Hour = null
                } else {
                    textClock.format24Hour = null
                    textClock.format12Hour = "hh:mm a"
                }

                // Cor Baseada no Dashboard
                val hexColor = JsonParserUtil.getString(jsonConfig, "text_color", "#FFFFFF")
                var parsedColor = Color.WHITE
                try {
                    parsedColor = Color.parseColor(hexColor)
                    textClock.setTextColor(parsedColor)
                    txtData.setTextColor(parsedColor)
                } catch (e: Exception) {
                    // Ignora erro de parse de cor
                }
                
                // [MODO BAIXO CONSUMO] Se o hardware for fraco, removemos o ShadowRadius (Sombra Neon)
                if (com.antigravity.media.exoplayer.ChipsetDetector.getRecommendedProfile() == com.antigravity.media.exoplayer.ChipsetDetector.HardwareProfile.LEGACY_STABILITY) {
                    textClock.setShadowLayer(0f, 0f, 0f, 0)
                    txtData.setShadowLayer(0f, 0f, 0f, 0)
                } else {
                    textClock.setShadowLayer(15f, 0f, 0f, parsedColor)
                    txtData.setShadowLayer(10f, 0f, 0f, parsedColor)
                }
                
                val sdf = java.text.SimpleDateFormat("EEEE, dd 'de' MMMM", java.util.Locale("pt", "BR"))
                txtData.text = sdf.format(java.util.Date())
                
                container.addView(clockView)
                
            } else if (widgetTypeParsed.contains("weather", ignoreCase = true)) {
                // Clima Nativo (XML)
                val weatherView = android.view.LayoutInflater.from(context).inflate(com.antigravity.player.R.layout.widget_clima, container, false)
                
                val cityText = weatherView.findViewById<TextView>(com.antigravity.player.R.id.txtCidade)
                val tempText = weatherView.findViewById<TextView>(com.antigravity.player.R.id.txtTemperatura)
                val imgIcon = weatherView.findViewById<android.widget.ImageView>(com.antigravity.player.R.id.imgClimaIcon)

                cityText.text = "Carregando Clima..."
                tempText.text = "--°"
                
                container.addView(weatherView)

                // Buscar Clima: Passando JSON de Configuração para Fail-Safe nativo
                fetchWeather(context, cityText, tempText, imgIcon, jsonConfig)
            } else {
                val errorText = TextView(context).apply {
                    text = "Widget não suportado: $widgetTypeParsed"
                    textSize = 40f
                    setTextColor(Color.RED)
                }
                container.addView(errorText)
            }
        }
    }

    private suspend fun fetchWeather(context: Context, cityText: TextView, tempText: TextView, imgIcon: android.widget.ImageView, jsonConfig: JSONObject) {
        val cache = LocalCacheManager(context)
        
        // Helper inline para renderizar a UI nativa 
        suspend fun render(tempVal: Int, cidade: String, condicao: String) {
            withContext(Dispatchers.Main) {
                tempText.text = "${tempVal}°"
                cityText.text = cidade.uppercase()
                
                val iconRes = when {
                    condicao.contains("rain") -> com.antigravity.player.R.drawable.ic_chuva
                    condicao.contains("clear") || condicao.contains("sunny") -> com.antigravity.player.R.drawable.ic_ensolarado
                    condicao.contains("cloud") -> com.antigravity.player.R.drawable.ic_futuristic_cloud
                    else -> com.antigravity.player.R.drawable.ic_ensolarado
                }
                imgIcon.setImageResource(iconRes)
                
                // [MODO BAIXO CONSUMO]
                if (com.antigravity.media.exoplayer.ChipsetDetector.getRecommendedProfile() == com.antigravity.media.exoplayer.ChipsetDetector.HardwareProfile.LEGACY_STABILITY) {
                    tempText.setShadowLayer(0f, 0f, 0f, 0)
                    cityText.setShadowLayer(0f, 0f, 0f, 0)
                } else {
                    tempText.setShadowLayer(15f, 0f, 0f, Color.CYAN)
                    cityText.setShadowLayer(10f, 0f, 0f, Color.CYAN)
                    applyNeonEffect(imgIcon)
                }
            }
        }

        // [ESTRATÉGIA ANTI-TELA PRETA] 
        // 1. Tentar ler os dados diretamente do Dashboard Sync (Zero Egress/Zero CPU)
        val weatherData = jsonConfig.optJSONObject("weather_data")
        if (weatherData != null) {
            try {
                val tempVal = weatherData.optDouble("temp", 0.0).toInt()
                val cidade = JsonParserUtil.getString(weatherData, "city_name", "Dashboard")
                val condicao = JsonParserUtil.getString(weatherData, "condition_slug", "none").lowercase()

                // Salva estado de sucesso no Cache Persistente
                cache.salvarClima(weatherData.toString())

                render(tempVal, cidade, condicao)
                return // Sai antecipadamente
            } catch (e: Exception) {
                com.antigravity.core.util.Logger.e("WIDGET", "Falha de Parse no Clima Nativo: ${e.message}")
            }
        }

        // [FALLBACK HÍBRIDO] 2. Se a Extensão do Dashboard falhar, busque na Internet
        val cityName = RegionalContextManager.city.ifBlank { "São Paulo" }
        val stateName = RegionalContextManager.state
        
        withContext(Dispatchers.IO) {
            try {
                // 1. Geocodificação Open-Meteo
                val geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=${java.net.URLEncoder.encode(cityName, "UTF-8")}&count=1&language=pt"
                val geoResponse = URL(geoUrl).readText()
                val geoJson = JSONObject(geoResponse)
                val results = geoJson.optJSONArray("results")
                
                if (results != null && results.length() > 0) {
                    val lat = results.getJSONObject(0).getDouble("latitude")
                    val lon = results.getJSONObject(0).getDouble("longitude")
                    
                    // 2. Clima Open-Meteo com weather_code
                    val weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto"
                    val weatherResponse = URL(weatherUrl).readText()
                    val weatherJson = JSONObject(weatherResponse)
                    
                    val current = weatherJson.getJSONObject("current")
                    val temp = Math.round(current.getDouble("temperature_2m"))
                    val weatherCode = current.optInt("weather_code", 0)

                    val condicaoMeteo = when (weatherCode) {
                        0, 1 -> "clear"
                        2, 3, 45, 48 -> "cloud"
                        else -> "rain"
                    }
                    
                    // Monta um JSON artificial para proteger o Cache Offline
                    val backupJson = JSONObject().apply {
                        put("temp", temp)
                        put("city_name", cityName)
                        put("condition_slug", condicaoMeteo)
                    }
                    cache.salvarClima(backupJson.toString())

                    render(temp.toInt(), cityName, condicaoMeteo)
                } else {
                    throw Exception("Localização não encontrada")
                }
            } catch (e: Exception) {
                com.antigravity.core.util.Logger.e("WIDGET", "Internet falhou. Entrando no Cache Offline: ${e.message}")
                
                // [NÍVEL 3 - MODO SOBREVIVÊNCIA] Recupera do SharedPreferences
                val ultimoClima = cache.getUltimoClima()
                if (ultimoClima != null) {
                    try {
                        val cachedData = JSONObject(ultimoClima)
                        val tempVal = cachedData.optDouble("temp", 0.0).toInt()
                        val cidade = JsonParserUtil.getString(cachedData, "city_name", "Offline")
                        val condicao = JsonParserUtil.getString(cachedData, "condition_slug", "none").lowercase()
                        render(tempVal, cidade, condicao)
                    } catch (ex: Exception) {
                        withContext(Dispatchers.Main) {
                            cityText.text = "OFFLINE"
                            tempText.text = "--°"
                        }
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        cityText.text = "OFFLINE"
                        tempText.text = "--°"
                    }
                }
            }
        }
    }

    private fun applyNeonEffect(view: View) {
        val glow = ObjectAnimator.ofFloat(view, "alpha", 0.6f, 1.0f).apply {
            duration = 2000
            repeatMode = ValueAnimator.REVERSE
            repeatCount = ValueAnimator.INFINITE
        }
        glow.start()
    }
}

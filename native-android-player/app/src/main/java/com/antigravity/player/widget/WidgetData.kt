package com.antigravity.player.widget

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject

data class RssItem(val title: String, val summary: String)

/** Leitor de RSS 2.0 e Atom sem dependências (mesma abordagem da Edge Function fetch-rss), testável na JVM. */
object RssFeedParser {

    private val itemRegex = Regex("<(item|entry)[\\s>][\\s\\S]*?</\\1>", RegexOption.IGNORE_CASE)
    private val titleRegex = Regex("<title[^>]*>([\\s\\S]*?)</title>", RegexOption.IGNORE_CASE)
    private val descRegexes = listOf("description", "summary", "content:encoded", "content").map {
        Regex("<${Regex.escape(it)}[^>]*>([\\s\\S]*?)</${Regex.escape(it)}>", RegexOption.IGNORE_CASE)
    }
    private val cdataRegex = Regex("<!\\[CDATA\\[([\\s\\S]*?)]]>")
    private val tagRegex = Regex("<[^>]*>")
    private val spaceRegex = Regex("\\s+")
    private val numericEntity = Regex("&#(x?[0-9a-fA-F]+);")

    const val MAX_SUMMARY_CHARS = 220

    fun parse(xml: String, max: Int): List<RssItem> {
        val out = ArrayList<RssItem>()
        for (m in itemRegex.findAll(xml)) {
            val block = m.value
            val title = titleRegex.find(block)?.groupValues?.get(1)?.let(::cleanText).orEmpty()
            if (title.isBlank()) continue
            val summary = descRegexes.firstNotNullOfOrNull { it.find(block)?.groupValues?.get(1) }
                ?.let(::cleanText).orEmpty()
            out.add(RssItem(title, summary.take(MAX_SUMMARY_CHARS).trim()))
            if (out.size >= max) break
        }
        return out
    }

    /** CDATA -> texto, remove tags HTML, decodifica entidades e colapsa espaços. */
    fun cleanText(raw: String): String {
        var s = raw
        s = cdataRegex.replace(s) { it.groupValues[1] }
        s = decodeEntities(s)          // o feed pode trazer HTML escapado (&lt;p&gt;)
        s = tagRegex.replace(s, " ")
        s = decodeEntities(s)
        return spaceRegex.replace(s, " ").trim()
    }

    private fun decodeEntities(input: String): String {
        var s = numericEntity.replace(input) { m ->
            val v = m.groupValues[1]
            val code = try { if (v.startsWith("x", true)) v.substring(1).toInt(16) else v.toInt() } catch (e: Exception) { -1 }
            if (code in 1..0x10FFFF) String(Character.toChars(code)) else ""
        }
        s = s.replace("&nbsp;", " ").replace("&quot;", "\"").replace("&apos;", "'")
            .replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        return s
    }
}

enum class WeatherIcon { SUN, MOON, PARTLY, CLOUD, FOG, RAIN, SNOW, STORM }

data class WeatherNow(
    val temp: Int,
    val feelsLike: Int,
    val humidity: Int,
    val windKmh: Int,
    val code: Int,
    val isDay: Boolean
) {
    val description: String get() = WeatherText.describe(code, isDay).first
    val icon: WeatherIcon get() = WeatherText.describe(code, isDay).second
}

object WeatherText {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** Códigos WMO (Open-Meteo) -> texto em português e ícone. */
    fun describe(code: Int, isDay: Boolean): Pair<String, WeatherIcon> = when (code) {
        0 -> "Céu limpo" to (if (isDay) WeatherIcon.SUN else WeatherIcon.MOON)
        1, 2 -> "Parcialmente nublado" to (if (isDay) WeatherIcon.PARTLY else WeatherIcon.CLOUD)
        3 -> "Nublado" to WeatherIcon.CLOUD
        45, 48 -> "Nevoeiro" to WeatherIcon.FOG
        in 51..57 -> "Garoa" to WeatherIcon.RAIN
        in 61..67 -> "Chuva" to WeatherIcon.RAIN
        in 71..77, 85, 86 -> "Neve" to WeatherIcon.SNOW
        in 80..82 -> "Pancadas de chuva" to WeatherIcon.RAIN
        in 95..99 -> "Tempestade" to WeatherIcon.STORM
        else -> "Tempo indisponível" to WeatherIcon.CLOUD
    }

    /** Corpo da resposta de https://api.open-meteo.com/v1/forecast?...&current=... */
    fun parseOpenMeteo(body: String): WeatherNow? {
        return try {
            val cur = json.parseToJsonElement(body).jsonObject["current"]?.jsonObject ?: return null
            fun num(key: String): Double? = (cur[key] as? JsonPrimitive)?.doubleOrNull
            val temp = num("temperature_2m") ?: return null
            WeatherNow(
                temp = Math.round(temp).toInt(),
                feelsLike = Math.round(num("apparent_temperature") ?: temp).toInt(),
                humidity = Math.round(num("relative_humidity_2m") ?: 0.0).toInt(),
                windKmh = Math.round(num("wind_speed_10m") ?: 0.0).toInt(),
                code = (num("weather_code") ?: 0.0).toInt(),
                isDay = (num("is_day") ?: 1.0).toInt() == 1
            )
        } catch (e: Exception) {
            null
        }
    }

    fun greeting(hour: Int): String = when (hour) {
        in 5..11 -> "Bom dia"
        in 12..17 -> "Boa tarde"
        else -> "Boa noite"
    }
}

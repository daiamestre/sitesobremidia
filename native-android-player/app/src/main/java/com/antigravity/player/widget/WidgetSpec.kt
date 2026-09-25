package com.antigravity.player.widget

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import java.net.URLDecoder

enum class WidgetKind { CLOCK, WEATHER, RSS, UNKNOWN }

/**
 * O que o painel gravou para o widget (widgets.config) e chega ao Player em `native_widget://<tipo>/<id>?config=<json>`.
 * Chaves do painel: backgroundImageLandscape/Portrait, position, showDate, showSeconds, latitude, longitude,
 * locationName, feedUrl, maxItems, scrollSpeed (segundos por notícia), variant (full|compact).
 */
data class WidgetSpec(
    val kind: WidgetKind,
    val rawType: String,
    val backgroundLandscape: String?,
    val backgroundPortrait: String?,
    val backgroundAny: String?,
    val position: String,
    val showDate: Boolean,
    val showSeconds: Boolean,
    val format24h: Boolean,
    val textColor: String?,
    val latitude: Double?,
    val longitude: Double?,
    val locationName: String?,
    val feedUrl: String,
    val maxItems: Int,
    val secondsPerItem: Int,
    val compact: Boolean
) {
    /** Fundo do widget: a imagem da orientação da tela; se só existir a outra, usa ela (nunca fica sem fundo à toa). */
    fun backgroundFor(landscape: Boolean): String? =
        (if (landscape) backgroundLandscape ?: backgroundPortrait else backgroundPortrait ?: backgroundLandscape) ?: backgroundAny
}

object WidgetSpecParser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    const val DEFAULT_MAX_ITEMS = 5
    const val DEFAULT_SECONDS_PER_ITEM = 8

    fun kindOf(rawType: String): WidgetKind {
        val t = rawType.lowercase()
        return when {
            t.contains("clock") || t.contains("relogio") || t.contains("relógio") -> WidgetKind.CLOCK
            t.contains("weather") || t.contains("clima") -> WidgetKind.WEATHER
            t.contains("rss") || t.contains("news") || t.contains("noticia") || t.contains("notícia") -> WidgetKind.RSS
            else -> WidgetKind.UNKNOWN
        }
    }

    fun parse(remoteUrl: String): WidgetSpec {
        val head = remoteUrl.substringBefore("?config=").substringBefore("?")
        val rawType = head.removePrefix("native_widget://").substringBefore("/")
        val cfg = decodeConfig(remoteUrl)

        fun str(key: String): String? = (cfg[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }
        fun bool(key: String, def: Boolean): Boolean = (cfg[key] as? JsonPrimitive)?.booleanOrNull ?: def
        fun dbl(key: String): Double? = (cfg[key] as? JsonPrimitive)?.let { it.doubleOrNull ?: it.content.toDoubleOrNull() }
        fun int(key: String): Int? = (cfg[key] as? JsonPrimitive)?.let { it.intOrNull ?: it.content.toDoubleOrNull()?.toInt() }

        return WidgetSpec(
            kind = kindOf(rawType),
            rawType = rawType,
            backgroundLandscape = httpUrlOrNull(str("backgroundImageLandscape")),
            backgroundPortrait = httpUrlOrNull(str("backgroundImagePortrait")),
            backgroundAny = httpUrlOrNull(str("backgroundImage") ?: str("background_url")),
            position = str("position")?.lowercase() ?: "center",
            showDate = bool("showDate", true),
            showSeconds = bool("showSeconds", false),
            format24h = bool("formato24h", true),
            textColor = str("text_color"),
            latitude = dbl("latitude")?.takeIf { it in -90.0..90.0 },
            longitude = dbl("longitude")?.takeIf { it in -180.0..180.0 },
            locationName = str("locationName"),
            feedUrl = httpUrlOrNull(str("feedUrl")) ?: "",
            maxItems = (int("maxItems") ?: DEFAULT_MAX_ITEMS).coerceIn(1, 20),
            secondsPerItem = (int("scrollSpeed") ?: DEFAULT_SECONDS_PER_ITEM).coerceIn(3, 60),
            compact = str("variant")?.lowercase() == "compact"
        )
    }

    private fun decodeConfig(remoteUrl: String): JsonObject {
        if (!remoteUrl.contains("?config=")) return JsonObject(emptyMap())
        return try {
            val decoded = URLDecoder.decode(remoteUrl.substringAfter("?config="), "UTF-8")
            json.parseToJsonElement(decoded).jsonObject
        } catch (e: Exception) {
            JsonObject(emptyMap())
        }
    }

    /** Só http(s): o Player nunca abre file://, content:// etc. vindos do banco. */
    private fun httpUrlOrNull(url: String?): String? =
        url?.takeIf { it.startsWith("https://", true) || it.startsWith("http://", true) }
}

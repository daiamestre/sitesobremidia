package com.antigravity.player.widget

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import java.net.URLDecoder

enum class WidgetKind { CLOCK, WEATHER, RSS, INSTITUTIONAL, OFFER, ADVERTISING, SOCIAL, YOUTUBE, SPORTS, UNKNOWN }

/** Linha "rótulo — valor" do modelo Institucional (ex.: "Segunda a sexta" — "06:00 — 22:00"). */
data class LinhaInfo(val rotulo: String, val valor: String)

/** Conteúdo do modelo Institucional / Aviso (widgets.config). */
data class Institucional(
    val selo: String,
    val titulo: String,
    val texto: String,
    val linhas: List<LinhaInfo>,
    val contato: String?,
    val endereco: String?,
    val site: String?,
    val cta: String?
)

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
    val compact: Boolean,
    /** Modelo da Galeria de Widgets (config.template), ex.: "weather-futurista"; null = clássico. */
    val template: String? = null,
    val institucional: Institucional? = null,
    /** Conteúdo do QR Code (qualquer modelo que o exiba) e a legenda. */
    val qrConteudo: String? = null,
    val qrLegenda: String? = null,
    /** Oferta atual do cadastro (o servidor junta em config.oferta a cada sincronização; nunca gravada no widget). */
    val oferta: Oferta? = null,
    /** Campanha atual (o servidor junta em config.campanha; nunca gravada no widget). */
    val campanha: Campanha? = null,
    /** Chamada (botão) — Publicidade. */
    val cta: String? = null,
    /** Social / Instagram: post enviado pelo usuário. */
    val post: PostSocial? = null,
    /** YouTube: vídeo/playlist validado para o player oficial. */
    val youtube: YoutubeRef? = null,
    /** Cores do Relógio/Clima Futurista escolhidas no painel (null = padrão SOBRE MÍDIA). */
    val cores: CoresWidget? = null,
    /** Esportes: jogos confirmados que o servidor junta em config.esportes (o Player não busca nada). */
    val esportes: DadosEsportes? = null,
    /** Notícias automáticas (config.origem = agencia-brasil): manchetes prontas em config.noticias; null = ler o feedUrl. */
    val noticiasProntas: List<RssItem>? = null
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
            t.contains("institutional") || t.contains("institucional") -> WidgetKind.INSTITUTIONAL
            t == "offer" || t.contains("oferta") -> WidgetKind.OFFER
            t == "advertising" || t.contains("publicidade") -> WidgetKind.ADVERTISING
            t == "social" || t.contains("instagram") -> WidgetKind.SOCIAL
            t.contains("youtube") -> WidgetKind.YOUTUBE
            t == "sports" || t.contains("esporte") -> WidgetKind.SPORTS
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
            compact = str("variant")?.lowercase() == "compact",
            template = str("template"),
            institucional = if (kindOf(rawType) != WidgetKind.INSTITUTIONAL) null else Institucional(
                selo = (str("selo") ?: "INFORMAÇÃO").uppercase(),
                titulo = str("titulo") ?: "",
                texto = str("texto") ?: "",
                linhas = (cfg["linhas"] as? kotlinx.serialization.json.JsonArray).orEmpty().mapNotNull { el ->
                    val o = el as? JsonObject ?: return@mapNotNull null
                    val r = (o["rotulo"] as? JsonPrimitive)?.content?.trim().orEmpty()
                    val v = (o["valor"] as? JsonPrimitive)?.content?.trim().orEmpty()
                    if (r.isEmpty() && v.isEmpty()) null else LinhaInfo(r, v)
                }.take(6),
                contato = str("contato"), endereco = str("endereco"), site = str("site"), cta = str("cta")
            ),
            qrConteudo = str("qrConteudo"),
            qrLegenda = str("qrLegenda"),
            oferta = if (kindOf(rawType) != WidgetKind.OFFER) null else OfertaText.parse(cfg["oferta"]),
            campanha = if (kindOf(rawType) != WidgetKind.ADVERTISING) null else CampanhaText.parse(cfg["campanha"]),
            cta = str("cta"),
            post = if (kindOf(rawType) != WidgetKind.SOCIAL) null else PostSocial(
                rede = PostSocial.redeDo(rawType, str("rede")),
                perfil = str("perfil"), autor = str("autor"), titulo = str("titulo"), texto = str("texto"),
                imagemUrl = httpUrlOrNull(str("imagemPost"))
            ),
            youtube = if (kindOf(rawType) != WidgetKind.YOUTUBE) null else YoutubeLink.ler(str("youtubeUrl")),
            cores = CoresWidget.parse(cfg["cores"]),
            esportes = if (kindOf(rawType) != WidgetKind.SPORTS) null else EsportesText.parse(cfg["esportes"]),
            noticiasProntas = if (kindOf(rawType) == WidgetKind.RSS && str("origem") == "agencia-brasil") NoticiasProntas.parse(cfg["noticias"]) else null
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

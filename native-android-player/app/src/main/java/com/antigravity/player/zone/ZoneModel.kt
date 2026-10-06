package com.antigravity.player.zone

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlin.math.roundToInt

/**
 * F-149 — Divisão da tela em zonas no Player Android (contrato get_player_layout_for_screen).
 *
 * Código puro (sem Android): modelo, leitura da resposta, geometria e a regra de "mesma mídia nunca em duas zonas".
 * O motor de reprodução existente continua tocando a zona PRINCIPAL sem nenhuma mudança de lógica — só muda de tamanho
 * e de posição. As demais zonas são tocadas pelo ZoneController.
 */
enum class ZoneItemKind { IMAGE, VIDEO, WIDGET }

enum class ZoneFit { CONTAIN, COVER, STRETCH }

data class ZoneItem(
    val id: String,
    /** id da mídia (ou "widget:<id>"): é por ele que se evita a mesma mídia em duas zonas. */
    val mediaId: String,
    val kind: ZoneItemKind,
    /** URL do arquivo, ou "native_widget://tipo/id?config=..." quando é widget. */
    val url: String,
    val durationSeconds: Long
)

data class Zone(
    val id: String,
    val numero: Int,
    val x: Int,
    val y: Int,
    val largura: Int,
    val altura: Int,
    val ordemZ: Int,
    val fit: ZoneFit,
    val principal: Boolean,
    val audio: Boolean,
    val items: List<ZoneItem>,
    /** Só na principal: mídias de anúncios vendidos para OUTRA zona (não tocam na principal). */
    val excluirMidias: Set<String>
)

data class ZoneLayout(
    val id: String,
    val telaId: String?,
    val versao: Int,
    val largura: Int,
    val altura: Int,
    val corFundo: String,
    val zonas: List<Zone>
) {
    val principal: Zone? get() = zonas.firstOrNull { it.principal }
    val secundarias: List<Zone> get() = zonas.filter { !it.principal }

    /** Muda quando posição, tamanho ou conteúdo de alguma zona muda (decide se a tela precisa ser remontada). */
    fun signature(): String = buildString {
        append(id).append('|').append(largura).append('x').append(altura).append('|').append(corFundo)
        for (z in zonas) {
            append("|z").append(z.id).append(':').append(z.x).append(',').append(z.y).append(',').append(z.largura).append(',').append(z.altura)
            append(',').append(z.ordemZ).append(',').append(z.fit).append(',').append(z.principal).append(',').append(z.audio)
            append(',').append(z.excluirMidias.sorted().joinToString("+"))
            for (i in z.items) append(';').append(i.id).append('~').append(i.mediaId).append('~').append(i.url.hashCode()).append('~').append(i.durationSeconds)
        }
    }
}

data class RectPx(val left: Int, val top: Int, val width: Int, val height: Int)

object ZoneGeometry {
    /** A tela lógica inteira cabe no visor sem cortar nem esticar, centralizada (mesma regra de encaixe do Player). */
    fun canvas(layoutW: Int, layoutH: Int, displayW: Int, displayH: Int): RectPx {
        if (layoutW <= 0 || layoutH <= 0 || displayW <= 0 || displayH <= 0) return RectPx(0, 0, displayW.coerceAtLeast(0), displayH.coerceAtLeast(0))
        val escala = minOf(displayW.toDouble() / layoutW, displayH.toDouble() / layoutH)
        val w = (layoutW * escala).roundToInt().coerceAtMost(displayW)
        val h = (layoutH * escala).roundToInt().coerceAtMost(displayH)
        return RectPx((displayW - w) / 2, (displayH - h) / 2, w, h)
    }

    /**
     * Retângulo da zona no visor. As bordas são arredondadas a partir das coordenadas (não da largura), para duas zonas
     * vizinhas dividirem exatamente a mesma borda — sem risco de sobrar ou faltar 1 pixel entre elas.
     */
    fun zoneRect(x: Int, y: Int, largura: Int, altura: Int, layoutW: Int, layoutH: Int, canvas: RectPx): RectPx {
        if (layoutW <= 0 || layoutH <= 0) return canvas
        val fx = canvas.width.toDouble() / layoutW
        val fy = canvas.height.toDouble() / layoutH
        val esquerda = (x * fx).roundToInt().coerceIn(0, canvas.width)
        val topo = (y * fy).roundToInt().coerceIn(0, canvas.height)
        val direita = ((x + largura) * fx).roundToInt().coerceIn(esquerda, canvas.width)
        val base = ((y + altura) * fy).roundToInt().coerceIn(topo, canvas.height)
        return RectPx(canvas.left + esquerda, canvas.top + topo, direita - esquerda, base - topo)
    }
}

object ZoneRotation {
    /**
     * Regra do proprietário: a MESMA mídia nunca toca em duas zonas da mesma tela ao mesmo tempo.
     * Devolve o índice do próximo item cuja mídia não está em uso por outra zona; -1 quando todos estão em uso ou a
     * zona está vazia (a zona espera e tenta de novo).
     */
    fun nextFree(items: List<ZoneItem>, current: Int, inUseByOthers: Set<String>): Int {
        val total = items.size
        if (total == 0) return -1
        for (passo in 1..total) {
            val i = (((current + passo) % total) + total) % total
            if (items[i].mediaId !in inUseByOthers) return i
        }
        return -1
    }
}

sealed class ZoneLayoutResult {
    /** A tela não está dividida: tela cheia tradicional. */
    object None : ZoneLayoutResult()
    /** Aparelho não é o da tela, tela bloqueada ou desativada: as zonas saem do ar. */
    object NoAccess : ZoneLayoutResult()
    /** Resposta que não deu para entender: mantém o que já está no ar. */
    object Invalid : ZoneLayoutResult()
    data class Ok(val layout: ZoneLayout) : ZoneLayoutResult()
}

object ZoneLayoutParser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun JsonObject.str(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull
    private fun JsonObject.int(k: String, padrao: Int = 0): Int = (this[k] as? JsonPrimitive)?.let { it.intOrNull ?: it.contentOrNull?.toDoubleOrNull()?.roundToInt() } ?: padrao
    private fun JsonObject.bool(k: String): Boolean = (this[k] as? JsonPrimitive)?.let { it.booleanOrNull ?: (it.contentOrNull == "true") } ?: false
    private fun JsonObject.obj(k: String): JsonObject? = this[k] as? JsonObject
    private fun JsonObject.arr(k: String): JsonArray? = this[k] as? JsonArray

    fun parse(raw: String?): ZoneLayoutResult {
        if (raw.isNullOrBlank()) return ZoneLayoutResult.Invalid
        val raiz: JsonObject = try {
            var el: JsonElement = json.parseToJsonElement(raw)
            // o PostgREST pode devolver o JSON como texto entre aspas
            if (el is JsonPrimitive && el.isString) el = json.parseToJsonElement(el.content)
            el as? JsonObject ?: return ZoneLayoutResult.Invalid
        } catch (e: Exception) {
            return ZoneLayoutResult.Invalid
        }
        return when (raiz.str("status")?.uppercase()) {
            "SEM_LAYOUT" -> ZoneLayoutResult.None
            "SEM_ACESSO" -> ZoneLayoutResult.NoAccess
            "SUCCESS" -> layout(raiz.obj("layout")) ?: ZoneLayoutResult.Invalid
            else -> ZoneLayoutResult.Invalid
        }
    }

    private fun layout(l: JsonObject?): ZoneLayoutResult? {
        l ?: return null
        val id = l.str("id") ?: return null
        val largura = l.int("largura")
        val altura = l.int("altura")
        if (largura <= 0 || altura <= 0) return null
        val zonas = (l.arr("zonas") ?: return null).mapNotNull { (it as? JsonObject)?.let(::zona) }
        if (zonas.isEmpty()) return null
        val cor = l.str("cor_fundo")?.takeIf { Regex("^#[0-9A-Fa-f]{6}$").matches(it) } ?: "#000000"
        return ZoneLayoutResult.Ok(ZoneLayout(id, l.str("tela_id"), l.int("versao", 1), largura, altura, cor, zonas))
    }

    private fun zona(z: JsonObject): Zone? {
        val id = z.str("id") ?: return null
        val w = z.int("largura")
        val h = z.int("altura")
        if (w <= 0 || h <= 0) return null
        val principal = z.bool("principal")
        val fit = when (z.str("modo_encaixe")?.uppercase()) { "COBRIR" -> ZoneFit.COVER; "ESTICAR" -> ZoneFit.STRETCH; else -> ZoneFit.CONTAIN }
        val itens = if (principal) emptyList() else (z.obj("playlist")?.arr("playlist_items") ?: JsonArray(emptyList())).mapNotNull { (it as? JsonObject)?.let(::item) }
        val excluir = (z.arr("excluir_midias") ?: JsonArray(emptyList())).mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.toSet()
        return Zone(id, z.int("numero", 1), z.int("x").coerceAtLeast(0), z.int("y").coerceAtLeast(0), w, h, z.int("ordem_z"), fit, principal, z.bool("audio"), itens, excluir)
    }

    private fun item(i: JsonObject): ZoneItem? {
        val duracao = ((i["duration"] as? JsonPrimitive)?.longOrNull ?: 0L).let { if (it > 0) it else 10L }
        val midia = i.obj("media")
        val widget = i.obj("widget")
        val idMidia = midia?.str("id")
        val url = midia?.str("file_url")
        if (idMidia != null && !url.isNullOrBlank()) {
            val tipo = midia.str("file_type")?.lowercase()
            if (tipo != "image" && tipo != "video") return null
            return ZoneItem(i.str("id") ?: idMidia, idMidia, if (tipo == "video") ZoneItemKind.VIDEO else ZoneItemKind.IMAGE, url, duracao)
        }
        val idWidget = widget?.str("id")
        val tipoWidget = widget?.str("widget_type")
        if (idWidget != null && !tipoWidget.isNullOrBlank()) {
            // mesmo formato que o Player já usa para widgets da playlist (RemoteDataSource.mapToProfessionalDomain)
            val base = "native_widget://${tipoWidget.lowercase()}/$idWidget"
            val config = widget.obj("config")?.toString()
            val urlWidget = if (!config.isNullOrBlank()) "$base?config=${java.net.URLEncoder.encode(config, "UTF-8")}" else base
            return ZoneItem(i.str("id") ?: "w:$idWidget", "widget:$idWidget", ZoneItemKind.WIDGET, urlWidget, duracao)
        }
        return null
    }
}

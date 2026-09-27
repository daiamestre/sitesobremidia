package com.antigravity.player.widget

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Widget "Esportes News" (F-90, widget_type = sports_news) — separado de Notícias (RSS).
 * Regra do proprietário: notícia de esporte SEMPRE com a imagem da notícia. O servidor já manda só itens com imagem
 * (config.esportesNews, de fn_widget_esportes_news_dados); o Player ainda descarta os que não têm imagem https e os
 * cuja imagem não carregar. Mesma regra do painel (src/lib/esportesNews.ts). Sem java.time (minSdk 23).
 */
data class NoticiaEsporte(
    val id: String,
    val titulo: String,
    val resumo: String?,
    val imagem: String,
    val creditoImagem: String?,
    val fonte: String,
    val publicadoEmMs: Long?
)

object EsportesNews {
    const val SEGUNDOS_POR_NOTICIA = 8
    const val NOTICIAS_POR_EXIBICAO = 3
    private const val TRES_HORAS_MS = 3L * 3600 * 1000 // Brasília = UTC-3 o ano todo
    private val UTC = TimeZone.getTimeZone("UTC")

    private fun texto(o: JsonObject, k: String): String? =
        (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }

    /** `config.esportesNews.itens` -> notícias com título e imagem https (as demais nunca entram). */
    fun parse(el: Any?): List<NoticiaEsporte>? {
        val o = el as? JsonObject ?: return null
        val itens = o["itens"] as? JsonArray ?: return null
        return itens.mapNotNull { e ->
            val j = e as? JsonObject ?: return@mapNotNull null
            val titulo = texto(j, "titulo") ?: return@mapNotNull null
            val imagem = texto(j, "imagem")?.takeIf { it.startsWith("https://", true) && it.none(Char::isWhitespace) } ?: return@mapNotNull null
            NoticiaEsporte(
                id = texto(j, "id") ?: imagem,
                titulo = titulo,
                resumo = texto(j, "resumo"),
                imagem = imagem,
                creditoImagem = texto(j, "creditoImagem"),
                fonte = texto(j, "fonte") ?: "",
                publicadoEmMs = texto(j, "publicadoEm")?.let { EsportesText.isoParaMs(it) }
            )
        }
    }

    /** Índices desta exibição: até 3, a partir da notícia `proximaId` (continua de onde a anterior parou). */
    fun indicesDaExibicao(total: List<NoticiaEsporte>, proximaId: String?, porExibicao: Int = NOTICIAS_POR_EXIBICAO): List<Int> {
        val n = total.size
        if (n == 0) return emptyList()
        val ini = total.indexOfFirst { it.id == proximaId }.coerceAtLeast(0)
        return (0 until minOf(porExibicao, n)).map { (ini + it) % n }
    }

    /** Depois de mostrar o índice `i`, a próxima exibição começa na notícia seguinte. */
    fun proximaDepois(total: List<NoticiaEsporte>, i: Int): String? = if (total.isEmpty()) null else total[(i + 1) % total.size].id

    /** "Foto: Tânia Rêgo/Agência Brasil"; arte: "Arte/EBC · Agência Brasil"; sem crédito: "Imagem: <fonte>". */
    fun credito(n: NoticiaEsporte): String {
        val c = n.creditoImagem?.trim().orEmpty()
        if (c.isEmpty()) return "Imagem: ${n.fonte}"
        val base = if (c.startsWith("arte", true)) c else "Foto: $c"
        return if (n.fonte.isNotEmpty() && !c.contains(n.fonte, true)) "$base · ${n.fonte}" else base
    }

    /** "Hoje, 14:30" / "Ontem, 09:10" / "25/09, 18:00" (Brasília). Sem data -> "". */
    fun quando(publicadoEmMs: Long?, agoraMs: Long): String {
        if (publicadoEmMs == null) return ""
        val dia = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = UTC }
        val hora = SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = UTC }
        val d = dia.format(java.util.Date(publicadoEmMs - TRES_HORAS_MS))
        val h = hora.format(java.util.Date(publicadoEmMs - TRES_HORAS_MS))
        return when (d) {
            dia.format(java.util.Date(agoraMs - TRES_HORAS_MS)) -> "Hoje, $h"
            dia.format(java.util.Date(agoraMs - TRES_HORAS_MS - 86_400_000L)) -> "Ontem, $h"
            else -> "${d.substring(8, 10)}/${d.substring(5, 7)}, $h"
        }
    }
}

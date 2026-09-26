package com.antigravity.player.widget

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * Esportes como o servidor entrega em `config.esportes` (fn_widget_esportes_dados — migração 20261251).
 * O Player NÃO busca nem valida nada: só desenha os jogos já confirmados pelo Sports Engine
 * (openfootball + Wikipédia). Horários já vêm em Brasília. Sem placar ao vivo.
 * Sem java.time: o Player roda em Android 6 (minSdk 23, sem desugaring).
 */
data class JogoEsporte(
    val codigo: String,
    val competicao: String,
    val slug: String,
    val mandante: String,
    val visitante: String,
    val placarMandante: Int?,
    val placarVisitante: Int?,
    val status: String,
    val data: String,          // YYYY-MM-DD (Brasília)
    val hora: String?,         // HH:MM (Brasília) ou null = a definir
    val kickoffUtcMs: Long?,
    /** Escudo oficial conferido (cópia no Storage); null = mostra as iniciais, nunca o escudo de outro time. */
    val escudoMandante: String? = null,
    val escudoVisitante: String? = null,
    val ordemCompeticao: Int = 99
)

data class CompeticaoEsporte(val slug: String, val nome: String, val ordem: Int)

/**
 * layout 2 (F-86): janela D-3..D+9 por campeonato (o Player recorta pelo próprio relógio). layout 1 = lista antiga (modo).
 */
data class DadosEsportes(
    val modo: String,
    val jogos: List<JogoEsporte>,
    val creditos: String,
    val layout: Int = 1,
    val janela: List<JogoEsporte> = emptyList(),
    val competicoes: List<CompeticaoEsporte> = emptyList()
)

object EsportesText {
    private val PT_BR = Locale("pt", "BR")
    private val UTC = TimeZone.getTimeZone("UTC")
    private val DATA = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    private val HORA = Regex("^\\d{2}:\\d{2}$")
    private val ISO_UTC = Regex("^(\\d{4}-\\d{2}-\\d{2})[T ](\\d{2}:\\d{2}:\\d{2})(?:\\.\\d+)?(Z|[+]00(?::?00)?)$")
    private val DIAS = arrayOf("dom", "seg", "ter", "qua", "qui", "sex", "sáb")

    fun parse(el: Any?): DadosEsportes? {
        val o = el as? JsonObject ?: return null
        fun s(obj: JsonObject, k: String) = (obj[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }
        fun i(obj: JsonObject, k: String) = (obj[k] as? JsonPrimitive)?.intOrNull
        fun jogoDe(e: Any?): JogoEsporte? {
            val j = e as? JsonObject ?: return null
            val mandante = s(j, "mandante") ?: return null
            val visitante = s(j, "visitante") ?: return null
            val data = s(j, "data")?.takeIf { DATA.matches(it) } ?: return null
            return JogoEsporte(
                codigo = s(j, "codigo") ?: "", competicao = s(j, "competicao") ?: "", slug = s(j, "slug") ?: "",
                mandante = mandante, visitante = visitante,
                placarMandante = i(j, "placarMandante"), placarVisitante = i(j, "placarVisitante"),
                status = s(j, "status") ?: "SCHEDULED", data = data,
                hora = s(j, "hora")?.takeIf { HORA.matches(it) },
                kickoffUtcMs = s(j, "kickoffUtc")?.let(::isoParaMs),
                escudoMandante = s(j, "escudoMandante")?.takeIf { it.startsWith("https://") },
                escudoVisitante = s(j, "escudoVisitante")?.takeIf { it.startsWith("https://") },
                ordemCompeticao = i(j, "ordemCompeticao") ?: 99
            )
        }
        val jogos = (o["jogos"] as? JsonArray).orEmpty().mapNotNull(::jogoDe).take(12)
        val janela = (o["janela"] as? JsonArray).orEmpty().mapNotNull(::jogoDe).take(300)
        val competicoes = (o["competicoes"] as? JsonArray).orEmpty().mapNotNull { e ->
            val c = e as? JsonObject ?: return@mapNotNull null
            val slug = s(c, "slug") ?: return@mapNotNull null
            CompeticaoEsporte(slug, s(c, "nome") ?: slug, i(c, "ordem") ?: 99)
        }
        return DadosEsportes(
            modo = s(o, "modo")?.takeIf { it in setOf("resultados", "proximos", "hoje") } ?: "resultados",
            jogos = jogos,
            creditos = s(o, "creditos") ?: "Dados: openfootball (CC0) · Wikipédia (CC BY-SA)",
            layout = i(o, "layout") ?: 1,
            janela = janela,
            competicoes = competicoes
        )
    }

    /** "2026-10-03T21:30:00+00:00" / "2026-10-03 21:30:00+00" / "...Z" (sempre UTC) -> epoch ms. */
    fun isoParaMs(v: String): Long? {
        val m = ISO_UTC.find(v.trim()) ?: return null
        return runCatching {
            SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).apply { timeZone = UTC; isLenient = false }
                .parse("${m.groupValues[1]} ${m.groupValues[2]}")?.time
        }.getOrNull()
    }

    fun rotuloModo(modo: String): String = when (modo) {
        "proximos" -> "PRÓXIMOS JOGOS"
        "hoje" -> "JOGOS DE HOJE"
        else -> "RESULTADOS"
    }

    /** Placar ("2 × 1") de jogo encerrado; horário ("18:30" / "a definir") dos demais. Mesma regra do painel (src/lib/esportes.ts). */
    fun centro(j: JogoEsporte): Pair<String, Boolean> =
        if (j.status == "FINISHED" && j.placarMandante != null && j.placarVisitante != null) "${j.placarMandante} × ${j.placarVisitante}" to true
        else (j.hora ?: "a definir") to false

    /** "2026-10-03" -> "sáb 03/10" (a data já está em Brasília: formata sem trocar o dia). */
    fun dataCurta(data: String): String = runCatching {
        val d = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = UTC; isLenient = false }.parse(data)!!
        val c = Calendar.getInstance(UTC, PT_BR).apply { time = d }
        "%s %02d/%02d".format(DIAS[c.get(Calendar.DAY_OF_WEEK) - 1], c.get(Calendar.DAY_OF_MONTH), c.get(Calendar.MONTH) + 1)
    }.getOrDefault(data)

    /** Em "próximos", jogo que já começou sai da lista (mesmo com dado antigo em cache). */
    fun visiveis(dados: DadosEsportes, agoraMs: Long): List<JogoEsporte> =
        if (dados.modo != "proximos") dados.jogos else dados.jogos.filter { it.kickoffUtcMs == null || it.kickoffUtcMs > agoraMs }
}

/** Notícias automáticas (motor de notícias) em `config.noticias.itens`: título + resumo, sem ler feed. */
object NoticiasProntas {
    fun parse(el: Any?): List<RssItem>? {
        val o = el as? JsonObject ?: return null
        val itens = o["itens"] as? JsonArray ?: return null
        return itens.mapNotNull { e ->
            val j = e as? JsonObject ?: return@mapNotNull null
            val t = (j["titulo"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim().orEmpty()
            if (t.isEmpty()) null else RssItem(t, (j["resumo"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim().orEmpty())
        }
    }
}

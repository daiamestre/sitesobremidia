package com.antigravity.player.widget

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * Widget Esportes v2 (F-86) — mesma regra do painel (src/lib/esportesPaginas.ts):
 *  - separado por campeonato, na ordem do cadastro;
 *  - resultados dos 3 dias anteriores (D-3..D-1) e próximos jogos de hoje até D+2, horário de Brasília;
 *  - cada página: até 3 resultados + até 3 próximos jogos daquele campeonato, em ordem de data e horário;
 *  - cada exibição mostra 3 páginas de 8 s; a próxima exibição continua de onde parou (no mesmo dia).
 * Sem java.time (minSdk 23).
 */
data class PaginaEsportes(
    val slug: String,
    val competicao: String,
    val resultados: List<JogoEsporte>,
    val proximos: List<JogoEsporte>,
    val parte: Int,
    val partes: Int
)

data class CursorEsportes(val dia: String, val proxima: Int)

object EsportesPaginas {
    const val JOGOS_POR_BLOCO = 3
    const val SEGUNDOS_POR_PAGINA = 8
    const val PAGINAS_POR_EXIBICAO = 3

    private const val TRES_HORAS_MS = 3L * 3600 * 1000 // Brasília = UTC-3 o ano todo
    private val UTC = TimeZone.getTimeZone("UTC")
    private val DIAS = arrayOf("DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB")

    private fun formato() = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = UTC; isLenient = false }

    fun diaEmBrasilia(ms: Long): String = formato().format(java.util.Date(ms - TRES_HORAS_MS))

    /** Nunca lança exceção (um widget não pode derrubar a tela): data inválida volta como veio. */
    fun somarDias(dia: String, n: Int): String = runCatching {
        val c = Calendar.getInstance(UTC).apply { time = formato().parse(dia)!!; add(Calendar.DAY_OF_MONTH, n) }
        formato().format(c.time)
    }.getOrDefault(dia)

    private fun instante(j: JogoEsporte): Long =
        j.kickoffUtcMs ?: runCatching { formato().parse(j.data)!!.time + TRES_HORAS_MS + 20L * 3600 * 1000 }.getOrDefault(Long.MAX_VALUE)

    private val INATIVO = setOf("CANCELLED", "POSTPONED")

    fun montar(janela: List<JogoEsporte>, competicoes: List<CompeticaoEsporte>, agoraMs: Long): List<PaginaEsportes> {
        val hoje = diaEmBrasilia(agoraMs)
        val inicio = somarDias(hoje, -3)
        val ontem = somarDias(hoje, -1)
        val fim = somarDias(hoje, 2)

        val resultados = janela.filter {
            it.status == "FINISHED" && it.placarMandante != null && it.placarVisitante != null && it.data >= inicio && it.data <= ontem
        }.sortedBy(::instante)
        val proximos = janela.filter {
            it.status !in INATIVO && it.data >= hoje && it.data <= fim &&
                (if (it.kickoffUtcMs != null) it.kickoffUtcMs > agoraMs else it.status == "SCHEDULED")
        }.sortedBy(::instante)

        val ordem = competicoes.sortedBy { it.ordem }.map { it.slug }.toMutableList()
        (resultados + proximos).forEach { if (it.slug !in ordem) ordem.add(it.slug) }
        fun nomeDe(slug: String) = competicoes.firstOrNull { it.slug == slug }?.nome
            ?: (resultados + proximos).firstOrNull { it.slug == slug }?.competicao ?: slug

        val paginas = mutableListOf<PaginaEsportes>()
        for (slug in ordem) {
            val r = resultados.filter { it.slug == slug }
            val p = proximos.filter { it.slug == slug }
            val partes = maxOf((r.size + JOGOS_POR_BLOCO - 1) / JOGOS_POR_BLOCO, (p.size + JOGOS_POR_BLOCO - 1) / JOGOS_POR_BLOCO)
            for (k in 0 until partes) {
                paginas.add(PaginaEsportes(
                    slug, nomeDe(slug),
                    r.drop(k * JOGOS_POR_BLOCO).take(JOGOS_POR_BLOCO),
                    p.drop(k * JOGOS_POR_BLOCO).take(JOGOS_POR_BLOCO),
                    k + 1, partes
                ))
            }
        }
        return paginas
    }

    /** Páginas desta exibição: continua do cursor (mesmo dia) e dá a volta no fim; sem páginas, nada. */
    fun daExibicao(total: Int, cursor: CursorEsportes?, hoje: String, quantas: Int = PAGINAS_POR_EXIBICAO): List<Int> {
        if (total <= 0) return emptyList()
        val inicio = if (cursor != null && cursor.dia == hoje && cursor.proxima in 0 until total) cursor.proxima else 0
        return (0 until quantas).map { (inicio + it) % total }
    }

    fun cursorDepois(indice: Int, total: Int, hoje: String) = CursorEsportes(hoje, if (total > 0) (indice + 1) % total else 0)

    fun diaDaSemana(dia: String): String = runCatching {
        val c = Calendar.getInstance(UTC).apply { time = formato().parse(dia)!! }
        "%s %s/%s".format(DIAS[c.get(Calendar.DAY_OF_WEEK) - 1], dia.substring(8, 10), dia.substring(5, 7))
    }.getOrDefault(dia)

    /** "HOJE", "AMANHÃ", "ONTEM" ou "QUA 23/09". */
    fun rotuloDia(dia: String, hoje: String): String = when (dia) {
        hoje -> "HOJE"
        somarDias(hoje, 1) -> "AMANHÃ"
        somarDias(hoje, -1) -> "ONTEM"
        else -> diaDaSemana(dia)
    }

    /** Iniciais do selo de reserva quando o time ainda não tem escudo conferido. */
    fun iniciais(nome: String): String {
        val partes = nome.replace(Regex("[^\\p{L}\\p{N} ]"), " ").split(Regex("\\s+")).filter { it.isNotBlank() }
        if (partes.isEmpty()) return "?"
        if (partes.size == 1) return partes[0].take(3).uppercase(Locale("pt", "BR"))
        return partes.take(3).joinToString("") { it.take(1) }.uppercase(Locale("pt", "BR"))
    }
}

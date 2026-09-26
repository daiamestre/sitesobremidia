package com.antigravity.player

import com.antigravity.player.widget.CompeticaoEsporte
import com.antigravity.player.widget.CursorEsportes
import com.antigravity.player.widget.EsportesPaginas
import com.antigravity.player.widget.EsportesText
import com.antigravity.player.widget.JogoEsporte
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * F-86 — mesma regra e mesmos casos do painel (src/tests/unit/esportesPaginas.test.ts): hoje é SÁBADO 10/10/2026 ->
 * resultados de qua/qui/sex, próximos de sáb/dom/seg; 3 + 3 por página; campeonato por campeonato; 3 páginas por
 * exibição e continuação na próxima. Jogos de TESTE.
 */
class EsportesPaginasTest {
    private val sabado = EsportesText.isoParaMs("2026-10-10T15:00:00Z")!! // 12:00 em Brasília
    private var n = 0
    private fun jogo(slug: String, data: String, hora: String, placar: Pair<Int, Int>?): JogoEsporte {
        n++
        val (h, m) = hora.split(":").map { it.toInt() }
        val utcH = h + 3
        val (dia, horaUtc) = if (utcH >= 24) EsportesPaginas.somarDias(data, 1) to utcH - 24 else data to utcH
        return JogoEsporte(
            codigo = if (slug == "brasileirao") "BSA" else "PD", competicao = if (slug == "brasileirao") "Brasileirão Série A" else "La Liga",
            slug = slug, mandante = "Casa $n", visitante = "Fora $n", placarMandante = placar?.first, placarVisitante = placar?.second,
            status = if (placar != null) "FINISHED" else "SCHEDULED", data = data, hora = hora,
            kickoffUtcMs = EsportesText.isoParaMs("%sT%02d:%02d:00Z".format(dia, horaUtc, m))
        )
    }
    private val comps = listOf(CompeticaoEsporte("brasileirao", "Brasileirão Série A", 0), CompeticaoEsporte("la-liga", "La Liga", 2))

    @Test fun `sabado - resultados de qua qui sex e proximos de sab dom seg`() {
        val janela = listOf(
            jogo("brasileirao", "2026-10-06", "20:00", 1 to 0), // terça: fora
            jogo("brasileirao", "2026-10-07", "19:00", 2 to 1),
            jogo("brasileirao", "2026-10-08", "21:30", 0 to 0),
            jogo("brasileirao", "2026-10-09", "20:00", 3 to 2),
            jogo("brasileirao", "2026-10-10", "10:00", 1 to 1), // sábado já jogado: nem resultado nem próximo
            jogo("brasileirao", "2026-10-10", "16:00", null),
            jogo("brasileirao", "2026-10-11", "16:00", null),
            jogo("brasileirao", "2026-10-12", "20:00", null),
            jogo("brasileirao", "2026-10-13", "20:00", null),   // D+3: fora
        )
        val p = EsportesPaginas.montar(janela, comps, sabado).first()
        assertEquals(listOf("2026-10-07", "2026-10-08", "2026-10-09"), p.resultados.map { it.data })
        assertEquals(listOf("2026-10-10", "2026-10-11", "2026-10-12"), p.proximos.map { it.data })
    }

    @Test fun `3 mais 3 por pagina, campeonato por campeonato`() {
        val janela = listOf(jogo("la-liga", "2026-10-08", "16:00", 1 to 0)) +
            listOf("2026-10-07", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-09").mapIndexed { i, d -> jogo("brasileirao", d, "1$i:00", i to 0) } +
            listOf("2026-10-10", "2026-10-11").map { jogo("brasileirao", it, "18:00", null) } +
            jogo("la-liga", "2026-10-11", "11:00", null)
        val paginas = EsportesPaginas.montar(janela, comps, sabado)
        assertEquals(
            listOf(listOf("brasileirao", 3, 2, "1/2"), listOf("brasileirao", 2, 0, "2/2"), listOf("la-liga", 1, 1, "1/1")),
            paginas.map { listOf(it.slug, it.resultados.size, it.proximos.size, "${it.parte}/${it.partes}") }
        )
        assertTrue(paginas[0].resultados.zipWithNext().all { (a, b) -> a.kickoffUtcMs!! <= b.kickoffUtcMs!! })
    }

    @Test fun `3 paginas por exibicao e continua de onde parou`() {
        val hoje = "2026-10-10"
        assertEquals(listOf(0, 1, 2), EsportesPaginas.daExibicao(7, null, hoje))
        assertEquals(listOf(3, 4, 5), EsportesPaginas.daExibicao(7, EsportesPaginas.cursorDepois(2, 7, hoje), hoje))
        assertEquals(listOf(6, 0, 1), EsportesPaginas.daExibicao(7, EsportesPaginas.cursorDepois(5, 7, hoje), hoje))
        assertEquals(listOf(4, 5, 6), EsportesPaginas.daExibicao(7, EsportesPaginas.cursorDepois(3, 7, hoje), hoje)) // cortada no meio
        assertEquals(listOf(0, 1, 2), EsportesPaginas.daExibicao(7, CursorEsportes("2026-10-09", 5), hoje))       // dia novo
        assertEquals(emptyList<Int>(), EsportesPaginas.daExibicao(0, null, hoje))
    }

    @Test fun `datas, rotulos e iniciais - nunca lanca excecao`() {
        assertEquals("2026-10-10", EsportesPaginas.diaEmBrasilia(EsportesText.isoParaMs("2026-10-11T02:30:00Z")!!))
        assertEquals("2026-09-28", EsportesPaginas.somarDias("2026-10-01", -3))
        assertEquals("", EsportesPaginas.somarDias("", 1))
        assertEquals("HOJE", EsportesPaginas.rotuloDia("2026-10-10", "2026-10-10"))
        assertEquals("AMANHÃ", EsportesPaginas.rotuloDia("2026-10-11", "2026-10-10"))
        assertEquals("ONTEM", EsportesPaginas.rotuloDia("2026-10-09", "2026-10-10"))
        assertEquals("QUA 07/10", EsportesPaginas.rotuloDia("2026-10-07", "2026-10-10"))
        assertEquals("FLA", EsportesPaginas.iniciais("Flamengo"))
        assertEquals("MU", EsportesPaginas.iniciais("Manchester United"))
    }

    @Test fun `le a janela v2 com escudos e competicoes do servidor`() {
        val json = Json.parseToJsonElement(
            """{"modo":"resultados","layout":2,"jogos":[],"competicoes":[{"slug":"brasileirao","nome":"Brasileirão Série A","ordem":0}],
               "janela":[{"slug":"brasileirao","competicao":"Brasileirão Série A","codigo":"BSA","ordemCompeticao":0,"mandante":"Flamengo","visitante":"Palmeiras",
               "placarMandante":2,"placarVisitante":1,"status":"FINISHED","data":"2026-10-07","hora":"19:00","kickoffUtc":"2026-10-07T22:00:00+00:00",
               "escudoMandante":"https://x.supabase.co/storage/v1/object/public/escudos-times/flamengo.png","escudoVisitante":"http://inseguro/p.png"}]}"""
        )
        val d = EsportesText.parse(json)!!
        assertEquals(2, d.layout)
        assertEquals("Brasileirão Série A", d.competicoes.single().nome)
        val j = d.janela.single()
        assertEquals("https://x.supabase.co/storage/v1/object/public/escudos-times/flamengo.png", j.escudoMandante)
        assertEquals(null, j.escudoVisitante) // só https
    }
}

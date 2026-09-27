package com.antigravity.player

import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.player.util.QueueManager
import com.antigravity.player.util.RodizioDePastas
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** F-93 — pasta da Biblioteca na playlist: 1 conteúdo da pasta por volta, do 1º ao último, e recomeça. Dados de TESTE. */
class RodizioDePastasTest {
    private fun m(id: String, ordem: Int, grupo: String? = null) =
        MediaItem(id, id, MediaType.IMAGE, 10, "https://x/$id.jpg", null, id, ordem, grupo = grupo)

    /** Simula o laço do Player (MainActivity): N itens tocados, com o cursor da pasta avançando a cada um. */
    private fun tocar(itens: List<MediaItem>, voltas: Int): List<String> {
        val cursor = HashMap<String, String>()
        val fila = QueueManager()
        val tocados = ArrayList<String>()
        repeat(voltas) {
            val lista = RodizioDePastas.umaPorGrupo(itens) { cursor[it] }
            val (item, _) = fila.getNextPlayableItem(lista)
            item!!
            tocados.add(item.id)
            fila.markAsProcessed(item)
            item.grupo?.let { g -> RodizioDePastas.seguinte(itens, item)?.let { cursor[g] = it } }
        }
        return tocados
    }

    @Test fun `pasta sozinha na playlist - um conteudo diferente por volta e recomeca`() {
        val pasta = (1..3).map { m("meme$it", 0, "P") }
        assertEquals(listOf("meme1", "meme2", "meme3", "meme1", "meme2"), tocar(pasta, 5))
    }

    @Test fun `pasta entre itens comuns - cada volta toca os comuns e UM da pasta`() {
        val itens = listOf(m("A", 0)) + (1..3).map { m("meme$it", 1, "P") } + listOf(m("B", 2))
        assertEquals(listOf("A", "meme1", "B", "A", "meme2", "B", "A", "meme3", "B", "A", "meme1"), tocar(itens, 11))
    }

    @Test fun `duas pastas giram cada uma no seu ritmo`() {
        val itens = (1..2).map { m("lot$it", 0, "L") } + (1..3).map { m("meme$it", 1, "M") }
        assertEquals(listOf("lot1", "meme1", "lot2", "meme2", "lot1", "meme3", "lot2", "meme1"), tocar(itens, 8))
    }

    @Test fun `conteudo removido da pasta - o cursor volta ao primeiro`() {
        val itens = (1..3).map { m("meme$it", 0, "P") }
        val lista = RodizioDePastas.umaPorGrupo(itens) { "meme-que-saiu" }
        assertEquals(listOf("meme1"), lista.map { it.id })
    }

    @Test fun `itens sem grupo ficam intactos e sem cursor`() {
        val itens = listOf(m("A", 0), m("B", 1))
        assertEquals(itens, RodizioDePastas.umaPorGrupo(itens) { null })
        assertNull(RodizioDePastas.seguinte(itens, itens[0]))
    }

    @Test fun `pasta com um conteudo so toca sempre o mesmo`() {
        assertEquals(listOf("unico", "unico", "unico"), tocar(listOf(m("unico", 0, "P")), 3))
    }
}

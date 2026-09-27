package com.antigravity.player.util

import android.content.Context
import com.antigravity.core.domain.model.MediaItem

/**
 * Pasta da Biblioteca na playlist (F-93). O servidor manda TODAS as mídias da pasta como itens comuns (download, cache
 * offline, integridade e limpeza continuam iguais), marcadas com o mesmo `grupo`. A cada volta da playlist entra UMA
 * delas — a "da vez" —, do 1º conteúdo ao último, e recomeça. O cursor fica gravado no aparelho (sobrevive a reinício,
 * a nova sincronização e a conteúdo novo na pasta).
 */
object RodizioDePastas {

    /** Membros de cada grupo, na ordem do servidor (ordem da pasta). */
    fun membros(itens: List<MediaItem>, grupo: String): List<MediaItem> = itens.filter { it.grupo == grupo }

    /**
     * Lista desta volta: itens comuns intactos; de cada grupo, só o membro da vez (id gravado; sumiu -> o 1º),
     * na posição do grupo.
     */
    fun umaPorGrupo(itens: List<MediaItem>, daVez: (String) -> String?): List<MediaItem> {
        val escolhido = HashMap<String, MediaItem>()
        itens.mapNotNull { it.grupo }.distinct().forEach { g ->
            val ms = membros(itens, g)
            val id = daVez(g)
            escolhido[g] = ms.firstOrNull { it.id == id } ?: ms.first()
        }
        val usados = HashSet<String>()
        return itens.mapNotNull { item ->
            val g = item.grupo ?: return@mapNotNull item
            if (!usados.add(g)) null else escolhido[g]
        }
    }

    /** Depois de tocar `atual`, o próximo do grupo (o último volta ao 1º). null = item sem grupo. */
    fun seguinte(itens: List<MediaItem>, atual: MediaItem): String? {
        val g = atual.grupo ?: return null
        val ms = membros(itens, g)
        if (ms.isEmpty()) return null
        val i = ms.indexOfFirst { it.id == atual.id }
        return ms[(i + 1).mod(ms.size)].id
    }
}

/** Cursor do rodízio por grupo (SharedPreferences, como o cursor do widget Esportes). */
class CursorDePastas(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("pasta_cursor", Context.MODE_PRIVATE)
    fun daVez(grupo: String): String? = prefs.getString(grupo, null)
    fun gravar(grupo: String, mediaId: String) { prefs.edit().putString(grupo, mediaId).apply() }

    /** Avança o grupo de `item` (tocou ou falhou: o rodízio nunca fica preso num conteúdo com defeito). */
    fun avancar(itensDaPlaylist: List<MediaItem>, item: MediaItem) {
        val g = item.grupo ?: return
        RodizioDePastas.seguinte(itensDaPlaylist, item)?.let { gravar(g, it) }
    }
}

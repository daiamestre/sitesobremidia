package com.antigravity.player.widget

import java.net.URI
import java.net.URLEncoder

/** YouTube: só pelo player OFICIAL (embed youtube-nocookie). Mesmas regras do painel (src/lib/youtube.ts). */
data class YoutubeRef(val playlist: Boolean, val id: String)

object YoutubeLink {
    private val VIDEO = Regex("^[A-Za-z0-9_-]{11}$")
    private val LISTA = Regex("^[A-Za-z0-9_-]{10,64}$")
    private val CANAL = Regex("^UC[A-Za-z0-9_-]{22}$")

    fun ler(entrada: String?): YoutubeRef? {
        val t = entrada?.trim().orEmpty()
        if (t.isEmpty()) return null
        if (CANAL.matches(t)) return YoutubeRef(true, "UU" + t.substring(2))
        val u = try { URI(if (t.startsWith("http://", true) || t.startsWith("https://", true)) t else "https://$t") } catch (e: Exception) { return null }
        val host = (u.host ?: return null).lowercase().removePrefix("www.").removePrefix("m.").removePrefix("music.")
        val partes = (u.rawPath ?: "").split("/").filter { it.isNotEmpty() }
        val query = (u.rawQuery ?: "").split("&").mapNotNull { p -> p.split("=", limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] } }.toMap()
        if (host == "youtu.be") return partes.firstOrNull()?.takeIf { VIDEO.matches(it) }?.let { YoutubeRef(false, it) }
        if (host != "youtube.com" && host != "youtube-nocookie.com") return null
        query["v"]?.takeIf { VIDEO.matches(it) }?.let { return YoutubeRef(false, it) }
        if (partes.firstOrNull() in setOf("shorts", "live", "embed")) partes.getOrNull(1)?.takeIf { VIDEO.matches(it) }?.let { return YoutubeRef(false, it) }
        if (partes.firstOrNull() == "channel") partes.getOrNull(1)?.takeIf { CANAL.matches(it) }?.let { return YoutubeRef(true, "UU" + it.substring(2)) }
        query["list"]?.takeIf { LISTA.matches(it) }?.let { return YoutubeRef(true, it) }
        return null
    }

    /** Player oficial: mudo (autoplay só é permitido sem som), sem controles, repetindo. */
    fun embedUrl(ref: YoutubeRef): String {
        val base = "autoplay=1&mute=1&controls=0&rel=0&playsinline=1&modestbranding=1&loop=1"
        val id = URLEncoder.encode(ref.id, "UTF-8")
        return if (ref.playlist) "https://www.youtube-nocookie.com/embed/videoseries?$base&list=$id"
        else "https://www.youtube-nocookie.com/embed/$id?$base&playlist=$id"
    }

    /**
     * Com imagem de fundo, o vídeo (16:9) fica centralizado sobre o fundo: até 94% da largura e 82% da altura.
     * Mesma regra do painel (YouTubeWidget: width = min(94cqw, 82cqh * 16/9)). Retorna (largura, altura) em px.
     */
    fun caixaSobreFundo(w: Int, h: Int): Pair<Int, Int> {
        val largura = minOf(w * 0.94f, h * 0.82f * 16f / 9f)
        return largura.toInt() to (largura * 9f / 16f).toInt()
    }
}

/** Post Social / Instagram montado com o que o usuário enviou (nada é buscado na rede social). */
data class PostSocial(
    /** instagram | facebook | tiktok | linkedin | x | geral */
    val rede: String,
    val perfil: String?,
    val autor: String?,
    val titulo: String?,
    val texto: String?,
    val imagemUrl: String?
) {
    val seloRede: String get() = when (rede) {
        "instagram" -> "INSTAGRAM"; "facebook" -> "FACEBOOK"; "tiktok" -> "TIKTOK"
        "linkedin" -> "LINKEDIN"; "x" -> "X"; else -> "SOCIAL"
    }

    companion object {
        private val REDES = setOf("instagram", "facebook", "tiktok", "linkedin", "x", "geral")
        /** widget "instagram" é sempre Instagram; "social" usa a rede escolhida. */
        fun redeDo(rawType: String, rede: String?): String =
            if (rawType.lowercase().contains("instagram")) "instagram" else rede?.lowercase()?.takeIf { it in REDES } ?: "geral"
        fun perfilComArroba(p: String?): String? = p?.trim()?.removePrefix("@")?.takeIf { it.isNotEmpty() }?.let { "@$it" }
    }
}

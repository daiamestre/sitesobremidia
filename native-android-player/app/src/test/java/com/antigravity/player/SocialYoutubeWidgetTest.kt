package com.antigravity.player

import com.antigravity.player.widget.PostSocial
import com.antigravity.player.widget.WidgetKind
import com.antigravity.player.widget.WidgetSpecParser
import com.antigravity.player.widget.YoutubeLink
import com.antigravity.player.widget.YoutubeRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.net.URLEncoder

/** W9 — YouTube só pelo player oficial e post Social/Instagram com o que o usuário enviou (mesmas regras do painel). */
class SocialYoutubeWidgetTest {

    private fun url(type: String, cfg: String) = "native_widget://$type/abc?config=" + URLEncoder.encode(cfg, "UTF-8")

    @Test
    fun youtube_mesmosLinksDoPainel() {
        val v = YoutubeRef(false, "dQw4w9WgXcQ")
        assertEquals(v, YoutubeLink.ler("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s"))
        assertEquals(v, YoutubeLink.ler("youtu.be/dQw4w9WgXcQ"))
        assertEquals(v, YoutubeLink.ler("https://m.youtube.com/shorts/dQw4w9WgXcQ"))
        assertEquals(v, YoutubeLink.ler("https://youtube.com/live/dQw4w9WgXcQ"))
        assertEquals(v, YoutubeLink.ler("https://www.youtube.com/embed/dQw4w9WgXcQ"))
        assertEquals(YoutubeRef(true, "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG"), YoutubeLink.ler("https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG"))
        assertEquals(YoutubeRef(true, "UUuAXFkgsw1L7xaCfnd5JJOw"), YoutubeLink.ler("https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw"))
        assertEquals(YoutubeRef(true, "UUuAXFkgsw1L7xaCfnd5JJOw"), YoutubeLink.ler("UCuAXFkgsw1L7xaCfnd5JJOw"))
        assertNull(YoutubeLink.ler("https://www.youtube.com/@canal"))
        assertNull(YoutubeLink.ler("https://vimeo.com/123"))
        assertNull(YoutubeLink.ler("https://evil.com/watch?v=dQw4w9WgXcQ"))
        assertNull(YoutubeLink.ler(""))
        // mesma URL do painel (src/lib/youtube.ts)
        assertEquals("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=0&rel=0&playsinline=1&modestbranding=1&loop=1&playlist=dQw4w9WgXcQ",
            YoutubeLink.embedUrl(v))
    }

    @Test
    fun spec_youtubeESocial() {
        val y = WidgetSpecParser.parse(url("youtube", """{"youtubeUrl":"youtu.be/dQw4w9WgXcQ"}"""))
        assertEquals(WidgetKind.YOUTUBE, y.kind)
        assertEquals("dQw4w9WgXcQ", y.youtube!!.id)
        assertNull(WidgetSpecParser.parse(url("youtube", """{"youtubeUrl":"https://evil.com"}""")).youtube)

        val i = WidgetSpecParser.parse(url("instagram", """{"rede":"facebook","perfil":"sualoja","titulo":"Novidade","imagemPost":"https://r2/x.jpg"}"""))
        assertEquals(WidgetKind.SOCIAL, i.kind)
        assertEquals("instagram", i.post!!.rede) // widget instagram é sempre Instagram
        assertEquals("INSTAGRAM", i.post!!.seloRede)
        assertEquals("https://r2/x.jpg", i.post!!.imagemUrl)
        assertEquals("@sualoja", PostSocial.perfilComArroba(i.post!!.perfil))

        val s = WidgetSpecParser.parse(url("social", """{"rede":"linkedin","imagemPost":"file:///x.jpg"}"""))
        assertEquals("linkedin", s.post!!.rede)
        assertNull(s.post!!.imagemUrl) // só http(s)
        assertEquals("geral", WidgetSpecParser.parse(url("social", """{"rede":"orkut"}""")).post!!.rede)
    }
}

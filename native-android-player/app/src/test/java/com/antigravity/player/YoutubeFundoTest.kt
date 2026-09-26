package com.antigravity.player

import com.antigravity.player.widget.YoutubeLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** YouTube com imagem de fundo: vídeo 16:9 centralizado, até 94% da largura e 82% da altura (igual ao painel). */
class YoutubeFundoTest {
    @Test fun `tela horizontal limita pela altura`() {
        val (w, h) = YoutubeLink.caixaSobreFundo(1920, 1080)
        assertEquals(1574, w) // 1080 * 0,82 * 16/9
        assertEquals(885, h)
        assertTrue(w <= 1920 * 0.94)
    }

    @Test fun `tela vertical (totem) limita pela largura`() {
        val (w, h) = YoutubeLink.caixaSobreFundo(1080, 1920)
        assertEquals(1015, w) // 1080 * 0,94
        assertEquals(571, h)
        assertTrue(h <= 1920 * 0.82)
    }
}

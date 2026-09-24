package com.antigravity.player

import com.antigravity.player.util.PlayerFlowPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Padrão SOBRE MÍDIA: 16x9 = mídia deitada (TV normal); 9x16 = mídia em pé (totem, TV virada).
 * TV Box/Smart TV ignoram pedido de orientação do app: o player gira o próprio canvas.
 */
class TvCanvasRotationTest {

    @Test
    fun tv_portraitPlaylist_onLandscapePanel_rotatesCanvasToFillTotem() {
        val t = PlayerFlowPolicy.tvCanvasTransform(true, "portrait", displayWidth = 1920, displayHeight = 1080)
        assertNotNull("9x16 numa TV deitada precisa girar o canvas (totem)", t)
        t!!
        // canvas lógico em pé 1080x1920 girado 90° e centralizado cobre exatamente o painel 1920x1080
        assertEquals(1080, t.width)
        assertEquals(1920, t.height)
        assertEquals(PlayerFlowPolicy.TV_CANVAS_ROTATION, t.rotation, 0f)
        assertEquals(420f, t.translationX, 0f)
        assertEquals(-420f, t.translationY, 0f)
    }

    @Test
    fun tv_4k_portraitPlaylist_rotatesAndCenters() {
        val t = PlayerFlowPolicy.tvCanvasTransform(true, "portrait", 3840, 2160)!!
        assertEquals(2160, t.width); assertEquals(3840, t.height)
        assertEquals(840f, t.translationX, 0f); assertEquals(-840f, t.translationY, 0f)
    }

    @Test
    fun tv_landscapePlaylist_onLandscapePanel_drawsNormally() {
        assertNull(PlayerFlowPolicy.tvCanvasTransform(true, "landscape", 1920, 1080))
    }

    @Test
    fun tv_landscapePlaylist_onPortraitPanel_rotatesToLandscape() {
        val t = PlayerFlowPolicy.tvCanvasTransform(true, "landscape", 1080, 1920)!!
        assertEquals(1920, t.width); assertEquals(1080, t.height)
    }

    @Test
    fun phoneAndTablet_neverRotateCanvas_theSystemLocksOrientation() {
        assertNull(PlayerFlowPolicy.tvCanvasTransform(false, "portrait", 1920, 1080))
        assertNull(PlayerFlowPolicy.tvCanvasTransform(false, "landscape", 1080, 1920))
    }

    @Test
    fun invalidSize_drawsNormally() {
        assertNull(PlayerFlowPolicy.tvCanvasTransform(true, "portrait", 0, 0))
    }
}

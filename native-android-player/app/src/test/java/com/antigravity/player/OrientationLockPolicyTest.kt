package com.antigravity.player

import android.content.pm.ActivityInfo
import com.antigravity.player.util.PlayerFlowPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Signage: o player roda SEMPRE na orientação da playlist do painel (16x9 deitado / 9x16 em pé).
 * No celular a tela não pode girar com o sensor quando o usuário vira o aparelho.
 */
class OrientationLockPolicyTest {

    @Test
    fun phone_landscapePlaylist_locksLandscape_ignoringSensor() {
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE,
            PlayerFlowPolicy.physicalOrientationLock("landscape", isTelevision = false, forcedByPanel = false))
    }

    @Test
    fun phone_portraitPlaylist_locksPortrait_ignoringSensor() {
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT,
            PlayerFlowPolicy.physicalOrientationLock("portrait", isTelevision = false, forcedByPanel = false))
    }

    @Test
    fun tv_withoutPanelCommand_isNotForced() {
        assertNull(PlayerFlowPolicy.physicalOrientationLock("portrait", isTelevision = true, forcedByPanel = false))
        assertNull(PlayerFlowPolicy.physicalOrientationLock("landscape", isTelevision = true, forcedByPanel = false))
    }

    @Test
    fun panelRotateCommand_stillForcesOnAnyDevice() {
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT,
            PlayerFlowPolicy.physicalOrientationLock("portrait", isTelevision = true, forcedByPanel = true))
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE,
            PlayerFlowPolicy.physicalOrientationLock("landscape", isTelevision = false, forcedByPanel = true))
    }

    @Test
    fun unknownOrientation_isNotForced() {
        assertNull(PlayerFlowPolicy.physicalOrientationLock(null, isTelevision = false, forcedByPanel = false))
    }
}

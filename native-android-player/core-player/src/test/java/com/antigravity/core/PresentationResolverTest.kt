package com.antigravity.core

import com.antigravity.core.domain.model.DevicePhysicalOrientation
import com.antigravity.core.domain.model.PlaylistOrientation
import com.antigravity.core.domain.model.PresentationResolver
import com.antigravity.core.domain.model.ScaleMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PresentationResolverTest {

    @Test
    fun testPlaylistOrientationParsing() {
        assertEquals(PlaylistOrientation.PORTRAIT_9_16, PlaylistOrientation.fromResolutionOrOrientation("9:16"))
        assertEquals(PlaylistOrientation.PORTRAIT_9_16, PlaylistOrientation.fromResolutionOrOrientation("9x16"))
        assertEquals(PlaylistOrientation.PORTRAIT_9_16, PlaylistOrientation.fromResolutionOrOrientation("portrait"))
        assertEquals(PlaylistOrientation.PORTRAIT_9_16, PlaylistOrientation.fromResolutionOrOrientation("vertical"))
        assertEquals(PlaylistOrientation.PORTRAIT_9_16, PlaylistOrientation.fromResolutionOrOrientation("retrato"))

        assertEquals(PlaylistOrientation.LANDSCAPE_16_9, PlaylistOrientation.fromResolutionOrOrientation("16:9"))
        assertEquals(PlaylistOrientation.LANDSCAPE_16_9, PlaylistOrientation.fromResolutionOrOrientation("16x9"))
        assertEquals(PlaylistOrientation.LANDSCAPE_16_9, PlaylistOrientation.fromResolutionOrOrientation("landscape"))
        assertEquals(PlaylistOrientation.LANDSCAPE_16_9, PlaylistOrientation.fromResolutionOrOrientation("horizontal"))
        assertEquals(PlaylistOrientation.LANDSCAPE_16_9, PlaylistOrientation.fromResolutionOrOrientation("paisagem"))

        // Fallback when resolution is null or unknown
        assertEquals(PlaylistOrientation.PORTRAIT_9_16, PlaylistOrientation.fromResolutionOrOrientation(null, "portrait"))
        assertEquals(PlaylistOrientation.LANDSCAPE_16_9, PlaylistOrientation.fromResolutionOrOrientation(null, "landscape"))
        assertEquals(PlaylistOrientation.LANDSCAPE_16_9, PlaylistOrientation.fromResolutionOrOrientation(null, null))
    }

    @Test
    fun testScenarioA1_Playlist9_16_on_Device9_16() {
        // Physical Portrait display 1080x1920 with 9:16 playlist
        val resolved = PresentationResolver.resolve(
            playlistOrientation = PlaylistOrientation.PORTRAIT_9_16,
            displayWidth = 1080,
            displayHeight = 1920,
            deviceOrientation = DevicePhysicalOrientation.PORTRAIT
        )

        assertEquals(PlaylistOrientation.PORTRAIT_9_16, resolved.logicalOrientation)
        assertEquals(DevicePhysicalOrientation.PORTRAIT, resolved.deviceOrientation)
        assertEquals(1080, resolved.viewportWidth)
        assertEquals(1920, resolved.viewportHeight)
        assertEquals(ScaleMode.EXACT_FILL, resolved.scaleMode)
        assertFalse(resolved.isPillarboxed)
        assertFalse(resolved.isLetterboxed)
    }

    @Test
    fun testScenarioA2_Playlist9_16_on_Device16_9() {
        // Physical Landscape display 1920x1080 with 9:16 playlist
        // Must preserve 9:16 ratio -> Pillarbox centered (black bars on left/right)
        val resolved = PresentationResolver.resolve(
            playlistOrientation = PlaylistOrientation.PORTRAIT_9_16,
            displayWidth = 1920,
            displayHeight = 1080,
            deviceOrientation = DevicePhysicalOrientation.LANDSCAPE
        )

        assertEquals(PlaylistOrientation.PORTRAIT_9_16, resolved.logicalOrientation)
        assertEquals(DevicePhysicalOrientation.LANDSCAPE, resolved.deviceOrientation)
        assertEquals(608, resolved.viewportWidth) // 1080 * 9 / 16 = 607.5 -> 608
        assertEquals(1080, resolved.viewportHeight)
        assertEquals(ScaleMode.FIT_LETTERBOX_OR_PILLARBOX, resolved.scaleMode)
        assertTrue(resolved.isPillarboxed)
        assertFalse(resolved.isLetterboxed)
    }

    @Test
    fun testScenarioB1_Playlist16_9_on_Device16_9() {
        // Physical Landscape display 1920x1080 with 16:9 playlist
        val resolved = PresentationResolver.resolve(
            playlistOrientation = PlaylistOrientation.LANDSCAPE_16_9,
            displayWidth = 1920,
            displayHeight = 1080,
            deviceOrientation = DevicePhysicalOrientation.LANDSCAPE
        )

        assertEquals(PlaylistOrientation.LANDSCAPE_16_9, resolved.logicalOrientation)
        assertEquals(DevicePhysicalOrientation.LANDSCAPE, resolved.deviceOrientation)
        assertEquals(1920, resolved.viewportWidth)
        assertEquals(1080, resolved.viewportHeight)
        assertEquals(ScaleMode.EXACT_FILL, resolved.scaleMode)
        assertFalse(resolved.isPillarboxed)
        assertFalse(resolved.isLetterboxed)
    }

    @Test
    fun testScenarioB2_Playlist16_9_on_Device9_16() {
        // Physical Portrait display 1080x1920 with 16:9 playlist
        // Must preserve 16:9 ratio -> Letterbox centered (black bars on top/bottom)
        val resolved = PresentationResolver.resolve(
            playlistOrientation = PlaylistOrientation.LANDSCAPE_16_9,
            displayWidth = 1080,
            displayHeight = 1920,
            deviceOrientation = DevicePhysicalOrientation.PORTRAIT
        )

        assertEquals(PlaylistOrientation.LANDSCAPE_16_9, resolved.logicalOrientation)
        assertEquals(DevicePhysicalOrientation.PORTRAIT, resolved.deviceOrientation)
        assertEquals(1080, resolved.viewportWidth)
        assertEquals(608, resolved.viewportHeight) // 1080 / (16/9) = 607.5 -> 608
        assertEquals(ScaleMode.FIT_LETTERBOX_OR_PILLARBOX, resolved.scaleMode)
        assertFalse(resolved.isPillarboxed)
        assertTrue(resolved.isLetterboxed)
    }

    @Test
    fun testRotationTransitions_PreserveLogicalContract() {
        val playlist = PlaylistOrientation.PORTRAIT_9_16

        // 1. Initially in Landscape (1920x1080)
        val r1 = PresentationResolver.resolve(playlist, 1920, 1080, DevicePhysicalOrientation.LANDSCAPE)
        assertEquals(PlaylistOrientation.PORTRAIT_9_16, r1.logicalOrientation)
        assertTrue(r1.isPillarboxed)

        // 2. User rotates device to Portrait (1080x1920)
        val r2 = PresentationResolver.resolve(playlist, 1080, 1920, DevicePhysicalOrientation.PORTRAIT)
        assertEquals(PlaylistOrientation.PORTRAIT_9_16, r2.logicalOrientation)
        assertEquals(ScaleMode.EXACT_FILL, r2.scaleMode)
        assertFalse(r2.isPillarboxed)

        // 3. User rotates back to Landscape (1920x1080)
        val r3 = PresentationResolver.resolve(playlist, 1920, 1080, DevicePhysicalOrientation.LANDSCAPE)
        assertEquals(PlaylistOrientation.PORTRAIT_9_16, r3.logicalOrientation)
        assertTrue(r3.isPillarboxed)
    }
}

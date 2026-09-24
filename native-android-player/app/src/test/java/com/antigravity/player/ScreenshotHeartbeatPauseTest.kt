package com.antigravity.player

import com.antigravity.player.util.ScreenshotCoordinator
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * F-33: o heartbeat era pausado pelo screenshot sem prazo. Se a captura nunca voltava, o heartbeat
 * parava para sempre e o painel mostrava o dispositivo OFFLINE (last_ping_at velho).
 */
class ScreenshotHeartbeatPauseTest {
    private var now = 1_000_000L

    @Before fun setUp() { ScreenshotCoordinator.clock = { now }; ScreenshotCoordinator.isHeartbeatPaused = false }
    @After fun tearDown() { ScreenshotCoordinator.isHeartbeatPaused = false; ScreenshotCoordinator.clock = { System.currentTimeMillis() } }

    @Test fun pausedRightAfterRequest() {
        ScreenshotCoordinator.isHeartbeatPaused = true
        assertTrue(ScreenshotCoordinator.isHeartbeatPaused)
    }

    @Test fun pauseExpiresByItself() {
        ScreenshotCoordinator.isHeartbeatPaused = true
        now += ScreenshotCoordinator.MAX_PAUSE_MS + 1
        assertFalse("a pausa nao pode ser eterna", ScreenshotCoordinator.isHeartbeatPaused)
    }

    @Test fun explicitReleaseWorks() {
        ScreenshotCoordinator.isHeartbeatPaused = true
        ScreenshotCoordinator.isHeartbeatPaused = false
        assertFalse(ScreenshotCoordinator.isHeartbeatPaused)
    }
}

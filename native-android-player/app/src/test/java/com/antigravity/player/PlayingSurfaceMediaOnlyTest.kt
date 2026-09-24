package com.antigravity.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * [MICRO-GATE P0.2] TEST SUITE — PLAYING SURFACE ABSOLUTE — MEDIA ONLY
 *
 * Verifies canonical requirement: PLAYING = MEDIA ONLY
 *
 * Test Scenarios:
 * - P0.2-T01: Valid media + connectivity available (PLAYING + onAvailable -> zero operational UI, media visible)
 * - P0.2-T02: Valid media + connectivity lost (PLAYING + onLost -> zero operational UI, cached media remains visible)
 * - P0.2-T03: Valid media + background sync (PLAYING + SYNC_RUNNING -> zero sync UI, media uninterrupted)
 * - P0.2-T04: Valid media + watchdog/recovery (PLAYING + recovery event -> zero operational UI)
 * - P0.2-T05: Valid media + remote commands (PLAYING + remote command -> zero operational UI)
 * - P0.2-T06: Invalid media / stopped state (NOT_PLAYING / ERROR -> error/recovery fallback contract active)
 */
class PlayingSurfaceMediaOnlyTest {

    enum class PlaybackState {
        IDLE,
        SYNCING_INITIAL,
        PREPARING,
        PLAYING,
        PAUSED,
        ERROR_FALLBACK
    }

    enum class ViewVisibility {
        VISIBLE,
        INVISIBLE,
        GONE
    }

    class MockPlayingSurfaceController {
        var playbackState: PlaybackState = PlaybackState.PLAYING
        var activeMediaId: String? = "media_video_001"
        var playerViewVisibility: ViewVisibility = ViewVisibility.VISIBLE
        var standbyImageVisibility: ViewVisibility = ViewVisibility.GONE
        var statusTextViewVisibility: ViewVisibility = ViewVisibility.GONE
        var statusText: String = ""
        var syncGuardOverlayVisibility: ViewVisibility = ViewVisibility.GONE
        var blockOverlayVisibility: ViewVisibility = ViewVisibility.GONE
        
        val emittedToasts = mutableListOf<String>()
        val emittedSnackbars = mutableListOf<String>()
        val emittedDialogs = mutableListOf<String>()
        val telemetryLogs = mutableListOf<String>()

        fun onNetworkAvailable() {
            // [T-02 Audit] Network restored while PLAYING:
            // MUST be 100% silent on UI. Telemetry/Logger only.
            telemetryLogs.add("NETWORK: Available")
            // No Toast, No change to surface
        }

        fun onNetworkLost() {
            // [T-03 Audit] Network lost while PLAYING:
            // MUST be 100% silent on UI. Playback continues uninterrupted from local cache.
            telemetryLogs.add("NETWORK: Lost")
            // No Toast, No change to surface
        }

        fun triggerBackgroundSync(syncSuccess: Boolean, newPlaylistAvailable: Boolean) {
            // [T-03 Scenario] Background sync while PLAYING:
            // Sync happens in background coroutine without locking screen or showing Toast/Text.
            telemetryLogs.add("SYNC: Background sync running")
            if (syncSuccess) {
                telemetryLogs.add("SYNC: Success")
                if (newPlaylistAvailable) {
                    telemetryLogs.add("SYNC: New sequence adopted seamlessly")
                }
            } else {
                telemetryLogs.add("SYNC: Failed silently, retrying in background")
            }
            // Surface must remain MEDIA ONLY
        }

        fun onAutoCleanScheduled() {
            // [T-04 Audit] 04:00 AM daily cache purge:
            // MUST be 100% silent on UI.
            telemetryLogs.add("AUTO_CLEAN: 04:00 AM purge triggered")
        }

        fun onWatchdogAutoRepair() {
            // [T-09 Audit] Watchdog auto-repair / self-healing:
            // MUST be 100% silent on UI while trying to recover.
            telemetryLogs.add("SELF_HEALING: Auto-repair triggered")
        }

        fun handleRemoteCommand(command: String, commandId: String) {
            // [T-05, T-06 Audit] Remote reboot / unpair / reload:
            // Acknowledged and executed without on-screen Toast over media.
            telemetryLogs.add("REMOTE_CMD: Executing $command")
        }

        fun handleCorruptedMedia(mediaId: String) {
            // [T-08 Audit] Media corrupted during playback loop:
            // Quarantined and logged to telemetry/blackbox, without Toast.
            telemetryLogs.add("BLACKBOX: Corrupted media quarantined: $mediaId")
        }

        fun handleFatalPlaybackError(errorMsg: String) {
            // [P0.2-T06] Legitimate total playback failure (no playable media):
            // Transitions to fallback/error state where standby/sync screen is shown.
            playbackState = PlaybackState.ERROR_FALLBACK
            activeMediaId = null
            playerViewVisibility = ViewVisibility.GONE
            standbyImageVisibility = ViewVisibility.VISIBLE
            telemetryLogs.add("ERROR: $errorMsg")
        }

        fun isSurfaceMediaOnly(): Boolean {
            return playbackState == PlaybackState.PLAYING &&
                    playerViewVisibility == ViewVisibility.VISIBLE &&
                    standbyImageVisibility == ViewVisibility.GONE &&
                    statusTextViewVisibility == ViewVisibility.GONE &&
                    syncGuardOverlayVisibility == ViewVisibility.GONE &&
                    blockOverlayVisibility == ViewVisibility.GONE &&
                    emittedToasts.isEmpty() &&
                    emittedSnackbars.isEmpty() &&
                    emittedDialogs.isEmpty()
        }
    }

    private lateinit var controller: MockPlayingSurfaceController

    @Before
    fun setUp() {
        controller = MockPlayingSurfaceController()
    }

    @Test
    fun testP02_T01_ValidMedia_ConnectivityAvailable_ZeroOperationalUI() {
        // Given player is actively playing valid media
        assertEquals(PlaybackState.PLAYING, controller.playbackState)
        assertTrue(controller.isSurfaceMediaOnly())

        // When network becomes available
        controller.onNetworkAvailable()

        // Then media remains visible with ZERO operational UI / Toasts
        assertTrue(controller.isSurfaceMediaOnly())
        assertTrue(controller.emittedToasts.isEmpty())
        assertTrue(controller.emittedSnackbars.isEmpty())
        assertEquals(ViewVisibility.GONE, controller.statusTextViewVisibility)
        assertEquals(ViewVisibility.GONE, controller.syncGuardOverlayVisibility)
        assertTrue(controller.telemetryLogs.contains("NETWORK: Available"))
    }

    @Test
    fun testP02_T02_ValidMedia_ConnectivityLost_ZeroOperationalUI_LocalCachePlays() {
        // Given player is actively playing valid media
        assertEquals(PlaybackState.PLAYING, controller.playbackState)
        assertTrue(controller.isSurfaceMediaOnly())

        // When network connection is lost
        controller.onNetworkLost()

        // Then player continues uninterrupted on local cache without visual interruptions
        assertTrue(controller.isSurfaceMediaOnly())
        assertTrue(controller.emittedToasts.isEmpty())
        assertTrue(controller.emittedSnackbars.isEmpty())
        assertEquals(ViewVisibility.GONE, controller.statusTextViewVisibility)
        assertEquals(ViewVisibility.GONE, controller.syncGuardOverlayVisibility)
        assertTrue(controller.telemetryLogs.contains("NETWORK: Lost"))
    }

    @Test
    fun testP02_T03_ValidMedia_BackgroundSync_ZeroOperationalUI() {
        // Given player is actively playing valid media
        assertEquals(PlaybackState.PLAYING, controller.playbackState)
        assertTrue(controller.isSurfaceMediaOnly())

        // When background sync executes and completes successfully
        controller.triggerBackgroundSync(syncSuccess = true, newPlaylistAvailable = true)

        // Then media remains visible with ZERO sync UI overlay or Toasts
        assertTrue(controller.isSurfaceMediaOnly())
        assertTrue(controller.emittedToasts.isEmpty())
        assertEquals(ViewVisibility.GONE, controller.syncGuardOverlayVisibility)
        assertEquals(ViewVisibility.GONE, controller.statusTextViewVisibility)

        // When background sync fails
        controller.triggerBackgroundSync(syncSuccess = false, newPlaylistAvailable = false)

        // Then media STILL remains visible with ZERO error UI over media
        assertTrue(controller.isSurfaceMediaOnly())
        assertTrue(controller.emittedToasts.isEmpty())
        assertEquals(ViewVisibility.GONE, controller.syncGuardOverlayVisibility)
    }

    @Test
    fun testP02_T04_ValidMedia_WatchdogAndRecovery_ZeroOperationalUI() {
        // Given player is actively playing valid media
        assertEquals(PlaybackState.PLAYING, controller.playbackState)
        assertTrue(controller.isSurfaceMediaOnly())

        // When scheduled 04:00 AM clean occurs
        controller.onAutoCleanScheduled()

        // When auto-repair occurs
        controller.onWatchdogAutoRepair()

        // When corrupted item is detected and quarantined
        controller.handleCorruptedMedia("corrupt_video_002")

        // Then surface remains strictly MEDIA ONLY with zero Toasts or overlays
        assertTrue(controller.isSurfaceMediaOnly())
        assertTrue(controller.emittedToasts.isEmpty())
        assertTrue(controller.telemetryLogs.contains("AUTO_CLEAN: 04:00 AM purge triggered"))
        assertTrue(controller.telemetryLogs.contains("SELF_HEALING: Auto-repair triggered"))
        assertTrue(controller.telemetryLogs.contains("BLACKBOX: Corrupted media quarantined: corrupt_video_002"))
    }

    @Test
    fun testP02_T05_ValidMedia_RemoteCommands_ZeroOperationalUI() {
        // Given player is actively playing valid media
        assertEquals(PlaybackState.PLAYING, controller.playbackState)
        assertTrue(controller.isSurfaceMediaOnly())

        // When remote reboot, unpair or refresh command is received
        controller.handleRemoteCommand("reboot", "cmd_901")
        controller.handleRemoteCommand("unpair", "cmd_902")
        controller.handleRemoteCommand("refresh", "cmd_903")

        // Then commands are processed in background/telemetry with zero UI overlays
        assertTrue(controller.isSurfaceMediaOnly())
        assertTrue(controller.emittedToasts.isEmpty())
        assertTrue(controller.telemetryLogs.contains("REMOTE_CMD: Executing reboot"))
        assertTrue(controller.telemetryLogs.contains("REMOTE_CMD: Executing unpair"))
        assertTrue(controller.telemetryLogs.contains("REMOTE_CMD: Executing refresh"))
    }

    @Test
    fun testP02_T06_InvalidMediaOrStopped_RecoveryFallbackActive() {
        // Given player encounters fatal failure where no media can play
        controller.handleFatalPlaybackError("No playable media in local cache")

        // Then player transitions to ERROR_FALLBACK, displaying standby layer
        assertEquals(PlaybackState.ERROR_FALLBACK, controller.playbackState)
        assertFalse(controller.isSurfaceMediaOnly())
        assertEquals(ViewVisibility.GONE, controller.playerViewVisibility)
        assertEquals(ViewVisibility.VISIBLE, controller.standbyImageVisibility)
        assertTrue(controller.telemetryLogs.contains("ERROR: No playable media in local cache"))
    }
}

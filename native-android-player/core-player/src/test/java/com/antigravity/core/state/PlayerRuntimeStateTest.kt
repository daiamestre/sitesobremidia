package com.antigravity.core.state

import com.antigravity.core.domain.state.KioskState
import com.antigravity.core.domain.state.MaintenanceSource
import com.antigravity.core.domain.state.MaintenanceState
import com.antigravity.core.domain.state.NetworkState
import com.antigravity.core.domain.state.PlaybackState
import com.antigravity.core.domain.state.PlayerRuntimeState
import com.antigravity.core.domain.state.SessionState
import com.antigravity.core.domain.state.SurfaceState
import com.antigravity.core.domain.state.SyncResult
import com.antigravity.core.domain.state.SyncState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Suite de Validação de Contrato do Modelo Canônico de Estado (P0.4.3).
 * Testa os 6 eixos canônicos ortogonais, a pureza das projeções de superfície
 * e as regras estritas de precedência de segurança.
 */
class PlayerRuntimeStateTest {

    private val sampleAuthorizedSession = SessionState.Authorized(
        screenId = "screen-101",
        hardwareHash = "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890"
    )

    private val samplePlayingState = PlaybackState.Playing(
        mediaId = "media-v1",
        mediaType = "VIDEO",
        durationMs = 15000L
    )

    // =========================================================================
    // TEST-01: Authorized + Playing -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun test01_authorizedAndPlaying_projectsMediaOnly() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingState,
            sync = SyncState.Idle,
            network = NetworkState.Online,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive
        )

        assertEquals(SurfaceState.MEDIA_ONLY, state.surface)
    }

    // =========================================================================
    // TEST-02: Authorized + Playing + Sync Downloading -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun test02_authorizedAndPlaying_withActiveSyncDownloading_preservesMediaOnly() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingState,
            sync = SyncState.DownloadingDelta(pendingCount = 3, totalCount = 10),
            network = NetworkState.Online,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive
        )

        assertEquals(
            "Background sync downloading MUST NOT destroy or displace the MEDIA_ONLY surface",
            SurfaceState.MEDIA_ONLY,
            state.surface
        )
    }

    // =========================================================================
    // TEST-03: Authorized + Playing + Offline -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun test03_authorizedAndPlaying_whileOffline_preservesMediaOnly() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingState,
            sync = SyncState.Idle,
            network = NetworkState.Offline,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive
        )

        assertEquals(
            "Offline playback from local cache MUST project MEDIA_ONLY surface",
            SurfaceState.MEDIA_ONLY,
            state.surface
        )
    }

    // =========================================================================
    // TEST-04: Suspended + any Playback -> BLOCKED
    // =========================================================================
    @Test
    fun test04_suspendedSession_forcesBlockedSurfaceAcrossAllPlaybackStates() {
        val suspendedSession = SessionState.Suspended(reason = "Pagamento pendente")

        val stateWithPlaying = PlayerRuntimeState(
            session = suspendedSession,
            playback = samplePlayingState
        )
        assertEquals(SurfaceState.BLOCKED, stateWithPlaying.surface)

        val stateWithPreparing = PlayerRuntimeState(
            session = suspendedSession,
            playback = PlaybackState.Preparing(mediaId = "m1")
        )
        assertEquals(SurfaceState.BLOCKED, stateWithPreparing.surface)

        val stateWithIdle = PlayerRuntimeState(
            session = suspendedSession,
            playback = PlaybackState.Idle
        )
        assertEquals(SurfaceState.BLOCKED, stateWithIdle.surface)

        val stateWithError = PlayerRuntimeState(
            session = suspendedSession,
            playback = PlaybackState.ErrorFallback(reason = "Codec error")
        )
        assertEquals(SurfaceState.BLOCKED, stateWithError.surface)
    }

    // =========================================================================
    // TEST-05: Revoked + any Playback -> BLOCKED
    // =========================================================================
    @Test
    fun test05_revokedSession_forcesBlockedSurfaceAcrossAllPlaybackStates() {
        val revokedSession = SessionState.Revoked(reason = "Hardware desvinculado")

        val stateWithPlaying = PlayerRuntimeState(
            session = revokedSession,
            playback = samplePlayingState
        )
        assertEquals(SurfaceState.BLOCKED, stateWithPlaying.surface)

        val stateWithPreparing = PlayerRuntimeState(
            session = revokedSession,
            playback = PlaybackState.Preparing(mediaId = "m2")
        )
        assertEquals(SurfaceState.BLOCKED, stateWithPreparing.surface)

        val stateWithIdle = PlayerRuntimeState(
            session = revokedSession,
            playback = PlaybackState.Idle
        )
        assertEquals(SurfaceState.BLOCKED, stateWithIdle.surface)

        val stateWithError = PlayerRuntimeState(
            session = revokedSession,
            playback = PlaybackState.ErrorFallback(reason = "Disk unreadable")
        )
        assertEquals(SurfaceState.BLOCKED, stateWithError.surface)
    }

    // =========================================================================
    // TEST-06: Unauthenticated -> LOGIN
    // =========================================================================
    @Test
    fun test06_unauthenticatedSession_projectsLoginSurface() {
        val state = PlayerRuntimeState(
            session = SessionState.Unauthenticated,
            playback = PlaybackState.Idle,
            sync = SyncState.Idle
        )

        assertEquals(SurfaceState.LOGIN, state.surface)
    }

    // =========================================================================
    // TEST-07: Unpaired -> SCREEN_SELECTION
    // =========================================================================
    @Test
    fun test07_unpairedSession_projectsScreenSelectionSurface() {
        val state = PlayerRuntimeState(
            session = SessionState.Unpaired,
            playback = PlaybackState.Idle,
            sync = SyncState.Idle
        )

        assertEquals(SurfaceState.SCREEN_SELECTION, state.surface)
    }

    // =========================================================================
    // TEST-08: Authorized + Preparing + Sync active -> SYNC_GUARD
    // =========================================================================
    @Test
    fun test08_authorizedAndPreparing_withSyncDownloading_projectsSyncGuard() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = PlaybackState.Preparing(mediaId = "media-init", isPreBuffer = false),
            sync = SyncState.DownloadingDelta(pendingCount = 5, totalCount = 5)
        )

        assertEquals(SurfaceState.SYNC_GUARD, state.surface)
    }

    // =========================================================================
    // TEST-09: Maintenance.Active + Playing -> does NOT produce BLOCKED
    // =========================================================================
    @Test
    fun test09_activeMaintenanceDuringPlayback_doesNotProduceBlockedSurface() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingState,
            kiosk = KioskState.Disabled,
            maintenance = MaintenanceState.Active(
                expiresAtMs = System.currentTimeMillis() + 180000L,
                source = MaintenanceSource.RemoteCommand
            )
        )

        assertNotEquals(SurfaceState.BLOCKED, state.surface)
        assertEquals(SurfaceState.MEDIA_ONLY, state.surface)
    }

    // =========================================================================
    // TEST-10: SyncResult separation (Sync.Failed not a persistent sync state)
    // =========================================================================
    @Test
    fun test10_syncResultSeparation_doesNotCorruptCanonicalSyncState() {
        val failureResult: SyncResult = SyncResult.Failed(
            reason = "HTTP 503 Service Unavailable",
            canRetry = true
        )
        val successResult: SyncResult = SyncResult.Success(itemsProcessed = 12)

        assertTrue(failureResult is SyncResult.Failed)
        assertEquals("HTTP 503 Service Unavailable", (failureResult as SyncResult.Failed).reason)
        assertTrue(failureResult.canRetry)

        assertTrue(successResult is SyncResult.Success)
        assertEquals(12, (successResult as SyncResult.Success).itemsProcessed)

        // The canonical SyncState remains in Idle after failure handling
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingState,
            sync = SyncState.Idle
        )
        assertEquals(SyncState.Idle, state.sync)
        assertEquals(SurfaceState.MEDIA_ONLY, state.surface)
    }

    // =========================================================================
    // ADDITIONAL TESTS: Immutability, Orthogonality & Precedence Isolation
    // =========================================================================
    @Test
    fun test11_playerRuntimeStateImmutability_andCopyOperations() {
        val baseState = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingState,
            sync = SyncState.Idle,
            network = NetworkState.Online
        )

        val transitionedState = baseState.copy(
            sync = SyncState.DownloadingDelta(pendingCount = 1, totalCount = 4),
            network = NetworkState.Offline
        )

        // Base state is immutable and unaffected
        assertEquals(SyncState.Idle, baseState.sync)
        assertEquals(NetworkState.Online, baseState.network)

        // Transitioned state holds new values
        assertEquals(SyncState.DownloadingDelta(1, 4), transitionedState.sync)
        assertEquals(NetworkState.Offline, transitionedState.network)
        assertEquals(SurfaceState.MEDIA_ONLY, transitionedState.surface)
    }

    @Test
    fun test12_exhaustiveMaintenanceSources() {
        val remoteSource = MaintenanceSource.RemoteCommand
        val localAdminSource = MaintenanceSource.LocalAdmin
        val timeoutSource = MaintenanceSource.TimeoutRecovery

        val stateRemote = MaintenanceState.Active(1000L, remoteSource)
        val stateLocal = MaintenanceState.Active(2000L, localAdminSource)
        val stateTimeout = MaintenanceState.Active(3000L, timeoutSource)

        assertEquals(MaintenanceSource.RemoteCommand, stateRemote.source)
        assertEquals(MaintenanceSource.LocalAdmin, stateLocal.source)
        assertEquals(MaintenanceSource.TimeoutRecovery, stateTimeout.source)
    }
}

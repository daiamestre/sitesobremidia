package com.antigravity.core.state

import com.antigravity.core.domain.renderer.RendererState
import com.antigravity.core.domain.state.KioskState
import com.antigravity.core.domain.state.MaintenanceSource
import com.antigravity.core.domain.state.MaintenanceState
import com.antigravity.core.domain.state.NetworkState
import com.antigravity.core.domain.state.PlaybackState
import com.antigravity.core.domain.state.SessionState
import com.antigravity.core.domain.state.SurfaceState
import com.antigravity.core.domain.state.SyncState
import com.antigravity.core.domain.state.adapter.KioskStateAdapter
import com.antigravity.core.domain.state.adapter.MaintenanceStateAdapter
import com.antigravity.core.domain.state.adapter.NetworkStateAdapter
import com.antigravity.core.domain.state.adapter.PlaybackStateAdapter
import com.antigravity.core.domain.state.adapter.PlayerRuntimeStateComposer
import com.antigravity.core.domain.state.adapter.SessionStateAdapter
import com.antigravity.core.domain.state.adapter.SyncStateAdapter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Suite de Testes Unitários dos Adapters Somente-Leitura e Compositor Canônico (P0.4.4).
 * Valida a integridade da tradução entre fontes de runtime existentes e o modelo canônico multi-eixos.
 */
class ReadOnlyAxisAdaptersTest {

    // =========================================================================
    // ADAPTER-01: Playback Real IDLE -> PlaybackState.Idle
    // =========================================================================
    @Test
    fun testAdapter01_playbackIdle_mapsToIdle() {
        val fromRenderer = PlaybackStateAdapter.adapt(RendererState.IDLE)
        assertEquals(PlaybackState.Idle, fromRenderer)

        val fromEnded = PlaybackStateAdapter.adapt(RendererState.ENDED)
        assertEquals(PlaybackState.Idle, fromEnded)

        val fromExoIdle = PlaybackStateAdapter.adaptExoPlayerState(
            playbackState = 1, // STATE_IDLE
            isPlaying = false
        )
        assertEquals(PlaybackState.Idle, fromExoIdle)
    }

    // =========================================================================
    // ADAPTER-02: Playback Real BUFFERING -> PlaybackState.Preparing
    // =========================================================================
    @Test
    fun testAdapter02_playbackBuffering_mapsToPreparing() {
        val fromRenderer = PlaybackStateAdapter.adapt(
            rendererState = RendererState.PREPARING,
            mediaId = "media-v1",
            isPreBuffer = false
        )
        assertTrue(fromRenderer is PlaybackState.Preparing)
        assertEquals("media-v1", (fromRenderer as PlaybackState.Preparing).mediaId)

        val fromExoBuffering = PlaybackStateAdapter.adaptExoPlayerState(
            playbackState = 2, // STATE_BUFFERING
            isPlaying = false,
            mediaId = "media-v1"
        )
        assertTrue(fromExoBuffering is PlaybackState.Preparing)
        assertEquals("media-v1", (fromExoBuffering as PlaybackState.Preparing).mediaId)
    }

    // =========================================================================
    // ADAPTER-03: Playback Real READY + isPlaying -> PlaybackState.Playing
    // =========================================================================
    @Test
    fun testAdapter03_playbackReadyAndPlaying_mapsToPlaying() {
        val fromRenderer = PlaybackStateAdapter.adapt(
            rendererState = RendererState.PLAYING,
            mediaId = "media-v10",
            mediaType = "VIDEO",
            durationMs = 15000L
        )
        assertTrue(fromRenderer is PlaybackState.Playing)
        val playing = fromRenderer as PlaybackState.Playing
        assertEquals("media-v10", playing.mediaId)
        assertEquals("VIDEO", playing.mediaType)
        assertEquals(15000L, playing.durationMs)

        val fromExoReady = PlaybackStateAdapter.adaptExoPlayerState(
            playbackState = 3, // STATE_READY
            isPlaying = true,
            mediaId = "media-v10",
            mediaType = "VIDEO",
            durationMs = 15000L
        )
        assertEquals(PlaybackState.Playing("media-v10", "VIDEO", 15000L), fromExoReady)
    }

    // =========================================================================
    // ADAPTER-04: Network Conectivity -> Online / Offline
    // =========================================================================
    @Test
    fun testAdapter04_networkConnectivity_mapsCorrectly() {
        assertEquals(NetworkState.Online, NetworkStateAdapter.adapt(true))
        assertEquals(NetworkState.Offline, NetworkStateAdapter.adapt(false))
    }

    // =========================================================================
    // ADAPTER-05: Session State Precedence & Mapping
    // =========================================================================
    @Test
    fun testAdapter05_sessionStateMapping_respectsHierarchy() {
        // 1. Unauthenticated (no token)
        val unauth = SessionStateAdapter.adapt(
            sessionStateName = "AUTHENTICATING",
            currentAccessToken = null
        )
        assertEquals(SessionState.Unauthenticated, unauth)

        // 2. Unpaired (has token, but no screen ID)
        val unpaired = SessionStateAdapter.adapt(
            sessionStateName = "AUTHENTICATED",
            currentAccessToken = "valid-jwt-token",
            currentUserId = null
        )
        assertEquals(SessionState.Unpaired, unpaired)

        // 3. Authorized (has token and screen ID)
        val auth = SessionStateAdapter.adapt(
            sessionStateName = "AUTHORIZED",
            currentAccessToken = "valid-jwt-token",
            currentUserId = "screen-42",
            deviceIdentityHash = "hash-1234"
        )
        assertEquals(SessionState.Authorized("screen-42", "hash-1234"), auth)

        // 4. Suspended (isScreenActive = false takes precedence over Authorized)
        val suspended = SessionStateAdapter.adapt(
            sessionStateName = "AUTHORIZED",
            isScreenActive = false,
            currentAccessToken = "valid-jwt-token",
            currentUserId = "screen-42",
            blockMessage = "Inadimplência comercial"
        )
        assertEquals(SessionState.Suspended("Inadimplência comercial"), suspended)

        // 5. Revoked (isDeviceRevoked = true takes absolute precedence)
        val revoked = SessionStateAdapter.adapt(
            sessionStateName = "AUTHORIZED",
            isDeviceRevoked = true,
            isScreenActive = true,
            currentAccessToken = "valid-jwt-token",
            currentUserId = "screen-42",
            blockMessage = "Aparelho desvinculado"
        )
        assertEquals(SessionState.Revoked("Aparelho desvinculado"), revoked)
    }

    // =========================================================================
    // ADAPTER-06: Kiosk Enforcement -> Enforced / Disabled
    // =========================================================================
    @Test
    fun testAdapter06_kioskEnforcement_mapsCorrectly() {
        assertEquals(KioskState.Enforced, KioskStateAdapter.adapt(true))
        assertEquals(KioskState.Disabled, KioskStateAdapter.adapt(false))
    }

    // =========================================================================
    // ADAPTER-07: Maintenance Deadline Evaluation
    // =========================================================================
    @Test
    fun testAdapter07_maintenanceDeadlineEvaluation() {
        val now = 1000000L

        // deadline == 0 -> Inactive
        val inactiveZero = MaintenanceStateAdapter.adapt(0L, now)
        assertEquals(MaintenanceState.Inactive, inactiveZero)

        // deadline <= now -> Inactive (expired)
        val inactiveExpired = MaintenanceStateAdapter.adapt(now - 1000L, now)
        assertEquals(MaintenanceState.Inactive, inactiveExpired)

        val inactiveExact = MaintenanceStateAdapter.adapt(now, now)
        assertEquals(MaintenanceState.Inactive, inactiveExact)

        // deadline > now -> Active
        val active = MaintenanceStateAdapter.adapt(
            maintenanceUntilMs = now + 180000L,
            currentTimeMs = now,
            source = MaintenanceSource.RemoteCommand
        )
        assertEquals(
            MaintenanceState.Active(now + 180000L, MaintenanceSource.RemoteCommand),
            active
        )
    }

    // =========================================================================
    // ADAPTER-08: Sync Observable States
    // =========================================================================
    @Test
    fun testAdapter08_syncObservableStates() {
        // Not in progress -> Idle
        val idle = SyncStateAdapter.adapt(isSyncInProgress = false)
        assertEquals(SyncState.Idle, idle)

        // In progress without delta count -> FetchingRemote
        val fetching = SyncStateAdapter.adapt(isSyncInProgress = true, totalCount = 0)
        assertEquals(SyncState.FetchingRemote, fetching)

        // In progress with delta count -> DownloadingDelta
        val downloading = SyncStateAdapter.adapt(
            isSyncInProgress = true,
            pendingCount = 2,
            totalCount = 8
        )
        assertEquals(SyncState.DownloadingDelta(2, 8), downloading)
    }

    // =========================================================================
    // COMPOSER-01: Combine 6 Axes into PlayerRuntimeState
    // =========================================================================
    @Test
    fun testComposer01_combineSixAxes_intoRuntimeState() {
        val state = PlayerRuntimeStateComposer.compose(
            playback = PlaybackState.Playing("m1", "VIDEO", 10000L),
            sync = SyncState.Idle,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionState.Authorized("screen-1", "hash-abc"),
            network = NetworkState.Online
        )

        assertEquals("m1", (state.playback as PlaybackState.Playing).mediaId)
        assertEquals(SyncState.Idle, state.sync)
        assertEquals(KioskState.Enforced, state.kiosk)
        assertEquals(MaintenanceState.Inactive, state.maintenance)
        assertEquals("screen-1", (state.session as SessionState.Authorized).screenId)
        assertEquals(NetworkState.Online, state.network)
    }

    // =========================================================================
    // COMPOSER-02: Authorized + Playing -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun testComposer02_authorizedAndPlaying_derivesMediaOnly() {
        val state = PlayerRuntimeStateComposer.compose(
            playback = PlaybackState.Playing("m1", "VIDEO", 10000L),
            sync = SyncState.Idle,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionState.Authorized("screen-1", "hash-abc"),
            network = NetworkState.Online
        )

        assertEquals(SurfaceState.MEDIA_ONLY, PlayerRuntimeStateComposer.deriveSurface(state))
        assertEquals(SurfaceState.MEDIA_ONLY, state.surface)
    }

    // =========================================================================
    // COMPOSER-03: Suspended + Playing -> BLOCKED
    // =========================================================================
    @Test
    fun testComposer03_suspendedAndPlaying_derivesBlocked() {
        val state = PlayerRuntimeStateComposer.compose(
            playback = PlaybackState.Playing("m1", "VIDEO", 10000L),
            sync = SyncState.Idle,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionState.Suspended("Suspensão"),
            network = NetworkState.Online
        )

        assertEquals(SurfaceState.BLOCKED, PlayerRuntimeStateComposer.deriveSurface(state))
    }

    // =========================================================================
    // COMPOSER-04: Revoked + Playing -> BLOCKED
    // =========================================================================
    @Test
    fun testComposer04_revokedAndPlaying_derivesBlocked() {
        val state = PlayerRuntimeStateComposer.compose(
            playback = PlaybackState.Playing("m1", "VIDEO", 10000L),
            sync = SyncState.Idle,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionState.Revoked("Revogado"),
            network = NetworkState.Online
        )

        assertEquals(SurfaceState.BLOCKED, PlayerRuntimeStateComposer.deriveSurface(state))
    }

    // =========================================================================
    // COMPOSER-05: Playing + Sync Downloading -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun testComposer05_playingWithBackgroundSync_preservesMediaOnly() {
        val state = PlayerRuntimeStateComposer.compose(
            playback = PlaybackState.Playing("m1", "VIDEO", 10000L),
            sync = SyncState.DownloadingDelta(pendingCount = 4, totalCount = 10),
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionState.Authorized("screen-1", "hash-abc"),
            network = NetworkState.Online
        )

        assertEquals(
            "Background sync downloading MUST NOT interrupt the MEDIA_ONLY surface",
            SurfaceState.MEDIA_ONLY,
            PlayerRuntimeStateComposer.deriveSurface(state)
        )
    }
}

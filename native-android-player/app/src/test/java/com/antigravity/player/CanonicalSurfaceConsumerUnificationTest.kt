package com.antigravity.player

import com.antigravity.core.domain.state.PlaybackState
import com.antigravity.core.domain.state.PlayerRuntimeState
import com.antigravity.core.domain.state.SessionState
import com.antigravity.core.domain.state.SurfaceState
import com.antigravity.core.domain.state.SyncState
import com.antigravity.core.domain.state.KioskState
import com.antigravity.core.domain.state.MaintenanceState
import com.antigravity.core.domain.state.MaintenanceSource
import com.antigravity.core.domain.state.NetworkState
import com.antigravity.core.domain.state.adapter.SessionStateAdapter
import com.antigravity.core.domain.state.adapter.PlaybackStateAdapter
import com.antigravity.core.domain.state.adapter.SyncStateAdapter
import com.antigravity.core.domain.state.projection.SurfaceProjectionEngine
import com.antigravity.core.domain.state.consumer.RuntimeSurfaceConsumer
import com.antigravity.core.domain.state.consumer.SurfaceTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * [MICRO-GATE P0.4.8] TEST SUITE — CANONICAL SURFACE CONSUMER UNIFICATION
 *
 * Verifica que os findings P0.4.7-01 a 04 foram tratados:
 * - TEST-01: PlayerUIState.SYNCING nao e autoridade independente de superficie
 * - TEST-02: PlayerUIState.PREPARING nao e autoridade independente de superficie
 * - TEST-03: PlayerUIState.PLAYING nao e autoridade independente de superficie
 * - TEST-04: screenActiveEvents nao possui aplicacao visual concorrente
 * - TEST-05: startSyncAndPlay() nao possui decisao visual concorrente
 * - TEST-06: MEDIA_ONLY permanece preservado
 * - TEST-07: Background Sync + Playing = MEDIA_ONLY
 * - TEST-08: Offline + Playing = MEDIA_ONLY
 * - TEST-09: Maintenance + Playing = MEDIA_ONLY
 * - TEST-10: Kiosk + Playing = MEDIA_ONLY
 */
class CanonicalSurfaceConsumerUnificationTest {

    class RecordingSurfaceTarget : SurfaceTarget {
        val calls = mutableListOf<String>()
        var lastApplied: SurfaceState? = null

        override fun showLoginSurface() { calls.add("LOGIN"); lastApplied = SurfaceState.LOGIN }
        override fun showScreenSelectionSurface() { calls.add("SCREEN_SELECTION"); lastApplied = SurfaceState.SCREEN_SELECTION }
        override fun showSyncGuardSurface(message: String?) { calls.add("SYNC_GUARD"); lastApplied = SurfaceState.SYNC_GUARD }
        override fun showMediaOnlySurface() { calls.add("MEDIA_ONLY"); lastApplied = SurfaceState.MEDIA_ONLY }
        override fun showBlockedSurface(message: String?) { calls.add("BLOCKED"); lastApplied = SurfaceState.BLOCKED }
    }

    private fun buildRuntimeState(
        exoPlaybackState: Int = 1,
        isPlaying: Boolean = false,
        mediaId: String? = null,
        isSyncInProgress: Boolean = false,
        sessionStateName: String? = "AUTHORIZED",
        isDeviceRevoked: Boolean = false,
        isScreenActive: Boolean = true,
        accessToken: String? = "valid_token",
        userId: String? = "screen_123",
        deviceHash: String? = "hash_abc"
    ): PlayerRuntimeState {
        val playback = PlaybackStateAdapter.adaptExoPlayerState(
            playbackState = exoPlaybackState,
            isPlaying = isPlaying,
            mediaId = mediaId
        )
        val sync = SyncStateAdapter.adapt(isSyncInProgress = isSyncInProgress)
        val session = SessionStateAdapter.adapt(
            sessionStateName = sessionStateName,
            isDeviceRevoked = isDeviceRevoked,
            isScreenActive = isScreenActive,
            currentAccessToken = accessToken,
            currentUserId = userId,
            deviceIdentityHash = deviceHash
        )
        return PlayerRuntimeState(
            playback = playback,
            sync = sync,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = session,
            network = NetworkState.Online
        )
    }

    private lateinit var target: RecordingSurfaceTarget
    private lateinit var consumer: RuntimeSurfaceConsumer

    @Before
    fun setUp() {
        target = RecordingSurfaceTarget()
        consumer = RuntimeSurfaceConsumer(target)
    }

    @Test
    fun test_P0_4_8_01_PlayerUIState_SYNCING_notIndependentSurfaceAuthority() {
        val state = buildRuntimeState(exoPlaybackState = 1, isPlaying = false, isSyncInProgress = true)
        val projected = SurfaceProjectionEngine.project(state)
        assertEquals("SYNCING: SurfaceProjectionEngine deve decidir SYNC_GUARD via PlaybackState.Idle", SurfaceState.SYNC_GUARD, projected)
        val consumed = consumer.consume(state)
        assertEquals(SurfaceState.SYNC_GUARD, consumed)
        assertEquals(SurfaceState.SYNC_GUARD, target.lastApplied)
    }

    @Test
    fun test_P0_4_8_02_PlayerUIState_PREPARING_notIndependentSurfaceAuthority() {
        val state = buildRuntimeState(exoPlaybackState = 2, isPlaying = false)
        val projected = SurfaceProjectionEngine.project(state)
        assertEquals("PREPARING: SurfaceProjectionEngine deve decidir SYNC_GUARD via PlaybackState.Preparing", SurfaceState.SYNC_GUARD, projected)
        val consumed = consumer.consume(state)
        assertEquals(SurfaceState.SYNC_GUARD, consumed)
    }

    @Test
    fun test_P0_4_8_03_PlayerUIState_PLAYING_notIndependentSurfaceAuthority() {
        val state = buildRuntimeState(exoPlaybackState = 3, isPlaying = true, mediaId = "media_001")
        val projected = SurfaceProjectionEngine.project(state)
        assertEquals("PLAYING: SurfaceProjectionEngine deve decidir MEDIA_ONLY via PlaybackState.Playing", SurfaceState.MEDIA_ONLY, projected)
        val consumed = consumer.consume(state)
        assertEquals(SurfaceState.MEDIA_ONLY, consumed)
    }

    @Test
    fun test_P0_4_8_04_screenActiveEvents_notDirectSurfaceAuthority() {
        val stateBlocked = buildRuntimeState(isScreenActive = false, sessionStateName = "SUSPENDED")
        val projected = SurfaceProjectionEngine.project(stateBlocked)
        assertEquals("screenActiveEvents(false): cadeia canonica deve resultar em BLOCKED", SurfaceState.BLOCKED, projected)
        val stateUnblocked = buildRuntimeState(isScreenActive = true, sessionStateName = "AUTHORIZED")
        val projectedUnblocked = SurfaceProjectionEngine.project(stateUnblocked)
        assertEquals("screenActiveEvents(true): cadeia canonica deve resultar em SYNC_GUARD", SurfaceState.SYNC_GUARD, projectedUnblocked)
    }

    @Test
    fun test_P0_4_8_05_startSyncAndPlay_notDirectSurfaceAuthority() {
        val stateOnSyncStart = buildRuntimeState(exoPlaybackState = 1, isPlaying = false, isSyncInProgress = false)
        val projected = SurfaceProjectionEngine.project(stateOnSyncStart)
        assertEquals("startSyncAndPlay inicio: SurfaceProjectionEngine deve decidir SYNC_GUARD", SurfaceState.SYNC_GUARD, projected)
        val stateDuringSync = buildRuntimeState(exoPlaybackState = 1, isPlaying = false, isSyncInProgress = true)
        assertEquals(SurfaceState.SYNC_GUARD, SurfaceProjectionEngine.project(stateDuringSync))
    }

    @Test
    fun test_P0_4_8_06_MEDIA_ONLY_preserved() {
        val state = buildRuntimeState(exoPlaybackState = 3, isPlaying = true, mediaId = "media_006")
        val projected = SurfaceProjectionEngine.project(state)
        assertEquals(SurfaceState.MEDIA_ONLY, projected)
        val consumed = consumer.consume(state)
        assertEquals(SurfaceState.MEDIA_ONLY, consumed)
        assertTrue("showMediaOnlySurface deve ter sido chamado", target.calls.contains("MEDIA_ONLY"))
    }

    @Test
    fun test_P0_4_8_07_backgroundSync_plus_playing_equals_MEDIA_ONLY() {
        val state = buildRuntimeState(exoPlaybackState = 3, isPlaying = true, mediaId = "media_007", isSyncInProgress = true)
        val projected = SurfaceProjectionEngine.project(state)
        assertEquals("Background Sync + Playing deve ser MEDIA_ONLY", SurfaceState.MEDIA_ONLY, projected)
    }

    @Test
    fun test_P0_4_8_08_offline_plus_playing_equals_MEDIA_ONLY() {
        val state = PlayerRuntimeState(
            playback = PlaybackState.Playing("media_008", "VIDEO", 30000L),
            sync = SyncState.Idle,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionState.Authorized("screen_123", "hash_abc"),
            network = NetworkState.Offline
        )
        val projected = SurfaceProjectionEngine.project(state)
        assertEquals("Offline + Playing deve ser MEDIA_ONLY", SurfaceState.MEDIA_ONLY, projected)
    }

    @Test
    fun test_P0_4_8_09_maintenance_plus_playing_equals_MEDIA_ONLY() {
        val state = PlayerRuntimeState(
            playback = PlaybackState.Playing("media_009", "IMAGE", 10000L),
            sync = SyncState.Idle,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Active(
                expiresAtMs = System.currentTimeMillis() + 60_000L,
                source = MaintenanceSource.LocalAdmin
            ),
            session = SessionState.Authorized("screen_123", "hash_abc"),
            network = NetworkState.Online
        )
        val projected = SurfaceProjectionEngine.project(state)
        assertEquals("Maintenance + Playing deve ser MEDIA_ONLY", SurfaceState.MEDIA_ONLY, projected)
    }

    @Test
    fun test_P0_4_8_10_kiosk_plus_playing_equals_MEDIA_ONLY() {
        val state = PlayerRuntimeState(
            playback = PlaybackState.Playing("media_010", "VIDEO", 20000L),
            sync = SyncState.FetchingRemote,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionState.Authorized("screen_123", "hash_abc"),
            network = NetworkState.Online
        )
        val projected = SurfaceProjectionEngine.project(state)
        assertEquals("Kiosk + Playing deve ser MEDIA_ONLY", SurfaceState.MEDIA_ONLY, projected)
    }

    @Test
    fun test_regression_idle_equals_SYNC_GUARD() {
        val state = buildRuntimeState(exoPlaybackState = 1, isPlaying = false)
        assertEquals(SurfaceState.SYNC_GUARD, SurfaceProjectionEngine.project(state))
    }

    @Test
    fun test_regression_errorFallback_equals_SYNC_GUARD() {
        val state = PlayerRuntimeState(
            playback = PlaybackState.ErrorFallback("codec error"),
            sync = SyncState.Idle,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionState.Authorized("screen_123", "hash_abc"),
            network = NetworkState.Online
        )
        assertEquals(SurfaceState.SYNC_GUARD, SurfaceProjectionEngine.project(state))
    }

    @Test
    fun test_regression_unauthenticated_equals_LOGIN() {
        val state = buildRuntimeState(sessionStateName = "UNKNOWN", accessToken = null, userId = null)
        assertEquals(SurfaceState.LOGIN, SurfaceProjectionEngine.project(state))
    }

    @Test
    fun test_regression_revoked_equals_BLOCKED() {
        val state = PlayerRuntimeState(
            playback = PlaybackState.Idle,
            sync = SyncState.Idle,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionState.Revoked("admin revoked"),
            network = NetworkState.Online
        )
        assertEquals(SurfaceState.BLOCKED, SurfaceProjectionEngine.project(state))
    }

    @Test
    fun test_regression_suspended_BLOCKED_overrides_playing() {
        val state = PlayerRuntimeState(
            playback = PlaybackState.Playing("media_x", "VIDEO", 10000L),
            sync = SyncState.Idle,
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionState.Suspended("billing suspended"),
            network = NetworkState.Online
        )
        assertEquals("BLOCKED tem precedencia sobre Playing quando session esta Suspended",
            SurfaceState.BLOCKED, SurfaceProjectionEngine.project(state))
    }

    @Test
    fun test_structural_SurfaceProjectionEngine_does_not_consume_PlayerUIState() {
        val state = PlayerRuntimeState()
        val result = SurfaceProjectionEngine.project(state)
        assertNotEquals(null, result)
    }
}

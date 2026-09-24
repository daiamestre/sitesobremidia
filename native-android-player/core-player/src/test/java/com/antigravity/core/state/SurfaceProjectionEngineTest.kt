package com.antigravity.core.state

import com.antigravity.core.domain.state.KioskState
import com.antigravity.core.domain.state.MaintenanceSource
import com.antigravity.core.domain.state.MaintenanceState
import com.antigravity.core.domain.state.NetworkState
import com.antigravity.core.domain.state.PlaybackState
import com.antigravity.core.domain.state.PlayerRuntimeState
import com.antigravity.core.domain.state.SessionState
import com.antigravity.core.domain.state.SurfaceState
import com.antigravity.core.domain.state.SyncState
import com.antigravity.core.domain.state.projection.SurfaceProjectionEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.lang.reflect.Modifier

/**
 * Suite de Testes do Motor Canônico de Projeção de Superfície (P0.4.5).
 * Valida o determinismo estrito, a precedência de segurança e a ausência
 * absoluta de efeitos colaterais e mutações operacionais.
 */
class SurfaceProjectionEngineTest {

    private val sampleAuthorizedSession = SessionState.Authorized(
        screenId = "screen-101",
        hardwareHash = "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890"
    )

    private val samplePlayingPlayback = PlaybackState.Playing(
        mediaId = "media-v100",
        mediaType = "VIDEO",
        durationMs = 20000L
    )

    // =========================================================================
    // PROJECTION-01: Unauthenticated + any playback -> LOGIN
    // =========================================================================
    @Test
    fun testProjection01_unauthenticatedWithAnyPlayback_projectsLogin() {
        val playbacks = listOf(
            samplePlayingPlayback,
            PlaybackState.Preparing(mediaId = "m1"),
            PlaybackState.Idle,
            PlaybackState.ErrorFallback("err")
        )

        for (pb in playbacks) {
            val state = PlayerRuntimeState(
                session = SessionState.Unauthenticated,
                playback = pb
            )
            assertEquals(
                "Unauthenticated MUST project LOGIN regardless of playback: $pb",
                SurfaceState.LOGIN,
                SurfaceProjectionEngine.project(state)
            )
        }
    }

    // =========================================================================
    // PROJECTION-02: Unpaired + any playback -> SCREEN_SELECTION
    // =========================================================================
    @Test
    fun testProjection02_unpairedWithAnyPlayback_projectsScreenSelection() {
        val playbacks = listOf(
            samplePlayingPlayback,
            PlaybackState.Preparing(mediaId = "m1"),
            PlaybackState.Idle,
            PlaybackState.ErrorFallback("err")
        )

        for (pb in playbacks) {
            val state = PlayerRuntimeState(
                session = SessionState.Unpaired,
                playback = pb
            )
            assertEquals(
                "Unpaired MUST project SCREEN_SELECTION regardless of playback: $pb",
                SurfaceState.SCREEN_SELECTION,
                SurfaceProjectionEngine.project(state)
            )
        }
    }

    // =========================================================================
    // PROJECTION-03: Suspended + Playing -> BLOCKED
    // =========================================================================
    @Test
    fun testProjection03_suspendedWithPlaying_projectsBlocked() {
        val state = PlayerRuntimeState(
            session = SessionState.Suspended(reason = "Pagamento atrasado"),
            playback = samplePlayingPlayback
        )
        assertEquals(SurfaceState.BLOCKED, SurfaceProjectionEngine.project(state))
    }

    // =========================================================================
    // PROJECTION-04: Revoked + Playing -> BLOCKED
    // =========================================================================
    @Test
    fun testProjection04_revokedWithPlaying_projectsBlocked() {
        val state = PlayerRuntimeState(
            session = SessionState.Revoked(reason = "Hardware desvinculado"),
            playback = samplePlayingPlayback
        )
        assertEquals(SurfaceState.BLOCKED, SurfaceProjectionEngine.project(state))
    }

    // =========================================================================
    // PROJECTION-05: Authorized + Playing -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun testProjection05_authorizedWithPlaying_projectsMediaOnly() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingPlayback,
            sync = SyncState.Idle,
            kiosk = KioskState.Enforced,
            network = NetworkState.Online
        )
        assertEquals(SurfaceState.MEDIA_ONLY, SurfaceProjectionEngine.project(state))
    }

    // =========================================================================
    // PROJECTION-06: Authorized + Playing + Sync Downloading -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun testProjection06_authorizedWithPlayingAndSyncDownloading_preservesMediaOnly() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingPlayback,
            sync = SyncState.DownloadingDelta(pendingCount = 3, totalCount = 10)
        )
        assertEquals(
            "Background sync downloading MUST NOT interrupt MEDIA_ONLY",
            SurfaceState.MEDIA_ONLY,
            SurfaceProjectionEngine.project(state)
        )
    }

    // =========================================================================
    // PROJECTION-07: Authorized + Playing + Offline -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun testProjection07_authorizedWithPlayingAndOffline_preservesMediaOnly() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingPlayback,
            network = NetworkState.Offline
        )
        assertEquals(
            "Offline playback from local cache MUST project MEDIA_ONLY",
            SurfaceState.MEDIA_ONLY,
            SurfaceProjectionEngine.project(state)
        )
    }

    // =========================================================================
    // PROJECTION-08: Authorized + Preparing -> SYNC_GUARD
    // =========================================================================
    @Test
    fun testProjection08_authorizedWithPreparing_projectsSyncGuard() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = PlaybackState.Preparing(mediaId = "init-m", isPreBuffer = false),
            sync = SyncState.Idle
        )
        assertEquals(
            "Preparation phase before first frame renders MUST project SYNC_GUARD",
            SurfaceState.SYNC_GUARD,
            SurfaceProjectionEngine.project(state)
        )
    }

    // =========================================================================
    // PROJECTION-09: Maintenance.Active + Playing -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun testProjection09_activeMaintenanceDuringPlaying_preservesMediaOnly() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingPlayback,
            kiosk = KioskState.Disabled,
            maintenance = MaintenanceState.Active(
                expiresAtMs = System.currentTimeMillis() + 180000L,
                source = MaintenanceSource.RemoteCommand
            )
        )
        assertEquals(
            "Active technical maintenance during playback MUST NOT project BLOCKED or SYNC_GUARD",
            SurfaceState.MEDIA_ONLY,
            SurfaceProjectionEngine.project(state)
        )
    }

    // =========================================================================
    // PROJECTION-10: Kiosk.Enforced + Playing -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun testProjection10_kioskEnforcedDuringPlaying_projectsMediaOnly() {
        val state = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingPlayback,
            kiosk = KioskState.Enforced
        )
        assertEquals(
            "Kiosk enforcement is isolation, not a visual surface; must project MEDIA_ONLY",
            SurfaceState.MEDIA_ONLY,
            SurfaceProjectionEngine.project(state)
        )
    }

    // =========================================================================
    // PROJECTION-11: Various Sync States do not pollute MEDIA_ONLY
    // =========================================================================
    @Test
    fun testProjection11_syncStatesDoNotPolluteMediaOnly() {
        val syncStates = listOf(
            SyncState.Idle,
            SyncState.FetchingRemote,
            SyncState.DownloadingDelta(pendingCount = 1, totalCount = 5),
            SyncState.VerifyingIntegrity,
            SyncState.CommittingRoom
        )

        for (sync in syncStates) {
            val state = PlayerRuntimeState(
                session = sampleAuthorizedSession,
                playback = samplePlayingPlayback,
                sync = sync
            )
            assertEquals(
                "Sync state $sync MUST NOT pollute or displace MEDIA_ONLY",
                SurfaceState.MEDIA_ONLY,
                SurfaceProjectionEngine.project(state)
            )
        }
    }

    // =========================================================================
    // PROJECTION-12: Determinism Test: Same PlayerRuntimeState -> Same SurfaceState
    // =========================================================================
    @Test
    fun testProjection12_determinism_identicalStateProducesIdenticalSurface() {
        val stateA = PlayerRuntimeState(
            session = sampleAuthorizedSession,
            playback = samplePlayingPlayback,
            sync = SyncState.DownloadingDelta(2, 4),
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            network = NetworkState.Online
        )

        val stateB = stateA.copy()

        val surfaceA = SurfaceProjectionEngine.project(stateA)
        val surfaceB = SurfaceProjectionEngine.project(stateB)

        assertEquals(surfaceA, surfaceB)
        assertEquals(surfaceA, stateA.surface)
        assertEquals(surfaceB, stateB.surface)
    }

    // =========================================================================
    // TEST DE NÃO-MUTAÇÃO: Prova estrutural de ausência de APIs operacionais
    // =========================================================================
    @Test
    fun testStructuralNonMutation_projectionEngineHasNoProhibitedAPIs() {
        val clazz = SurfaceProjectionEngine::class.java

        // 1. Prohibited method names
        val prohibitedMethodNames = setOf(
            "stop", "release", "prepare", "seekTo", "clearMediaItems",
            "play", "pause", "logout", "unpair", "insert", "update",
            "delete", "startActivity", "finish", "show", "hide"
        )

        val declaredMethods = clazz.declaredMethods
        for (method in declaredMethods) {
            assertFalse(
                "SurfaceProjectionEngine MUST NOT declare operational method: ${method.name}",
                prohibitedMethodNames.contains(method.name.lowercase())
            )
        }

        // 2. Prohibited mutable fields
        val declaredFields = clazz.declaredFields
        for (field in declaredFields) {
            // Fields in pure singleton should be static/final, no mutable state
            if (!field.name.contains("INSTANCE")) {
                assertTrue(
                    "Field ${field.name} in SurfaceProjectionEngine must be final (immutable)",
                    Modifier.isFinal(field.modifiers)
                )
            }
        }
    }
}

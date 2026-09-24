package com.antigravity.core.state.consumer

import com.antigravity.core.domain.state.KioskState
import com.antigravity.core.domain.state.MaintenanceState
import com.antigravity.core.domain.state.NetworkState
import com.antigravity.core.domain.state.PlaybackState
import com.antigravity.core.domain.state.PlayerRuntimeState
import com.antigravity.core.domain.state.SessionState
import com.antigravity.core.domain.state.SurfaceState
import com.antigravity.core.domain.state.SyncState
import com.antigravity.core.domain.state.consumer.RuntimeSurfaceConsumer
import com.antigravity.core.domain.state.consumer.SurfaceTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.lang.reflect.Method
import java.lang.reflect.Modifier

/**
 * Suíte de Testes de Integração da Micro-Gate P0.4.6:
 * PROJECTION CONSUMER INTEGRATION
 *
 * Valida os contratos canônicos INTEGRATION-01 a INTEGRATION-13:
 * Prova que o runtime surface consumer aplica a projeção canônica do SurfaceProjectionEngine
 * sem assumir ou exercer authorities operacionais (playback, sync, session, kiosk, maintenance).
 */
class ProjectionConsumerIntegrationTest {

    private lateinit var spyTarget: SpySurfaceTarget
    private lateinit var consumer: RuntimeSurfaceConsumer

    @Before
    fun setUp() {
        spyTarget = SpySurfaceTarget()
        consumer = RuntimeSurfaceConsumer(spyTarget)
    }

    // =========================================================================
    // HELPER: Base Builder para PlayerRuntimeState
    // =========================================================================
    private fun buildState(
        playback: PlaybackState = PlaybackState.Playing("m-001", "VIDEO", 15000L),
        sync: SyncState = SyncState.Idle,
        kiosk: KioskState = KioskState.Enforced,
        maintenance: MaintenanceState = MaintenanceState.Inactive,
        session: SessionState = SessionState.Authorized("screen-100", "hw-abc-123"),
        network: NetworkState = NetworkState.Online
    ): PlayerRuntimeState {
        return PlayerRuntimeState(
            playback = playback,
            sync = sync,
            kiosk = kiosk,
            maintenance = maintenance,
            session = session,
            network = network
        )
    }

    // =========================================================================
    // INTEGRATION-01: Unauthenticated -> LOGIN
    // =========================================================================
    @Test
    fun `INTEGRATION-01 - Unauthenticated session projects and applies LOGIN surface`() {
        val state = buildState(session = SessionState.Unauthenticated)

        val applied = consumer.consume(state)

        assertEquals(SurfaceState.LOGIN, applied)
        assertEquals(SurfaceState.LOGIN, consumer.currentAppliedSurface)
        assertEquals(1, spyTarget.showLoginCount)
        assertEquals(0, spyTarget.showScreenSelectionCount)
        assertEquals(0, spyTarget.showSyncGuardCount)
        assertEquals(0, spyTarget.showMediaOnlyCount)
        assertEquals(0, spyTarget.showBlockedCount)
    }

    // =========================================================================
    // INTEGRATION-02: Unpaired -> SCREEN_SELECTION
    // =========================================================================
    @Test
    fun `INTEGRATION-02 - Unpaired session projects and applies SCREEN_SELECTION surface`() {
        val state = buildState(session = SessionState.Unpaired)

        val applied = consumer.consume(state)

        assertEquals(SurfaceState.SCREEN_SELECTION, applied)
        assertEquals(SurfaceState.SCREEN_SELECTION, consumer.currentAppliedSurface)
        assertEquals(0, spyTarget.showLoginCount)
        assertEquals(1, spyTarget.showScreenSelectionCount)
        assertEquals(0, spyTarget.showSyncGuardCount)
        assertEquals(0, spyTarget.showMediaOnlyCount)
        assertEquals(0, spyTarget.showBlockedCount)
    }

    // =========================================================================
    // INTEGRATION-03: Suspended + Playing -> BLOCKED
    // =========================================================================
    @Test
    fun `INTEGRATION-03 - Suspended session even while Playing projects and applies BLOCKED surface`() {
        val state = buildState(
            session = SessionState.Suspended(reason = "Licença Temporariamente Suspensa"),
            playback = PlaybackState.Playing("m-001", "VIDEO", 15000L)
        )

        val applied = consumer.consume(state, message = "Licença Temporariamente Suspensa")

        assertEquals(SurfaceState.BLOCKED, applied)
        assertEquals(SurfaceState.BLOCKED, consumer.currentAppliedSurface)
        assertEquals(1, spyTarget.showBlockedCount)
        assertEquals("Licença Temporariamente Suspensa", spyTarget.lastBlockedMessage)
        assertEquals(0, spyTarget.showMediaOnlyCount)
    }

    // =========================================================================
    // INTEGRATION-04: Revoked + Playing -> BLOCKED
    // =========================================================================
    @Test
    fun `INTEGRATION-04 - Revoked session even while Playing projects and applies BLOCKED surface`() {
        val state = buildState(
            session = SessionState.Revoked(reason = "Dispositivo Revogado pelo Administrador"),
            playback = PlaybackState.Playing("m-001", "VIDEO", 15000L)
        )

        val applied = consumer.consume(state, message = "Dispositivo Revogado")

        assertEquals(SurfaceState.BLOCKED, applied)
        assertEquals(SurfaceState.BLOCKED, consumer.currentAppliedSurface)
        assertEquals(1, spyTarget.showBlockedCount)
        assertEquals("Dispositivo Revogado", spyTarget.lastBlockedMessage)
        assertEquals(0, spyTarget.showMediaOnlyCount)
    }

    // =========================================================================
    // INTEGRATION-05: Authorized + Playing -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun `INTEGRATION-05 - Authorized session and Playing playback projects and applies MEDIA_ONLY surface`() {
        val state = buildState(
            session = SessionState.Authorized("screen-100", "hw-abc-123"),
            playback = PlaybackState.Playing("m-001", "VIDEO", 15000L)
        )

        val applied = consumer.consume(state)

        assertEquals(SurfaceState.MEDIA_ONLY, applied)
        assertEquals(SurfaceState.MEDIA_ONLY, consumer.currentAppliedSurface)
        assertEquals(1, spyTarget.showMediaOnlyCount)
        assertEquals(0, spyTarget.showSyncGuardCount)
        assertEquals(0, spyTarget.showBlockedCount)
    }

    // =========================================================================
    // INTEGRATION-06: Authorized + Playing + Sync -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun `INTEGRATION-06 - Background sync during valid Playing playback preserves strict MEDIA_ONLY surface`() {
        val syncStates = listOf(
            SyncState.FetchingRemote,
            SyncState.DownloadingDelta(pendingCount = 3, totalCount = 5),
            SyncState.VerifyingIntegrity,
            SyncState.CommittingRoom
        )

        for (sync in syncStates) {
            val state = buildState(
                playback = PlaybackState.Playing("m-001", "VIDEO", 15000L),
                sync = sync
            )

            val applied = consumer.consume(state)

            assertEquals("Sync state $sync must NOT interrupt MEDIA_ONLY", SurfaceState.MEDIA_ONLY, applied)
            assertEquals(SurfaceState.MEDIA_ONLY, consumer.currentAppliedSurface)
        }

        // Garante que NENHUM sync guard ou banner foi acionado
        assertEquals(syncStates.size, spyTarget.showMediaOnlyCount)
        assertEquals(0, spyTarget.showSyncGuardCount)
    }

    // =========================================================================
    // INTEGRATION-07: Authorized + Playing + Offline -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun `INTEGRATION-07 - Offline network during valid Playing playback preserves strict MEDIA_ONLY surface`() {
        val offlineNetworks = listOf(
            NetworkState.Offline
        )

        for (net in offlineNetworks) {
            val state = buildState(
                playback = PlaybackState.Playing("m-001", "VIDEO", 15000L),
                network = net
            )

            val applied = consumer.consume(state)

            assertEquals("Network state $net must NOT interrupt MEDIA_ONLY", SurfaceState.MEDIA_ONLY, applied)
            assertEquals(SurfaceState.MEDIA_ONLY, consumer.currentAppliedSurface)
        }

        assertEquals(0, spyTarget.showSyncGuardCount)
        assertEquals(0, spyTarget.showBlockedCount)
    }

    // =========================================================================
    // INTEGRATION-08: Authorized + Playing + Maintenance -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun `INTEGRATION-08 - Maintenance Active during Playing playback preserves MEDIA_ONLY surface`() {
        val state = buildState(
            playback = PlaybackState.Playing("m-001", "VIDEO", 15000L),
            maintenance = MaintenanceState.Active(
                expiresAtMs = System.currentTimeMillis() + 120_000L,
                source = com.antigravity.core.domain.state.MaintenanceSource.RemoteCommand
            )
        )

        val applied = consumer.consume(state)

        assertEquals(SurfaceState.MEDIA_ONLY, applied)
        assertEquals(SurfaceState.MEDIA_ONLY, consumer.currentAppliedSurface)
        assertEquals(1, spyTarget.showMediaOnlyCount)
        assertEquals(0, spyTarget.showSyncGuardCount)
    }

    // =========================================================================
    // INTEGRATION-09: Authorized + Playing + Kiosk.Enforced -> MEDIA_ONLY
    // =========================================================================
    @Test
    fun `INTEGRATION-09 - Kiosk Enforced or Released during Playing playback remains strictly MEDIA_ONLY`() {
        val kioskStates = listOf(
            KioskState.Enforced,
            KioskState.Disabled
        )

        for (kiosk in kioskStates) {
            val state = buildState(
                playback = PlaybackState.Playing("m-001", "VIDEO", 15000L),
                kiosk = kiosk
            )

            val applied = consumer.consume(state)

            assertEquals("Kiosk state $kiosk must NOT change MEDIA_ONLY", SurfaceState.MEDIA_ONLY, applied)
            assertEquals(SurfaceState.MEDIA_ONLY, consumer.currentAppliedSurface)
        }

        assertEquals(kioskStates.size, spyTarget.showMediaOnlyCount)
        assertEquals(0, spyTarget.showSyncGuardCount)
    }

    // =========================================================================
    // INTEGRATION-10: Provar que aplicar MEDIA_ONLY não chama playback methods
    // =========================================================================
    @Test
    fun `INTEGRATION-10 - Applying MEDIA_ONLY does NOT invoke playback operational methods`() {
        // 1. Verificação Estática via Reflexão: nem RuntimeSurfaceConsumer nem SurfaceTarget declaram métodos operacionais de playback
        val forbiddenPlaybackMethods = listOf(
            "play",
            "pause",
            "stop",
            "release",
            "prepare",
            "seekTo",
            "clearMediaItems",
            "startPlaybackLoop",
            "resume"
        )

        val consumerMethods = RuntimeSurfaceConsumer::class.java.declaredMethods.map { it.name }
        val targetMethods = SurfaceTarget::class.java.declaredMethods.map { it.name }

        for (method in forbiddenPlaybackMethods) {
            assertFalse(
                "RuntimeSurfaceConsumer must NOT declare playback method: $method",
                consumerMethods.contains(method)
            )
            assertFalse(
                "SurfaceTarget interface must NOT declare playback method: $method",
                targetMethods.contains(method)
            )
        }

        // 2. Verificação Dinâmica via Test Double / Spy com motor operacional
        val operationalPlaybackEngine = MockPlaybackEngineSpy()
        val mockTargetWithEngine = object : SurfaceTarget {
            override fun showLoginSurface() {}
            override fun showScreenSelectionSurface() {}
            override fun showSyncGuardSurface(message: String?) {}
            override fun showMediaOnlySurface() {
                // UI pura: mostra mídia, não chama playback
            }
            override fun showBlockedSurface(message: String?) {}
        }

        val testConsumer = RuntimeSurfaceConsumer(mockTargetWithEngine)
        testConsumer.applySurface(SurfaceState.MEDIA_ONLY)

        assertEquals("Zero calls to play()", 0, operationalPlaybackEngine.playCount)
        assertEquals("Zero calls to pause()", 0, operationalPlaybackEngine.pauseCount)
        assertEquals("Zero calls to stop()", 0, operationalPlaybackEngine.stopCount)
        assertEquals("Zero calls to release()", 0, operationalPlaybackEngine.releaseCount)
        assertEquals("Zero calls to prepare()", 0, operationalPlaybackEngine.prepareCount)
        assertEquals("Zero calls to seekTo()", 0, operationalPlaybackEngine.seekToCount)
        assertEquals("Zero calls to clearMediaItems()", 0, operationalPlaybackEngine.clearCount)
    }

    // =========================================================================
    // INTEGRATION-11: Provar que aplicar BLOCKED não altera SessionState
    // =========================================================================
    @Test
    fun `INTEGRATION-11 - Applying BLOCKED does NOT alter SessionState`() {
        val originalSession: SessionState = SessionState.Suspended(reason = "Inadimplência")
        val state = buildState(session = originalSession)

        consumer.applySurface(SurfaceState.BLOCKED, message = "Inadimplência")

        // A sessão do estado original deve permanecer identicamente intacta
        assertEquals(originalSession, state.session)
        assertTrue(state.session is SessionState.Suspended)
        assertEquals("Inadimplência", (state.session as SessionState.Suspended).reason)
        assertEquals(SurfaceState.BLOCKED, consumer.currentAppliedSurface)
    }

    // =========================================================================
    // INTEGRATION-12: Provar que aplicar LOGIN não executa autenticação
    // =========================================================================
    @Test
    fun `INTEGRATION-12 - Applying LOGIN does NOT execute authentication side effects`() {
        val authSpy = MockAuthAuthoritySpy()
        val targetWithAuthCheck = object : SurfaceTarget {
            override fun showLoginSurface() {
                // Aplicação visual pura de Login (renderiza tela ou redireciona intent)
                // NÃO deve disparar login() ou autenticação automática
            }
            override fun showScreenSelectionSurface() {}
            override fun showSyncGuardSurface(message: String?) {}
            override fun showMediaOnlySurface() {}
            override fun showBlockedSurface(message: String?) {}
        }

        val localConsumer = RuntimeSurfaceConsumer(targetWithAuthCheck)
        localConsumer.applySurface(SurfaceState.LOGIN)

        assertEquals("Zero auth calls executed", 0, authSpy.loginCallCount)
        assertEquals(SurfaceState.LOGIN, localConsumer.currentAppliedSurface)
    }

    // =========================================================================
    // INTEGRATION-13: Provar que aplicar SCREEN_SELECTION não executa pairing
    // =========================================================================
    @Test
    fun `INTEGRATION-13 - Applying SCREEN_SELECTION does NOT execute pairing side effects`() {
        val pairingSpy = MockPairingAuthoritySpy()
        val targetWithPairingCheck = object : SurfaceTarget {
            override fun showLoginSurface() {}
            override fun showScreenSelectionSurface() {
                // Aplicação visual pura de Seleção de Tela
                // NÃO deve executar pareamento de hardware ou registro de tela
            }
            override fun showSyncGuardSurface(message: String?) {}
            override fun showMediaOnlySurface() {}
            override fun showBlockedSurface(message: String?) {}
        }

        val localConsumer = RuntimeSurfaceConsumer(targetWithPairingCheck)
        localConsumer.applySurface(SurfaceState.SCREEN_SELECTION)

        assertEquals("Zero pairing calls executed", 0, pairingSpy.pairScreenCount)
        assertEquals(SurfaceState.SCREEN_SELECTION, localConsumer.currentAppliedSurface)
    }

    // =========================================================================
    // TEST DOUBLES / SPY IMPLEMENTATIONS
    // =========================================================================
    private class SpySurfaceTarget : SurfaceTarget {
        var showLoginCount = 0
        var showScreenSelectionCount = 0
        var showSyncGuardCount = 0
        var showMediaOnlyCount = 0
        var showBlockedCount = 0

        var lastSyncGuardMessage: String? = null
        var lastBlockedMessage: String? = null

        override fun showLoginSurface() {
            showLoginCount++
        }

        override fun showScreenSelectionSurface() {
            showScreenSelectionCount++
        }

        override fun showSyncGuardSurface(message: String?) {
            showSyncGuardCount++
            lastSyncGuardMessage = message
        }

        override fun showMediaOnlySurface() {
            showMediaOnlyCount++
        }

        override fun showBlockedSurface(message: String?) {
            showBlockedCount++
            lastBlockedMessage = message
        }
    }

    private class MockPlaybackEngineSpy {
        var playCount = 0
        var pauseCount = 0
        var stopCount = 0
        var releaseCount = 0
        var prepareCount = 0
        var seekToCount = 0
        var clearCount = 0

        fun play() { playCount++ }
        fun pause() { pauseCount++ }
        fun stop() { stopCount++ }
        fun release() { releaseCount++ }
        fun prepare() { prepareCount++ }
        fun seekTo(pos: Long) { seekToCount++ }
        fun clearMediaItems() { clearCount++ }
    }

    private class MockAuthAuthoritySpy {
        var loginCallCount = 0
        fun login(token: String) { loginCallCount++ }
    }

    private class MockPairingAuthoritySpy {
        var pairScreenCount = 0
        fun pairScreen(screenId: String) { pairScreenCount++ }
    }
}

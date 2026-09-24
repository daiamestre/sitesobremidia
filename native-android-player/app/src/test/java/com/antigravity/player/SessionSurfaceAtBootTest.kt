package com.antigravity.player

import com.antigravity.core.domain.state.KioskState
import com.antigravity.core.domain.state.MaintenanceState
import com.antigravity.core.domain.state.NetworkState
import com.antigravity.core.domain.state.PlayerRuntimeState
import com.antigravity.core.domain.state.SurfaceState
import com.antigravity.core.domain.state.adapter.PlaybackStateAdapter
import com.antigravity.core.domain.state.adapter.SessionStateAdapter
import com.antigravity.core.domain.state.adapter.SyncStateAdapter
import com.antigravity.core.domain.state.projection.SurfaceProjectionEngine
import com.antigravity.player.util.PlayerFlowPolicy
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * O usuário loga, escolhe a tela e o app NÃO pode voltar ao Login nem se fechar: a projeção de superfície
 * precisa usar os valores REAIS do runtime no boot (SessionManager fica em UNKNOWN até o 1o sync ok; o token
 * em memória pode estar vazio se o processo renasceu). Os testes anteriores montavam sempre "AUTHORIZED".
 */
class SessionSurfaceAtBootTest {

    /** Reproduz MainActivity.sampleRuntimeState() no momento do startSyncAndPlay (playback ocioso). */
    private fun surfaceAtBoot(stateName: String?, token: String?, userId: String?, savedScreen: String?, screenActive: Boolean = true): SurfaceState {
        val s = PlayerFlowPolicy.effectiveSessionInputs(stateName, token, userId, savedScreen)
        val state = PlayerRuntimeState(
            playback = PlaybackStateAdapter.adaptExoPlayerState(playbackState = 1, isPlaying = false, mediaId = null),
            sync = SyncStateAdapter.adapt(isSyncInProgress = true),
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionStateAdapter.adapt(
                sessionStateName = s.stateName,
                isDeviceRevoked = false,
                isScreenActive = screenActive,
                currentAccessToken = s.accessToken,
                currentUserId = s.userId,
                deviceIdentityHash = "hash"
            ),
            network = NetworkState.Online
        )
        return SurfaceProjectionEngine.project(state)
    }

    @Test
    fun justSelectedScreen_firstSync_showsSyncScreen_notLogin() {
        // Login ok (token em memória) + tela escolhida; SessionManager ainda UNKNOWN (nenhum sync concluiu).
        assertEquals(SurfaceState.SYNC_GUARD, surfaceAtBoot("UNKNOWN", token = "jwt", userId = "screen-1", savedScreen = "screen-1"))
    }

    @Test
    fun autoLoginFromRoom_stateInitializing_showsSyncScreen_notLogin() {
        assertEquals(SurfaceState.SYNC_GUARD, surfaceAtBoot("INITIALIZING", token = "jwt", userId = "screen-1", savedScreen = "screen-1"))
        assertEquals(SurfaceState.SYNC_GUARD, surfaceAtBoot("AUTHENTICATING", token = "jwt", userId = "screen-1", savedScreen = "screen-1"))
    }

    @Test
    fun processReborn_tokenNotInMemory_butScreenSaved_showsSyncScreen_notLogin() {
        // Watchdog/OS recriou o processo direto na MainActivity: token em memória vazio, tela salva no aparelho.
        assertEquals(SurfaceState.SYNC_GUARD, surfaceAtBoot("UNKNOWN", token = null, userId = null, savedScreen = "screen-1"))
        assertEquals(SurfaceState.SYNC_GUARD, surfaceAtBoot("UNKNOWN", token = "", userId = "screen-1", savedScreen = "screen-1"))
    }

    @Test
    fun trulyLoggedOut_stillGoesToLogin() {
        assertEquals(SurfaceState.LOGIN, surfaceAtBoot("UNKNOWN", token = null, userId = null, savedScreen = null))
        assertEquals(SurfaceState.LOGIN, surfaceAtBoot("UNKNOWN", token = "", userId = "", savedScreen = ""))
    }

    @Test
    fun loggedInWithoutScreen_goesToScreenSelection() {
        assertEquals(SurfaceState.SCREEN_SELECTION, surfaceAtBoot("AUTHENTICATED", token = "jwt", userId = null, savedScreen = null))
    }

    @Test
    fun suspendedScreen_staysBlocked() {
        assertEquals(SurfaceState.BLOCKED, surfaceAtBoot("SUSPENDED", token = "jwt", userId = "screen-1", savedScreen = "screen-1", screenActive = false))
    }

    @Test
    fun alreadyAuthorized_isUnchanged() {
        assertEquals(SurfaceState.SYNC_GUARD, surfaceAtBoot("AUTHORIZED", token = "jwt", userId = "screen-1", savedScreen = "screen-1"))
    }
}

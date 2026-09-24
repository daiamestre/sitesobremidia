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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * [P0.4.8R-F01] MainActivity.onNewIntent() — superfície de re-entrada.
 *
 * MainActivity é singleInstance e é filtro HOME. Com a Activity viva, onNewIntent() é disparado por:
 * tecla HOME, watchdog AlarmManager (startWatchdog), relaunch do UserApplication e retorno de
 * manutenção do SelfHealingService. Nenhum desses eventos pode derrubar a mídia válida em reprodução.
 *
 * Exercita a função de produção resolveReentrySurface() com PlayerRuntimeState real.
 */
class OnNewIntentReentrySurfaceTest {

    private fun runtimeState(exoPlaybackState: Int, isPlaying: Boolean): PlayerRuntimeState {
        return PlayerRuntimeState(
            playback = PlaybackStateAdapter.adaptExoPlayerState(
                playbackState = exoPlaybackState,
                isPlaying = isPlaying,
                mediaId = if (isPlaying) "media_01" else null
            ),
            sync = SyncStateAdapter.adapt(isSyncInProgress = false),
            kiosk = KioskState.Enforced,
            maintenance = MaintenanceState.Inactive,
            session = SessionStateAdapter.adapt(
                sessionStateName = "AUTHORIZED",
                isDeviceRevoked = false,
                isScreenActive = true,
                currentAccessToken = "valid_token",
                currentUserId = "screen_123",
                deviceIdentityHash = "hash_abc"
            ),
            network = NetworkState.Online
        )
    }

    private val playing = runtimeState(exoPlaybackState = 3, isPlaying = true)
    private val idle = runtimeState(exoPlaybackState = 1, isPlaying = false)

    @Test
    fun f01_playingSameScreen_onNewIntent_appliesNoSurface() {
        // Pré-condição: a projeção canônica deste estado é MEDIA_ONLY.
        assertEquals(SurfaceState.MEDIA_ONLY, SurfaceProjectionEngine.project(playing))

        val surface = resolveReentrySurface(playing, rendererScreenId = "screen_123", savedScreenId = "screen_123")

        // null = onNewIntent não aplica superfície: a mídia em reprodução (A/B renderer) permanece intacta.
        assertNull("PLAYING da mesma tela não pode receber superfície em onNewIntent (antes: SYNC_GUARD)", surface)
    }

    @Test
    fun f01_idle_reentry_keepsSyncGuard() {
        // Re-entrada vinda da ScreenSelectionActivity sem mídia ativa: comportamento RC2 preservado.
        val surface = resolveReentrySurface(idle, rendererScreenId = "screen_123", savedScreenId = "screen_123")
        assertEquals(SurfaceState.SYNC_GUARD, surface)
    }

    @Test
    fun f01_rendererNotInitialized_keepsSyncGuard() {
        val surface = resolveReentrySurface(idle, rendererScreenId = null, savedScreenId = "screen_123")
        assertEquals(SurfaceState.SYNC_GUARD, surface)
    }

    @Test
    fun f01_playingDifferentScreen_keepsSyncGuard() {
        // Mídia de outra tela não pode permanecer visível como se fosse da nova tela selecionada.
        val surface = resolveReentrySurface(playing, rendererScreenId = "screen_OLD", savedScreenId = "screen_NEW")
        assertEquals(SurfaceState.SYNC_GUARD, surface)
    }
}

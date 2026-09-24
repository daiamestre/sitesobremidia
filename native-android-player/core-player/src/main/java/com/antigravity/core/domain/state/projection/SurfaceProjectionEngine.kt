package com.antigravity.core.domain.state.projection

import com.antigravity.core.domain.state.PlaybackState
import com.antigravity.core.domain.state.PlayerRuntimeState
import com.antigravity.core.domain.state.SessionState
import com.antigravity.core.domain.state.SurfaceState

/**
 * Motor Canônico de Projeção de Superfície (SOBRE MÍDIA Android Player).
 * Determina exclusivamente e de forma pura qual superfície visual (SurfaceState)
 * deve estar ativa com base na composição do PlayerRuntimeState.
 *
 * Imutável, determinístico, livre de efeitos colaterais e sem comandos operacionais.
 * Não acessa Android UI, ExoPlayer, Room, SharedPreferences ou rede.
 */
object SurfaceProjectionEngine {

    /**
     * Projeta a superfície visual com base no estado agregado de runtime.
     * Obedece rigorosamente à hierarquia canônica de precedência:
     * 1. Sessão (Unauthenticated -> LOGIN, Unpaired -> SCREEN_SELECTION, Suspended/Revoked -> BLOCKED)
     * 2. Playback (Playing -> MEDIA_ONLY independente de Sync/Network/Kiosk/Maintenance)
     * 3. Playback Transitório (Preparing/Idle/ErrorFallback -> SYNC_GUARD)
     *
     * @param runtimeState Estado consolidado contendo os 6 eixos operacionais canônicos.
     * @return SurfaceState declarativo determinístico.
     */
    fun project(runtimeState: PlayerRuntimeState): SurfaceState {
        // Nível 1: Segurança e Autoridade de Sessão / Licenciamento
        return when (runtimeState.session) {
            is SessionState.Unauthenticated -> SurfaceState.LOGIN
            is SessionState.Unpaired -> SurfaceState.SCREEN_SELECTION
            is SessionState.Suspended,
            is SessionState.Revoked -> SurfaceState.BLOCKED
            is SessionState.Authorized -> {
                // Nível 2: Dispositivo Autorizado -> Playback governa a superfície física
                when (runtimeState.playback) {
                    is PlaybackState.Playing -> SurfaceState.MEDIA_ONLY
                    is PlaybackState.Preparing -> SurfaceState.SYNC_GUARD
                    is PlaybackState.Idle -> SurfaceState.SYNC_GUARD
                    is PlaybackState.ErrorFallback -> SurfaceState.SYNC_GUARD
                }
            }
        }
    }
}

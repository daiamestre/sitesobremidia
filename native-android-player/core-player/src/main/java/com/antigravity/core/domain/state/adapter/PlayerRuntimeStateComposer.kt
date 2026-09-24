package com.antigravity.core.domain.state.adapter

import com.antigravity.core.domain.state.KioskState
import com.antigravity.core.domain.state.MaintenanceState
import com.antigravity.core.domain.state.NetworkState
import com.antigravity.core.domain.state.PlaybackState
import com.antigravity.core.domain.state.PlayerRuntimeState
import com.antigravity.core.domain.state.SessionState
import com.antigravity.core.domain.state.SurfaceState
import com.antigravity.core.domain.state.SyncState
import com.antigravity.core.domain.state.projection.SurfaceProjectionEngine

/**
 * Compositor somente de leitura do Estado Canônico Agregado de Runtime.
 * Agrega os seis eixos operacionais adaptados em uma única estrutura imutável PlayerRuntimeState,
 * expondo a projeção visual derivada pura sem comandar o runtime.
 * Não possui estado mutável próprio e não interfere na execução do Player.
 */
object PlayerRuntimeStateComposer {

    /**
     * Combina os 6 eixos canônicos em um PlayerRuntimeState imutável.
     */
    fun compose(
        playback: PlaybackState,
        sync: SyncState,
        kiosk: KioskState,
        maintenance: MaintenanceState,
        session: SessionState,
        network: NetworkState
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

    /**
     * Projeta a superfície visual derivada diretamente do PlayerRuntimeState.
     * Delega ao SurfaceProjectionEngine canônico.
     */
    fun deriveSurface(runtimeState: PlayerRuntimeState): SurfaceState {
        return SurfaceProjectionEngine.project(runtimeState)
    }
}

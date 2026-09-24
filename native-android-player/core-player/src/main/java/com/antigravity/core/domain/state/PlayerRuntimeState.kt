package com.antigravity.core.domain.state

import com.antigravity.core.domain.state.projection.SurfaceProjectionEngine

/**
 * Estado Canônico Agregado de Runtime do SOBRE MÍDIA Android Player.
 * Composto por 6 eixos ortogonais imutáveis + 1 projeção visual derivada pura.
 * Sem efeitos colaterais, sem dependências Android UI / ExoPlayer / Supabase / Room.
 *
 * @param playback Eixo de ciclo de vida de reprodução de mídia.
 * @param sync Eixo de sincronização e download delta em background.
 * @param kiosk Eixo de contenção e isolamento de sistema.
 * @param maintenance Eixo de autorização de sessão técnica temporária.
 * @param session Eixo de credencial e atestação de hardware.
 * @param network Eixo de conectividade com a nuvem.
 */
data class PlayerRuntimeState(
    val playback: PlaybackState = PlaybackState.Idle,
    val sync: SyncState = SyncState.Idle,
    val kiosk: KioskState = KioskState.Enforced,
    val maintenance: MaintenanceState = MaintenanceState.Inactive,
    val session: SessionState = SessionState.Unauthenticated,
    val network: NetworkState = NetworkState.Online
) {
    /**
     * Projeção derivada determinística da superfície visual dominante.
     * Delega exclusivamente ao SurfaceProjectionEngine canônico.
     */
    val surface: SurfaceState
        get() = SurfaceProjectionEngine.project(this)

    companion object {
        /**
         * Função pura que calcula a projeção visual da superfície
         * com base na precedência canônica estrita dos eixos operacionais.
         */
        fun deriveSurface(
            playback: PlaybackState,
            sync: SyncState,
            session: SessionState,
            kiosk: KioskState,
            maintenance: MaintenanceState,
            network: NetworkState = NetworkState.Online
        ): SurfaceState {
            return SurfaceProjectionEngine.project(
                PlayerRuntimeState(
                    playback = playback,
                    sync = sync,
                    kiosk = kiosk,
                    maintenance = maintenance,
                    session = session,
                    network = network
                )
            )
        }
    }
}

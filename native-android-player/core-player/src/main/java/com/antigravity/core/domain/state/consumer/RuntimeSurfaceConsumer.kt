package com.antigravity.core.domain.state.consumer

import com.antigravity.core.domain.state.PlayerRuntimeState
import com.antigravity.core.domain.state.SurfaceState
import com.antigravity.core.domain.state.projection.SurfaceProjectionEngine

/**
 * Consumidor canônico de projeção de superfície visual (SOBRE MÍDIA Android Player).
 * Conecta o PlayerRuntimeState e o SurfaceProjectionEngine à camada visual concreta (SurfaceTarget).
 *
 * Arquitetura Canônica:
 * PlayerRuntimeState -> SurfaceProjectionEngine -> SurfaceState -> RuntimeSurfaceConsumer -> SurfaceTarget (UI)
 *
 * GOVERNANÇA DE AUTORIDADE:
 * O consumidor é estritamente limitado à exibição e ocultação de superfícies visuais.
 * Não possui nem adquire autoridade operacional sobre playback, sincronização,
 * sessão, kiosk, manutenção ou rede.
 */
class RuntimeSurfaceConsumer(
    private val target: SurfaceTarget
) {

    /**
     * Superfície visual atualmente aplicada na UI (somente leitura para auditoria e teste).
     */
    var currentAppliedSurface: SurfaceState? = null
        private set

    /**
     * Mensagem associada à superfície atualmente aplicada na UI.
     */
    var currentAppliedMessage: String? = null
        private set

    /**
     * Aplica uma projeção declarativa SurfaceState diretamente na UI através do SurfaceTarget.
     * Não executa efeitos colaterais operacionais (play/pause/stop/release/sync/auth/kiosk).
     *
     * @param surface Estado declarativo da superfície projetada.
     * @param message Mensagem de contexto opcional (usada em SYNC_GUARD ou BLOCKED).
     * @return A mesma superfície aplicada, garantindo rastreabilidade.
     */
    fun applySurface(surface: SurfaceState, message: String? = null): SurfaceState {
        when (surface) {
            SurfaceState.LOGIN -> target.showLoginSurface()
            SurfaceState.SCREEN_SELECTION -> target.showScreenSelectionSurface()
            SurfaceState.SYNC_GUARD -> target.showSyncGuardSurface(message)
            SurfaceState.MEDIA_ONLY -> target.showMediaOnlySurface()
            SurfaceState.BLOCKED -> target.showBlockedSurface(message)
        }
        currentAppliedSurface = surface
        currentAppliedMessage = message
        return surface
    }

    /**
     * Projeta e consome o estado visual a partir de um PlayerRuntimeState canônico agregado.
     * Delega exclusivamente ao SurfaceProjectionEngine canônico para determinar a superfície.
     *
     * @param runtimeState Estado consolidado contendo os 6 eixos operacionais canônicos.
     * @param message Mensagem de contexto opcional para superfícies que suportem texto informativo.
     * @return A superfície projetada e aplicada na UI.
     */
    fun consume(runtimeState: PlayerRuntimeState, message: String? = null): SurfaceState {
        val projectedSurface = SurfaceProjectionEngine.project(runtimeState)
        return applySurface(projectedSurface, message)
    }
}

package com.antigravity.core.domain.state.consumer

/**
 * Contrato canônico de visualização física de superfície (SOBRE MÍDIA Android Player).
 * Define estritamente a aplicação de interface visual (UI) na tela física.
 *
 * RESTRIÇÃO DE AUTORIDADE:
 * Implementações deste contrato NÃO possuem autoridade operacional e NÃO devem
 * executar comandos de playback (play, pause, stop, release, prepare, seekTo),
 * sincronização de banco de dados, autenticação de sessão, isolamento de kiosk ou regras financeiras.
 */
interface SurfaceTarget {

    /**
     * Exibe a interface de login / autenticação inicial.
     */
    fun showLoginSurface()

    /**
     * Exibe a interface de seleção de ponto de exibição / pareamento de hardware.
     */
    fun showScreenSelectionSurface()

    /**
     * Exibe a tela de proteção de sincronização / preparação com mensagem contextual opcional.
     */
    fun showSyncGuardSurface(message: String? = null)

    /**
     * Exibe exclusivamente a mídia em tela cheia (MEDIA ONLY).
     * Todos os banners operacionais, textos de status, spinners e overlays devem estar ocultos.
     */
    fun showMediaOnlySurface()

    /**
     * Exibe o overlay de bloqueio administrativo / suspensão de tela com mensagem opcional.
     */
    fun showBlockedSurface(message: String? = null)
}

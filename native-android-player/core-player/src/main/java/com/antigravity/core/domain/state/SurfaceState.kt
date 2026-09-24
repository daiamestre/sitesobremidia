package com.antigravity.core.domain.state

/**
 * Projeção Visual Derivada da Superfície (SOBRE MÍDIA Android Player).
 * Representa a camada de visualização dominante na tela física.
 * Não é uma autoridade de estado independente, mas o resultado puro de f(RuntimeState).
 */
enum class SurfaceState {
    /**
     * Tela de autenticação / login inicial.
     */
    LOGIN,

    /**
     * Tela de seleção de ponto de exibição / pareamento.
     */
    SCREEN_SELECTION,

    /**
     * Tela de inicialização, sincronização inicial ou transição de mídia.
     */
    SYNC_GUARD,

    /**
     * Reprodução limpa de mídia em tela cheia (MEDIA ONLY).
     * NENHUM overlay operacional, toast ou banner é exibido.
     */
    MEDIA_ONLY,

    /**
     * Tela de bloqueio administrativo por suspensão ou revogação de licença.
     */
    BLOCKED
}

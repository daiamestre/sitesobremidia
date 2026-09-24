package com.antigravity.core.domain.state

/**
 * Eixo Canônico de Playback (SOBRE MÍDIA Android Player).
 * Representa os estados de ciclo de vida de reprodução de mídia.
 * Imutável e agnóstico de plataforma UI/ExoPlayer.
 */
sealed interface PlaybackState {
    /**
     * Player ocioso, aguardando início de loop ou sem mídias prontas.
     */
    data object Idle : PlaybackState

    /**
     * Preparando carregamento, buffer ou transição de mídia.
     * @param mediaId ID da mídia em preparação (se conhecido).
     * @param isPreBuffer Indica se é um pré-carregamento em background.
     */
    data class Preparing(
        val mediaId: String? = null,
        val isPreBuffer: Boolean = false
    ) : PlaybackState

    /**
     * Mídia ativamente em reprodução na superfície.
     * @param mediaId ID canônico da mídia.
     * @param mediaType Tipo da mídia (VIDEO, IMAGE, WEB_WIDGET, etc.).
     * @param durationMs Duração total planejada em milissegundos.
     */
    data class Playing(
        val mediaId: String,
        val mediaType: String,
        val durationMs: Long
    ) : PlaybackState

    /**
     * Modo de contingência por falha de decodificação ou erro de renderização.
     * @param reason Descrição informativa da falha.
     */
    data class ErrorFallback(
        val reason: String
    ) : PlaybackState
}

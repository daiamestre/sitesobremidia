package com.antigravity.player.playback

import com.antigravity.core.domain.model.MediaType

/**
 * Política de transição entre mídias (padrão de players profissionais: cruzamento/dissolve).
 *
 * Referências de mercado (pesquisa): Xibo soma a transição de SAÍDA ao tempo do item (comportamento que a própria
 * comunidade registrou como bug); Yodeck só faz transição entre imagens e não em 4K; BrightSign não tem transição entre
 * vídeos; Screenly/Anthias pisca preto por 100-200 ms entre ativos.
 * Aqui o cruzamento vale para QUALQUER par (imagem/vídeo/widget) e acontece DENTRO do tempo do item que entra.
 */
object TransitionPolicy {
    const val DEFAULT_FADE_MS = 500L

    /** Abaixo disso o cruzamento não é perceptível: corte. */
    private const val MIN_FADE_MS = 120L

    /** O cruzamento nunca pode passar de 1/4 do tempo do item que entra. */
    private const val MAX_SLOT_FRACTION = 4L

    fun fadeMs(
        effect: String?,
        incomingDurationMs: Long,
        hasOutgoing: Boolean,
        videoToVideoOnSingleDecoder: Boolean
    ): Long {
        if (!hasOutgoing) return 0L
        val e = effect?.trim()?.lowercase()
        if (e == "cut" || e == "none" || e == "corte") return 0L
        // TV Box legada só tem UM decodificador: dois vídeos em cruzamento derrubam o codec.
        if (videoToVideoOnSingleDecoder) return 0L
        val capped = minOf(DEFAULT_FADE_MS, incomingDurationMs / MAX_SLOT_FRACTION)
        return if (capped < MIN_FADE_MS) 0L else capped
    }

    fun isVideoToVideo(outgoing: MediaType?, incoming: MediaType): Boolean =
        outgoing == MediaType.VIDEO && incoming == MediaType.VIDEO
}

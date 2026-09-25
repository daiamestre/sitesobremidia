package com.antigravity.player.playback

/**
 * Como um vídeo ocupa o tempo configurado no painel ("Tempo de Mídia"):
 * - configurado MENOR que o vídeo: corta exatamente no tempo configurado;
 * - configurado MAIOR que o vídeo: repete (loop) até completar o tempo (antes parava no fim do vídeo e a mídia ficava
 *   menos tempo que o configurado);
 * - configurado 0: vídeo inteiro.
 */
object VideoFillPlan {
    /** Diferença mínima para preferir repetir em vez de deixar o último quadro parado. */
    private const val LOOP_TOLERANCE_MS = 250L

    data class Plan(val loop: Boolean, val playMs: Long)

    fun plan(configuredMs: Long, realMs: Long): Plan = when {
        configuredMs <= 0L -> Plan(loop = false, playMs = maxOf(realMs, 0L))
        realMs <= 0L -> Plan(loop = false, playMs = configuredMs)
        configuredMs > realMs + LOOP_TOLERANCE_MS -> Plan(loop = true, playMs = configuredMs)
        else -> Plan(loop = false, playMs = configuredMs)
    }
}

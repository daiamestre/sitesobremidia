package com.antigravity.player.playback

/**
 * Quanto tempo um vídeo ocupa na tela, a partir do "Tempo de Mídia" do painel:
 * - configurado MENOR que o vídeo: corta exatamente no tempo configurado;
 * - configurado MAIOR que o vídeo: o vídeo toca INTEIRO uma única vez e a playlist segue (padrão de BrightSign, Yodeck,
 *   Xibo). NÃO repete: a repetição para "preencher" (5.4.0) voltava ao início e cortava no meio — e no tablet Multilaser
 *   (Unisoc SC9863a) a volta ao início saía distorcida/borrada;
 * - configurado 0 ou duração real desconhecida: usa o que se sabe (vídeo inteiro / tempo configurado).
 */
object VideoFillPlan {

    data class Plan(val playMs: Long)

    fun plan(configuredMs: Long, realMs: Long): Plan = when {
        configuredMs <= 0L -> Plan(playMs = maxOf(realMs, 0L))
        realMs <= 0L -> Plan(playMs = configuredMs)
        else -> Plan(playMs = minOf(configuredMs, realMs))
    }
}

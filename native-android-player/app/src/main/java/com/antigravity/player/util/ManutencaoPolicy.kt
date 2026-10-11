package com.antigravity.player.util

/**
 * F-183 — quando a manutenção automática pode REINICIAR o motor de reprodução.
 *
 * A manutenção rodava a cada 4 horas em QUALQUER horário: soltava os dois reprodutores e refazia a sincronização, e a tela
 * voltava para "Sincronizando Mídias" no meio do expediente (além de forçar coleta de lixo). Agora o reinício fica para a
 * madrugada, para quando a memória está de fato apertada, ou para quando já passou muito tempo (12 h) desde o último.
 */
object ManutencaoPolicy {
    const val LIMITE_SEM_REINICIAR_MS = 12 * 60 * 60 * 1000L

    fun horaDeMadrugada(hora: Int): Boolean = hora in 3..5

    fun deveReiniciarMotor(hora: Int, msDesdeUltimoReinicio: Long, memoriaBaixa: Boolean): Boolean =
        memoriaBaixa || horaDeMadrugada(hora) || msDesdeUltimoReinicio >= LIMITE_SEM_REINICIAR_MS
}

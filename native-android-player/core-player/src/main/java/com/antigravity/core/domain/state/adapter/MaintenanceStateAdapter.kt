package com.antigravity.core.domain.state.adapter

import com.antigravity.core.domain.state.MaintenanceSource
import com.antigravity.core.domain.state.MaintenanceState

/**
 * Adapter somente de leitura para o Eixo de Manutenção.
 * Converte o timestamp de expiração (PREF_MAINTENANCE_UNTIL) e tempo corrente para MaintenanceState canônico.
 * Não altera SharedPreferences nem cria timers.
 */
object MaintenanceStateAdapter {

    /**
     * Avalia se a janela de manutenção está ativa com base no deadline.
     * @param maintenanceUntilMs Timestamp Epoch (ms) em que a autorização expira.
     * @param currentTimeMs Timestamp Epoch atual para comparação pura (injetável para testes).
     * @param source Origem tipada da manutenção (quando conhecida no contexto).
     */
    fun adapt(
        maintenanceUntilMs: Long,
        currentTimeMs: Long = System.currentTimeMillis(),
        source: MaintenanceSource = MaintenanceSource.RemoteCommand
    ): MaintenanceState {
        return if (maintenanceUntilMs > 0L && maintenanceUntilMs > currentTimeMs) {
            MaintenanceState.Active(
                expiresAtMs = maintenanceUntilMs,
                source = source
            )
        } else {
            MaintenanceState.Inactive
        }
    }
}

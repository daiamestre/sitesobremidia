package com.antigravity.core.domain.state

/**
 * Origem tipada da ativação da sessão de manutenção.
 */
enum class MaintenanceSource {
    RemoteCommand,
    LocalAdmin,
    TimeoutRecovery
}

/**
 * Eixo Canônico de Manutenção (SOBRE MÍDIA Android Player).
 * Representa a autorização temporária de acesso operacional ao dispositivo.
 * Imutável e desacoplado de persistência SharedPreferences/Room.
 */
sealed interface MaintenanceState {
    /**
     * Manutenção inativa (operação comercial nominal).
     */
    data object Inactive : MaintenanceState

    /**
     * Janela de manutenção temporária ativa.
     * @param expiresAtMs Timestamp Epoch em milissegundos do término da autorização.
     * @param source Origem tipada da requisição de manutenção.
     */
    data class Active(
        val expiresAtMs: Long,
        val source: MaintenanceSource
    ) : MaintenanceState
}

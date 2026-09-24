package com.antigravity.core.domain.state

/**
 * Eixo Canônico de Autenticação e Sessão de Hardware (SOBRE MÍDIA Android Player).
 * Representa a autoridade de vínculo criptográfico e licenciamento do dispositivo.
 * Imutável e desacoplado de SessionManager / Supabase / rede.
 */
sealed interface SessionState {
    /**
     * Dispositivo sem credenciais de autenticação ativas.
     */
    data object Unauthenticated : SessionState

    /**
     * Dispositivo autenticado na conta, mas sem ponto de exibição (tela) selecionado/pareado.
     */
    data object Unpaired : SessionState

    /**
     * Dispositivo plenamente autorizado com tela vinculada e binding de hardware verificado.
     * @param screenId Identificador único da tela/ponto de exibição.
     * @param hardwareHash Hash SHA-256 de identificação do hardware físico.
     */
    data class Authorized(
        val screenId: String,
        val hardwareHash: String
    ) : SessionState

    /**
     * Tela ou conta temporariamente suspensa administrativamente (ex: inadimplência/bloqueio manual).
     * @param reason Motivo opcional da suspensão.
     */
    data class Suspended(
        val reason: String? = null
    ) : SessionState

    /**
     * Vínculo de hardware revogado permanentemente pelo painel central.
     * @param reason Motivo opcional da revogação.
     */
    data class Revoked(
        val reason: String? = null
    ) : SessionState
}

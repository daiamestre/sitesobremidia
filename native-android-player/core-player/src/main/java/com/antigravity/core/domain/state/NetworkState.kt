package com.antigravity.core.domain.state

/**
 * Eixo Canônico de Conectividade de Rede (SOBRE MÍDIA Android Player).
 * Representa a disponibilidade de rota para a nuvem.
 * Imutável e desacoplado de Android ConnectivityManager.
 */
sealed interface NetworkState {
    /**
     * Conectividade com a internet estabelecida e funcional.
     */
    data object Online : NetworkState

    /**
     * Conexão indisponível; player opera em modo autônomo via cache local.
     */
    data object Offline : NetworkState
}

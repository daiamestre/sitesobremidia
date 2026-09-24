package com.antigravity.core.domain.state.adapter

import com.antigravity.core.domain.state.NetworkState

/**
 * Adapter somente de leitura para o Eixo de Conectividade de Rede.
 * Converte o sinal de rede para NetworkState canônico.
 * Não registra listeners de conectividade nem altera o estado de rede.
 */
object NetworkStateAdapter {

    fun adapt(isConnected: Boolean): NetworkState {
        return if (isConnected) {
            NetworkState.Online
        } else {
            NetworkState.Offline
        }
    }
}

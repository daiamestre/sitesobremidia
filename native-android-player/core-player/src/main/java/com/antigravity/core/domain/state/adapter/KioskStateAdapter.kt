package com.antigravity.core.domain.state.adapter

import com.antigravity.core.domain.state.KioskState

/**
 * Adapter somente de leitura para o Eixo de Kiosk.
 * Converte o sinal de contenção de sistema (isKioskEnforced) para KioskState canônico.
 * Não altera configurações de Kiosk nem chama APIs de DeviceControl.
 */
object KioskStateAdapter {

    fun adapt(isKioskEnforced: Boolean): KioskState {
        return if (isKioskEnforced) {
            KioskState.Enforced
        } else {
            KioskState.Disabled
        }
    }
}

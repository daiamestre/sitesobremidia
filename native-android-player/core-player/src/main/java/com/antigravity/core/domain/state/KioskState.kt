package com.antigravity.core.domain.state

/**
 * Eixo Canônico de Kiosk / Isolamento de Sistema (SOBRE MÍDIA Android Player).
 * Representa o estado de proteção contra escape e restrição de interface.
 * Imutável e desacoplado de APIs Android / WindowManager.
 */
sealed interface KioskState {
    /**
     * Modo Kiosk ativo: barras de sistema ocultas, touch protegido, foco forçado.
     */
    data object Enforced : KioskState

    /**
     * Modo Kiosk temporariamente desabilitado (ex: sessão de manutenção autorizada).
     */
    data object Disabled : KioskState
}

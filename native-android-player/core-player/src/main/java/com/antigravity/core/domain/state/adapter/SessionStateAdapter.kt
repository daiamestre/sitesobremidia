package com.antigravity.core.domain.state.adapter

import com.antigravity.core.domain.state.SessionState

/**
 * Adapter somente de leitura para o Eixo de Sessão.
 * Converte o estado de sessão do SessionManager, credenciais e hardware binding
 * para o SessionState canônico imutável, respeitando a precedência estrita de segurança.
 * Não realiza chamadas de rede, logout, despareamento ou persistência.
 */
object SessionStateAdapter {

    fun adapt(
        sessionStateName: String? = null,
        isDeviceRevoked: Boolean = false,
        isScreenActive: Boolean = true,
        currentAccessToken: String? = null,
        currentUserId: String? = null,
        deviceIdentityHash: String? = null,
        blockMessage: String? = null
    ): SessionState {
        val stateUpper = sessionStateName?.trim()?.uppercase()

        // Precedência 1: Revogação de Hardware / Admin (Bloqueio Permanente)
        if (isDeviceRevoked || stateUpper == "REVOKED") {
            return SessionState.Revoked(reason = blockMessage)
        }

        // Precedência 2: Suspensão Administrativa da Tela (Bloqueio Temporário)
        if (!isScreenActive || stateUpper == "SUSPENDED") {
            return SessionState.Suspended(reason = blockMessage)
        }

        // Precedência 3: Não Autenticado (Sem Token Válido)
        if (currentAccessToken.isNullOrBlank() ||
            stateUpper == "UNKNOWN" ||
            stateUpper == "INITIALIZING" ||
            stateUpper == "AUTHENTICATING"
        ) {
            // Se tiver token válido mas estiver em INITIALIZING/AUTHENTICATING sem tela, é Unpaired
            if (!currentAccessToken.isNullOrBlank() && currentUserId.isNullOrBlank()) {
                return SessionState.Unpaired
            }
            return SessionState.Unauthenticated
        }

        // Precedência 4: Autenticado, porém Sem Tela Selecionada / Desemparelhado
        if (currentUserId.isNullOrBlank() || stateUpper == "AUTHENTICATED" || stateUpper == "UNPAIRED") {
            return SessionState.Unpaired
        }

        // Precedência 5: Plenamente Autorizado com Tela Vinculada
        return SessionState.Authorized(
            screenId = currentUserId,
            hardwareHash = deviceIdentityHash ?: ""
        )
    }
}

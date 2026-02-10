package com.antigravity.core.fsm

/**
 * Representa os estados possíveis do Player conforme especificado na
 * arquitetura do documento "ESPE - PLAYER ANDROID ENTERPRISE".
 */
sealed class PlayerState {
    // Inicialização e Boot
    object INIT : PlayerState()
    
    // Autenticação e Registro
    object AUTHENTICATING : PlayerState()
    object REGISTERED : PlayerState() // Estado transitório pós-sucesso auth

    // Sincronização
    object SYNCING : PlayerState() // Baixando e validando mídias
    
    // Prontidão
    object READY : PlayerState() // Tudo baixado, verificado e pronto

    // Playback Nominal
    object PLAYING : PlayerState() // Loop de reprodução ativo com rede
    
    // Playback Degradado / Offline
    object OFFLINE_PLAYING : PlayerState() // Sem rede, tocando cache local
    
    // Modos de Falha
    data class DEGRADED_MODE(val reason: String) : PlayerState() // Pulando mídia específica
    data class ERROR_RECOVERY(val attempt: Int) : PlayerState() // Tentando auto-cura
    data class SAFE_MODE(val error: Throwable) : PlayerState() // Falha crítica, requer suporte
    
    // Ciclo de Vida do Sistema
    object UPDATING : PlayerState() // Processo OTA
    object REBOOTING : PlayerState() // Reinício forçado
}

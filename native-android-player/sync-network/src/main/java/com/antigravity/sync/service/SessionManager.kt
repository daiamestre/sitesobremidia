package com.antigravity.sync.service

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout

/**
 * Estados da Identidade Física do Aparelho (Hardware Attestation).
 */
enum class IdentityState {
    IDENTITY_INITIALIZING,
    IDENTITY_READY,
    IDENTITY_FAILED
}

/**
 * Estados da Sessão e Ciclo de Vida do Player (State Machine Formal).
 */
enum class PlayerSessionState {
    UNKNOWN,
    INITIALIZING,
    AUTHENTICATING,
    AUTHENTICATED,
    SYNCING,
    AUTHORIZED,
    PLAYING,
    OFFLINE,
    SUSPENDED,
    REVOKED,
    BINDING_ERROR,
    NETWORK_ERROR
}

/**
 * Singleton que gerencia o estado da sessão do player.
 * Responsável por tokens de autenticação, configurações dinâmicas,
 * e eventos reativos (rotação, áudio, sync, comandos remotos).
 */
object SessionManager {

    // --- Authentication ---
    var currentAccessToken: String? = null
    var currentUserId: String? = null // Armazena Custom ID ou UUID da tela
    var currentUUID: String? = null   // UUID real do Supabase para auditoria/telemetria

    // --- Device Identity (Hardware Binding) ---
    private val _identityState = MutableStateFlow(IdentityState.IDENTITY_INITIALIZING)
    val identityState: StateFlow<IdentityState> = _identityState.asStateFlow()

    var deviceIdentityHash: String? = null
        private set

    var boundDeviceId: String? = null      // UUID do device registrado no backend
    var isDeviceRevoked: Boolean = false   // Bloqueio por revogação do Owner/Admin

    // --- Session State Machine ---
    private val _sessionState = MutableStateFlow(PlayerSessionState.UNKNOWN)
    val sessionState: StateFlow<PlayerSessionState> = _sessionState.asStateFlow()

    // --- Observability ---
    var currentCorrelationId: String? = null // Correlation do comando remoto em execução

    // --- Screen Config ---
    var currentOrientation: String? = "landscape"
    var currentScreenName: String? = null

    // --- Player Settings ---
    var heartbeatIntervalSeconds: Int = 60
    var seamlessTransition: Boolean = true
    var cacheNextMedia: Boolean = true
    var isAudioEnabled: Boolean = true
    var isScreenActive: Boolean = true
    var blockMessage: String = "Sistema Temporariamente Suspenso - Entre em contato com o suporte"

    // --- Persistence Callback (set by MainActivity) ---
    var onScreenActiveChanged: ((Boolean) -> Unit)? = null

    // --- State Tracking ---
    var lastConfigHash: String? = null

    // --- Reactive Event Channels ---
    private val _rotationEvents = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val rotationEvents: SharedFlow<String> = _rotationEvents.asSharedFlow()

    private val _audioEvents = MutableSharedFlow<Boolean>(extraBufferCapacity = 1)
    val audioEvents: SharedFlow<Boolean> = _audioEvents.asSharedFlow()

    private val _maintenanceEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val maintenanceEvents: SharedFlow<Unit> = _maintenanceEvents.asSharedFlow()

    private val _syncEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val syncEvents: SharedFlow<Unit> = _syncEvents.asSharedFlow()

    private val _remoteCommandEvents = MutableSharedFlow<Pair<String, String>>(extraBufferCapacity = 5)
    val remoteCommandEvents: SharedFlow<Pair<String, String>> = _remoteCommandEvents.asSharedFlow()

    private val _screenActiveEvents = MutableSharedFlow<Boolean>(extraBufferCapacity = 1)
    val screenActiveEvents: SharedFlow<Boolean> = _screenActiveEvents.asSharedFlow()

    // --- Identity Methods ---

    fun setIdentity(hash: String) {
        if (hash.isNotBlank() && hash != "UNKNOWN_DEVICE" && hash != "UNKNOWN") {
            deviceIdentityHash = hash
            _identityState.value = IdentityState.IDENTITY_READY
        } else {
            _identityState.value = IdentityState.IDENTITY_FAILED
        }
    }

    fun setIdentityFailed(reason: String) {
        _identityState.value = IdentityState.IDENTITY_FAILED
    }

    /**
     * Aguarda de forma segura a inicialização da identidade antes de permitir chamadas RPC.
     * Elimina 100% qualquer envio de UNKNOWN_DEVICE para o banco de dados.
     */
    suspend fun awaitIdentity(timeoutMs: Long = 10000L): String {
        return withTimeout(timeoutMs) {
            val state = _identityState.first { it != IdentityState.IDENTITY_INITIALIZING }
            if (state == IdentityState.IDENTITY_READY && !deviceIdentityHash.isNullOrBlank()) {
                deviceIdentityHash!!
            } else {
                throw IllegalStateException("Falha ao obter identidade de hardware válida (Estado: $state)")
            }
        }
    }

    // --- Session State Machine Transitions ---

    fun transitionTo(newState: PlayerSessionState) {
        _sessionState.value = newState
    }

    // --- Event Triggers ---

    fun triggerRotation(newOrientation: String) {
        currentOrientation = newOrientation
        _rotationEvents.tryEmit(newOrientation)
    }

    fun triggerAudioChange(enabled: Boolean) {
        isAudioEnabled = enabled
        _audioEvents.tryEmit(enabled)
    }

    fun triggerWebViewReset() {
        _maintenanceEvents.tryEmit(Unit)
    }

    fun triggerSyncNudge() {
        _syncEvents.tryEmit(Unit)
    }

    fun triggerRemoteCommand(command: String, commandId: String) {
        currentCorrelationId = commandId
        _remoteCommandEvents.tryEmit(command to commandId)
    }

    fun triggerScreenActive(active: Boolean, message: String? = null) {
        isScreenActive = active
        message?.let { blockMessage = it }
        if (!active) {
            transitionTo(PlayerSessionState.SUSPENDED)
        } else if (_sessionState.value == PlayerSessionState.SUSPENDED) {
            transitionTo(PlayerSessionState.AUTHORIZED)
        }
        _screenActiveEvents.tryEmit(active)
        onScreenActiveChanged?.invoke(active)
    }

    // [P0-C] Limpeza restrita e idempotente para desvinculação da Screen
    fun unpairScreen() {
        currentUserId = null
        currentUUID = null
        boundDeviceId = null
        isDeviceRevoked = false
        currentOrientation = "landscape"
        heartbeatIntervalSeconds = 60
        seamlessTransition = true
        cacheNextMedia = true
        lastConfigHash = null
        isScreenActive = true
        // Importante: NÃO limpar deviceIdentityHash nem _identityState, 
        // a identidade de hardware é imutável perante a vida útil do App.
        // Dispositivo NÃO está revogado após unpair — permanece elegível para novo pareamento.
        _sessionState.value = PlayerSessionState.INITIALIZING
    }

    fun clear() {
        currentAccessToken = null
        currentUserId = null
        currentUUID = null
        deviceIdentityHash = null
        boundDeviceId = null
        isDeviceRevoked = false
        currentCorrelationId = null
        currentOrientation = "landscape"
        heartbeatIntervalSeconds = 60
        seamlessTransition = true
        cacheNextMedia = true
        lastConfigHash = null
        isScreenActive = true
        _identityState.value = IdentityState.IDENTITY_INITIALIZING
        _sessionState.value = PlayerSessionState.UNKNOWN
    }
}

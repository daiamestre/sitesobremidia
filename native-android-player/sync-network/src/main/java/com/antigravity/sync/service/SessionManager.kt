package com.antigravity.sync.service

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Singleton que gerencia o estado da sessão do player.
 * Responsável por tokens de autenticação, configurações dinâmicas,
 * e eventos reativos (rotação, áudio, sync, comandos remotos).
 */
object SessionManager {

    // --- Authentication ---
    var currentAccessToken: String? = null
    var currentUserId: String? = null // This often stores Custom ID
    var currentUUID: String? = null   // New: Store the real Supabase UUID for system logic

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
        _remoteCommandEvents.tryEmit(command to commandId)
    }

    fun triggerScreenActive(active: Boolean, message: String? = null) {
        isScreenActive = active
        message?.let { blockMessage = it }
        _screenActiveEvents.tryEmit(active)
        onScreenActiveChanged?.invoke(active)
    }

    fun clear() {
        currentAccessToken = null
        currentUserId = null
        currentOrientation = "landscape"
        heartbeatIntervalSeconds = 60
        seamlessTransition = true
        cacheNextMedia = true
        lastConfigHash = null
        isScreenActive = true
    }
}

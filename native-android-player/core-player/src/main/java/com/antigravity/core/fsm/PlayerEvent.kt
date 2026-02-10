package com.antigravity.core.fsm

/**
 * Eventos que disparam transições na Máquina de Estados.
 */
sealed class PlayerEvent {
    // System Events
    object BootCompleted : PlayerEvent()
    object NetworkAvailable : PlayerEvent()
    object NetworkLost : PlayerEvent()
    
    // Auth Events
    object RegistrationSuccess : PlayerEvent()
    object RegistrationFailed : PlayerEvent()
    
    // Sync Events
    object PlaylistUpdateFound : PlayerEvent()
    object SyncCompleted : PlayerEvent()
    object SyncFailed : PlayerEvent()
    
    // Playback Events
    object PlaybackStarted : PlayerEvent()
    data class MediaError(val mediaId: String, val error: Throwable) : PlayerEvent()
    
    // Critical Events
    data class CriticalError(val error: Throwable) : PlayerEvent()
    object WatchdogTimeout : PlayerEvent()
    object UpdateReceived : PlayerEvent()
}

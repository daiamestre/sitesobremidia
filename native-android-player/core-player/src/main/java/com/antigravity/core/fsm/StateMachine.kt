package com.antigravity.core.fsm

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Gerenciador central de estado.
 * Responsável por aplicar as regras de transição estritas definidas na ESPECIFICAÇÃO.
 */
class StateMachine {

    private val _currentState = MutableStateFlow<PlayerState>(PlayerState.INIT)
    val currentState: StateFlow<PlayerState> = _currentState.asStateFlow()

    fun transition(event: PlayerEvent) {
        val oldState = _currentState.value
        val newState = computeNextState(oldState, event)

        if (oldState != newState) {
            _currentState.value = newState
            logTransition(oldState, newState, event)
        }
    }

    private fun computeNextState(current: PlayerState, event: PlayerEvent): PlayerState {
        return when (current) {
            PlayerState.INIT -> when (event) {
                PlayerEvent.BootCompleted -> PlayerState.AUTHENTICATING
                is PlayerEvent.CriticalError -> PlayerState.SAFE_MODE(event.error)
                else -> current
            }

            PlayerState.AUTHENTICATING -> when (event) {
                PlayerEvent.RegistrationSuccess -> PlayerState.REGISTERED
                PlayerEvent.RegistrationFailed -> PlayerState.AUTHENTICATING // Retry loop logic to be handled by usecase
                is PlayerEvent.CriticalError -> PlayerState.SAFE_MODE(event.error)
                else -> current
            }
            
            PlayerState.REGISTERED -> when (event) {
                PlayerEvent.SyncCompleted -> PlayerState.READY
                PlayerEvent.PlaylistUpdateFound -> PlayerState.SYNCING
                else -> PlayerState.SYNCING // Default to syncing after registration
            }

            PlayerState.SYNCING -> when (event) {
                PlayerEvent.SyncCompleted -> PlayerState.READY
                PlayerEvent.SyncFailed -> PlayerState.OFFLINE_PLAYING // Fallback if applicable
                is PlayerEvent.CriticalError -> PlayerState.ERROR_RECOVERY(1)
                else -> current
            }

            PlayerState.READY -> when (event) {
                PlayerEvent.PlaybackStarted -> PlayerState.PLAYING
                PlayerEvent.NetworkLost -> PlayerState.OFFLINE_PLAYING
                PlayerEvent.PlaylistUpdateFound -> PlayerState.SYNCING
                else -> current
            }

            PlayerState.PLAYING -> when (event) {
                PlayerEvent.NetworkLost -> PlayerState.OFFLINE_PLAYING
                is PlayerEvent.MediaError -> PlayerState.DEGRADED_MODE("Media Failure: ${event.mediaId}")
                is PlayerEvent.CriticalError -> PlayerState.ERROR_RECOVERY(1)
                PlayerEvent.UpdateReceived -> PlayerState.UPDATING
                else -> current
            }

            PlayerState.OFFLINE_PLAYING -> when (event) {
                PlayerEvent.NetworkAvailable -> PlayerState.PLAYING // Or trigger sync check
                is PlayerEvent.CriticalError -> PlayerState.REBOOTING // If remote is dead and local dies -> Reboot
                else -> current
            }

            is PlayerState.DEGRADED_MODE -> when (event) {
                PlayerEvent.PlaybackStarted -> PlayerState.PLAYING // Recovered
                is PlayerEvent.CriticalError -> PlayerState.ERROR_RECOVERY(1)
                else -> current
            }

            is PlayerState.ERROR_RECOVERY -> {
                // Logic for retries would be handled here or in a manager. 
                // Simplification: if sync/play works, go to Ready. 
                // If fails again -> Safe Mode.
                when (event) {
                    PlayerEvent.SyncCompleted -> PlayerState.READY
                    is PlayerEvent.CriticalError -> PlayerState.SAFE_MODE(event.error)
                    else -> current
                }
            }
            
            is PlayerState.SAFE_MODE -> current

            PlayerState.UPDATING -> {
                // Installation process
                current
            }

            PlayerState.REBOOTING -> current
        }
    }

    private fun logTransition(old: PlayerState, new: PlayerState, event: PlayerEvent) {
        println("FSM_TRANSITION: ${old.javaClass.simpleName} -> ${new.javaClass.simpleName} [Trigger: ${event.javaClass.simpleName}]")
    }
}

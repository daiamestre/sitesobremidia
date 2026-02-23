package com.antigravity.sync.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ProfessionalDashboardResponse(
    @SerialName("screen_metadata") val metadata: ScreenMetadata,
    @SerialName("display_settings") val displaySettings: DisplaySettings,
    @SerialName("player_logic") val playerLogic: PlayerLogicDTO,
    @SerialName("content_package") val contentPackage: ContentPackageDTO
)

@Serializable
data class ScreenMetadata(
    @SerialName("display_id") val displayId: String,
    @SerialName("last_sync") val lastSync: String,
    @SerialName("status") val status: String
)

@Serializable
data class DisplaySettings(
    val orientation: String,
    val resolution: String,
    @SerialName("force_full_screen") val forceFullScreen: Boolean = true,
    @SerialName("show_clock") val showClock: Boolean = false,
    val brightness: Int = 100
)

@Serializable
data class PlayerLogicDTO(
    @SerialName("seamless_transition") val seamlessTransition: Boolean = true,
    @SerialName("cache_next_media") val cacheNextMedia: Boolean = true,
    @SerialName("auto_launch_on_boot") val autoLaunchOnBoot: Boolean = true,
    @SerialName("heartbeat_interval_seconds") val heartbeatIntervalSeconds: Int = 60
)

@Serializable
data class ContentPackageDTO(
    @SerialName("playlist_id") val playlistId: String,
    val items: List<ProfessionalMediaItemDTO>
)

@Serializable
data class ProfessionalMediaItemDTO(
    val id: String,
    val type: String,
    val url: String,
    @SerialName("duration_seconds") val durationSeconds: Long,
    @SerialName("transition_effect") val transitionEffect: String? = "crossfade"
)

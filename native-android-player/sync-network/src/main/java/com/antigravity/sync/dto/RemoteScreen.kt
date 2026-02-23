package com.antigravity.sync.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RemoteScreen(
    val id: String,
    val name: String,
    @SerialName("playlist_id") val playlistId: String?,
    @SerialName("orientation") val orientation: String? = "landscape",
    @SerialName("resolution") val resolution: String? = "16x9",
    @SerialName("is_active") val isActive: Boolean? = true,
    @SerialName("custom_id") val customId: String? = null,
    @SerialName("audio_enabled") val audioEnabled: Boolean? = true,
    @SerialName("timezone_offset") val timezoneOffset: Int? = -3
)

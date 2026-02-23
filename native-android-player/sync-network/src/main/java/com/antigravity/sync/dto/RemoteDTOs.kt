package com.antigravity.sync.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RemotePlaylist(
    val id: String,
    val name: String,
    // Note: Supabase joins are handled via Postgrest, assume embedded items if queried correctly
    // or fetched separately. For simplicity, we define the structure here.
    @SerialName("playlist_items") val items: List<RemotePlaylistItem> = emptyList()
)

@Serializable
data class RemotePlaylistItem(
    val id: String,
    @SerialName("media_id") val mediaId: String? = null,
    @SerialName("widget_id") val widgetId: String? = null,
    @SerialName("external_link_id") val externalLinkId: String? = null,
    @SerialName("position") val order: Int? = 0, // DB column is 'position'
    @SerialName("duration") val duration: Long? = 10, // DB column is 'duration'
    @SerialName("start_time") val startTime: String? = null, // "08:00:00" -> Parser needs to handle this
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("days_of_week") val daysOfWeek: String? = null, // "1,2,3"
    @SerialName("media") val media: RemoteMedia? = null,
    @SerialName("widget") val widget: RemoteWidget? = null,
    @SerialName("external_link") val externalLink: RemoteExternalLink? = null
)

@Serializable
data class RemoteWidget(
    val id: String,
    val name: String,
    @SerialName("widget_type") val widgetType: String,
    val config: kotlinx.serialization.json.JsonObject? = null
)

@Serializable
data class RemoteExternalLink(
    val id: String,
    val title: String,
    val url: String
)

@Serializable
data class RemoteMedia(
    val id: String,
    val name: String,
    @SerialName("file_type") val type: String? = "image",
    @SerialName("file_url") val url: String,
)

@Serializable
data class PlayLogDto(
    @SerialName("screen_id") val screenId: String,
    @SerialName("media_id") val mediaId: String,
    @SerialName("duration") val duration: Int, // Seconds
    @SerialName("started_at") val startedAt: String, // ISO 8601 string
    @SerialName("status") val status: String,
    @SerialName("signature") val signature: String? = null
)

@Serializable
data class AppReleaseDto(
    val id: String,
    @SerialName("version_code") val versionCode: Int,
    @SerialName("version_name") val versionName: String,
    @SerialName("apk_url") val apkUrl: String,
    @SerialName("release_notes") val release_notes: String? = null,
    @SerialName("is_mandatory") val is_mandatory: Boolean = false
)

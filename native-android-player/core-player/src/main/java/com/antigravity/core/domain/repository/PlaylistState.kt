package com.antigravity.core.domain.repository

import com.antigravity.core.domain.model.MediaItem

sealed class PlaylistState {
    object Loading : PlaylistState()
    data class Downloading(val fileName: String) : PlaylistState()
    data class Success(val items: List<MediaItem>) : PlaylistState()
    data class Error(val message: String) : PlaylistState()
}

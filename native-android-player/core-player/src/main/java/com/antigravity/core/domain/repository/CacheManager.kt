package com.antigravity.core.domain.repository

import java.io.File

interface CacheManager {
    fun getLocalPathForId(id: String): String
    fun calculateHash(path: String): String
    suspend fun savePlaylistToRoom(items: List<Any>) // Generic for now, implementation will handle it
}

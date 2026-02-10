package com.antigravity.sync.service

import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.domain.model.Playlist
import com.antigravity.sync.dto.RemotePlaylist
import com.antigravity.sync.dto.RemoteScreen
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns

class RemoteDataSource {

    private val client = SupabaseModule.client

    // Fetch the playlist assigned to this screen
    // Fetch the playlist assigned to this screen
    // Fetch the playlist assigned to this screen
    suspend fun getPlaylistForScreen(identifier: String): Playlist? {
        println("SYNC: Starting Sequential Fetch for Screen Identifier: $identifier")

        // 1. Try to find Screen by 'custom_id' (User Friendly ID)
        var screen = client.from("screens")
            .select {
                filter {
                    eq("custom_id", identifier)
                }
            }.decodeSingleOrNull<RemoteScreen>()

        // Fallback: If not found, try by UUID 'id' (Legacy support)
        if (screen == null) {
             println("SYNC: Custom ID not found. Trying as UUID...")
             try {
                 screen = client.from("screens")
                    .select {
                        filter {
                            eq("id", identifier)
                        }
                    }.decodeSingleOrNull<RemoteScreen>()
             } catch (e: Exception) {
                 // Ignore format errors if identifier is not a valid UUID
             }
        }

        if (screen == null) {
            throw Exception("Tela não encontrada no painel. ID: $identifier")
        }

        val playlistId = screen.playlistId
        println("SYNC: Found Playlist ID: $playlistId")
        
        if (playlistId == null) {
             throw Exception("Tela encontrada ($identifier), mas sem Playlist atribuída.")
        }

        // 2. Fetch Playlist Metadata
        val remotePlaylist = client.from("playlists")
            .select(columns = Columns.raw("id, name")) {
                filter {
                    eq("id", playlistId)
                }
            }.decodeSingleOrNull<RemotePlaylist>()

        if (remotePlaylist == null) {
            println("SYNC: Playlist metadata not found.")
            throw Exception("Playlist ID $playlistId não encontrada (Excluída ou bloqueada por RLS).")
        }

        // 3. Fetch Items
        val items = client.from("playlist_items")
            .select {
                filter {
                    eq("playlist_id", playlistId)
                }
            }.decodeList<com.antigravity.sync.dto.RemotePlaylistItem>()

        println("SYNC: Fetched ${items.size} items from playlist_items table.")

        if (items.isEmpty()) {
            return remotePlaylist.toDomain(emptyList(), emptyMap())
        }

        // 4. Fetch Media
        val mediaIds = items.mapNotNull { it.mediaId }.distinct()
        println("SYNC: Fetching ${mediaIds.size} unique media files...")

        val mediaList = if (mediaIds.isNotEmpty()) {
            client.from("media")
                .select {
                    filter {
                        try {
                            // Supabase kt syntax for IN
                            isIn("id", mediaIds)
                        } catch (e: Exception) {
                            println("SYNC: Filter IN error: ${e.message}")
                        }
                    }
                }.decodeList<com.antigravity.sync.dto.RemoteMedia>()
        } else {
            emptyList()
        }
        
        println("SYNC: Fetched ${mediaList.size} media objects from media table.")
        
        // 5. Build Map
        val mediaMap = mediaList.associateBy { it.id }

        // 6. Combine
        return remotePlaylist.toDomain(items, mediaMap)
    }

    // [NEW] Find screen by Custom ID (entered by user)
    suspend fun findScreenByCustomId(customId: String): RemoteScreen? {
         return client.from("screens")
             .select {
                 filter {
                     eq("custom_id", customId) // Exact match on custom_id column
                 }
             }
             .decodeSingleOrNull<RemoteScreen>()
    }

    // Updated Mapper function
    private fun RemotePlaylist.toDomain(
        rawItems: List<com.antigravity.sync.dto.RemotePlaylistItem>,
        mediaMap: Map<String, com.antigravity.sync.dto.RemoteMedia>
    ): Playlist {
        
        val domainItems = rawItems.mapNotNull { item ->
            val mediaId = item.mediaId ?: return@mapNotNull null
            val media = mediaMap[mediaId]
            
            if (media == null) {
                println("SYNC: Item ${item.id} skipped (Media ID $mediaId not found in Media table).")
                return@mapNotNull null
            }

            val typeEnum = inferMediaType(media.url)
            
            MediaItem(
                id = media.id,
                name = media.name,
                type = typeEnum,
                durationSeconds = item.duration ?: 10L,
                remoteUrl = media.url,
                localPath = null,
                hash = "",
                order = item.order ?: 0
            )
        }.sortedBy { it.order }
        
        println("SYNC: Final Domain Playlist has ${domainItems.size} playable items.")

        return Playlist(
            id = this.id,
            name = this.name ?: "Untitled Playlist",
            version = System.currentTimeMillis(),
            items = domainItems
        )
    }

    // [NEW] Update Screen Status (Heartbeat)
    suspend fun updateScreenStatus(id: String, status: String, version: String, ipAddress: String?) {
        try {
            val updatePayload = buildMap {
                put("status", status)
                put("version", version)
                if (ipAddress != null) put("ip_address", ipAddress)
                // We let Supabase handle 'last_ping_at' via a Trigger OR send current time.
                // Sending exact time from client is safer for "offline detection" logic.
                put("last_ping_at", java.time.Instant.now().toString()) 
            }

            client.from("screens").update(updatePayload) {
                filter {
                    eq("id", id)
                }
            }
            // println("SYNC: Heartbeat sent for $id")
        } catch (e: Exception) {
            println("SYNC: Heartbeat failed: ${e.message}")
        }
    }

    private fun inferMediaType(url: String): MediaType {
        val extension = url.substringAfterLast('.', "").lowercase()
        return when {
            extension in listOf("mp4", "mkv", "webm", "avi", "mov") -> MediaType.VIDEO
            else -> MediaType.IMAGE // Default to Image for jpg, png, etc.
        }
    }
}

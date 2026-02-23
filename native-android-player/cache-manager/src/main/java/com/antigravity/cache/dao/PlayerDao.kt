package com.antigravity.cache.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.antigravity.cache.entity.CachedMediaItem
import com.antigravity.cache.entity.CachedPlaylist

@Dao
interface PlayerDao {

    @Transaction
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPlaylistWithItems(playlist: CachedPlaylist, items: List<CachedMediaItem>) {
        // [HARD RESET] Force purge of all previous playlists/items to avoid "Ghost Media"
        // This ensures LIMIT 1 always returns the exact current sync state.
        deleteAllPlaylists()
        deleteAllMediaItems()
        
        insertPlaylist(playlist)
        insertItems(items)
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPlaylist(playlist: CachedPlaylist)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertItems(items: List<CachedMediaItem>)

    @Query("DELETE FROM media_item WHERE playlistId = :playlistId")
    suspend fun deleteItemsByPlaylist(playlistId: String)

    @Query("SELECT * FROM playlist LIMIT 1") // Assuming single playlist for now
    suspend fun getActivePlaylist(): CachedPlaylist?

    @Query("SELECT * FROM media_item WHERE playlistId = :playlistId ORDER BY orderIndex ASC")
    suspend fun getItemsForPlaylist(playlistId: String): List<CachedMediaItem>

    @Query("DELETE FROM playlist")
    suspend fun deleteAllPlaylists()

    @Query("DELETE FROM media_item")
    suspend fun deleteAllMediaItems()

    @Query("UPDATE media_item SET localPath = :path WHERE id = :mediaId")
    suspend fun updateMediaLocalPath(mediaId: String, path: String)
}

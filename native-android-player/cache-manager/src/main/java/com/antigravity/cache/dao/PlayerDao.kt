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
        insertPlaylist(playlist)
        // Simple strategy: Clear old items for this playlist and re-insert
        deleteItemsByPlaylist(playlist.id)
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
}

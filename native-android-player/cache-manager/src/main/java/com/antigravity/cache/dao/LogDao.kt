package com.antigravity.cache.dao

import androidx.room.*
import com.antigravity.cache.entity.CachedPlayLog
import com.antigravity.cache.entity.OfflinePlaybackLog

@Dao
interface LogDao {
    @Insert
    suspend fun insertLog(log: CachedPlayLog)

    @Query("SELECT * FROM play_logs ORDER BY startedAt ASC LIMIT 50")
    suspend fun getPendingLogs(): List<CachedPlayLog>

    @Query("DELETE FROM play_logs WHERE id IN (:ids)")
    suspend fun deleteLogs(ids: List<Long>)

    @Query("DELETE FROM play_logs WHERE id IN (SELECT id FROM play_logs ORDER BY startedAt ASC LIMIT :count)")
    suspend fun deleteOldestLogs(count: Int)
}

/**
 * [OFFLINE BUFFER] Interface de acesso aos dados para logs reativos.
 */
@Dao
interface OfflineLogDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLog(log: com.antigravity.cache.entity.OfflinePlaybackLog)

    @Query("SELECT * FROM offline_playback_logs ORDER BY started_at ASC")
    suspend fun getAllPendingLogs(): List<com.antigravity.cache.entity.OfflinePlaybackLog>

    @Delete
    suspend fun deleteLog(log: com.antigravity.cache.entity.OfflinePlaybackLog)

    @Query("DELETE FROM offline_playback_logs")
    suspend fun clearAll()
}

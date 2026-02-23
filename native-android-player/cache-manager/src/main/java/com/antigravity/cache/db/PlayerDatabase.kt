package com.antigravity.cache.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.antigravity.cache.dao.LogDao
import com.antigravity.cache.dao.PlayerDao
import com.antigravity.cache.entity.CachedPlaylist
import com.antigravity.cache.entity.CachedMediaItem
import com.antigravity.cache.entity.CachedPlayLog
import com.antigravity.cache.entity.OfflinePlaybackLog
import com.antigravity.cache.dao.OfflineLogDao

@Database(entities = [CachedPlaylist::class, CachedMediaItem::class, CachedPlayLog::class, OfflinePlaybackLog::class], version = 5, exportSchema = false)
abstract class PlayerDatabase : RoomDatabase() {

    abstract fun playerDao(): PlayerDao
    abstract fun logDao(): LogDao
    abstract fun offlineLogDao(): OfflineLogDao

    companion object {
        @Volatile
        private var INSTANCE: PlayerDatabase? = null

        fun getDatabase(context: Context): PlayerDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    PlayerDatabase::class.java,
                    "player_database"
                )
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}

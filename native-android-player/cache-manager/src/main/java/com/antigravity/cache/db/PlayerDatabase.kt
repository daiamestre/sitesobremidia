package com.antigravity.cache.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.antigravity.cache.dao.PlayerDao
import com.antigravity.cache.entity.CachedMediaItem
import com.antigravity.cache.entity.CachedPlaylist

@Database(entities = [CachedPlaylist::class, CachedMediaItem::class], version = 1, exportSchema = false)
abstract class PlayerDatabase : RoomDatabase() {

    abstract fun playerDao(): PlayerDao

    companion object {
        @Volatile
        private var INSTANCE: PlayerDatabase? = null

        fun getDatabase(context: Context): PlayerDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    PlayerDatabase::class.java,
                    "player_database"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}

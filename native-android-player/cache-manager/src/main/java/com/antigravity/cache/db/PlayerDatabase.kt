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
import com.antigravity.cache.entity.ConfiguracaoEntity
import com.antigravity.cache.dao.ConfiguracaoDao
import com.antigravity.cache.entity.LogAuditoriaEntity
import com.antigravity.cache.dao.LogAuditoriaDao

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [CachedPlaylist::class, CachedMediaItem::class, CachedPlayLog::class, OfflinePlaybackLog::class, ConfiguracaoEntity::class, LogAuditoriaEntity::class], version = 9, exportSchema = false)
abstract class PlayerDatabase : RoomDatabase() {

    abstract fun playerDao(): PlayerDao
    abstract fun logDao(): LogDao
    abstract fun offlineLogDao(): OfflineLogDao
    abstract fun configuracaoDao(): ConfiguracaoDao
    abstract fun logAuditoriaDao(): LogAuditoriaDao

    companion object {
        @Volatile
        private var INSTANCE: PlayerDatabase? = null

        val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE configuracoes_player ADD COLUMN tokenAcesso TEXT")
                database.execSQL("ALTER TABLE configuracoes_player ADD COLUMN playerID TEXT")
            }
        }

        val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // 1. Adicionar colunas de robustez (Yeloo Style)
                db.execSQL("ALTER TABLE media_item ADD COLUMN file_hash TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE media_item ADD COLUMN media_type TEXT NOT NULL DEFAULT 'video'")
                
                // 2. Tabela de auditoria unificada (se não existir)
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS log_auditoria (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        evento TEXT NOT NULL,
                        timestamp INTEGER NOT NULL,
                        detalhes TEXT
                    )
                """.trimIndent())
            }
        }

        fun getDatabase(context: Context): PlayerDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    PlayerDatabase::class.java,
                    "player_database"
                )
                .addMigrations(MIGRATION_7_8, MIGRATION_8_9)
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}

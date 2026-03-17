package com.antigravity.cache.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.antigravity.cache.entity.ConfiguracaoEntity

@Dao
interface ConfiguracaoDao {
    @Query("SELECT * FROM configuracoes_player WHERE id = 1")
    suspend fun getLocalizacaoSalva(): ConfiguracaoEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun salvarLocalizacao(config: ConfiguracaoEntity)
}

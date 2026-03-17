package com.antigravity.cache.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.antigravity.cache.entity.LogAuditoriaEntity

@Dao
interface LogAuditoriaDao {
    @Insert
    suspend fun inserirLog(log: LogAuditoriaEntity)

    @Query("SELECT * FROM logs_auditoria ORDER BY dataHora DESC")
    suspend fun buscarTodosLogs(): List<LogAuditoriaEntity>

    @Query("DELETE FROM logs_auditoria WHERE dataHora < :limiteTempo")
    suspend fun limparLogsAntigos(limiteTempo: Long) // Ex: deletar logs com mais de 30 dias
}

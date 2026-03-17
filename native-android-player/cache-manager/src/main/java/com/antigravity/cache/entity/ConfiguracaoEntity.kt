package com.antigravity.cache.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "configuracoes_player")
data class ConfiguracaoEntity(
    @PrimaryKey val id: Int = 1, // Usamos ID fixo pois só existe uma configuração ativa
    val tokenAcesso: String? = null,
    val playerID: String? = null,
    val cidade: String,
    val estado: String,
    val timezone: String,
    val ultimaAtualizacao: Long = System.currentTimeMillis()
)

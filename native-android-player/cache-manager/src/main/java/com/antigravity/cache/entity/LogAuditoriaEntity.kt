package com.antigravity.cache.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "logs_auditoria")
data class LogAuditoriaEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val midiaNome: String,       // Nome do vídeo, imagem ou widget
    val midiaTipo: String,       // VIDEO, IMAGEM, WIDGET
    val dataHora: Long = System.currentTimeMillis(), // Timestamp exato
    val cidadeNoMomento: String, // Onde o player estava
    val duracaoExibida: Int      // Quantos segundos ficou na tela
)

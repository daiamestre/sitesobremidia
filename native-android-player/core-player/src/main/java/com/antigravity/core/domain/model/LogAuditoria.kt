package com.antigravity.core.domain.model

data class LogAuditoria(
    val id: Long,
    val midiaNome: String,
    val midiaTipo: String,
    val dataHora: Long,
    val cidadeNoMomento: String,
    val duracaoExibida: Int
)

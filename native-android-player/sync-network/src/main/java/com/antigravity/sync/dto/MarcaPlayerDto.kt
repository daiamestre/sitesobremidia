@file:OptIn(kotlinx.serialization.InternalSerializationApi::class)
package com.antigravity.sync.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Marca do Gestor de Mídias que está logado no Player (RPC fn_player_minha_marca, F-103).
 * status = "OK" (usar a marca) ou "PADRAO" (marca SOBRE MÍDIA). Todos os campos são opcionais.
 */
@Serializable
data class MarcaPlayerDto(
    val status: String = "PADRAO",
    @SerialName("nome_marca") val nomeMarca: String? = null,
    val slogan: String? = null,
    @SerialName("logo_url") val logoUrl: String? = null,
    @SerialName("cor_primaria") val corPrimaria: String? = null,
    @SerialName("cor_secundaria") val corSecundaria: String? = null,
    @SerialName("atualizado_em") val atualizadoEm: String? = null
)

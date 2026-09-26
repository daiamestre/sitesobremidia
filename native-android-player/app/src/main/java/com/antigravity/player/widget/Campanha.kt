package com.antigravity.player.widget

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/** Campanha como o servidor envia em `config.campanha` (fn_widget_campanha_dados) — o widget só guarda o id. */
data class Campanha(
    val titulo: String,
    val dataInicio: String,
    val dataFim: String,
    val vigenteNoServidor: Boolean,
    /** URLs públicas dos criativos em imagem, na ordem de envio (até 6). */
    val criativos: List<String>
)

/** Regras da campanha no Player — as mesmas do painel (src/lib/campanhaWidget.ts). */
object CampanhaText {
    /** Tempo de cada criativo quando há mais de um (mesmo valor do painel). */
    const val SEGUNDOS_POR_CRIATIVO = 8

    fun parse(el: Any?): Campanha? {
        val o = el as? JsonObject ?: return null
        fun s(k: String) = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }
        val criativos = (o["criativos"] as? JsonArray).orEmpty().mapNotNull { e ->
            (e as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()
                ?.takeIf { it.startsWith("https://", true) || it.startsWith("http://", true) }
        }.distinct().take(6)
        return Campanha(
            titulo = s("titulo") ?: "",
            dataInicio = s("data_inicio") ?: return null,
            dataFim = s("data_fim") ?: return null,
            vigenteNoServidor = (o["vigente"] as? JsonPrimitive)?.booleanOrNull ?: false,
            criativos = criativos
        )
    }

    /** Pode mostrar hoje? Segunda trava para o Player offline com a playlist em cache (dia de Brasília). */
    fun vigente(c: Campanha, hojeBrasilia: String): Boolean =
        c.vigenteNoServidor && c.criativos.isNotEmpty() && c.dataInicio <= hojeBrasilia && hojeBrasilia <= c.dataFim
}

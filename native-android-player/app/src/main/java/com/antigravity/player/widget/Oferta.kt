package com.antigravity.player.widget

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToInt

/** Produto da oferta como o servidor envia em `config.oferta.itens` (fn_widget_oferta_dados). */
data class OfertaItem(
    val nome: String,
    val marca: String?,
    val unidade: String?,
    val imagemUrl: String?,
    val precoOriginal: Double,
    val precoOferta: Double,
    val desconto: Double,
    val destaque: Boolean
)

/** Oferta do cadastro (ofertas/oferta_itens/produtos) — o widget só guarda o id; nada é copiado. */
data class Oferta(
    val titulo: String,
    val descricao: String?,
    val dataInicio: String,
    val dataFim: String,
    val vigenteNoServidor: Boolean,
    val itens: List<OfertaItem>
)

/** Regras da oferta no Player — as mesmas do painel (src/lib/ofertaWidget.ts). */
object OfertaText {
    private val PT_BR = Locale("pt", "BR")

    fun parse(el: Any?): Oferta? {
        val o = el as? JsonObject ?: return null
        fun s(obj: JsonObject, k: String) = (obj[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }
        fun d(obj: JsonObject, k: String) = (obj[k] as? JsonPrimitive)?.let { it.doubleOrNull ?: it.content.toDoubleOrNull() }
        val itens = (o["itens"] as? JsonArray).orEmpty().mapNotNull { e ->
            val i = e as? JsonObject ?: return@mapNotNull null
            val nome = s(i, "nome") ?: return@mapNotNull null
            val oferta = d(i, "preco_oferta") ?: return@mapNotNull null
            OfertaItem(
                nome = nome, marca = s(i, "marca"), unidade = s(i, "unidade"),
                imagemUrl = s(i, "imagem_url")?.takeIf { it.startsWith("https://", true) || it.startsWith("http://", true) },
                precoOriginal = d(i, "preco_original") ?: oferta, precoOferta = oferta,
                desconto = d(i, "desconto") ?: 0.0,
                destaque = (i["destaque"] as? JsonPrimitive)?.booleanOrNull ?: false
            )
        }.take(6)
        return Oferta(
            titulo = s(o, "titulo") ?: "Ofertas",
            descricao = s(o, "descricao"),
            dataInicio = s(o, "data_inicio") ?: return null,
            dataFim = s(o, "data_fim") ?: return null,
            vigenteNoServidor = (o["vigente"] as? JsonPrimitive)?.booleanOrNull ?: false,
            itens = itens
        )
    }

    /**
     * Pode mostrar preço hoje? O servidor só envia oferta vigente; aqui é a segunda trava para o Player offline
     * que ficou com a playlist em cache depois do fim da oferta (datas comparadas no dia de Brasília).
     */
    fun vigente(o: Oferta, hojeBrasilia: String): Boolean =
        o.vigenteNoServidor && o.itens.isNotEmpty() && o.dataInicio <= hojeBrasilia && hojeBrasilia <= o.dataFim

    fun precoBR(v: Double): String = NumberFormat.getCurrencyInstance(PT_BR).format(v).replace(' ', ' ')

    /** 14.9 -> ("14", "90"); 1234.5 -> ("1.234", "50"). */
    fun partes(v: Double): Pair<String, String> {
        val centavosTotais = (v * 100).roundToInt()
        return NumberFormat.getIntegerInstance(PT_BR).format(centavosTotais / 100) to "%02d".format(centavosTotais % 100)
    }

    fun desconto(i: OfertaItem): Int = when {
        i.desconto > 0 -> i.desconto.roundToInt()
        i.precoOriginal > 0 && i.precoOferta < i.precoOriginal -> ((1 - i.precoOferta / i.precoOriginal) * 100).roundToInt()
        else -> 0
    }

    fun validade(dataFim: String, hojeBrasilia: String): String {
        if (dataFim == hojeBrasilia) return "Válido só hoje"
        val p = dataFim.split("-")
        return if (p.size == 3) "Válido até ${p[2]}/${p[1]}" else ""
    }
}

package com.antigravity.player.widget

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Cores do Relógio/Clima Futurista escolhidas no painel (`config.cores`, já resolvidas pelo painel —
 * src/lib/widgetPaletas.ts). O Player só aplica: paleta nova no painel não exige APK novo.
 * Qualquer cor ausente ou inválida -> padrão roxo SOBRE MÍDIA (nunca tela sem cor).
 */
data class CoresWidget(
    val c1: Int, val c2: Int, val c3: Int,
    val brilho: Int, val selo: Int, val seloTexto: Int
) {
    companion object {
        private val HEX = Regex("^#[0-9a-fA-F]{6}$")

        /** #RRGGBB -> cor opaca (0xFFRRGGBB), sem depender do android.graphics (testável na JVM). */
        fun hex(v: String): Int = (0xFF000000L or v.substring(1).toLong(16)).toInt()

        val PADRAO = CoresWidget(
            c1 = hex("#22004A"), c2 = hex("#5D1BFF"), c3 = hex("#8A2EFF"),
            brilho = hex("#B04DFF"), selo = hex("#FFD400"), seloTexto = hex("#22004A")
        )

        fun parse(el: Any?): CoresWidget? {
            val o = el as? JsonObject ?: return null
            fun cor(k: String): Int? = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()
                ?.takeIf { HEX.matches(it) }?.let { hex(it) }
            return CoresWidget(
                c1 = cor("c1") ?: return null, c2 = cor("c2") ?: return null, c3 = cor("c3") ?: return null,
                brilho = cor("brilho") ?: return null, selo = cor("selo") ?: return null, seloTexto = cor("seloTexto") ?: return null
            )
        }

        /** Mesma cor com transparência (véus/halos). */
        fun comAlfa(cor: Int, alfa: Int): Int = (alfa.coerceIn(0, 255) shl 24) or (cor and 0x00FFFFFF)
    }
}

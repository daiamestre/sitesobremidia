package com.antigravity.player.launcher

import android.content.Context
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.StateListDrawable

/**
 * F-213 — tema da launcher a partir da cor escolhida no painel: a cor pinta o fundo E o app inteiro (botões Player e
 * Menu, opções do Menu, cartões dos apps, pílulas do topo e o painel do Menu). Com imagem de capa o app continua na
 * mesma cor. A MESMA conta existe no painel (src/lib/temaLauncher.ts), para a prévia sair igual à TV.
 * Sem cor = os desenhos padrão Sobre Mídia (índigo → violeta). O brilho neon azul do cartão selecionado continua igual.
 */
object TemaDaLauncher {

    data class Paleta(
        val botaoInicio: Int, val botaoFim: Int,
        val superficie: Int, val superficieFoco: Int, val borda: Int,
        val gaveta: Int, val veu: Int
    )

    private const val NEON = 0xFF22D3EE.toInt()

    fun lerHex(hex: String?): Int? {
        val h = hex?.trim()?.removePrefix("#") ?: return null
        if (h.length != 6 || !h.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) return null
        return h.toInt(16)
    }

    /** [h] 0..360, [s] e [v] 0..1. */
    fun hsvDe(rgb: Int): FloatArray {
        val r = (rgb shr 16 and 255) / 255f; val g = (rgb shr 8 and 255) / 255f; val b = (rgb and 255) / 255f
        val max = maxOf(r, g, b); val min = minOf(r, g, b); val d = max - min
        var h = when {
            d == 0f -> 0f
            max == r -> 60f * (((g - b) / d) % 6f)
            max == g -> 60f * ((b - r) / d + 2f)
            else -> 60f * ((r - g) / d + 4f)
        }
        if (h < 0f) h += 360f
        return floatArrayOf(h, if (max == 0f) 0f else d / max, max)
    }

    fun hsv(h: Float, s: Float, v: Float, alfa: Float = 1f): Int {
        val c = v * s; val x = c * (1 - Math.abs((h / 60f) % 2f - 1)); val m = v - c
        val (r, g, b) = when {
            h < 60 -> Triple(c, x, 0f); h < 120 -> Triple(x, c, 0f); h < 180 -> Triple(0f, c, x)
            h < 240 -> Triple(0f, x, c); h < 300 -> Triple(x, 0f, c); else -> Triple(c, 0f, x)
        }
        fun p(n: Float) = Math.round((n + m) * 255).coerceIn(0, 255)
        return (Math.round(alfa * 255).coerceIn(0, 255) shl 24) or (p(r) shl 16) or (p(g) shl 8) or p(b)
    }

    /** Paleta do app na cor do fundo (#RRGGBB); null = tema padrão. Cor acinzentada continua acinzentada. */
    fun paleta(corDoFundo: String?): Paleta? {
        val rgb = lerHex(corDoFundo) ?: return null
        val (h, s) = hsvDe(rgb).let { it[0] to it[1] }
        val viva = if (s < 0.12f) s else maxOf(s, 0.62f)
        return Paleta(
            botaoInicio = hsv(h, viva, 0.78f),
            botaoFim = hsv(h, minOf(1f, viva + 0.1f), 0.52f),
            superficie = hsv(h, minOf(viva, 0.6f), 0.22f, 0.8f),
            superficieFoco = hsv(h, viva, 0.45f, 0.95f),
            borda = hsv(h, viva * 0.6f, 0.85f, 0.4f),
            gaveta = hsv(h, minOf(viva, 0.7f), 0.1f, 0.99f),
            veu = hsv(h, minOf(viva, 0.7f), 0.1f, 0.55f)
        )
    }

    // ------------------------------------------------------------------ desenhos (um por view: StateList não se divide)

    private fun dp(ctx: Context, v: Float) = v * ctx.resources.displayMetrics.density

    private fun forma(ctx: Context, raio: Float, cor: Int? = null, borda: Int? = null, larguraBorda: Float = 1f, degrade: IntArray? = null) =
        GradientDrawable().apply {
            cornerRadius = dp(ctx, raio)
            if (degrade != null) { orientation = GradientDrawable.Orientation.BL_TR; colors = degrade } else if (cor != null) setColor(cor)
            if (borda != null) setStroke(dp(ctx, larguraBorda).toInt().coerceAtLeast(1), borda)
        }

    /** Botões Player e Menu: degradê na cor do app; selecionado = o mesmo brilho neon azul de sempre (F-211). */
    fun botaoPrincipal(ctx: Context, p: Paleta): Drawable {
        val cartao = { alfa: Int, foco: Boolean ->
            forma(ctx, 29f, degrade = intArrayOf((p.botaoFim and 0xFFFFFF) or (alfa shl 24), (p.botaoInicio and 0xFFFFFF) or (alfa shl 24)),
                borda = if (foco) 0xFF7FEBFF.toInt() else 0x33FFFFFF, larguraBorda = if (foco) 1.5f else 1f)
        }
        val i7 = dp(ctx, 7f).toInt()
        val focado = LayerDrawable(arrayOf(
            forma(ctx, 36f, borda = 0x1A00D4FF, larguraBorda = 7f),
            forma(ctx, 34f, borda = 0x3300D4FF, larguraBorda = 5f),
            forma(ctx, 32f, borda = 0x6600D4FF, larguraBorda = 3f),
            cartao(0xFF, true)
        )).apply {
            val i2 = dp(ctx, 2f).toInt(); val i4 = dp(ctx, 4f).toInt()
            setLayerInset(1, i2, i2, i2, i2); setLayerInset(2, i4, i4, i4, i4); setLayerInset(3, i7, i7, i7, i7)
        }
        val normal = LayerDrawable(arrayOf(cartao(0xE6, false))).apply { setLayerInset(0, i7, i7, i7, i7) }
        return StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), focado)
            addState(intArrayOf(), normal)
        }
    }

    /** Opções do Menu e cartões dos apps. */
    fun botaoDoMenu(ctx: Context, p: Paleta, raio: Float = 30f): Drawable = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_focused), forma(ctx, raio, p.superficieFoco, NEON, 3f))
        addState(intArrayOf(android.R.attr.state_pressed), forma(ctx, raio, p.superficieFoco, 0xFFFFFFFF.toInt(), 3f))
        addState(intArrayOf(), forma(ctx, raio, p.superficie, p.borda, 1f))
    }

    /** Pílulas do topo (Wi-Fi, Pendrive, Tela inicial, Voltar). */
    fun pilula(ctx: Context, p: Paleta): Drawable = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_focused), forma(ctx, 999f, p.superficieFoco, NEON, 2f))
        addState(intArrayOf(), forma(ctx, 999f, p.superficie, p.borda, 1f))
    }

    fun gaveta(p: Paleta): Drawable = GradientDrawable().apply { setColor(p.gaveta) }

    /** Véu por cima da imagem de capa, na cor do app (o texto continua legível). */
    fun veu(p: Paleta): Drawable = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(p.veu, (p.veu and 0xFFFFFF) or (0x33 shl 24), p.veu))
}

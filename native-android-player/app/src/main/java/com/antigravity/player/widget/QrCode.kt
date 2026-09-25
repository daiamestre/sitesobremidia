package com.antigravity.player.widget

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.common.BitMatrix
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/**
 * QR Code dos widgets no Player: gerado na hora a partir do conteúdo configurado (nenhuma imagem salva).
 * Mesma regra de conteúdo permitido do painel (src/lib/qrCode.ts).
 */
object QrCode {
    private val PERMITIDOS = Regex("^(https?://|tel:|mailto:)", RegexOption.IGNORE_CASE)
    private val DOMINIO = Regex("""^[\w.-]+\.[a-z]{2,}(/.*)?$""", RegexOption.IGNORE_CASE)

    fun conteudoValido(conteudo: String?): String? {
        val c = conteudo?.trim().orEmpty()
        if (c.isEmpty() || c.length > 1000) return null
        if (DOMINIO.matches(c)) return "https://$c"
        return c.takeIf { PERMITIDOS.containsMatchIn(it) }
    }

    /** Matriz do QR (quadrados pretos = true), com margem de 1 módulo. null se o conteúdo não for permitido. */
    fun matriz(conteudo: String?, tamanho: Int): BitMatrix? {
        val c = conteudoValido(conteudo) ?: return null
        return QRCodeWriter().encode(
            c, BarcodeFormat.QR_CODE, tamanho, tamanho,
            mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to 1, EncodeHintType.CHARACTER_SET to "UTF-8")
        )
    }
}

package com.antigravity.player

import com.antigravity.player.widget.QrCode
import com.google.zxing.BinaryBitmap
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QrCodeTest {

    /** Gera o QR e lê de volta com o decodificador do zxing: prova que a tela mostra um código legível. */
    private fun lerDeVolta(conteudo: String): String {
        val m = QrCode.matriz(conteudo, 300)!!
        val px = IntArray(m.width * m.height) { i -> if (m.get(i % m.width, i / m.width)) 0xFF000000.toInt() else 0xFFFFFFFF.toInt() }
        val bmp = BinaryBitmap(HybridBinarizer(RGBLuminanceSource(m.width, m.height, px)))
        return QRCodeReader().decode(bmp).text
    }

    @Test fun url_idaEVolta() = assertEquals("https://sobremidia.com.br/oferta?id=123", lerDeVolta("https://sobremidia.com.br/oferta?id=123"))

    @Test fun dominioSemEsquema_viraHttps() = assertEquals("https://loja.com.br/promo", lerDeVolta("loja.com.br/promo"))

    @Test fun telefoneEWhatsapp() {
        assertEquals("tel:+5581999990000", lerDeVolta("tel:+5581999990000"))
        assertEquals("https://wa.me/5581999990000", lerDeVolta("https://wa.me/5581999990000"))
    }

    @Test fun conteudoProibidoOuVazio_naoGeraQr() {
        assertNull(QrCode.matriz("javascript:alert(1)", 300))
        assertNull(QrCode.matriz("file:///sdcard/x", 300))
        assertNull(QrCode.matriz("", 300))
        assertNull(QrCode.matriz(null, 300))
    }
}

package com.antigravity.player

import com.antigravity.core.util.Logger
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** F-197 — o registro do Player nunca guarda login (JWT), chave "apikey" ou identificador do aparelho; zonas e rádio tentam de novo logo. */
class RegistroSemSegredosTest {

    private val jwt = "eyJhbGciOiJFUzI1NiIsImtpZCI6IjM2YTExY2IxIn0.eyJzdWIiOiIxMjM0NTY3OC0xMjM0IiwiZXhwIjoxNzkyMzA4MTAzfQ.lt4jha6MNb3XY9r3PW6VlPuBXxKkEXMOZG4_NfBwHIm1D"

    @Test
    fun `mensagem de falha da biblioteca sai sem login, chave e cabecalhos`() {
        val bruto = "JWT expired\nURL: https://x.supabase.co/rest/v1/rpc/fn_player_report_telemetry\nHttp Method: POST\n" +
            "Headers: [Authorization=[Bearer $jwt], Prefer=[], apikey=[$jwt], X-Device-ID=[698b7637], X-Tenant-ID=[1ce02cc4]]"
        val limpo = Logger.limpar(bruto)
        assertFalse(limpo.contains("eyJ"))
        assertFalse(limpo.contains("698b7637"))
        assertTrue(limpo.contains("JWT expired"))
        assertTrue(limpo.contains("fn_player_report_telemetry"))
        assertTrue(limpo.contains("Headers: [ocultos]"))
        // token solto no meio de outro texto também some
        assertFalse(Logger.limpar("falhou com Authorization=[Bearer $jwt] agora").contains("eyJ"))
        assertTrue(Logger.limpar("").isEmpty())
    }

    @Test
    fun `o registro enviado ao servidor tambem passa pela limpeza e zonas e radio tentam de novo em 10 s`() {
        val rede = File("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt").readText()
        assertTrue(rede.contains("\"message\" to com.antigravity.core.util.Logger.limpar(message + "))
        val zonas = File("src/main/java/com/antigravity/player/zone/ZoneController.kt").readText()
        assertTrue(zonas.contains("delay(if (ultimaFalhou) NOVA_TENTATIVA_MS else INTERVALO_MS)"))
        val radio = File("src/main/java/com/antigravity/player/radio/RadioController.kt").readText()
        assertTrue(radio.contains("delay(if (ultimaFalhou) 10_000L else INTERVALO_MS)"))
    }

    @Test
    fun `localizacao da tela por servicos com HTTPS gratuito - o ip-api so tinha HTTPS pago`() {
        val r = File("src/main/java/com/antigravity/player/util/RegionalContextManager.kt").readText()
        assertTrue(r.contains("https://ipwho.is/"))
        assertTrue(r.contains("https://ipapi.co/json/"))
        assertFalse(r.contains("ip-api.com/json"))
        assertTrue(r.contains("for (apiUrl in SERVICOS_DE_LOCALIZACAO)"))
    }
}

package com.antigravity.player

import com.antigravity.sync.service.PairingPolicy
import com.antigravity.sync.service.PairingPolicy.AcaoDoVinculo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** F-205: Desvincular mostra a tela de suporte; "Vincular outro aparelho" leva o aparelho para a tela nova. */
class VincularOutroAparelhoTest {

    @Test
    fun `o servidor decide - mesma tela segue, outra tela troca, sem tela vai para o suporte`() {
        assertEquals(AcaoDoVinculo.CONTINUAR, PairingPolicy.acaoDoVinculo("unpair", "A", true, "A"))
        assertEquals("comando antigo de troca para a tela onde já está", AcaoDoVinculo.CONTINUAR, PairingPolicy.acaoDoVinculo("trocar_tela", "a", true, "A"))
        assertEquals(AcaoDoVinculo.TROCAR_DE_TELA, PairingPolicy.acaoDoVinculo("trocar_tela", "A", true, "B"))
        assertEquals("desvincular e já ligado a outra tela: vai para ela", AcaoDoVinculo.TROCAR_DE_TELA, PairingPolicy.acaoDoVinculo("unpair", "A", true, "B"))
        assertEquals(AcaoDoVinculo.TELA_DE_SUPORTE, PairingPolicy.acaoDoVinculo("unpair", "A", false, null))
        assertEquals(AcaoDoVinculo.TELA_DE_SUPORTE, PairingPolicy.acaoDoVinculo("trocar_tela", "A", false, null))
        assertEquals("sem resposta, o desvincular vale", AcaoDoVinculo.TELA_DE_SUPORTE, PairingPolicy.acaoDoVinculo("unpair", "A", null, null))
        assertEquals("sem resposta, a troca espera", AcaoDoVinculo.TENTAR_DEPOIS, PairingPolicy.acaoDoVinculo("trocar_tela", "A", null, null))
        assertEquals(AcaoDoVinculo.TELA_DE_SUPORTE, PairingPolicy.acaoDoVinculo("trocar_tela", "A", true, " "))
    }

    @Test
    fun `comandos chegam pelo tempo real e pela consulta, inclusive atrasados`() {
        val rede = File("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt").readText()
        val lista = rede.substringAfter("COMMAND_POLL_SAFE = listOf(").substringBefore(")")
        assertTrue(lista.contains("\"trocar_tela\"") && lista.contains("\"unpair\""))
        assertTrue(rede.contains("val COMANDOS_DE_VINCULO = listOf(\"unpair\", \"trocar_tela\")"))
        assertTrue("a cada ~1 min, sem limite de idade", rede.contains("if (voltas++ % 6 == 0) pollComandosDeVinculo(screenUuid)"))
        assertTrue(rede.contains("rpc(\"fn_player_tela_do_aparelho\""))
    }

    @Test
    fun `Player troca de tela ou mostra o suporte, e o suporte espera o painel`() {
        val principal = File("src/main/java/com/antigravity/player/MainActivity.kt").readText()
        assertTrue(principal.contains("\"unpair\", \"trocar_tela\" -> resolverVinculo(command, commandId)"))
        val resolver = principal.substringAfter("private fun resolverVinculo(").substringBefore("private fun sairDaTelaAtual()")
        assertTrue("decide pelo servidor", resolver.contains("PairingPolicy.acaoDoVinculo(command, atual, vinculo?.first, vinculo?.second)"))
        assertTrue("troca pela escolha automática da tela (sincroniza e limpa as mídias antigas)", resolver.contains("putExtra(\"extra_select_screen_id\", vinculo?.second)"))
        assertTrue(resolver.contains("AparelhoDesvinculadoActivity.marcar(applicationContext, true)"))
        assertFalse("o desvincular não leva mais para a escolha de tela", principal.contains(">>> UNPAIR COMMAND RECEIVED FROM SERVER"))

        val suporte = File("src/main/java/com/antigravity/player/ui/AparelhoDesvinculadoActivity.kt").readText()
        assertTrue(suporte.contains("RemoteDataSource().telaDoAparelho(aparelho)"))
        assertTrue(suporte.contains("putExtra(\"extra_select_screen_id\", tela)"))
        assertTrue("logo igual à da tela desativada", suporte.contains("MarcaDoGestor.aplicarLogo(this, findViewById(R.id.desvinculado_logo))"))
        assertTrue("sem tela salva: o quiosque não puxa o Player por cima", suporte.contains(".remove(\"saved_screen_id\")"))
        val layout = File("src/main/res/layout/activity_aparelho_desvinculado.xml").readText()
        assertTrue(layout.contains("Entre em contato com o suporte"))

        val splash = File("src/main/java/com/antigravity/player/ui/SplashActivity.kt").readText()
        val rotear = splash.substringAfter("private fun rotear()")
        assertTrue("depois de reiniciar continua no suporte", rotear.indexOf("estaDesvinculado(applicationContext)") in 0 until rotear.indexOf("getStoredCredentials()"))
        assertTrue(File("src/main/java/com/antigravity/player/ui/ScreenSelectionActivity.kt").readText().contains("AparelhoDesvinculadoActivity.marcar(this, false)"))
        assertTrue(File("src/main/AndroidManifest.xml").readText().contains("android:name=\".ui.AparelhoDesvinculadoActivity\""))
    }
}

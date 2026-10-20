package com.antigravity.player

import android.content.pm.ActivityInfo
import com.antigravity.player.ui.ScreenLabel
import com.antigravity.player.util.OtaPolicy
import com.antigravity.player.util.OtaPolicy.ModoDeInstalacao
import com.antigravity.player.util.PlayerFlowPolicy
import com.antigravity.player.util.RootInstaller
import com.antigravity.sync.service.SessionManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * F-194 — atualização sem interromper a reprodução (silenciosa com root ou Device Owner), rotação da tela em 4 posições
 * (9x16 nasce em 270) e o NOME da tela na escolha depois do login.
 */
class AtualizacaoSilenciosaERotacaoTest {

    private fun codigo(caminho: String) = File(caminho).readLines()
        .filterNot { it.trim().startsWith("//") || it.trim().startsWith("*") || it.trim().startsWith("/*") }.joinToString("\n")

    // ---------------------------------------------------------------- atualização

    @Test
    fun `modo de instalacao - Device Owner e root em silencio, o resto so com toque`() {
        assertEquals(ModoDeInstalacao.DONO_DO_APARELHO, OtaPolicy.modoDeInstalacao(donoDoAparelho = true, temRoot = true))
        assertEquals(ModoDeInstalacao.ROOT, OtaPolicy.modoDeInstalacao(donoDoAparelho = false, temRoot = true))
        assertEquals(ModoDeInstalacao.PEDIR_TOQUE, OtaPolicy.modoDeInstalacao(donoDoAparelho = false, temRoot = false))
    }

    @Test
    fun `instalador do Android e aviso na tela so a pedido do painel, por 10 minutos`() {
        val agora = 1_000_000L
        assertFalse(OtaPolicy.podeAbrirTelaDoAndroid(agora + 50 * 60_000L))
        OtaPolicy.registrarPedidoDoPainel(agora)
        assertTrue(OtaPolicy.podeAbrirTelaDoAndroid(agora + 60_000L))
        assertTrue(OtaPolicy.mostrarAvisoNaTela(agora + 60_000L))
        assertFalse(OtaPolicy.podeAbrirTelaDoAndroid(agora + 11 * 60_000L))
        assertFalse(OtaPolicy.mostrarAvisoNaTela(agora + 11 * 60_000L))
        assertTrue(OtaPolicy.notaPrecisaDeToque("5.7.9").contains("Instalar atualização agora"))
    }

    @Test
    fun `root - comando instala por cima, apaga a copia e reabre o Player`() {
        val c = RootInstaller.comandoDeInstalacao("/storage/emulated/0/Android/data/x/files/update_5.7.9.apk", "com.antigravity.player", "com.antigravity.player.ui.SplashActivity")
        assertTrue(c.contains("cat '/storage/emulated/0/Android/data/x/files/update_5.7.9.apk' > /data/local/tmp/sobremidia_update.apk"))
        assertTrue(c.contains("pm install -r /data/local/tmp/sobremidia_update.apk"))
        assertTrue(c.contains("rm -f /data/local/tmp/sobremidia_update.apk"))
        assertTrue(c.contains("am start -n com.antigravity.player/com.antigravity.player.ui.SplashActivity"))
        assertTrue("sai do grupo do app antes de instalar", c.indexOf("/acct/tasks") < c.indexOf("pm install"))
        assertTrue(RootInstaller.provaDeRoot(RootInstaller.Resposta(0, "uid=0(root) gid=0(root)", true)))
        assertFalse(RootInstaller.provaDeRoot(RootInstaller.Resposta(0, "uid=10087(u0_a87)", true)))
        assertFalse("sem resposta (gerenciador de root perguntando) não conta", RootInstaller.provaDeRoot(RootInstaller.Resposta(-1, "", false)))
        assertTrue(RootInstaller.instalouComSucesso(RootInstaller.Resposta(0, "Success\n", true)))
        assertFalse(RootInstaller.instalouComSucesso(RootInstaller.Resposta(0, "Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]", true)))
    }

    @Test
    fun `o gerenciador nao abre nada por cima das midias sem pedido do painel`() {
        val ota = codigo("src/main/java/com/antigravity/player/util/OTAUpdateManager.kt")
        assertTrue(ota.contains("OtaPolicy.modoDeInstalacao(donoDoAparelho, !donoDoAparelho && !appDeSistema && RootInstaller.disponivel(context), appDeSistema)"))
        assertTrue(ota.contains("RootInstaller.instalar(context, file)"))
        // a tela de permissão e o instalador manual só abrem com o pedido do painel
        val ini = ota.indexOf("ACTION_MANAGE_UNKNOWN_APP_SOURCES")
        assertTrue(ota.lastIndexOf("if (!podeAbrir)", ini) in 1 until ini)
        assertTrue(ota.contains("if (OtaPolicy.podeAbrirTelaDoAndroid()) installApkWithIntent(file)"))
        val receptor = codigo("src/main/java/com/antigravity/player/receiver/OTAInstallReceiver.kt")
        val i = receptor.indexOf("STATUS_PENDING_USER_ACTION ->")
        val bloco = receptor.substring(i, receptor.indexOf("STATUS_SUCCESS ->"))
        assertTrue(bloco.indexOf("podeAbrirTelaDoAndroid()") in 1 until bloco.indexOf("context.startActivity(confirmationIntent)"))
        val principal = codigo("src/main/java/com/antigravity/player/MainActivity.kt")
        assertTrue(principal.contains("\"install_update\" ->"))
        assertTrue(principal.contains("OtaPolicy.registrarPedidoDoPainel()"))
        assertTrue(principal.contains("if (com.antigravity.player.util.OtaPolicy.mostrarAvisoNaTela()) com.antigravity.player.util.OtaStatus.mensagem(estado) else null"))
        val rede = codigo("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt")
        assertTrue(rede.contains("\"install_update\", \"sync\""))
    }

    // ---------------------------------------------------------------- rotação em 4 posições

    @Test
    fun `TV - as 4 rotacoes no painel deitado 1280x720`() {
        assertNull(PlayerFlowPolicy.tvCanvasTransform(true, "landscape", 1280, 720, rotacaoTela = 0))
        val r180 = PlayerFlowPolicy.tvCanvasTransform(true, "landscape", 1280, 720, rotacaoTela = 180)!!
        assertEquals(180f, r180.rotation); assertEquals(1280, r180.width); assertEquals(720, r180.height)
        val r90 = PlayerFlowPolicy.tvCanvasTransform(true, "landscape", 1280, 720, rotacaoTela = 90)!!
        assertEquals(90f, r90.rotation); assertEquals(720, r90.width); assertEquals(1280, r90.height)
        val r270 = PlayerFlowPolicy.tvCanvasTransform(true, "portrait", 1280, 720, rotacaoTela = 270)!!
        assertEquals(270f, r270.rotation); assertEquals(720, r270.width); assertEquals(1280, r270.height)
        assertEquals(280f, r270.translationX); assertEquals(-280f, r270.translationY)
        // a rotação escolhida manda, mesmo com a playlist deitada
        assertEquals(270f, PlayerFlowPolicy.tvCanvasTransform(true, "landscape", 1280, 720, rotacaoTela = 270)!!.rotation)
        // sem escolha (servidor antigo): regra anterior
        assertEquals(90f, PlayerFlowPolicy.tvCanvasTransform(true, "portrait", 1280, 720)!!.rotation)
        // celular/tablet que obedecem não giram o quadro
        assertNull(PlayerFlowPolicy.tvCanvasTransform(false, "portrait", 1280, 720, rotacaoTela = 270))
    }

    @Test
    fun `painel ja em pe - a referencia anda 90 graus`() {
        assertNull(PlayerFlowPolicy.tvCanvasTransform(true, "portrait", 720, 1280, rotacaoTela = 270))
        assertEquals(180f, PlayerFlowPolicy.tvCanvasTransform(true, "portrait", 720, 1280, rotacaoTela = 90)!!.rotation)
    }

    @Test
    fun `celular e tablet - cada rotacao tem a sua trava e o padrao continua igual`() {
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT, PlayerFlowPolicy.physicalOrientationLock("portrait", false, false, 270))
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_REVERSE_PORTRAIT, PlayerFlowPolicy.physicalOrientationLock("portrait", false, false, 90))
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE, PlayerFlowPolicy.physicalOrientationLock("landscape", false, false, 180))
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE, PlayerFlowPolicy.physicalOrientationLock("landscape", false, false, 0))
        assertNull("TV sem comando continua sem trava", PlayerFlowPolicy.physicalOrientationLock("portrait", true, false, 270))
        // comando explícito do painel (rotate_*) continua valendo
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE, PlayerFlowPolicy.physicalOrientationLock("landscape", false, true, 270))
    }

    @Test
    fun `aparelho que ignora o pedido - em pe e de cabeca para baixo giram por software`() {
        assertTrue(PlayerFlowPolicy.precisaGirarQuadroPorSoftware(1280, 720, PlayerFlowPolicy.orientacaoDesejada(270, "landscape"), 270, 0))
        assertTrue("180 pedido e o display ficou em 0", PlayerFlowPolicy.precisaGirarQuadroPorSoftware(1280, 720, "landscape", 180, 0))
        assertFalse("180 obedecido (display em 180)", PlayerFlowPolicy.precisaGirarQuadroPorSoftware(1280, 720, "landscape", 180, 2))
        assertFalse(PlayerFlowPolicy.precisaGirarQuadroPorSoftware(1280, 720, PlayerFlowPolicy.orientacaoDesejada(0, "portrait"), 0, 0))
        assertEquals("portrait", PlayerFlowPolicy.chaveDoGiro("portrait", null))
        assertEquals("landscape@180", PlayerFlowPolicy.chaveDoGiro("landscape", 180))
        assertEquals(270, SessionManager.rotacaoValida(270)); assertNull(SessionManager.rotacaoValida(45)); assertNull(SessionManager.rotacaoValida(null))
    }

    @Test
    fun `a rotacao vem do painel, fica guardada e vale ao religar`() {
        assertTrue(codigo("../sync-network/src/main/java/com/antigravity/sync/dto/SupabaseDTOs.kt").contains("@SerialName(\"rotacao_tela\") val rotacaoTela: Int? = null"))
        assertTrue(codigo("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt").contains("SessionManager.rotacaoValida(device.rotacaoTela)"))
        val principal = codigo("src/main/java/com/antigravity/player/MainActivity.kt")
        assertTrue(principal.contains("rotacaoTela = SessionManager.rotacaoTela"))
        assertTrue(principal.indexOf("savedPrefs.getInt(PREF_ROTACAO_TELA, -1)") in 1 until principal.indexOf("applyScreenRotation(initialOrientation)"))
    }

    // ---------------------------------------------------------------- nome da tela no login

    @Test
    fun `escolha da tela - nome da tela em cima e o ID embaixo`() {
        assertEquals("Recepção Hotel Maxsuel", ScreenLabel.nome("Recepção Hotel Maxsuel", "TELA-01", "uuid"))
        assertEquals("TELA-01", ScreenLabel.nome("  ", "TELA-01", "uuid"))
        assertEquals("ID: TEL-2026-000068", ScreenLabel.id("TEL-2026-000068", "TELA-01", "D´casa"))
        assertEquals("ID: TELA-01", ScreenLabel.id(null, "TELA-01", "D´casa"))
        assertNull(ScreenLabel.id(null, "D´casa", "D´casa"))
        val tela = codigo("src/main/java/com/antigravity/player/ui/ScreenSelectionActivity.kt")
        assertTrue(tela.contains("ScreenLabel.nome(screen.name, screen.customId, screen.id)"))
        assertTrue(File("src/main/res/layout/item_screen_selection.xml").readText().contains("@+id/screen_id"))
    }
}

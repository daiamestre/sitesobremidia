package com.antigravity.player

import com.antigravity.player.util.ManutencaoPolicy
import com.antigravity.player.util.OtaPolicy
import com.antigravity.player.util.OtaPolicy.Resultado
import com.antigravity.player.util.OtaStatus
import com.antigravity.player.util.OtaStatus.Estado
import com.antigravity.player.util.PlayerFlowPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * F-183 — aviso de atualização na tela, atualização logo ao abrir, giro da playlist 9x16 e fim das interrupções
 * desnecessárias na reprodução.
 */
class AtualizacaoEReproducaoTest {

    private fun fonte(caminho: String) = File(caminho).readText()

    /** Só as linhas de código (sem comentários), para conferir o que o programa realmente executa. */
    private fun codigo(caminho: String) = File(caminho).readLines().filterNot { it.trim().startsWith("//") || it.trim().startsWith("*") || it.trim().startsWith("/*") }.joinToString("\n")

    // ---------------------------------------------------------------- mensagens na tela
    @Test
    fun `cada etapa da atualizacao tem uma mensagem em portugues com a versao`() {
        assertNull(OtaStatus.mensagem(Estado.Nenhum))
        assertEquals("Atualizando o aplicativo para a versão 5.7.3 — baixando…", OtaStatus.mensagem(Estado.Baixando("5.7.3", null)))
        assertEquals("Atualizando o aplicativo para a versão 5.7.3 — baixando 45%", OtaStatus.mensagem(Estado.Baixando("5.7.3", 45)))
        assertTrue(OtaStatus.mensagem(Estado.Instalando("5.7.3"))!!.contains("Instalando a versão 5.7.3"))
        assertTrue(OtaStatus.mensagem(Estado.AguardandoConfirmacao("5.7.3"))!!.contains("Confirme a instalação da versão 5.7.3"))
        assertEquals("Aplicativo atualizado para a versão 5.7.3", OtaStatus.mensagem(Estado.Atualizado("5.7.3")))
        assertTrue(OtaStatus.mensagem(Estado.Falhou("5.7.3"))!!.contains("tenta de novo sozinho"))
    }

    @Test
    fun `o aviso de atualizado e de falha some sozinho, o de andamento fica ate acabar`() {
        assertEquals(10_000L, OtaStatus.duracaoDoAvisoMs(Estado.Atualizado("5.7.3")))
        assertEquals(20_000L, OtaStatus.duracaoDoAvisoMs(Estado.Falhou("5.7.3")))
        assertEquals(0L, OtaStatus.duracaoDoAvisoMs(Estado.Baixando("5.7.3", 10)))
        assertEquals(0L, OtaStatus.duracaoDoAvisoMs(Estado.Instalando("5.7.3")))
        assertEquals(0L, OtaStatus.duracaoDoAvisoMs(Estado.AguardandoConfirmacao("5.7.3")))
    }

    @Test
    fun `o estado guarda a versao em instalacao para o receptor do instalador`() {
        OtaStatus.definir(Estado.Baixando("5.7.9", 3))
        assertEquals("5.7.9", OtaStatus.versaoEmInstalacao)
        assertEquals(Estado.Baixando("5.7.9", 3), OtaStatus.estado.value)
        OtaStatus.definir(Estado.Nenhum)
        assertEquals(Estado.Nenhum, OtaStatus.estado.value)
    }

    @Test
    fun `so avisa que atualizou quando a versao desta abertura e maior que a da anterior`() {
        assertTrue(OtaStatus.versaoMudou(guardada = 559, atual = 560))
        assertFalse("primeira abertura de todas", OtaStatus.versaoMudou(guardada = 0, atual = 560))
        assertFalse("mesma versão", OtaStatus.versaoMudou(guardada = 560, atual = 560))
        assertFalse("versão menor (reinstalação)", OtaStatus.versaoMudou(guardada = 561, atual = 560))
    }

    // ---------------------------------------------------------------- quando perguntar por versão nova
    @Test
    fun `pergunta a cada 15 minutos quando esta em dia e tenta de novo logo quando nao ha resposta`() {
        assertEquals(15 * 60_000L, OtaPolicy.proximaChecagemMs(Resultado.EM_DIA, 0))
        assertEquals(60_000L, OtaPolicy.proximaChecagemMs(Resultado.ATUALIZANDO, 0))
        assertEquals(20_000L, OtaPolicy.proximaChecagemMs(Resultado.SEM_RESPOSTA, 1))
        assertEquals(40_000L, OtaPolicy.proximaChecagemMs(Resultado.SEM_RESPOSTA, 2))
        assertEquals(20_000L, OtaPolicy.proximaChecagemMs(Resultado.FALHOU, 0))
        assertEquals(5 * 60_000L, OtaPolicy.proximaChecagemMs(Resultado.SEM_RESPOSTA, 500)) // nunca martela o servidor
    }

    @Test
    fun `o instalador do Android nao e reaberto toda hora por cima da tela`() {
        val agora = 10_000_000_000L
        assertTrue(OtaPolicy.podePedirInstalacao(0L, agora))
        assertFalse(OtaPolicy.podePedirInstalacao(agora - 60_000L, agora))
        assertTrue(OtaPolicy.podePedirInstalacao(agora - OtaPolicy.REPETIR_PEDIDO_DE_INSTALACAO_MS, agora))
    }

    // ---------------------------------------------------------------- playlist 9x16 em pé
    @Test
    fun `playlist em pe numa tela fisica deitada gira o quadro, e o contrario tambem`() {
        assertTrue(PlayerFlowPolicy.precisaGirarQuadroPorSoftware(1920, 1080, "portrait"))
        assertTrue(PlayerFlowPolicy.precisaGirarQuadroPorSoftware(1080, 1920, "landscape"))
        assertFalse(PlayerFlowPolicy.precisaGirarQuadroPorSoftware(1080, 1920, "portrait"))
        assertFalse(PlayerFlowPolicy.precisaGirarQuadroPorSoftware(1920, 1080, "landscape"))
        assertFalse("sem medida ainda: não decide", PlayerFlowPolicy.precisaGirarQuadroPorSoftware(0, 0, "portrait"))
    }

    @Test
    fun `liberado o giro, o quadro 9x16 ocupa a tela deitada inteira, girado em 90 graus`() {
        val t = PlayerFlowPolicy.tvCanvasTransform(isTelevision = true, canonicalOrientation = "portrait", displayWidth = 1920, displayHeight = 1080)!!
        assertEquals(1080, t.width)
        assertEquals(1920, t.height)
        assertEquals(90f, t.rotation, 0f)
        // o quadro lógico em pé (1080x1920) centralizado no painel 1920x1080 cobre exatamente a tela depois do giro
        assertEquals((1920 - 1080) / 2f, t.translationX, 0f)
        assertEquals((1080 - 1920) / 2f, t.translationY, 0f)
        assertNull("já casando, não gira", PlayerFlowPolicy.tvCanvasTransform(true, "portrait", 1080, 1920))
    }

    @Test
    fun `a tela principal libera o giro por software para aparelho que nao e TV`() {
        val principal = fonte("src/main/java/com/antigravity/player/MainActivity.kt")
        assertTrue(principal.contains("isTelevision = DeviceTypeUtil.isTelevision(applicationContext) || rotacaoPorSoftwareLiberada"))
        assertTrue(principal.contains("reavaliarGiroDoQuadroDepoisDoPedido()"))
        assertTrue(principal.contains("PlayerFlowPolicy.precisaGirarQuadroPorSoftware"))
    }

    // ---------------------------------------------------------------- menos engasgo
    @Test
    fun `a manutencao so reinicia a reprodução de madrugada, com memoria baixa ou depois de 12 horas`() {
        assertFalse(ManutencaoPolicy.deveReiniciarMotor(hora = 14, msDesdeUltimoReinicio = 4 * 3_600_000L, memoriaBaixa = false))
        assertFalse(ManutencaoPolicy.deveReiniciarMotor(hora = 9, msDesdeUltimoReinicio = 8 * 3_600_000L, memoriaBaixa = false))
        assertTrue(ManutencaoPolicy.deveReiniciarMotor(hora = 3, msDesdeUltimoReinicio = 1_000L, memoriaBaixa = false))
        assertTrue(ManutencaoPolicy.deveReiniciarMotor(hora = 5, msDesdeUltimoReinicio = 1_000L, memoriaBaixa = false))
        assertFalse(ManutencaoPolicy.deveReiniciarMotor(hora = 6, msDesdeUltimoReinicio = 1_000L, memoriaBaixa = false))
        assertTrue(ManutencaoPolicy.deveReiniciarMotor(hora = 15, msDesdeUltimoReinicio = 1_000L, memoriaBaixa = true))
        assertTrue(ManutencaoPolicy.deveReiniciarMotor(hora = 15, msDesdeUltimoReinicio = 12 * 3_600_000L, memoriaBaixa = false))
    }

    @Test
    fun `nao ha mais coleta de lixo forcada no meio da reproducao`() {
        val guardiao = codigo("src/main/java/com/antigravity/player/util/MemoryLeakGuardian.kt")
        // a única coleta forçada que sobra é a do ramo de memória realmente baixa (antes do "return true")
        assertEquals(1, Regex("System\\.gc\\(\\)").findAll(guardiao).count())
        assertTrue(guardiao.indexOf("System.gc()") < guardiao.indexOf("return true"))
        assertFalse(codigo("../media-engine/src/main/java/com/antigravity/media/exoplayer/ExoPlayerRenderer.kt").contains("System.gc()"))
        val limpeza = codigo("src/main/java/com/antigravity/player/service/AutoCleanManager.kt")
        assertFalse(limpeza.contains("System.gc()"))
        assertTrue(limpeza.contains("ManutencaoPolicy.deveReiniciarMotor"))
    }

    // ---------------------------------------------------------------- atualização logo ao abrir, com aviso
    @Test
    fun `a atualizacao comeca na abertura do aplicativo e nao mais 10 segundos depois com ciclo de 12 horas`() {
        val app = fonte("src/main/java/com/antigravity/player/UserApplication.kt")
        assertTrue(app.contains("OtaCycle.start(this, applicationScope)"))
        val principal = fonte("src/main/java/com/antigravity/player/MainActivity.kt")
        assertFalse(principal.contains("delay(10000) // Wait for network to stabilize"))
        assertFalse(principal.contains("delay(43200000) // 12 hours"))
        assertTrue(principal.contains("\"update_app\", \"check_update\""))
        val ciclo = fonte("src/main/java/com/antigravity/player/util/OtaCycle.kt")
        assertTrue(ciclo.contains("OtaPolicy.proximaChecagemMs"))
    }

    @Test
    fun `o aviso esta no layout acima das outras camadas e a tela mostra o texto do estado`() {
        val layout = fonte("src/main/res/layout/activity_main.xml")
        assertTrue(layout.contains("@+id/ota_banner"))
        val elevacao = Regex("ota_banner[\\s\\S]*?android:elevation=\"(\\d+)dp\"").find(layout)!!.groupValues[1].toInt()
        assertTrue("acima da tela de sincronização e do bloqueio (100dp)", elevacao > 100)
        val principal = fonte("src/main/java/com/antigravity/player/MainActivity.kt")
        assertTrue(principal.contains("OtaStatus.estado.collect"))
        assertTrue(principal.contains("OtaStatus.mensagem(estado)"))
        assertTrue(principal.contains("ultima_versao_executada"))
    }

    @Test
    fun `o gerenciador avisa as etapas, reaproveita o arquivo baixado e instala por sessao`() {
        val ota = fonte("src/main/java/com/antigravity/player/util/OTAUpdateManager.kt")
        for (etapa in listOf("Estado.Baixando", "Estado.Instalando", "Estado.Falhou", "Estado.AguardandoConfirmacao")) assertTrue(etapa, ota.contains(etapa))
        assertTrue("não baixa de novo o que já baixou", ota.contains("jaBaixado"))
        assertTrue(ota.contains("OtaPolicy.podePedirInstalacao"))
        assertTrue("sessões antigas são abandonadas", ota.contains("abandonSession"))
        assertTrue(ota.contains("USER_ACTION_NOT_REQUIRED"))
        assertTrue("o painel fica sabendo", ota.contains("informarPainel"))
        // a segurança continua: HTTPS, SHA-256 e assinatura
        assertTrue(ota.contains("startsWith(\"https://\")"))
        assertTrue(ota.contains("INTEGRITY FAIL"))
        assertTrue(ota.contains("OTA_RELEASE_CERT_SHA256"))
        val receptor = fonte("src/main/java/com/antigravity/player/receiver/OTAInstallReceiver.kt")
        assertTrue(receptor.contains("AguardandoConfirmacao"))
        assertTrue(receptor.contains("avisarFalha()"))
        val rede = fonte("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt")
        assertTrue("consulta sem login", rede.contains("rpc(\"get_latest_app_release\")"))
        assertNotNull(Regex("COMMAND_POLL_SAFE = listOf\\([^)]*\"update_app\"").find(rede))
    }

    @Test
    fun `enquanto o instalador do Android esta aberto o Player nao toma a tela de volta`() {
        val principal = codigo("src/main/java/com/antigravity/player/MainActivity.kt")
        // a volta forçada ao primeiro plano (perda de foco) respeita a janela do instalador
        val ini = principal.indexOf("Focus lost. Forcing MainActivity back to top.")
        assertTrue(ini > 0)
        assertTrue(principal.substring(ini, ini + 400).contains("instaladorDoSistemaAberto()"))
        val vigia = codigo("src/main/java/com/antigravity/player/service/SelfHealingService.kt")
        assertTrue("retorno soberano de 8 s também espera", vigia.contains("instaladorDoSistemaAberto()"))
        assertTrue(codigo("src/main/java/com/antigravity/player/util/DeviceControl.kt").contains("fun instaladorDoSistemaAberto()"))
        // a janela é aberta antes do instalador aparecer, nos dois caminhos (sessão e intent manual)
        assertTrue(codigo("src/main/java/com/antigravity/player/receiver/OTAInstallReceiver.kt").contains("suppressExitCountUntilMs = System.currentTimeMillis() + 180_000L"))
        assertTrue(codigo("src/main/java/com/antigravity/player/util/OTAUpdateManager.kt").contains("suppressExitCountUntilMs = System.currentTimeMillis() + 180_000L"))
    }

    @Test
    fun `sem a permissao de instalar o aviso explica e a tela do Android abre sozinha`() {
        val m = OtaStatus.mensagem(OtaStatus.Estado.PrecisaPermissao("5.7.3"))!!
        assertTrue(m.contains("5.7.3") && m.contains("Permitir desta fonte"))
        assertTrue(OtaStatus.duracaoDoAvisoMs(OtaStatus.Estado.PrecisaPermissao("5.7.3")) > 0L)
        val ota = codigo("src/main/java/com/antigravity/player/util/OTAUpdateManager.kt")
        assertTrue(ota.contains("canRequestPackageInstalls()"))
        assertTrue(ota.contains("ACTION_MANAGE_UNKNOWN_APP_SOURCES"))
        assertTrue("a checagem vem antes da instalação", ota.indexOf("canRequestPackageInstalls()") < ota.indexOf("installApkBySession(file)"))
    }

    @Test
    fun `depois de atualizado o aplicativo reabre sozinho`() {
        assertTrue(fonte("src/main/AndroidManifest.xml").contains("android.intent.action.MY_PACKAGE_REPLACED"))
        val boot = codigo("src/main/java/com/antigravity/player/receiver/BootReceiver.kt")
        assertTrue(boot.contains("Intent.ACTION_MY_PACKAGE_REPLACED"))
        assertTrue(boot.contains("SplashActivity::class.java"))
    }
}

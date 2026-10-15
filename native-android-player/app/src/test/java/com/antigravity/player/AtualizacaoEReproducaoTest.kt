package com.antigravity.player

import com.antigravity.player.util.ManutencaoPolicy
import com.antigravity.player.util.OtaPolicy
import com.antigravity.player.util.OtaPolicy.Resultado
import com.antigravity.player.util.OtaStatus
import com.antigravity.player.util.OtaStatus.Estado
import com.antigravity.player.util.PlayerFlowPolicy
import org.junit.Assert.assertArrayEquals
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

    // ---------------------------------------------------------------- F-186: religar o aparelho não deixa tela preta

    @Test
    fun `a decisao de girar por software vale na abertura seguinte so para a mesma orientacao`() {
        assertTrue(PlayerFlowPolicy.giroPorSoftwareGuardado(true, "portrait", "portrait"))
        assertFalse(PlayerFlowPolicy.giroPorSoftwareGuardado(true, "portrait", "landscape"))
        assertFalse(PlayerFlowPolicy.giroPorSoftwareGuardado(false, "portrait", "portrait"))
        assertFalse(PlayerFlowPolicy.giroPorSoftwareGuardado(true, null, "portrait"))
    }

    @Test
    fun `giro que muda com video no ar reinicia o motor, e durante a sincronizacao nao`() {
        assertTrue(PlayerFlowPolicy.reiniciarMotorAoMudarGiro(motorDeVideoCriado = true, sincronizando = false))
        assertFalse(PlayerFlowPolicy.reiniciarMotorAoMudarGiro(motorDeVideoCriado = true, sincronizando = true))
        assertFalse(PlayerFlowPolicy.reiniciarMotorAoMudarGiro(motorDeVideoCriado = false, sincronizando = false))
    }

    @Test
    fun `ao abrir, o giro guardado e aplicado antes de a reproducao comecar`() {
        val principal = codigo("src/main/java/com/antigravity/player/MainActivity.kt")
        val restaura = principal.indexOf("PlayerFlowPolicy.giroPorSoftwareGuardado(")
        val primeiraRotacao = principal.indexOf("applyScreenRotation(initialOrientation)")
        assertTrue(restaura in 1 until primeiraRotacao)
        assertTrue(principal.contains("putBoolean(PREF_GIRO_POR_SOFTWARE, liberar)"))
        assertTrue(principal.contains("PlayerFlowPolicy.reiniciarMotorAoMudarGiro(::playerRenderer1.isInitialized, isSyncInProgress)"))
    }

    @Test
    fun `o reinicio do motor de video cria players novos e religa as telas`() {
        val motor = codigo("../media-engine/src/main/java/com/antigravity/media/exoplayer/ExoPlayerRenderer.kt")
        val recria = motor.substring(motor.indexOf("fun recreate()"))
        assertTrue(recria.indexOf("release()") in 1 until recria.indexOf("initializePlayer()"))
        val principal = codigo("src/main/java/com/antigravity/player/MainActivity.kt")
        val reinicio = principal.substring(principal.indexOf("private fun reiniciarMotorDeVideo()"))
        assertTrue(reinicio.indexOf("playerRenderer1.recreate()") < reinicio.indexOf("playerView1.player = playerRenderer1.getPlayerInstance()"))
        // o laço para antes da troca e recomeça do zero depois (sem depender de startSyncAndPlay, que pode desistir)
        val corpo = reinicio.substring(0, reinicio.indexOf("private fun reavaliarGiroDoQuadroDepoisDoPedido()"))
        assertTrue(corpo.indexOf("playbackLoopJob?.cancel()") in 1 until corpo.indexOf("playerRenderer1.recreate()"))
        assertTrue(corpo.indexOf("playbackStage.forget()") < corpo.indexOf("playerRenderer1.recreate()"))
        assertTrue(corpo.indexOf("playerView2.player = playerRenderer2.getPlayerInstance()") < corpo.indexOf("startPlaybackLoop()"))
        assertTrue(corpo.contains("isSyncLoopRunning = false"))
        assertFalse(corpo.contains("startSyncAndPlay()"))
        // ninguém mais libera o motor e segue tocando sem recriar
        assertNull(Regex("playerRenderer2\\.release\\(\\)\\s+startSyncAndPlay\\(\\)").find(principal))
        // a manutenção e a mudança de giro usam o reinício completo (2 chamadas + a declaração)
        assertEquals(4, Regex("reiniciarMotorDeVideo\\(\\)").findAll(principal).count())
    }

    @Test
    fun `o relogio aceita correcao grande em vez de ficar horas errado para sempre`() {
        val tm = codigo("../core-player/src/main/java/com/antigravity/core/util/TimeManager.kt")
        val corpo = tm.substring(tm.indexOf("fun updateOffset(newOffset: Long)"), tm.indexOf("fun setTimeZoneOffset"))
        assertFalse("não existe mais a recusa de salto grande", corpo.contains("Rejecting massive drift"))
        assertNull("nenhum caminho sai sem aplicar a correção", Regex("\breturn\b").find(corpo))
        assertTrue(corpo.contains("timeOffsetMs = newOffset"))
    }

    // ---------------------------------------------------------------- F-187: mídia no ar tem de aparecer

    private fun vigia(item: Boolean = true, liberada: Boolean = true, sync: Long = 0, camada: Long = 0, video: Boolean = false, parado: Long = 0) =
        PlayerFlowPolicy.acaoDoVigia(item, liberada, sync, camada, video, parado)

    @Test
    fun `sincronizando por cima de midia no ar e solto depois da tolerancia`() {
        assertEquals(PlayerFlowPolicy.AcaoDoVigia.NADA, vigia(sync = 7_000))
        assertEquals(PlayerFlowPolicy.AcaoDoVigia.MOSTRAR_MIDIA, vigia(sync = 8_000))
    }

    @Test
    fun `camada do item escondida volta a aparecer, e o cruzamento entre midias nao dispara`() {
        assertEquals(PlayerFlowPolicy.AcaoDoVigia.NADA, vigia(camada = 2_000))
        assertEquals(PlayerFlowPolicy.AcaoDoVigia.MOSTRAR_MIDIA, vigia(camada = 4_000))
    }

    @Test
    fun `video no ar parado reinicia o motor, e imagem parada nao`() {
        assertEquals(PlayerFlowPolicy.AcaoDoVigia.NADA, vigia(video = true, parado = 11_000))
        assertEquals(PlayerFlowPolicy.AcaoDoVigia.REINICIAR_MOTOR, vigia(video = true, parado = 12_000))
        assertEquals(PlayerFlowPolicy.AcaoDoVigia.NADA, vigia(video = false, parado = 60_000))
        assertTrue(PlayerFlowPolicy.videoAndando(true, tocando = true, posicaoMs = 5, posicaoAnteriorMs = 5))
        assertTrue(PlayerFlowPolicy.videoAndando(true, tocando = false, posicaoMs = 9, posicaoAnteriorMs = 5))
        assertFalse(PlayerFlowPolicy.videoAndando(true, tocando = false, posicaoMs = 5, posicaoAnteriorMs = 5))
        assertFalse(PlayerFlowPolicy.videoAndando(false, tocando = false, posicaoMs = -1, posicaoAnteriorMs = 7))
    }

    @Test
    fun `sem item no ar ou com a tela bloqueada o vigia nao mexe`() {
        assertEquals(PlayerFlowPolicy.AcaoDoVigia.NADA, vigia(item = false, sync = 600_000, camada = 600_000))
        assertEquals(PlayerFlowPolicy.AcaoDoVigia.NADA, vigia(liberada = false, sync = 600_000, video = true, parado = 600_000))
    }

    @Test
    fun `o vigia roda desde que o palco existe e usa o reinicio completo do motor`() {
        val principal = codigo("src/main/java/com/antigravity/player/MainActivity.kt")
        assertTrue(principal.contains("iniciarVigiaDaImagem()"))
        val v = principal.substring(principal.indexOf("private fun vigiarImagem()"), principal.indexOf("private fun reavaliarGiroDoQuadroDepoisDoPedido()"))
        assertTrue(v.contains("syncGuard.releaseLock()") && v.contains("playbackStage.restoreShown()") && v.contains("reiniciarMotorDeVideo()"))
    }

    // ---------------------------------------------------------------- F-187: o painel sabe quando não está reproduzindo

    private val saude = com.antigravity.player.util.SaudeDaReproducao

    @Test
    fun `com midia no ar esta reproduzindo, e sem item so vira alerta depois da tolerancia`() {
        assertEquals(true to null, saude.avaliar(itemNoAr = true, telaLiberada = true, semItemHaMs = 0, presoNaSincronizacao = false, reiniciosDoMotorNaJanela = 0))
        assertEquals(true to null, saude.avaliar(false, true, 89_000, true, 0))
        val preso = saude.avaliar(false, true, 90_000, true, 0)
        assertFalse(preso.first); assertTrue(preso.second!!.contains("sincronização"))
        val semItem = saude.avaliar(false, true, 120_000, false, 0)
        assertFalse(semItem.first); assertTrue(semItem.second!!.contains("Nenhuma mídia no ar"))
    }

    @Test
    fun `motor reiniciado demais vira alerta, e tela bloqueada no painel nao e defeito`() {
        val motor = saude.avaliar(true, true, 0, false, 3)
        assertFalse(motor.first); assertTrue(motor.second!!.contains("motor de vídeo"))
        assertEquals(true to null, saude.avaliar(false, telaLiberada = false, semItemHaMs = 900_000, presoNaSincronizacao = true, reiniciosDoMotorNaJanela = 9))
    }

    @Test
    fun `o sinal de vida so diz playing quando o vigia confirma, e explica a causa`() {
        saude.informar(true, null, agoraMs = 1_000_000)
        assertEquals("playing" to null, saude.statusParaOServidor(1_005_000, telaAtiva = true, temPlaylist = true))
        assertEquals("blocked", saude.statusParaOServidor(1_005_000, telaAtiva = false, temPlaylist = true).first)
        assertEquals("syncing", saude.statusParaOServidor(1_005_000, telaAtiva = true, temPlaylist = false).first)
        // o vigia calou (tela do Player fechada): não é "playing"
        val calado = saude.statusParaOServidor(1_000_000 + 31_000, true, true)
        assertEquals("sem_reproducao", calado.first); assertTrue(calado.second!!.contains("não está aberta"))
        saude.informar(false, "Preso na tela de sincronização há 120 s", agoraMs = 2_000_000)
        assertEquals("sem_reproducao" to "Preso na tela de sincronização há 120 s", saude.statusParaOServidor(2_001_000, true, true))
        saude.informar(true, null, agoraMs = 3_000_000) // não deixa estado sujo para os outros testes
        val servico = codigo("src/main/java/com/antigravity/player/service/PersistentHeartbeatService.kt")
        assertTrue(servico.contains("SaudeDaReproducao.statusParaOServidor("))
        assertFalse("não existe mais o playing automático", servico.contains("playlist != null -> \"playing\""))
        assertTrue(servico.contains("\"SemReproducao\""))
    }

    // ---------------------------------------------------------------- F-188: fluidez medida no aparelho

    private val dv = com.antigravity.player.util.DesempenhoDeVideo

    @Test
    fun `reconhece decodificador por software e por hardware`() {
        assertTrue(dv.porSoftware("OMX.google.h264.decoder"))
        assertTrue(dv.porSoftware("c2.android.avc.decoder"))
        assertFalse(dv.porSoftware("OMX.rk.video_decoder.avc"))
        assertFalse(dv.porSoftware("OMX.amlogic.avc.decoder.awesome"))
        assertFalse(dv.porSoftware(null))
    }

    @Test
    fun `veredito de fluidez pelos quadros exibidos e perdidos`() {
        assertEquals(30f, dv.fpsDoFormato("1080x1920@30.0"))
        assertNull(dv.fpsDoFormato("1080x1920@-1.0"))
        assertEquals(900, dv.quadrosEsperados(30_000, 30f))
        assertEquals("fluido", dv.veredito(exibidos = 895, perdidos = 3, esperados = 900))
        assertEquals("engasgos leves", dv.veredito(exibidos = 800, perdidos = 30, esperados = 900))
        assertEquals("travando", dv.veredito(exibidos = 420, perdidos = 200, esperados = 900))
        assertEquals("travando", dv.veredito(exibidos = 400, perdidos = 0, esperados = 900)) // lento: mostrou menos da metade
    }

    @Test
    fun `a medicao por item desconta o acumulado do player emendado`() {
        // mesmo decodificador (identidade 7): desconta o acumulado
        assertArrayEquals(intArrayOf(100, 2, 5, 1), dv.delta(intArrayOf(900, 10, 3, 0, 7), intArrayOf(1000, 12, 5, 1, 7)))
        // decodificador reaberto no meio, ou inexistente no início: a leitura final já é só do item
        assertArrayEquals(intArrayOf(700, 20, 4, 0), dv.delta(intArrayOf(900, 10, 3, 0, 7), intArrayOf(700, 20, 4, 0, 9)))
        assertArrayEquals(intArrayOf(700, 20, 4, 0), dv.delta(null, intArrayOf(700, 20, 4, 0, 9)))
        val principal = codigo("src/main/java/com/antigravity/player/MainActivity.kt")
        assertTrue(principal.contains("iniciarMedicaoDeVideo(active)") && principal.contains("encerrarMedicaoDeVideo()"))
        assertTrue(codigo("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt").contains("fn_player_registrar_desempenho_video"))
    }

    // ---------------------------------------------------------------- F-189: baixar vídeo novo não trava o vídeo no ar

    @Test
    fun `o ritmo do download respeita o limite e sem limite nunca espera`() {
        val r = com.antigravity.sync.service.RitmoDeDownload
        assertEquals(0L, r.esperaMs(bytesLidos = 3_000_000, decorridoMs = 100, limiteBytesPorSegundo = 0))
        // 1,5 MB lidos em 0,5 s com limite de 1,5 MB/s: espera o meio segundo que falta
        assertEquals(500L, r.esperaMs(1_500_000, 500, 1_500_000))
        assertEquals(0L, r.esperaMs(1_500_000, 1_200, 1_500_000))
        assertEquals(1_000L, r.esperaMs(15_000_000, 0, 1_500_000)) // nunca dorme mais de 1 s por vez
    }

    @Test
    fun `em TV Box fraca o download e um por vez, lento e em prioridade baixa`() {
        val w = codigo("src/main/java/com/antigravity/player/worker/MediaDownloadWorker.kt")
        assertTrue(w.contains("vezDeBaixar.withLock { mediaDownloader.downloadFile(url, file, limiteBytesPorSegundo = limite) }"))
        assertTrue(w.contains("RitmoDeDownload.LIMITE_TV_BOX_FRACA"))
        val d = codigo("../sync-network/src/main/java/com/antigravity/sync/service/MediaDownloader.kt")
        assertTrue(d.contains("THREAD_PRIORITY_BACKGROUND") && d.contains("setThreadPriority(prioridadeAnterior)"))
        assertTrue(d.contains("RitmoDeDownload.esperaMs("))
    }
}

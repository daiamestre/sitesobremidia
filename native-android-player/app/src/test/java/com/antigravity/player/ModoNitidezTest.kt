package com.antigravity.player

import com.antigravity.player.util.ModoNitidez
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** F-198 (TESTE 5.7.11) — modo nitidez: vídeo no plano de hardware quando a saída HDMI é maior que a tela do Android. */
class ModoNitidezTest {

    @Test
    fun `liga so quando a saida HDMI e maior que a tela do Android e o quadro nao gira`() {
        assertTrue(ModoNitidez.usar(1280, 720, 1920, 1080, quadroGiradoPorSoftware = false))
        assertTrue(ModoNitidez.usar(1280, 720, 3840, 2160, quadroGiradoPorSoftware = false))
        assertFalse("sem ganho (saída = tela)", ModoNitidez.usar(1920, 1080, 1920, 1080, false))
        assertFalse("TV Box 720p de verdade", ModoNitidez.usar(1280, 720, 1280, 720, false))
        assertFalse("totem girado fica na camada comum", ModoNitidez.usar(1280, 720, 1920, 1080, true))
        assertFalse("medida inválida", ModoNitidez.usar(0, 0, 1920, 1080, false))
        // painel natural em pé (emulador/celular): compara pelo lado maior
        assertTrue(ModoNitidez.usar(1280, 720, 1080, 1920, false))
    }

    @Test
    fun `a tela troca a camada, reabre sem o modo se o quadro girar, mede a saida e a captura inclui o video`() {
        val principal = File("src/main/java/com/antigravity/player/MainActivity.kt").readText()
        assertTrue(principal.indexOf("decidirModoNitidez()") in 1 until principal.indexOf("playerView1 = findViewById<PlayerView>(R.id.playerView1)"))
        assertTrue(principal.contains("layoutInflater.inflate(R.layout.player_view_surface, pai, false)"))
        assertTrue(principal.contains("if (modoNitidez && wantRot != 0f)"))
        // sem laço: guarda a rotação antes de reabrir e suspende o modo até a próxima abertura
        val reabre = principal.indexOf("reabrindo a tela sem o modo nitidez")
        assertTrue(principal.indexOf(".commit()", reabre) in reabre until principal.indexOf("recreate()", reabre))
        assertTrue(principal.contains("nitidezSuspensa = true"))
        assertTrue(principal.contains("if (e is kotlinx.coroutines.CancellationException) throw e"))
        assertTrue(principal.contains("\"TELA_FISICA\", descricaoDaTela"))
        assertTrue(File("src/main/res/layout/player_view_surface.xml").readText().contains("app:surface_type=\"surface_view\""))
        val captura = File("../media-engine/src/main/java/com/antigravity/media/util/ScreenCapture.kt").readText()
        assertTrue(captura.contains("PixelCopy.request(sv, quadro"))
        val widgets = File("src/main/java/com/antigravity/player/util/NativeWidgetEngine.kt").readText()
        assertFalse(widgets.contains("PREFER_RGB_565"))
    }
}

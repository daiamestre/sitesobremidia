package com.antigravity.player

import android.content.Context
import android.media.AudioManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.antigravity.player.radio.Radio
import com.antigravity.player.radio.RadioController
import com.antigravity.player.radio.RadioFaixa
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * F-153 — SOM de verdade no Player Android (sem login): a Rádio Comércio toca duas faixas reais (tons gerados aqui),
 * confere que o som está saindo (AudioManager.isMusicActive), o volume pedido pelo servidor, a troca de faixa e que
 * ao parar o som cessa.
 */
@RunWith(AndroidJUnit4::class)
class RadioSomTest {
    private fun wav(hz: Double, segundos: Int): ByteArray {
        val sr = 22050; val n = sr * segundos
        val b = ByteBuffer.allocate(44 + n * 2).order(ByteOrder.LITTLE_ENDIAN)
        b.put("RIFF".toByteArray()).putInt(36 + n * 2).put("WAVEfmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(sr).putInt(sr * 2).putShort(2).putShort(16)
        b.put("data".toByteArray()).putInt(n * 2)
        for (i in 0 until n) b.putShort((Math.sin(2 * Math.PI * hz * i / sr) * 12000).toInt().toShort())
        return b.array()
    }

    private fun esperar(ms: Long, ate: () -> Boolean): Boolean {
        val fim = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < fim) { if (ate()) return true; Thread.sleep(200) }
        return ate()
    }

    @Test fun radioToca_comSomVolumeETrocaDeFaixa() {
        val inst = InstrumentationRegistry.getInstrumentation()
        val ctx = inst.targetContext
        val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val escopo = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        val controle = RadioController(ctx, escopo)
        val pasta = File(ctx.filesDir, "radio_media").apply { deleteRecursively(); mkdirs() }
        val faixas = listOf(RadioFaixa("f1", "https://teste.invalid/musica-1.wav"), RadioFaixa("f2", "https://teste.invalid/musica-2.wav"))
        // arquivos já "baixados": o controlador usa o que existe no aparelho
        File(pasta, controle.nomeDoArquivo(faixas[0].url)).writeBytes(wav(440.0, 3))
        File(pasta, controle.nomeDoArquivo(faixas[1].url)).writeBytes(wav(660.0, 3))
        try {
            assertFalse("antes da rádio não há som", audio.isMusicActive)
            controle.aplicarParaTeste(Radio("p-teste", 55, false, faixas))

            // 1) o som sai
            assertTrue("o aparelho está emitindo som", esperar(30_000) { audio.isMusicActive })
            var tocando = false; var volume = -1f; var indice = -1; var total = 0
            inst.runOnMainSync { val p = controle.reprodutorParaTeste(); tocando = p?.isPlaying == true; volume = p?.volume ?: -1f; indice = p?.currentMediaItemIndex ?: -1; total = p?.mediaItemCount ?: 0 }
            assertTrue("ExoPlayer tocando", tocando)
            assertEquals("volume do servidor (55%)", 0.55f, volume, 0.001f)
            assertEquals("duas faixas na fila", 2, total)
            assertEquals("começa pela primeira", 0, indice)

            // 2) troca de faixa sem parar o som
            assertTrue("passou para a 2ª faixa", esperar(15_000) { var i = -1; inst.runOnMainSync { i = controle.reprodutorParaTeste()?.currentMediaItemIndex ?: -1 }; i == 1 })
            assertTrue("o som continua na troca", audio.isMusicActive)

            // 3) volta para a primeira (repetição) — a rádio não acaba
            assertTrue("a rádio recomeça", esperar(15_000) { var i = -1; inst.runOnMainSync { i = controle.reprodutorParaTeste()?.currentMediaItemIndex ?: -1 }; i == 0 })

            // 4) desligar: o som cessa
            controle.pararParaTeste()
            assertTrue("ao desligar a rádio o som cessa", esperar(15_000) { !audio.isMusicActive })
            assertTrue(controle.reprodutorParaTeste() == null)
        } finally {
            inst.runOnMainSync { controle.stop() }
            escopo.cancel()
            File(ctx.filesDir, "radio_media").deleteRecursively()
        }
    }
}

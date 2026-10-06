package com.antigravity.player

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.antigravity.player.zone.ZoneController
import com.antigravity.player.zone.ZoneLayoutParser
import com.antigravity.player.zone.ZoneLayoutResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * F-149 — monta de verdade a divisão da tela no aparelho (sem login): baixa as imagens da internet, posiciona a zona
 * principal e as demais, e salva um PNG para conferência.
 *  - 75% + 25%: a camada principal fica com 3/4 da largura e a zona lateral com 1/4;
 *  - a zona lateral mostra a imagem dela;
 *  - quando o motor principal começa a mostrar a mesma mídia, a zona lateral troca para outra na hora;
 *  - sem divisão, a camada principal volta à tela cheia.
 */
@RunWith(AndroidJUnit4::class)
class ZonasRenderTest {
    private val W = 1280
    private val H = 720
    // fotos públicas do próprio acervo do projeto (pontos parceiros)
    private val img1 = "https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev/tenants/7d62aaec-e24d-4273-b257-867183cf658c/pontos/padaria-galeria-mulgyhyl.jpg"
    private val img2 = "https://sitesobremidia.vercel.app/logo-3d.png"

    private fun resposta() = """
      {"status":"SUCCESS","layout":{"id":"L-teste","tela_id":"T","versao":1,"largura":1920,"altura":1080,"cor_fundo":"#000000","zonas":[
        {"id":"z1","numero":1,"x":0,"y":0,"largura":1440,"altura":1080,"ordem_z":0,"modo_encaixe":"CONTER","principal":true,"audio":true,"excluir_midias":["m-de-outra-zona"],"playlist":null},
        {"id":"z2","numero":2,"x":1440,"y":0,"largura":480,"altura":1080,"ordem_z":1,"modo_encaixe":"COBRIR","principal":false,"audio":false,
         "playlist":{"id":"p2","playlist_items":[
           {"id":"i1","position":0,"duration":30,"media":{"id":"m1","file_url":"$img1","file_type":"image"}},
           {"id":"i2","position":1,"duration":30,"media":{"id":"m2","file_url":"$img2","file_type":"image"}}]}}]}}
    """.trimIndent()

    private fun esperar(ms: Long, ate: () -> Boolean): Boolean {
        val fim = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < fim) { if (ate()) return true; Thread.sleep(250) }
        return ate()
    }

    @Test fun montaAsZonasENaoRepeteAMidiaDoMotorPrincipal() {
        val inst = InstrumentationRegistry.getInstrumentation()
        val ctx = inst.targetContext
        File(ctx.filesDir, "zonas_media").deleteRecursively()
        val layout = (ZoneLayoutParser.parse(resposta()) as ZoneLayoutResult.Ok).layout
        val escopo = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        lateinit var raiz: FrameLayout
        lateinit var camadaPrincipal: View
        lateinit var controle: ZoneController
        val medir = {
            raiz.measure(View.MeasureSpec.makeMeasureSpec(W, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(H, View.MeasureSpec.EXACTLY))
            raiz.layout(0, 0, W, H)
        }
        try {
            inst.runOnMainSync {
                raiz = FrameLayout(ctx).apply { setBackgroundColor(Color.BLACK) }
                // faz o papel das camadas do motor principal (em produção: main_engine_layer)
                camadaPrincipal = View(ctx).apply { setBackgroundColor(Color.rgb(40, 60, 160)) }
                raiz.addView(camadaPrincipal, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
                medir()
                controle = ZoneController(ctx, escopo, raiz, listOf(camadaPrincipal), camadaPrincipal)
                controle.aplicarParaTeste(layout)
                medir()
            }

            // 1) geometria: 75% + 25%
            inst.runOnMainSync { medir() }
            val quadro = controle.quadroDaZona("z2")
            assertNotNull("zona lateral criada", quadro)
            assertEquals("principal = 3/4 da largura", 960, camadaPrincipal.width)
            assertEquals(H, camadaPrincipal.height)
            assertEquals("lateral começa onde a principal termina", 960, quadro!!.left)
            assertEquals("lateral = 1/4 da largura", 320, quadro.width)

            // 2) a zona lateral baixa e mostra a mídia dela
            assertTrue("zona lateral começou a tocar", esperar(60_000) { controle.midiaDaZona("z2") != null })
            val primeira = controle.midiaDaZona("z2")!!
            fun imagemVisivel(): Boolean {
                var ok = false
                inst.runOnMainSync {
                    medir()
                    val iv = (0 until (quadro as FrameLayout).childCount).map { quadro.getChildAt(it) }.filterIsInstance<ImageView>().firstOrNull()
                    ok = iv != null && iv.visibility == View.VISIBLE && iv.drawable != null
                }
                return ok
            }
            assertTrue("imagem desenhada na zona", esperar(30_000) { imagemVisivel() })

            // 3) o motor principal passa a mostrar a mesma mídia: a zona troca para outra
            controle.onMainItemStarted(primeira)
            assertTrue("a zona largou a mídia que a principal pegou", esperar(60_000) { controle.midiaDaZona("z2").let { it != null && it != primeira } })
            assertNotEquals(primeira, controle.midiaDaZona("z2"))
            assertTrue(esperar(30_000) { imagemVisivel() })

            // retrato para conferência
            val saida = File(ctx.getExternalFilesDir(null), "f149").apply { mkdirs() }
            inst.runOnMainSync {
                medir()
                val bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
                raiz.draw(Canvas(bmp))
                File(saida, "zonas-75-25.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            }

            // 4) prova de exibição por zona ficou na fila (a mídia trocada foi exibida)
            assertTrue("prova com a zona", controle.provasPendentes().any { it.contains("\"zona_numero\":2") && it.contains(primeira) })

            // 5) sem divisão: a camada principal volta à tela cheia e a zona some
            inst.runOnMainSync { controle.aplicarParaTeste(null); medir() }
            assertEquals(W, camadaPrincipal.width)
            assertEquals(0, camadaPrincipal.left)
            assertEquals(null, controle.quadroDaZona("z2"))
        } finally {
            inst.runOnMainSync { controle.stop() }
            escopo.cancel()
        }
    }
}

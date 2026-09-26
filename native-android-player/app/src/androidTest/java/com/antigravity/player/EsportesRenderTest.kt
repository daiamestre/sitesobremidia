package com.antigravity.player

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.antigravity.core.util.TimeManager
import com.antigravity.player.util.NativeWidgetEngine
import com.antigravity.player.widget.EsportesText
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.URLEncoder

/**
 * F-86 — desenha o widget Esportes v2 de verdade (NativeWidgetEngine, escudos baixados do Storage) e salva PNGs para a
 * conferência visual, em 16:9 e 9:16. Dados: a janela real de 19/09/2026 (asset esportes_19_09_2026.json, gerado de
 * fn_widget_esportes_dados com referência 19/09) — usada porque em 26/09 a janela está vazia (Data FIFA).
 * O relógio do Player é posto em 19/09 12:00 de Brasília SÓ neste teste (deslocamento do TimeManager).
 * Cada página é desenhada a partir do cursor (dia, próxima), o mesmo mecanismo da continuação entre exibições.
 */
@RunWith(AndroidJUnit4::class)
class EsportesRenderTest {
    private val campoOffset = TimeManager::class.java.getDeclaredField("timeOffsetMs").apply { isAccessible = true }

    @After fun limpar() {
        campoOffset.setLong(TimeManager, 0L)
        InstrumentationRegistry.getInstrumentation().targetContext.getSharedPreferences("esportes_cursor", 0).edit().clear().commit()
    }

    @Test fun desenhaPaginasHorizontalEVertical() = runBlocking {
        val inst = InstrumentationRegistry.getInstrumentation()
        val ctx = inst.targetContext
        val json = inst.context.assets.open("esportes_19_09_2026.json").bufferedReader().use { it.readText() }
        val alvo = EsportesText.isoParaMs("2026-09-19T15:00:00Z")!!
        val url = "native_widget://sports/teste-f86?config=" + URLEncoder.encode("""{"competicoes":[],"esportes":$json}""", "UTF-8")
        val saida = File(ctx.getExternalFilesDir(null), "f86").apply { mkdirs() }
        var salvos = 0
        for ((nome, w, h) in listOf(Triple("h", 1920, 1080), Triple("v", 1080, 1920))) {
            for (pagina in 0 until 8) {
                ctx.getSharedPreferences("esportes_cursor", 0).edit().putString("teste-f86", "2026-09-19|$pagina").commit()
                // A sincronização NTP do app pode desfazer o deslocamento a qualquer momento: reposiciona antes de cada desenho.
                campoOffset.setLong(TimeManager, alvo - System.currentTimeMillis())
                val container = FrameLayout(ctx)
                inst.runOnMainSync {
                    container.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
                    container.layout(0, 0, w, h)
                }
                NativeWidgetEngine.renderWidget(ctx, container, url)
                inst.runOnMainSync {
                    container.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
                    container.layout(0, 0, w, h)
                    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                    container.draw(Canvas(bmp))
                    File(saida, "esportes_${nome}_p${pagina + 1}.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    salvos++
                }
            }
        }
        assertTrue(salvos == 16)
    }
}

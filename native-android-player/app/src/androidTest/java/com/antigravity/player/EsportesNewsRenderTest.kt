package com.antigravity.player

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.antigravity.player.util.NativeWidgetEngine
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.URLEncoder

/**
 * F-90 — desenha o widget Esportes News de verdade (NativeWidgetEngine, imagem baixada da Agência Brasil) e salva PNGs
 * para a conferência visual, em 16:9 e 9:16. Dados: a saída real de fn_widget_esportes_news_dados em 27/09/2026
 * (asset esportes_news_27_09_2026.json). Também prova que notícia cuja imagem não carrega NÃO aparece.
 */
@RunWith(AndroidJUnit4::class)
class EsportesNewsRenderTest {
    @After fun limpar() {
        InstrumentationRegistry.getInstrumentation().targetContext.getSharedPreferences("esportes_news_cursor", 0).edit().clear().commit()
    }

    private fun textos(v: View): List<String> = when (v) {
        is TextView -> listOf(v.text.toString())
        is android.view.ViewGroup -> (0 until v.childCount).flatMap { textos(v.getChildAt(it)) }
        else -> emptyList()
    }

    private fun desenhar(url: String, w: Int, h: Int, arquivo: File?): FrameLayout = runBlocking {
        val inst = InstrumentationRegistry.getInstrumentation()
        val ctx = inst.targetContext
        val container = FrameLayout(ctx)
        inst.runOnMainSync {
            container.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
            container.layout(0, 0, w, h)
        }
        NativeWidgetEngine.renderWidget(ctx, container, url)
        inst.runOnMainSync {
            container.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
            container.layout(0, 0, w, h)
            if (arquivo != null) {
                val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                container.draw(Canvas(bmp))
                arquivo.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            }
        }
        container
    }

    @Test fun desenhaNoticiaHorizontalEVertical() {
        val inst = InstrumentationRegistry.getInstrumentation()
        val json = inst.context.assets.open("esportes_news_27_09_2026.json").bufferedReader().use { it.readText() }
        val url = "native_widget://sports_news/teste-f90?config=" + URLEncoder.encode("""{"template":"esportes-news","esportesNews":$json}""", "UTF-8")
        val saida = File(inst.targetContext.getExternalFilesDir(null), "f90").apply { mkdirs() }
        for ((nome, w, h) in listOf(Triple("h", 1920, 1080), Triple("v", 1080, 1920))) {
            val c = desenhar(url, w, h, File(saida, "esportes_news_$nome.png"))
            val t = textos(c)
            assertTrue("manchete na tela ($nome): $t", t.any { it.startsWith("Brasileirão Feminino: TV Brasil transmite") })
            assertTrue("crédito na tela ($nome): $t", t.contains("Arte/Agência Brasil"))
        }
    }

    @Test fun noticiaSemImagemCarregadaNaoAparece() {
        val itens = """{"itens":[{"id":"x1","titulo":"Notícia cuja imagem não existe","imagem":"https://imagem-inexistente.invalid/f.jpg","fonte":"Teste"}]}"""
        val url = "native_widget://sports_news/teste-f90b?config=" + URLEncoder.encode("""{"esportesNews":$itens}""", "UTF-8")
        val t = textos(desenhar(url, 1920, 1080, null))
        assertTrue("não pode mostrar a notícia sem imagem: $t", t.none { it.contains("Notícia cuja imagem não existe") })
        assertEquals(1, t.count { it == "Nenhuma notícia de esporte com imagem no momento." })
    }
}

package com.antigravity.player

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.antigravity.player.util.NativeWidgetEngine
import com.antigravity.player.widget.EsportesNews
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.URLEncoder

/**
 * F-90/F-91 — desenha de verdade (NativeWidgetEngine, imagens baixadas da internet) e salva PNGs para conferência:
 *  - Esportes News com a saída real de fn_widget_esportes_news_dados de 27/09/2026 (10 notícias, Agência Brasil e ge
 *    intercaladas): as 3 primeiras exibições seguidas, provando que a notícia muda;
 *  - Notícias (RSS) com um feed real (Agência Brasil — o feed não traz foto: a imagem vem da página da matéria);
 *  - notícia com imagem inexistente não aparece.
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

    @Test fun esportesNewsMudaDeNoticiaEmCadaExibicao() {
        val inst = InstrumentationRegistry.getInstrumentation()
        val ctx = inst.targetContext
        val json = inst.context.assets.open("esportes_news_27_09_2026_v2.json").bufferedReader().use { it.readText() }
        val url = "native_widget://sports_news/teste-f91?config=" + URLEncoder.encode("""{"template":"esportes-news","esportesNews":$json}""", "UTF-8")
        val itens = com.antigravity.player.widget.WidgetSpecParser.parse(url).esportesNews!!
        assertTrue("várias notícias: ${itens.size}", itens.size >= 6)
        val saida = File(ctx.getExternalFilesDir(null), "f91").apply { mkdirs() }
        val titulosVistos = LinkedHashSet<String>()
        // 1ª, 2ª e 3ª exibição (cada uma começa onde a anterior parou: +3 notícias)
        for (exibicao in 0 until 3) {
            val inicio = itens[exibicao * EsportesNews.NOTICIAS_POR_EXIBICAO]
            ctx.getSharedPreferences("esportes_news_cursor", 0).edit().putString("teste-f91", inicio.id).commit()
            val (w, h) = if (exibicao == 1) 1080 to 1920 else 1920 to 1080
            val t = textos(desenhar(url, w, h, File(saida, "esportes_news_exibicao${exibicao + 1}.png")))
            assertTrue("mostra a notícia do cursor (${inicio.titulo}): $t", t.contains(inicio.titulo))
            titulosVistos.add(inicio.titulo)
        }
        assertEquals(3, titulosVistos.size)
    }

    @Test fun noticiasRssComImagemDaPagina() {
        val inst = InstrumentationRegistry.getInstrumentation()
        val url = "native_widget://rss/teste-f91-rss?config=" + URLEncoder.encode(
            """{"feedUrl":"https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml","maxItems":5,"scrollSpeed":8}""", "UTF-8")
        val saida = File(inst.targetContext.getExternalFilesDir(null), "f91").apply { mkdirs() }
        val t = textos(desenhar(url, 1920, 1080, File(saida, "noticias_rss_h.png")))
        assertTrue("selo NOTÍCIAS e notícia com imagem: $t", t.contains("NOTÍCIAS") && t.none { it.startsWith("Sem notícias") })
        desenhar(url, 1080, 1920, File(saida, "noticias_rss_v.png"))
    }

    @Test fun noticiaSemImagemCarregadaNaoAparece() {
        val itens = """{"itens":[{"id":"x1","titulo":"Notícia cuja imagem não existe","imagem":"https://imagem-inexistente.invalid/f.jpg","fonte":"Teste"}]}"""
        val url = "native_widget://sports_news/teste-f90b?config=" + URLEncoder.encode("""{"esportesNews":$itens}""", "UTF-8")
        val t = textos(desenhar(url, 1920, 1080, null))
        assertTrue("não pode mostrar a notícia sem imagem: $t", t.none { it.contains("Notícia cuja imagem não existe") })
        assertEquals(1, t.count { it == "Nenhuma notícia de esporte com imagem no momento." })
    }
}

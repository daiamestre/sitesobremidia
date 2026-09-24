package com.antigravity.media.util

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.abs

/**
 * Screenshot do Player: o vídeo (TextureView, como no ExoPlayer) precisa aparecer na imagem,
 * e não como um retângulo preto — nos dois caminhos (janela/PixelCopy e o fallback de TV Box antiga).
 * O quadro estático do teste demora a ser composto no emulador; recaptura por até ~5 s (em playback real
 * o vídeo atualiza o TextureView continuamente).
 */
@RunWith(AndroidJUnit4::class)
class ScreenCaptureTest {

    private fun near(actual: Int, expected: Int, tol: Int = 40) =
        abs(Color.red(actual) - Color.red(expected)) <= tol &&
            abs(Color.green(actual) - Color.green(expected)) <= tol &&
            abs(Color.blue(actual) - Color.blue(expected)) <= tol

    private fun pixel(bmp: Bitmap, rx: Float, ry: Float) = bmp.getPixel((bmp.width * rx).toInt(), (bmp.height * ry).toInt())

    private fun isRedBackgroundAndGreenVideo(bmp: Bitmap) =
        near(pixel(bmp, 0.08f, 0.5f), Color.RED) && near(pixel(bmp, 0.5f, 0.5f), Color.GREEN)

    private fun describe(bmp: Bitmap?) = bmp?.let {
        "fundo=#${Integer.toHexString(pixel(it, 0.08f, 0.5f))} video=#${Integer.toHexString(pixel(it, 0.5f, 0.5f))}"
    } ?: "null"

    private fun awaitCapture(scenario: ActivityScenario<ScreenCaptureTestActivity>, label: String, take: (ScreenCaptureTestActivity, (Bitmap?) -> Unit) -> Unit) {
        var last: Bitmap? = null
        for (attempt in 1..20) {
            val latch = CountDownLatch(1)
            var bmp: Bitmap? = null
            scenario.onActivity { a -> take(a) { b -> bmp = b; latch.countDown() } }
            assertTrue("captura não retornou", latch.await(10, TimeUnit.SECONDS))
            val captured = bmp
            last = captured
            if (captured != null && isRedBackgroundAndGreenVideo(captured)) {
                Log.i("SCREEN_CAPTURE_TEST", "$label OK na tentativa $attempt (${describe(captured)}, ${captured.width}x${captured.height})")
                return
            }
            Thread.sleep(250)
        }
        assertNotNull("$label: captura falhou", last)
        throw AssertionError("$label: vídeo (TextureView) deveria ser verde e o fundo vermelho, mas veio ${describe(last)} (preto/transparente = bug)")
    }

    @Test
    fun windowCapture_includesTextureVideo() {
        ActivityScenario.launch(ScreenCaptureTestActivity::class.java).use { sc ->
            var activity: ScreenCaptureTestActivity? = null
            sc.onActivity { activity = it }
            assertTrue(activity!!.greenDrawn.await(10, TimeUnit.SECONDS))
            awaitCapture(sc, "janela") { a, done ->
                ScreenCapture.capture(a.window, a.window.decorView, Handler(Looper.getMainLooper())) { b, _ -> done(b) }
            }
        }
    }

    @Test
    fun legacyCapture_includesTextureVideo() {
        ActivityScenario.launch(ScreenCaptureTestActivity::class.java).use { sc ->
            var activity: ScreenCaptureTestActivity? = null
            sc.onActivity { activity = it }
            assertTrue(activity!!.greenDrawn.await(10, TimeUnit.SECONDS))
            awaitCapture(sc, "legado") { a, done -> done(ScreenCapture.captureLegacy(a.window.decorView)) }
        }
    }

    @Test
    fun output_isDownscaledToProtectWeakBoxes() {
        assertTrue(ScreenCapture.scaledSize(3840, 2160).let { maxOf(it.first, it.second) } <= ScreenCapture.MAX_SIDE_PX)
        assertTrue(ScreenCapture.scaledSize(1280, 720) == (1280 to 720))
        assertTrue(ScreenCapture.scaledSize(2160, 3840).let { it.second <= ScreenCapture.MAX_SIDE_PX && it.first < it.second })
    }
}

package com.antigravity.player.util

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.view.PixelCopy
import com.antigravity.core.util.Logger
import java.io.File

/**
 * Sonda de DEPURAÇÃO da reprodução (desligada por padrão): amostra a luminância real da tela (~25x/s, PixelCopy reduzido
 * para 32x18) e registra todo trecho preto/vazio. Serve para PROVAR, com número, que as transições entre mídias não
 * têm buraco (quadro preto) — em vez de julgar a olho. Só liga se existir o arquivo `files/probe_enabled` no app
 * (criado via `adb shell run-as ... touch files/probe_enabled`); em produção o arquivo não existe e nada roda.
 *
 * Log: `PROBE_BLACK start` / `PROBE_BLACK end dur=Xms` e um resumo por segundo `PROBE_SEC min=.. avg=.. max=..`.
 */
object PlaybackProbe {
    private const val FLAG_FILE = "probe_enabled"
    private const val SAMPLE_EVERY_MS = 40L
    private const val BLACK_LUM = 12

    @Volatile private var thread: HandlerThread? = null

    fun startIfEnabled(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!File(activity.filesDir, FLAG_FILE).exists()) return
        if (thread != null) return
        val t = HandlerThread("PlaybackProbe").also { it.start() }
        thread = t
        val handler = Handler(t.looper)
        val dest = Bitmap.createBitmap(32, 18, Bitmap.Config.ARGB_8888)
        val pixels = IntArray(32 * 18)
        var blackSince = -1L
        var secStart = SystemClock.elapsedRealtime()
        var secMin = 255; var secMax = 0; var secSum = 0L; var secN = 0
        Logger.w("PROBE", "Sonda de reprodução ATIVA (${SAMPLE_EVERY_MS}ms)")

        val tick = object : Runnable {
            override fun run() {
                try {
                    PixelCopy.request(activity.window, dest, { result ->
                        val now = SystemClock.elapsedRealtime()
                        if (result == PixelCopy.SUCCESS) {
                            dest.getPixels(pixels, 0, 32, 0, 0, 32, 18)
                            var sum = 0L
                            for (p in pixels) sum += (0.299 * Color.red(p) + 0.587 * Color.green(p) + 0.114 * Color.blue(p)).toInt()
                            val lum = (sum / pixels.size).toInt()
                            if (lum < secMin) secMin = lum; if (lum > secMax) secMax = lum; secSum += lum; secN++
                            if (lum < BLACK_LUM) {
                                if (blackSince < 0) { blackSince = now; Logger.w("PROBE", "PROBE_BLACK start t=$now") }
                            } else if (blackSince >= 0) {
                                Logger.w("PROBE", "PROBE_BLACK end dur=${now - blackSince}ms t=$now"); blackSince = -1
                            }
                            if (now - secStart >= 1000) {
                                Logger.i("PROBE", "PROBE_SEC min=$secMin avg=${if (secN > 0) secSum / secN else 0} max=$secMax n=$secN")
                                secStart = now; secMin = 255; secMax = 0; secSum = 0; secN = 0
                            }
                        }
                    }, handler)
                } catch (e: Exception) {
                    // janela sem superfície (Activity pausada): tenta de novo no próximo ciclo
                }
                handler.postDelayed(this, SAMPLE_EVERY_MS)
            }
        }
        handler.postDelayed(tick, 1000)
    }
}

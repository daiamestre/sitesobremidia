package com.antigravity.media.util

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.RectF
import android.os.Build
import android.os.Handler
import android.view.PixelCopy
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.Window

/**
 * Captura da tela do Player (UI + vídeo) para o screenshot do painel.
 *
 * O vídeo do ExoPlayer é um TextureView. Em teste no emulador (Android 9) o PixelCopy da janela devolveu o
 * retângulo do vídeo transparente/preto; por isso, em QUALQUER caminho, os TextureViews visíveis são
 * sobrepostos via TextureView.getBitmap() (no mesmo frame, então sobrepor o que o PixelCopy já trouxe é inofensivo).
 *
 * - API 26+: PixelCopy da janela + sobreposição dos TextureViews.
 * - API 23-25 (TV Box antiga) ou PixelCopy falhando: desenho da hierarquia + sobreposição dos TextureViews.
 * - F-198 (modo nitidez): vídeo numa SurfaceView não aparece no desenho da janela; cada SurfaceView visível é copiada
 *   com PixelCopy (Android 7+) e desenhada por cima, no lugar dela.
 * A imagem sai reduzida (lado maior <= [MAX_SIDE_PX]) para não estourar a RAM de boxes fracas nem o upload.
 * Chamar na main thread; [onDone] roda no looper de [handler] (use o da main).
 */
object ScreenCapture {

    const val MAX_SIDE_PX = 1280
    private const val BIG_VIEW_PIXELS = 4_000_000L

    fun capture(window: Window, root: View, handler: Handler, onDone: (bitmap: Bitmap?, error: String?) -> Unit) {
        val w = root.width
        val h = root.height
        if (w <= 0 || h <= 0) {
            onDone(null, "View de exibição com dimensões inválidas (${w}x$h)")
            return
        }
        val (dw, dh) = scaledSize(w, h)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val dest = try {
                Bitmap.createBitmap(dw, dh, Bitmap.Config.ARGB_8888)
            } catch (e: Throwable) {
                onDone(null, "Sem memória para capturar (${dw}x$dh): ${e.message}")
                return
            }
            try {
                PixelCopy.request(window, dest, { result ->
                    if (result == PixelCopy.SUCCESS) {
                        try {
                            val canvas = Canvas(dest)
                            canvas.scale(dw.toFloat() / w, dh.toFloat() / h)
                            overlayTextureViews(root, canvas, IntArray(2).also { root.getLocationInWindow(it) }, dw.toFloat() / w)
                        } catch (e: Throwable) {
                            // mantém o que o PixelCopy trouxe
                        }
                        sobreporSurfaceViews(root, dest, w, h, handler) { onDone(dest, null) }
                    } else {
                        dest.recycle()
                        val legacy = captureLegacy(root)
                        if (legacy != null) sobreporSurfaceViews(root, legacy, w, h, handler) { onDone(legacy, null) }
                        else onDone(null, "PixelCopy falhou (código $result) e o fallback também")
                    }
                }, handler)
                return
            } catch (e: Throwable) {
                dest.recycle()
                // cai para o caminho legado abaixo
            }
        }

        val legacy = captureLegacy(root)
        if (legacy != null) sobreporSurfaceViews(root, legacy, w, h, handler) { onDone(legacy, null) } else onDone(null, "Captura legada falhou")
    }

    /** F-198: copia cada SurfaceView visível (vídeo no plano de hardware) e desenha no lugar dela; depois chama [fim]. */
    private fun sobreporSurfaceViews(root: View, alvo: Bitmap, w: Int, h: Int, handler: Handler, fim: () -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) { fim(); return }
        val lista = mutableListOf<SurfaceView>()
        coletarSurfaceViews(root, lista)
        if (lista.isEmpty()) { fim(); return }
        val rootLoc = IntArray(2).also { root.getLocationInWindow(it) }
        val escalaX = alvo.width.toFloat() / w
        val escalaY = alvo.height.toFloat() / h
        fun proxima(i: Int) {
            if (i >= lista.size) { fim(); return }
            val sv = lista[i]
            val bw = maxOf(1, (sv.width * escalaX).toInt())
            val bh = maxOf(1, (sv.height * escalaY).toInt())
            val quadro = try { Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888) } catch (e: Throwable) { null }
            if (quadro == null) { proxima(i + 1); return }
            try {
                PixelCopy.request(sv, quadro, { r ->
                    if (r == PixelCopy.SUCCESS) {
                        try {
                            val loc = IntArray(2).also { sv.getLocationInWindow(it) }
                            val left = (loc[0] - rootLoc[0]) * escalaX
                            val top = (loc[1] - rootLoc[1]) * escalaY
                            Canvas(alvo).drawBitmap(quadro, null, RectF(left, top, left + bw, top + bh), null)
                        } catch (e: Throwable) { /* fica o que já havia */ }
                    }
                    quadro.recycle()
                    proxima(i + 1)
                }, handler)
            } catch (e: Throwable) {
                quadro.recycle()
                proxima(i + 1)
            }
        }
        proxima(0)
    }

    private fun coletarSurfaceViews(view: View, lista: MutableList<SurfaceView>) {
        if (view.visibility != View.VISIBLE) return
        if (view is SurfaceView) {
            if (view.isShown && view.width > 0 && view.height > 0 && view.holder?.surface?.isValid == true) lista.add(view)
            return
        }
        if (view is ViewGroup) for (i in 0 until view.childCount) coletarSurfaceViews(view.getChildAt(i), lista)
    }

    /** Caminho sem PixelCopy: hierarquia + TextureViews visíveis. Deve rodar na main thread. */
    fun captureLegacy(root: View): Bitmap? {
        val w = root.width
        val h = root.height
        if (w <= 0 || h <= 0) return null
        return try {
            val (dw, dh) = scaledSize(w, h)
            val bmp = Bitmap.createBitmap(dw, dh, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bmp)
            canvas.scale(dw.toFloat() / w, dh.toFloat() / h)
            root.draw(canvas)
            overlayTextureViews(root, canvas, IntArray(2).also { root.getLocationInWindow(it) }, dw.toFloat() / w)
            bmp
        } catch (e: Throwable) {
            null
        }
    }

    /** Desenha o frame atual de cada TextureView visível; [canvas] está em coordenadas da raiz. */
    private fun overlayTextureViews(view: View, canvas: Canvas, rootLoc: IntArray, scale: Float) {
        if (view.visibility != View.VISIBLE) return
        if (view is TextureView) {
            if (view.isAvailable && view.isShown && view.alpha > 0.01f && view.width > 0 && view.height > 0) {
                // Tamanho cheio (comprovado em teste: o getBitmap reduzido devolveu transparente no emulador).
                // Só views acima de ~4 MP pedem o frame reduzido, para não passar de 30 MB em tela 4K.
                val frame = if (view.width.toLong() * view.height > BIG_VIEW_PIXELS) {
                    view.getBitmap(maxOf(1, (view.width * scale).toInt()), maxOf(1, (view.height * scale).toInt()))
                } else {
                    view.getBitmap(view.width, view.height)
                }
                if (frame != null) {
                    val loc = IntArray(2).also { view.getLocationInWindow(it) }
                    val left = (loc[0] - rootLoc[0]).toFloat()
                    val top = (loc[1] - rootLoc[1]).toFloat()
                    canvas.drawBitmap(frame, null, RectF(left, top, left + view.width, top + view.height), null)
                    frame.recycle()
                }
            }
            return
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) overlayTextureViews(view.getChildAt(i), canvas, rootLoc, scale)
        }
    }

    internal fun scaledSize(w: Int, h: Int): Pair<Int, Int> {
        val longest = maxOf(w, h)
        if (longest <= MAX_SIDE_PX) return w to h
        val f = MAX_SIDE_PX.toFloat() / longest
        return maxOf(1, (w * f).toInt()) to maxOf(1, (h * f).toInt())
    }
}

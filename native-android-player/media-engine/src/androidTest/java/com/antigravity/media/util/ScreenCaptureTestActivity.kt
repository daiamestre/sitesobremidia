package com.antigravity.media.util

import android.app.Activity
import android.graphics.Color
import android.graphics.SurfaceTexture
import android.os.Bundle
import android.view.Gravity
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import java.util.concurrent.CountDownLatch

/** Fundo VERMELHO com um TextureView VERDE no centro (simula o vídeo do ExoPlayer em TextureView). */
class ScreenCaptureTestActivity : Activity() {
    val greenDrawn = CountDownLatch(1)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this).apply { setBackgroundColor(Color.RED) }
        val texture = TextureView(this).apply {
            surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
                    val surface = Surface(st)
                    val canvas = surface.lockCanvas(null)
                    canvas.drawColor(Color.GREEN)
                    surface.unlockCanvasAndPost(canvas)
                    surface.release()
                    greenDrawn.countDown()
                }
                override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {}
                override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean = true
                override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}
            }
        }
        root.addView(texture, FrameLayout.LayoutParams(300, 300, Gravity.CENTER))
        setContentView(root)
    }
}

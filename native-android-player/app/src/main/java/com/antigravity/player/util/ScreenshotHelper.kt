package com.antigravity.player.util

import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.SurfaceView
import android.view.Window
import com.antigravity.core.util.Logger
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

object ScreenshotHelper {

    private const val TAG = "Screenshot"

    suspend fun captureScreenshot(window: Window, surfaceView: SurfaceView? = null): ByteArray {
        return suspendCancellableCoroutine { continuation ->
            try {
                // Determine dimensions
                val width = surfaceView?.width ?: window.decorView.width
                val height = surfaceView?.height ?: window.decorView.height
                
                if (width == 0 || height == 0) {
                     continuation.resumeWithException(Exception("View dimensions are 0"))
                     return@suspendCancellableCoroutine
                }

                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

                // If we have a SurfaceView (Video), we MUST use PixelCopy.
                // If just normal view (ImageView), we could use drawing cache, but PixelCopy is safer for everything on Android 8+
                
                val handler = Handler(Looper.getMainLooper())
                
                val listener = PixelCopy.OnPixelCopyFinishedListener { copyResult ->
                    if (copyResult == PixelCopy.SUCCESS) {
                        try {
                            val stream = ByteArrayOutputStream()
                            // Compress to JPG, 70% quality (Good balance for Remote View)
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                            continuation.resume(stream.toByteArray())
                        } catch (e: Exception) {
                            continuation.resumeWithException(e)
                        } finally {
                            bitmap.recycle() // Important!
                        }
                    } else {
                        continuation.resumeWithException(Exception("PixelCopy failed with error code: $copyResult"))
                    }
                }

                if (surfaceView != null) {
                    // Capture specific Surface (Video)
                    PixelCopy.request(surfaceView, bitmap, listener, handler)
                } else {
                    // Capture Whole Window (May be black for DRM content without specific SurfaceView target)
                    PixelCopy.request(window, bitmap, listener, handler)
                }

            } catch (e: Exception) {
                Logger.e(TAG, "Screenshot capture failed", e)
                continuation.resumeWithException(e)
            }
        }
    }
}

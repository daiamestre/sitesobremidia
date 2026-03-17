package com.antigravity.player.util

import android.view.View
import com.antigravity.core.util.Logger

/**
 * [PROFESSIONAL REPRODUCTION MODE]
 * Calcula e aplica a escala matemática exata para preencher a tela inteira (Full Screen)
 * mantendo a proporção original do vídeo (Aspect Ratio).
 * Ideal para displays irregulares ou TV Boxes que ignoram o atributo resize_mode do XML.
 */
object AspectRatioManager {

    /**
     * Aplica o escalonamento "Fill Without Stretch" (Center Crop) na View alvo.
     * 
     * @param targetView A view do player a ser escalonada (ex: PlayerView ou SurfaceView)
     * @param videoWidth Largura real da mídia decodificada
     * @param videoHeight Altura real da mídia decodificada
     */
    fun applyCenterCropScale(targetView: View, videoWidth: Int, videoHeight: Int) {
        if (videoWidth == 0 || videoHeight == 0) return

        targetView.post {
            val viewWidth = targetView.width
            val viewHeight = targetView.height

            if (viewWidth == 0 || viewHeight == 0) return@post

            val scaleX = viewWidth.toFloat() / videoWidth.toFloat()
            val scaleY = viewHeight.toFloat() / videoHeight.toFloat()

            // [SEAMLESS ENGINE] Preenchimento total da tela:
            // Usa o maior fator de escala (Math.max) para preencher os dois eixos,
            // permitindo que o vídeo vaze um pouco pelas bordas se a proporção não bater.
            val scale = Math.max(scaleX, scaleY)

            // Escalona as dimensões do conteúdo renderizado para o tamanho da View
            val finalWidth = (videoWidth * scale).toInt()
            val finalHeight = (videoHeight * scale).toInt()

            // Aplica a proporção (scaleX/scaleY) na própria View
            targetView.scaleX = finalWidth.toFloat() / viewWidth.toFloat()
            targetView.scaleY = finalHeight.toFloat() / viewHeight.toFloat()

            Logger.d("ASPECT_RATIO", "Video: ${videoWidth}x${videoHeight} | View: ${viewWidth}x${viewHeight} | Scale: X=${targetView.scaleX}, Y=${targetView.scaleY}")
        }
    }
}

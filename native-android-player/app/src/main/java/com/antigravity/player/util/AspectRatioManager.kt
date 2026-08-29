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

            // [CORREÇÃO P0] O AspectRatioManager antigo forçava um Math.max() 
            // que dava zoom e cortava as bordas do conteúdo, violando o Aspect Ratio original.
            // Esta lógica foi depreciada em favor do app:resize_mode="fit" nativo do ExoPlayer.
            
            // Não manipulamos mais targetView.scaleX ou scaleY manualmente.
            Logger.d("ASPECT_RATIO", "Video: ${videoWidth}x${videoHeight} | View: ${viewWidth}x${viewHeight} | Scaling bypass applied (Using Native ExoPlayer FIT)")
        }
    }
}

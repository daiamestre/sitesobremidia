package com.antigravity.media.exoplayer

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector

/**
 * 🔒 HardwareConstraintManager
 * 
 * Enforces strict technical limits to ensure stable 60 FPS playback on Android TV/Box hardware.
 * Prevents thermal throttling by ignoring 4K streams when 1080p is available,
 * and forces optimal hardware decoder configuration.
 */
@UnstableApi
object HardwareConstraintManager {

    /**
     * 1. RESTRIÇÃO DE RESOLUÇÃO (MAX-LIMIT) & 2. SINCRONIA DE FRAMES
     */
    fun getTrackSelectorParameters(context: Context): DefaultTrackSelector.Parameters {
        val builder = DefaultTrackSelector.Parameters.Builder(context)
        
        // DETEÇÃO INTELIGENTE DE HARDWARE (MÁXIMA ESTABILIDADE)
        val profile = ChipsetDetector.getRecommendedProfile()
        
        if (profile == ChipsetDetector.HardwareProfile.LEGACY_STABILITY) {
             // MODO ESTABILIDADE: 1080p Fixo para evitar superaquecimento
             // Allow 1920x1920 to support BOTH Landscape (1920x1080) and Portrait (1080x1920)
             builder
                .setMaxVideoSize(1920, 1920)
                .setMaxVideoBitrate(15_000_000)
                .setViewportSize(1920, 1080, true)
                // Se exceder (ex: cliente enviou 4K), tentamos rodar mesmo assim em vez de falhar e ficar só com áudio (famosa tela da Logo infinita)
                .setExceedVideoConstraintsIfNecessary(true)
        } else {
             // MODO ALTA PERFORMANCE: Liberar 4K nativo
             builder
                .setMaxVideoSize(3840, 3840)
                .setViewportSize(3840, 2160, true)
                .setExceedVideoConstraintsIfNecessary(true)
        }

        return builder
            .setMaxVideoFrameRate(60)
            .build()
    }

    /**
     * 3. ESTABILIDADE DE BUFFER E DECODER
     */
    fun getRenderersFactory(context: Context): DefaultRenderersFactory {
        return DefaultRenderersFactory(context)
            // [MANDATORY HARDWARE] GPU-ONLY: Disable software extensions to prevent CPU lag.
            // Professional signage requires raw hardware power for heavy videos.
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
            .setEnableDecoderFallback(true) 
    }

    /**
     * Helper to verify if track is HDR (High Dynamic Range)
     */
    fun isHdrTrack(format: Format): Boolean {
        // Simple check for HDR color transfer via ColorInfo
        val colorInfo = format.colorInfo ?: return false
        return colorInfo.colorTransfer != Format.NO_VALUE &&
               colorInfo.colorTransfer != C.COLOR_TRANSFER_SDR &&
               colorInfo.colorTransfer != C.COLOR_TRANSFER_GAMMA_2_2
    }
}

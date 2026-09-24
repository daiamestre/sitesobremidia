package com.antigravity.core.domain.model

/**
 * [MICRO-GATE P0] Canonical Presentation Resolver for Digital Signage.
 * 
 * Enforces the sovereign contract:
 * PLAYLIST ORIENTATION / RESOLUTION = SOURCE OF TRUTH (Content Composition)
 * DEVICE / DISPLAY ORIENTATION      = PRESENTATION CONTEXT (Physical Surface)
 */
enum class PlaylistOrientation(
    val canonicalName: String,
    val logicalWidth: Int,
    val logicalHeight: Int,
    val aspectRatio: Float
) {
    PORTRAIT_9_16("portrait", 9, 16, 9f / 16f),
    LANDSCAPE_16_9("landscape", 16, 9, 16f / 9f);

    companion object {
        fun fromResolutionOrOrientation(
            resolution: String?,
            fallbackOrientation: String? = null
        ): PlaylistOrientation {
            val resNorm = resolution?.lowercase()?.trim() ?: ""
            val oriNorm = fallbackOrientation?.lowercase()?.trim() ?: ""

            return when {
                resNorm in listOf("9:16", "9x16", "portrait", "vertical", "retrato", "vert") -> PORTRAIT_9_16
                resNorm in listOf("16:9", "16x9", "landscape", "horizontal", "paisagem", "horiz") -> LANDSCAPE_16_9
                oriNorm in listOf("portrait", "vertical", "retrato", "9:16", "9x16") -> PORTRAIT_9_16
                oriNorm in listOf("landscape", "horizontal", "paisagem", "16:9", "16x9") -> LANDSCAPE_16_9
                else -> LANDSCAPE_16_9
            }
        }
    }
}

enum class DevicePhysicalOrientation {
    PORTRAIT,
    LANDSCAPE,
    REVERSE_PORTRAIT,
    REVERSE_LANDSCAPE,
    UNKNOWN;

    companion object {
        fun fromConfig(orientation: Int): DevicePhysicalOrientation {
            return when (orientation) {
                android.content.res.Configuration.ORIENTATION_LANDSCAPE -> LANDSCAPE
                android.content.res.Configuration.ORIENTATION_PORTRAIT -> PORTRAIT
                else -> UNKNOWN
            }
        }
    }
}

enum class ScaleMode {
    FIT_LETTERBOX_OR_PILLARBOX,
    EXACT_FILL
}

data class ResolvedPresentation(
    val logicalOrientation: PlaylistOrientation,
    val deviceOrientation: DevicePhysicalOrientation,
    val displayWidth: Int,
    val displayHeight: Int,
    val viewportWidth: Int,
    val viewportHeight: Int,
    val scaleMode: ScaleMode,
    val isPillarboxed: Boolean,
    val isLetterboxed: Boolean
) {
    fun toLogString(): String {
        return """
            [ORIENTATION_CONTRACT]
            PLAYLIST: orientation=${logicalOrientation.canonicalName} (${logicalOrientation.logicalWidth}:${logicalOrientation.logicalHeight}, ratio=${String.format(java.util.Locale.US, "%.4f", logicalOrientation.aspectRatio)})
            DEVICE: orientation=$deviceOrientation display=${displayWidth}x${displayHeight}
            PRESENTATION: viewport=${viewportWidth}x${viewportHeight} scaleMode=$scaleMode pillarbox=$isPillarboxed letterbox=$isLetterboxed
            CROP=false | STRETCH=false | DISTORTION=false
        """.trimIndent()
    }
}

object PresentationResolver {

    /**
     * Resolves the exact presentation viewport and scaling parameters
     * on the physical display while preserving the playlist composition aspect ratio.
     */
    fun resolve(
        playlistOrientation: PlaylistOrientation,
        displayWidth: Int,
        displayHeight: Int,
        deviceOrientation: DevicePhysicalOrientation = DevicePhysicalOrientation.UNKNOWN
    ): ResolvedPresentation {
        if (displayWidth <= 0 || displayHeight <= 0) {
            return ResolvedPresentation(
                logicalOrientation = playlistOrientation,
                deviceOrientation = deviceOrientation,
                displayWidth = displayWidth,
                displayHeight = displayHeight,
                viewportWidth = displayWidth.coerceAtLeast(1),
                viewportHeight = displayHeight.coerceAtLeast(1),
                scaleMode = ScaleMode.EXACT_FILL,
                isPillarboxed = false,
                isLetterboxed = false
            )
        }

        val displayRatio = displayWidth.toFloat() / displayHeight.toFloat()
        val targetRatio = playlistOrientation.aspectRatio

        // Floating point comparison with 1% tolerance
        val isExactRatio = Math.abs(displayRatio - targetRatio) < 0.02f

        return if (isExactRatio) {
            ResolvedPresentation(
                logicalOrientation = playlistOrientation,
                deviceOrientation = deviceOrientation,
                displayWidth = displayWidth,
                displayHeight = displayHeight,
                viewportWidth = displayWidth,
                viewportHeight = displayHeight,
                scaleMode = ScaleMode.EXACT_FILL,
                isPillarboxed = false,
                isLetterboxed = false
            )
        } else if (displayRatio > targetRatio) {
            // Display is wider than target ratio -> Pillarbox (bars on left & right)
            val computedWidth = Math.round(displayHeight * targetRatio)
            ResolvedPresentation(
                logicalOrientation = playlistOrientation,
                deviceOrientation = deviceOrientation,
                displayWidth = displayWidth,
                displayHeight = displayHeight,
                viewportWidth = computedWidth,
                viewportHeight = displayHeight,
                scaleMode = ScaleMode.FIT_LETTERBOX_OR_PILLARBOX,
                isPillarboxed = true,
                isLetterboxed = false
            )
        } else {
            // Display is taller than target ratio -> Letterbox (bars on top & bottom)
            val computedHeight = Math.round(displayWidth / targetRatio)
            ResolvedPresentation(
                logicalOrientation = playlistOrientation,
                deviceOrientation = deviceOrientation,
                displayWidth = displayWidth,
                displayHeight = displayHeight,
                viewportWidth = displayWidth,
                viewportHeight = computedHeight,
                scaleMode = ScaleMode.FIT_LETTERBOX_OR_PILLARBOX,
                isPillarboxed = false,
                isLetterboxed = true
            )
        }
    }
}

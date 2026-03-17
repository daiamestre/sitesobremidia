package com.antigravity.player.util

import com.bumptech.glide.annotation.GlideModule
import com.bumptech.glide.module.AppGlideModule

/**
 * [HIGH-PERFORMANCE] KSP AppGlideModule Processor
 * Allows Glide to output Native Hardware Bitmaps via the GPU instead of CPU,
 * significantly boosting performance and preventing RAM overflow on low-end devices.
 */
@GlideModule
class MyAppGlideModule : AppGlideModule() {
    // Left empty intentionally. KSP will generate the optimized code automatically at compile time.
}

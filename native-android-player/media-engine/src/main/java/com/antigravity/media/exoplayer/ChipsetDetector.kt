package com.antigravity.media.exoplayer

import android.os.Build
import android.util.Log

object ChipsetDetector {
    private const val TAG = "ChipsetDetector"

    enum class HardwareProfile {
        LEGACY_STABILITY, // 1080p @ 60fps (Allwinner, Rockchip, Amlogic de entrada)
        HIGH_PERFORMANCE  // 4K @ 60fps (Dispositivos Modernos/Potentes)
    }

    fun getRecommendedProfile(): HardwareProfile {
        val board = Build.BOARD.lowercase()
        val hardware = Build.HARDWARE.lowercase()
        val procInfo = getCpuInfo()

        // Assinaturas de processadores de entrada (Allwinner, Rockchip, Amlogic)
        val isLegacy = board.contains("sun8i") || board.contains("sun50i") || 
                       board.contains("rk30") || board.contains("rk32") ||
                       board.contains("rk33") || board.contains("rk35") ||
                       board.contains("p281") || board.contains("p212") ||
                       board.contains("u212") || board.contains("p230") ||
                       hardware.contains("allwinner") || hardware.contains("rockchip") ||
                       hardware.contains("meson") || procInfo.contains("s805") ||
                       procInfo.contains("s905") || procInfo.contains("s912") ||
                       procInfo.contains("h3") || procInfo.contains("h6") ||
                       procInfo.contains("a64") || procInfo.contains("a53")

        return if (isLegacy) {
            Log.i(TAG, "MODO ESTABILIDADE ATIVO: Limitando a 1080p@60fps")
            HardwareProfile.LEGACY_STABILITY
        } else {
            Log.i(TAG, "MODO ALTA PERFORMANCE: Liberando 4K")
            HardwareProfile.HIGH_PERFORMANCE
        }
    }

    private fun getCpuInfo(): String {
        return try { java.util.Scanner(java.io.File("/proc/cpuinfo")).useDelimiter("\\A").next().lowercase() } 
        catch (e: Exception) { "" }
    }
}

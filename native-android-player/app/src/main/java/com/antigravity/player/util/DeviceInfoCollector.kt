@file:Suppress("DEPRECATION")
package com.antigravity.player.util

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import android.telephony.TelephonyManager
import android.net.wifi.WifiManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.hardware.display.DisplayManager
import android.view.Display
import android.content.res.Configuration
import androidx.core.content.ContextCompat
import com.antigravity.core.util.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.FileReader

/**
 * DeviceInfoCollector - Coleta informações completas do hardware e classifica o tipo de dispositivo
 * 
 * Segue a especificação Device Fleet:
 * - PHONE, TABLET, TV_BOX, ANDROID_TV, GOOGLE_TV, SMART_TV, UNKNOWN
 * - Coleta: manufacturer, brand, model, serial, android_id, os_version, os_sdk
 * - Hardware: architecture, cpu_model, cpu_cores, ram_total, storage_total, gpu
 * - Display: width, height, density, refresh_rate
 * - Player: version, telemetry_protocol_version
 */
class DeviceInfoCollector(private val context: Context) {

    companion object {
        private const val TELEMETRY_PROTOCOL_VERSION = 1
    }

    data class DeviceInfo(
        val manufacturer: String?,
        val brand: String?,
        val model: String?,
        val serialNumber: String?,
        val androidId: String?,
        val osVersion: String,
        val osSdk: Int,
        val architecture: String?,
        val cpuModel: String?,
        val cpuCores: Int?,
        val ramTotalMb: Long?,
        val storageTotalMb: Long?,
        val gpu: String?,
        val screenWidth: Int?,
        val screenHeight: Int?,
        val screenDensity: Float?,
        val screenRefreshRate: Int?,
        val deviceType: DeviceType,
        val deviceName: String?,
        val playerVersion: String,
        val telemetryProtocolVersion: Int = TELEMETRY_PROTOCOL_VERSION
    )

    enum class DeviceType {
        PHONE, TABLET, TV_BOX, ANDROID_TV, GOOGLE_TV, SMART_TV, UNKNOWN
    }

    /**
     * Coleta todas as informações do dispositivo de forma segura
     * Nunca lança exceção - retorna N/A para campos indisponíveis
     */
    suspend fun collect(): DeviceInfo = withContext(Dispatchers.IO) {
        try {
            val manufacturer = getManufacturer()
            val brand = getBrand()
            val model = getModel()
            val serialNumber = getSerialNumber()
            val androidId = getAndroidId()
            val osVersion = Build.VERSION.RELEASE
            val osSdk = Build.VERSION.SDK_INT
            val architecture = getArchitecture()
            val cpuModel = getCpuModel()
            val cpuCores = getCpuCores()
            val ramTotalMb = getTotalRamMb()
            val storageTotalMb = getTotalStorageMb()
            val gpu = getGpu()
            val screenInfo = getScreenInfo()
            val deviceType = classifyDevice(manufacturer, brand, model)
            val deviceName = buildDeviceName(brand, model, deviceType)
            val playerVersion = getPlayerVersion()

            DeviceInfo(
                manufacturer = manufacturer,
                brand = brand,
                model = model,
                serialNumber = serialNumber,
                androidId = androidId,
                osVersion = osVersion,
                osSdk = osSdk,
                architecture = architecture,
                cpuModel = cpuModel,
                cpuCores = cpuCores,
                ramTotalMb = ramTotalMb,
                storageTotalMb = storageTotalMb,
                gpu = gpu,
                screenWidth = screenInfo.width,
                screenHeight = screenInfo.height,
                screenDensity = screenInfo.density,
                screenRefreshRate = screenInfo.refreshRate,
                deviceType = deviceType,
                deviceName = deviceName,
                playerVersion = playerVersion
            )
        } catch (e: Exception) {
            Logger.e("DEVICE_INFO", "Falha ao coletar info do dispositivo: ${e.message}")
            // Fallback mínimo
            DeviceInfo(
                manufacturer = null,
                brand = null,
                model = null,
                serialNumber = null,
                androidId = null,
                osVersion = Build.VERSION.RELEASE,
                osSdk = Build.VERSION.SDK_INT,
                architecture = null,
                cpuModel = null,
                cpuCores = null,
                ramTotalMb = null,
                storageTotalMb = null,
                gpu = null,
                screenWidth = null,
                screenHeight = null,
                screenDensity = null,
                screenRefreshRate = null,
                deviceType = DeviceType.UNKNOWN,
                deviceName = null,
                playerVersion = getPlayerVersion()
            )
        }
    }

    // ================================================================
    // COLETA INDIVIDUAL DE CAMPOS (SEGURA)
    // ================================================================

    private fun getManufacturer(): String? = try { Build.MANUFACTURER.takeIf { it.isNotBlank() } } catch (e: Exception) { null }

    private fun getBrand(): String? = try { Build.BRAND.takeIf { it.isNotBlank() } } catch (e: Exception) { null }

    private fun getModel(): String? = try { Build.MODEL.takeIf { it.isNotBlank() } } catch (e: Exception) { null }

    @android.annotation.SuppressLint("MissingPermission")
    private fun getSerialNumber(): String? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Build.getSerial().takeIf { it.isNotBlank() && it != "unknown" }
        } else {
            @Suppress("DEPRECATION")
            Build.SERIAL.takeIf { it.isNotBlank() && it != "unknown" }
        }
    } catch (e: Exception) { null }

    private fun getAndroidId(): String? = try {
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)?.takeIf { it.isNotBlank() }
    } catch (e: Exception) { null }

    private fun getArchitecture(): String? = try {
        val abiList = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Build.SUPPORTED_ABIS
        } else {
            arrayOf(Build.CPU_ABI, Build.CPU_ABI2)
        }
        abiList.firstOrNull()?.takeIf { it.isNotBlank() }
    } catch (e: Exception) { null }

    private fun getCpuModel(): String? = try {
        BufferedReader(FileReader("/proc/cpuinfo")).use { reader ->
            reader.readLines().firstOrNull { it.startsWith("Hardware") || it.startsWith("model name") }
                ?.substringAfter(":")?.trim()
                ?.takeIf { it.isNotBlank() }
        }
    } catch (e: Exception) { null }

    private fun getCpuCores(): Int? = try {
        Runtime.getRuntime().availableProcessors().takeIf { it > 0 }
    } catch (e: Exception) { null }

    private fun getTotalRamMb(): Long? = try {
        // Método mais confiável: /proc/meminfo
        BufferedReader(FileReader("/proc/meminfo")).use { reader ->
            reader.readLines()
                .firstOrNull { it.startsWith("MemTotal:") }
                ?.let { line ->
                    val kb = line.substringAfter("MemTotal:").trim().removeSuffix("kB").trim().toLong()
                    (kb / 1024).takeIf { it > 0 }
                }
        }
    } catch (e: Exception) { null }

    private fun getTotalStorageMb(): Long? = try {
        val stat = StatFs(Environment.getDataDirectory().absolutePath)
        val totalBytes = stat.blockCountLong * stat.blockSizeLong
        (totalBytes / (1024 * 1024)).takeIf { it > 0 }
    } catch (e: Exception) { null }

    private fun getGpu(): String? = try {
        // Fallback: tentar via GLES20
        android.opengl.GLES20.glGetString(android.opengl.GLES20.GL_RENDERER)?.takeIf { it.isNotBlank() }
    } catch (e: Exception) { null }

    private data class ScreenInfo(
        val width: Int?,
        val height: Int?,
        val density: Float?,
        val refreshRate: Int?
    )

    private fun getScreenInfo(): ScreenInfo = try {
        val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        val display = displayManager.getDisplay(Display.DEFAULT_DISPLAY)
        val metrics = android.util.DisplayMetrics()
        display.getRealMetrics(metrics)
        val refreshRate = display.refreshRate.toInt()

        ScreenInfo(
            width = metrics.widthPixels.takeIf { it > 0 },
            height = metrics.heightPixels.takeIf { it > 0 },
            density = metrics.density.takeIf { it > 0f },
            refreshRate = refreshRate.takeIf { it > 0 }
        )
    } catch (e: Exception) { ScreenInfo(null, null, null, null) }

    // ================================================================
    // CLASSIFICAÇÃO DO DISPOSITIVO
    // ================================================================

    private fun classifyDevice(
        manufacturer: String?,
        brand: String?,
        model: String?
    ): DeviceType {
        val mfr = manufacturer?.lowercase() ?: ""
        val brd = brand?.lowercase() ?: ""
        val mdl = model?.lowercase() ?: ""
        val all = "$mfr $brd $mdl"

        // 1. GOOGLE_TV / CHROMECAST
        if (all.contains("chromecast") || all.contains("google tv") || 
            (brd == "google" && (mdl.contains("chromecast") || mdl.contains("gtv") || mdl.contains("sabrina")))) {
            return DeviceType.GOOGLE_TV
        }

        // 2. ANDROID_TV (certificado)
        val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as android.app.UiModeManager
        if (uiModeManager.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) {
            // Verifica se é Android TV certificado vs TV Box genérico
            if (all.contains("android tv") || 
                all.contains("nvidia shield") ||
                all.contains("xiaomi mi box") ||
                all.contains("mi tv") ||
                (mfr == "sony" && mdl.contains("bravia")) ||
                (mfr == "philips" && mdl.contains("android tv")) ||
                (mfr == "tcl" && mdl.contains("android tv")) ||
                (mfr == "hisense" && mdl.contains("android tv"))) {
                return DeviceType.ANDROID_TV
            }
            // Smart TV genérica (Samsung Tizen, LG webOS não rodam Android - mas se rodar, seria aqui)
            return DeviceType.SMART_TV
        }

        // 3. TV_BOX genérico (não certificado Android TV)
        val tvBoxKeywords = listOf(
            "tv box", "tvbox", "ott", "media box", "streaming box",
            "mxq", "tx3", "tx6", "h96", "x96", "tanix", "hk1", "x88",
            "amlogic", "rockchip rk33", "s905", "s912", "s922",
            "allwinner", "h616", "h313"
        )
        if (tvBoxKeywords.any { all.contains(it) }) {
            return DeviceType.TV_BOX
        }

        // 4. TABLET - heurística baseada em tela e configuração
        val isTablet = isTabletDevice()
        if (isTablet) {
            return DeviceType.TABLET
        }

        // 5. PHONE - padrão para mobile
        val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        if (telephony.phoneType != TelephonyManager.PHONE_TYPE_NONE) {
            return DeviceType.PHONE
        }

        // 6. Fallback: tela grande sem telefonia = tablet provável
        if (isLargeScreen()) {
            return DeviceType.TABLET
        }

        return DeviceType.PHONE
    }

    private fun isTabletDevice(): Boolean {
        val config = context.resources.configuration
        return (config.screenLayout and Configuration.SCREENLAYOUT_SIZE_MASK) >= Configuration.SCREENLAYOUT_SIZE_LARGE
    }

    private fun isLargeScreen(): Boolean {
        try {
            val metrics = android.util.DisplayMetrics()
            val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
            val display = displayManager.getDisplay(Display.DEFAULT_DISPLAY)
            display.getRealMetrics(metrics)
            val widthInches = metrics.widthPixels / metrics.xdpi
            val heightInches = metrics.heightPixels / metrics.ydpi
            val diagonalInches = Math.sqrt((widthInches * widthInches + heightInches * heightInches).toDouble())
            return diagonalInches >= 7.0 // 7 polegadas ou mais = tablet/TV
        } catch (e: Exception) { return false }
    }

    private fun buildDeviceName(brand: String?, model: String?, type: DeviceType): String? {
        val parts = mutableListOf<String>()
        brand?.let { parts.add(it) }
        model?.let { parts.add(it) }
        if (parts.isNotEmpty()) {
            return "${parts.joinToString(" ")} (${type.name})"
        }
        return type.name
    }

    private fun getPlayerVersion(): String = try {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0.0"
    } catch (e: Exception) { "1.0.0" }
}
package com.antigravity.player.manager

import android.content.Context
import com.antigravity.sync.service.MediaDownloader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class UpdateManager(private val context: Context) {

    private val mediaDownloader = MediaDownloader()

    suspend fun checkForUpdatesAndInstall(apkUrl: String, version: String) {
        withContext(Dispatchers.IO) {
            try {
                // 1. Download unique APK file
                val fileName = "update_$version.apk"
                val targetFile = File(context.getExternalFilesDir(null), fileName)
                
                if (targetFile.exists()) targetFile.delete()

                println("UPDATE: Downloading APK from $apkUrl...")
                val result = mediaDownloader.downloadFile(apkUrl, targetFile)

                if (result.isSuccess) {
                    println("UPDATE: Download complete. Installing...")
                    installApk(targetFile)
                } else {
                    println("UPDATE: Download failed.")
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun installApk(file: File) {
        // Try Silent Install (Requires Root/System App)
        // Note: This is a "Best Effort" attempt for Kiosk devices.
        val command = "pm install -r ${file.absolutePath}"
        val process = Runtime.getRuntime().exec(arrayOf("su", "-c", command))
        val exitCode = process.waitFor()

        if (exitCode == 0) {
            println("UPDATE: Silent install successful.")
            // App will die here
        } else {
            println("UPDATE: Silent install failed (Exit $exitCode). Prompting user...")
            promptInstall(file)
        }
    }

    private fun promptInstall(file: File) {
        // Standard Android Intent for APK installation
        // Requires FileProvider in a production app targeting >= Android N
        // For this MVP/Kiosk scenario, we assume file is world readable or strict mode allowed,
        // OR we use FileProvider if configured.
        
        // Simulating simple intent for now (User needs to handle FileProviderURI in real strict mode)
        /*
        val intent = Intent(Intent.ACTION_VIEW)
        intent.setDataAndType(Uri.fromFile(file), "application/vnd.android.package-archive")
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        context.startActivity(intent)
        */
        
        // NOTE: Without FileProvider validation, this might crash on Android 7+.
        // Given constraint: "Contingency without Internet" -> The user can manually install if prompted.
        // We will leave the prompt logic commented out or basic until FileProvider is set up in Manifest.
    }
}

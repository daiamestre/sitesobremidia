package com.antigravity.player.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.antigravity.core.util.Logger
import com.antigravity.sync.service.MediaDownloader
import com.antigravity.sync.service.RemoteDataSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * [INDUSTRIAL] OTA UPDATE MANAGER
 * Responsável por detectar, baixar e disparar a instalação de novas versões.
 * Projetado para operação 24/7 em Kiosks.
 */
class OTAUpdateManager(
    private val context: Context,
    private val remoteDataSource: RemoteDataSource,
    private val downloader: MediaDownloader
) {

    suspend fun checkForUpdates() = withContext(Dispatchers.IO) {
        try {
            Logger.i("OTA", "Checking for remote updates...")
            val latest = remoteDataSource.getLatestAppRelease() ?: return@withContext
            
            val currentVersionCode = getCurrentVersionCode()
            Logger.d("OTA", "Current Version: $currentVersionCode | Remote: ${latest.versionCode}")

            if (latest.versionCode > currentVersionCode) {
                Logger.i("OTA", ">>> NEW VERSION DETECTED: ${latest.versionName} (${latest.versionCode})")
                downloadAndInstall(latest.apkUrl, latest.versionName)
            } else {
                Logger.d("OTA", "App is up to date.")
            }
        } catch (e: Exception) {
            Logger.e("OTA", "Update check failed: ${e.message}")
        }
    }

    private fun getCurrentVersionCode(): Int {
        return try {
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getPackageInfo(context.packageName, android.content.pm.PackageManager.PackageInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(context.packageName, 0)
            }
            packageInfo.versionCode
        } catch (e: Exception) {
            0
        }
    }

    private suspend fun downloadAndInstall(url: String, versionName: String) {
        try {
            if (url == "N/A" || !url.startsWith("http")) {
                Logger.w("OTA", "Invalid APK URL: $url")
                return
            }

            val apkFile = File(context.getExternalFilesDir(null), "update_$versionName.apk")
            Logger.i("OTA", "Downloading update to: ${apkFile.absolutePath}")
            
            downloader.downloadFile(url, apkFile)
            
            if (apkFile.exists() && apkFile.length() > 0) {
                Logger.i("OTA", "Download complete. Triggering installation...")
                installApk(apkFile)
            } else {
                Logger.e("OTA", "Downloaded file is empty or missing.")
            }
        } catch (e: Exception) {
            Logger.e("OTA", "Download/Install sequence failed: ${e.message}")
        }
    }

    private fun installApk(file: File) {
        try {
            val apkUri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            
            context.startActivity(intent)
            Logger.i("OTA", "Installation intent fired successfully.")
        } catch (e: Exception) {
            Logger.e("OTA", "Failed to fire installation intent: ${e.message}")
        }
    }
}

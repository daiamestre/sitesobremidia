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
import java.io.FileInputStream
import java.security.MessageDigest

/**
 * [INDUSTRIAL] OTA UPDATE MANAGER
 * Responsável por detectar, baixar, VERIFICAR e disparar a instalação
 * de novas versões. Projetado para operação 24/7 em Kiosks.
 *
 * [SECURITY HARDENING FASE J]
 * - HTTPS OBRIGATÓRIO para a URL do APK (http:// é rejeitado).
 * - Integridade por SHA-256: o APK só é instalado se o hash baixado
 *   bater com o hash publicado na tabela app_releases.sha256.
 * - Anti-downgrade: apenas version_code MAIOR que o instalado.
 * - Instalação SEMPRE via FileProvider (sem root, sem su).
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
                downloadAndInstall(latest.apkUrl, latest.versionName, latest.sha256)
            } else {
                Logger.d("OTA", "App is up to date. (anti-downgrade: remote <= current é ignorado)")
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

    private suspend fun downloadAndInstall(url: String, versionName: String, expectedSha256: String?) {
        try {
            // [SECURITY] HTTPS obrigatório — nunca instalar APK vindo de HTTP
            if (!url.startsWith("https://")) {
                Logger.e("OTA", "REJECTED: APK URL não é HTTPS. OTA abortado. URL=$url")
                return
            }

            // [SECURITY] Hash ausente = release não publicável com integridade.
            // Bloqueia o download (fail-safe): melhor não instalar do que
            // instalar um APK não verificado.
            if (expectedSha256 == null || !expectedSha256.matches(Regex("^[a-fA-F0-9]{64}$"))) {
                Logger.e("OTA", "REJECTED: release sem sha256 válido. OTA abortado.")
                return
            }

            val apkFile = File(context.getExternalFilesDir(null), "update_$versionName.apk")
            if (apkFile.exists()) apkFile.delete()
            Logger.i("OTA", "Downloading update to: ${apkFile.absolutePath}")

            val result = downloader.downloadFile(url, apkFile)
            if (result.isFailure) {
                Logger.e("OTA", "Download failed: ${result.exceptionOrNull()?.message}")
                return
            }

            if (!apkFile.exists() || apkFile.length() == 0L) {
                Logger.e("OTA", "Downloaded file is empty or missing.")
                return
            }

            // [SECURITY] Verificação de integridade SHA-256
            val actualSha256 = sha256Of(apkFile)
            if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
                Logger.e("OTA", "INTEGRITY FAIL: sha256 diverge. Esperado=$expectedSha256 Obtido=$actualSha256")
                apkFile.delete()
                return
            }
            Logger.i("OTA", "SHA-256 verificado com sucesso.")

            // [SECURITY FASE F] Verificação de ASSINATURA do APK (cert pin):
            // quando OTA_RELEASE_CERT_SHA256 está configurado (keystore.properties),
            // o certificado do APK baixado DEVE bater com o pin — caso contrário
            // a instalação é bloqueada (fail-closed). Sem pin configurado, o
            // SHA-256 do arquivo permanece como garantia mínima.
            val pinnedCert = com.antigravity.player.BuildConfig.OTA_RELEASE_CERT_SHA256
            if (pinnedCert.isNotBlank()) {
                if (!pinnedCert.matches(Regex("^[a-fA-F0-9]{64}$"))) {
                    Logger.e("OTA", "REJECTED: OTA_RELEASE_CERT_SHA256 inválido (64 hex exigido).")
                    apkFile.delete()
                    return
                }
                val apkCertSha256 = apkSigningCertSha256(apkFile)
                if (apkCertSha256 == null || !apkCertSha256.equals(pinnedCert, ignoreCase = true)) {
                    Logger.e("OTA", "SIGNATURE FAIL: certificado do APK diverge do pin. " +
                        "Esperado=$pinnedCert Obtido=$apkCertSha256. Instalação bloqueada.")
                    apkFile.delete()
                    return
                }
                Logger.i("OTA", "Assinatura do APK verificada contra o pin de produção.")
            } else {
                Logger.w("OTA", "Pin de certificado não configurado (OTA_RELEASE_CERT_SHA256). " +
                    "Integridade SHA-256 mantida; configure o pin para produção.")
            }

            installApk(apkFile)
        } catch (e: Exception) {
            Logger.e("OTA", "Download/Install sequence failed: ${e.message}")
        }
    }

    private fun sha256Of(file: File): String {
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            FileInputStream(file).use { input ->
                val buffer = ByteArray(8192)
                var read = input.read(buffer)
                while (read != -1) {
                    digest.update(buffer, 0, read)
                    read = input.read(buffer)
                }
            }
            digest.digest().joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            Logger.e("OTA", "sha256 computation failed: ${e.message}")
            ""
        }
    }

    /**
     * [SECURITY FASE F] SHA-256 do certificado de assinatura do APK baixado.
     * Usa PackageManager.getPackageArchiveInfo (API pública; deprecated a
     * partir do 28 mas funcional) para ler o certificado sem instalar.
     * Retorna null se o APK não for assinado ou ilegível (fail-closed).
     */
    @Suppress("DEPRECATION")
    private fun apkSigningCertSha256(apkFile: File): String? {
        return try {
            val pm = context.packageManager
            val pkgInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageArchiveInfo(
                    apkFile.absolutePath,
                    android.content.pm.PackageManager.PackageInfoFlags.of(
                        android.content.pm.PackageManager.GET_SIGNATURES.toLong()
                    )
                )
            } else {
                pm.getPackageArchiveInfo(
                    apkFile.absolutePath,
                    android.content.pm.PackageManager.GET_SIGNATURES
                )
            }
            val cert = pkgInfo?.signatures?.firstOrNull() ?: return null
            val digest = MessageDigest.getInstance("SHA-256")
            digest.update(cert.toByteArray())
            digest.digest().joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            Logger.e("OTA", "Failed to read APK signing certificate: ${e.message}")
            null
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
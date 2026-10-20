@file:Suppress("DEPRECATION")
package com.antigravity.player.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.antigravity.core.util.Logger
import com.antigravity.player.util.OtaPolicy.Resultado
import com.antigravity.player.util.OtaStatus.Estado
import com.antigravity.sync.service.MediaDownloader
import com.antigravity.sync.service.RemoteDataSource
import com.antigravity.sync.service.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

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
 * - Instalação: Device Owner ou root = silenciosa; nos outros aparelhos só abre o instalador a pedido do painel (F-194).
 *
 * F-183 — o aparelho AVISA NA TELA (OtaStatus) que está atualizando e para qual versão; pergunta por versão nova logo ao abrir
 * e a cada 15 minutos; não baixa de novo o que já baixou; instala por sessão do PackageInstaller (silencioso em Device Owner e,
 * no Android 12+, quando este app foi quem instalou a versão atual).
 */
class OTAUpdateManager(
    private val context: Context,
    private val remoteDataSource: RemoteDataSource,
    private val downloader: MediaDownloader
) {

    companion object {
        /** Uma checagem por vez em todo o processo (o gerenciador é recriado a cada uso). */
        private val emAndamento = AtomicBoolean(false)
        private const val PREFS = "ota_prefs"
        private const val CHAVE_ULTIMO_PEDIDO = "ultimo_pedido_instalacao_ms"
    }

    suspend fun checkForUpdates(): Resultado = withContext(Dispatchers.IO) {
        if (!emAndamento.compareAndSet(false, true)) return@withContext Resultado.ATUALIZANDO
        try {
            Logger.i("OTA", "Checking for remote updates...")
            val resposta = remoteDataSource.fetchLatestAppRelease()
            val latest = resposta.getOrElse {
                Logger.w("OTA", "Sem resposta do servidor de versões: ${it.message}")
                return@withContext Resultado.SEM_RESPOSTA
            } ?: return@withContext Resultado.EM_DIA

            val currentVersionCode = getCurrentVersionCode()
            Logger.d("OTA", "Current Version: $currentVersionCode | Remote: ${latest.versionCode}")

            if (latest.versionCode > currentVersionCode) {
                Logger.i("OTA", ">>> NEW VERSION DETECTED: ${latest.versionName} (${latest.versionCode})")
                downloadAndInstall(latest.apkUrl, latest.versionName, latest.sha256)
            } else {
                Logger.d("OTA", "App is up to date. (anti-downgrade: remote <= current é ignorado)")
                Resultado.EM_DIA
            }
        } catch (e: Exception) {
            Logger.e("OTA", "Update check failed: ${e.message}")
            Resultado.FALHOU
        } finally {
            emAndamento.set(false)
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

    /** Conta ao painel (screens.status_note) em que pé está a atualização deste aparelho. */
    private suspend fun informarPainel(texto: String) {
        try {
            val tela = SessionManager.currentUUID ?: return
            remoteDataSource.updateScreenActionStatus(tela, "AppUpdate", texto)
        } catch (e: Exception) {
            Logger.w("OTA", "Não foi possível avisar o painel: ${e.message}")
        }
    }

    private fun falhou(versao: String, motivo: String): Resultado {
        Logger.e("OTA", motivo)
        OtaStatus.definir(Estado.Falhou(versao))
        return Resultado.FALHOU
    }

    private suspend fun downloadAndInstall(url: String, versionName: String, expectedSha256: String?): Resultado {
        try {
            // [SECURITY] HTTPS obrigatório — nunca instalar APK vindo de HTTP
            if (!url.startsWith("https://")) {
                return falhou(versionName, "REJECTED: APK URL não é HTTPS. OTA abortado. URL=$url")
            }

            // [SECURITY] Hash ausente = release não publicável com integridade.
            // Bloqueia o download (fail-safe): melhor não instalar do que
            // instalar um APK não verificado.
            if (expectedSha256 == null || !expectedSha256.matches(Regex("^[a-fA-F0-9]{64}$"))) {
                return falhou(versionName, "REJECTED: release sem sha256 válido. OTA abortado.")
            }

            val apkFile = File(context.getExternalFilesDir(null), "update_$versionName.apk")

            // Já baixado e íntegro (instalador aguardando toque): não baixa de novo e não reabre o instalador toda hora.
            val jaBaixado = apkFile.exists() && apkFile.length() > 0L && sha256Of(apkFile).equals(expectedSha256, ignoreCase = true)
            if (jaBaixado) {
                val agora = System.currentTimeMillis()
                val ultimo = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(CHAVE_ULTIMO_PEDIDO, 0L)
                if (!OtaPolicy.podePedirInstalacao(ultimo, agora) && !OtaPolicy.pedidoDoPainelAtivo(agora)) {
                    Logger.i("OTA", "Versão $versionName já baixada e aguardando a instalação; não reabro o instalador agora.")
                    OtaStatus.definir(Estado.AguardandoConfirmacao(versionName))
                    return Resultado.ATUALIZANDO
                }
                Logger.i("OTA", "Versão $versionName já baixada e verificada: indo direto à instalação.")
            } else {
                if (apkFile.exists()) apkFile.delete()

                // [P1-01] Storage Guard
                val usableSpace = context.getExternalFilesDir(null)?.usableSpace ?: 0L
                if (usableSpace < 250_000_000L) { // 250 MB
                    return falhou(versionName, "STORAGE GUARD: Espaço insuficiente para OTA. Disponível: ${usableSpace / 1024 / 1024}MB. Exigido: 250MB.")
                }

                Logger.i("OTA", "Downloading update to: ${apkFile.absolutePath}")
                OtaStatus.definir(Estado.Baixando(versionName, null))
                informarPainel("$versionName: baixando")

                var ultimoPct = -1
                val result = downloader.downloadFile(url, apkFile) { lido, total ->
                    if (total > 0) {
                        val pct = (lido * 100 / total).toInt().coerceIn(0, 100)
                        if (pct >= ultimoPct + 2 || pct == 100) {
                            ultimoPct = pct
                            OtaStatus.definir(Estado.Baixando(versionName, pct))
                        }
                    }
                }
                if (result.isFailure) {
                    return falhou(versionName, "Download failed: ${result.exceptionOrNull()?.message}")
                }

                if (!apkFile.exists() || apkFile.length() == 0L) {
                    return falhou(versionName, "Downloaded file is empty or missing.")
                }

                // [SECURITY] Verificação de integridade SHA-256
                val actualSha256 = sha256Of(apkFile)
                if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
                    apkFile.delete()
                    return falhou(versionName, "INTEGRITY FAIL: sha256 diverge. Esperado=$expectedSha256 Obtido=$actualSha256")
                }
                Logger.i("OTA", "SHA-256 verificado com sucesso.")
            }

            // [SECURITY FASE F] Verificação de ASSINATURA do APK (cert pin):
            // quando OTA_RELEASE_CERT_SHA256 está configurado (keystore.properties),
            // o certificado do APK baixado DEVE bater com o pin — caso contrário
            // a instalação é bloqueada (fail-closed). Sem pin configurado, o
            // SHA-256 do arquivo permanece como garantia mínima.
            val pinnedCert = com.antigravity.player.BuildConfig.OTA_RELEASE_CERT_SHA256
            if (pinnedCert.isNotBlank()) {
                if (!pinnedCert.matches(Regex("^[a-fA-F0-9]{64}$"))) {
                    apkFile.delete()
                    return falhou(versionName, "REJECTED: OTA_RELEASE_CERT_SHA256 inválido (64 hex exigido).")
                }
                val apkCertSha256 = apkSigningCertSha256(apkFile)
                if (apkCertSha256 == null || !apkCertSha256.equals(pinnedCert, ignoreCase = true)) {
                    apkFile.delete()
                    return falhou(versionName, "SIGNATURE FAIL: certificado do APK diverge do pin. " +
                        "Esperado=$pinnedCert Obtido=$apkCertSha256. Instalação bloqueada.")
                }
                Logger.i("OTA", "Assinatura do APK verificada contra o pin de produção.")
            } else {
                Logger.w("OTA", "Pin de certificado não configurado (OTA_RELEASE_CERT_SHA256). " +
                    "Integridade SHA-256 mantida; configure o pin para produção.")
            }

            OtaStatus.definir(Estado.Instalando(versionName))
            informarPainel("$versionName: instalando")
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(CHAVE_ULTIMO_PEDIDO, System.currentTimeMillis()).apply()
            installApk(apkFile)?.let { informarPainel("$versionName: $it") }
            return Resultado.ATUALIZANDO
        } catch (e: Exception) {
            return falhou(versionName, "Download/Install sequence failed: ${e.message}")
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

    /**
     * F-194 — instala SEM interromper a reprodução:
     *  - Device Owner: sessão do PackageInstaller, silenciosa;
     *  - root: `pm install -r` por baixo (RootInstaller), silencioso, e o Player reabre sozinho;
     *  - os outros: a sessão é enviada (no Android 12+ pode passar sem toque), mas o instalador/configuração do Android só
     *    abre na tela se o painel pediu ("Instalar atualização agora"). Devolve a nota para o painel (null = nada a dizer).
     */
    private fun installApk(file: File): String? {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        val donoDoAparelho = dpm.isDeviceOwnerApp(context.packageName)
        // F-201: app de sistema (ROM Sobre Mídia) com permissão de instalar — sessão do PackageInstaller sem toque e sem root
        val appDeSistema = context.checkSelfPermission(android.Manifest.permission.INSTALL_PACKAGES) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val modo = OtaPolicy.modoDeInstalacao(donoDoAparelho, !donoDoAparelho && !appDeSistema && RootInstaller.disponivel(context), appDeSistema)
        val versao = OtaStatus.versaoEmInstalacao ?: "nova versão"
        when (modo) {
            OtaPolicy.ModoDeInstalacao.DONO_DO_APARELHO -> {
                Logger.i("OTA", "Device Owner detected. Starting Silent Install via PackageInstaller.")
                installApkBySession(file)
                return "instalando em silêncio (Device Owner)"
            }
            OtaPolicy.ModoDeInstalacao.APP_DE_SISTEMA -> {
                Logger.i("OTA", "App de sistema (ROM Sobre Mídia): instalação silenciosa pelo PackageInstaller.")
                installApkBySession(file)
                return "instalando em silêncio (app de sistema)"
            }
            OtaPolicy.ModoDeInstalacao.ROOT -> {
                // se der certo o processo é encerrado aqui dentro e a versão nova abre sozinha
                val nota = RootInstaller.instalar(context, file)
                Logger.w("OTA", "Instalação por root não concluiu: $nota. Seguindo pela sessão do PackageInstaller.")
                installApkBySession(file)
                return nota
            }
            OtaPolicy.ModoDeInstalacao.PEDIR_TOQUE -> Unit
        }
        val podeAbrir = OtaPolicy.podeAbrirTelaDoAndroid()
        // F-183: sem a permissão "instalar apps desconhecidos" o Android recusa a instalação (e o aparelho ficava mudo)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            OtaStatus.definir(Estado.PrecisaPermissao(versao))
            if (!podeAbrir) {
                Logger.w("OTA", "Sem permissão de instalar apps desconhecidos; a tela de configuração só abre a pedido do painel.")
                return "$versao: pronta, falta liberar \"instalar apps desconhecidos\" no aparelho (use \"Instalar atualização agora\" com alguém ao lado da TV)"
            }
            Logger.w("OTA", "Sem permissão de instalar apps desconhecidos: abrindo a tela de configuração do Android (pedido do painel).")
            DeviceControl.suppressExitCountUntilMs = System.currentTimeMillis() + 180_000L
            try {
                context.startActivity(
                    Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (e: Exception) {
                Logger.e("OTA", "Tela de permissão indisponível neste aparelho: ${e.message}")
            }
            return null
        }
        Logger.i("OTA", "Instalação por sessão do PackageInstaller (silenciosa no Android 12+ se este app instalou a versão atual; " +
            "senão aguarda: o instalador só abre a pedido do painel).")
        installApkBySession(file)
        return if (podeAbrir) null else OtaPolicy.notaPrecisaDeToque(versao)
    }

    /** Para testes no aparelho (androidTest): instala um APK local pelo mesmo caminho da atualização. */
    @androidx.annotation.VisibleForTesting
    internal fun instalarArquivoParaTeste(file: File, versao: String) {
        OtaStatus.definir(Estado.Instalando(versao))
        installApk(file)
    }

    private fun installApkBySession(file: File) {
        try {
            val packageInstaller = context.packageManager.packageInstaller
            // pedidos antigos que ninguém confirmou não ficam acumulados
            for (antiga in packageInstaller.mySessions) {
                try { packageInstaller.abandonSession(antiga.sessionId) } catch (_: Exception) { /* já encerrada */ }
            }
            val params = android.content.pm.PackageInstaller.SessionParams(android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(context.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                params.setRequireUserAction(android.content.pm.PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            val sessionId = packageInstaller.createSession(params)
            val session = packageInstaller.openSession(sessionId)

            val out = session.openWrite("package", 0, -1)
            val input = FileInputStream(file)
            input.copyTo(out)
            session.fsync(out)
            input.close()
            out.close()

            // Receptor canônico dedicado para telemetria e governança do PackageInstaller
            val intent = Intent(context, com.antigravity.player.receiver.OTAInstallReceiver::class.java).apply {
                action = com.antigravity.player.receiver.OTAInstallReceiver.ACTION_INSTALL_STATUS
            }
            val pendingIntent = android.app.PendingIntent.getBroadcast(
                context,
                sessionId,
                intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE
            )
            session.commit(pendingIntent.intentSender)
            Logger.i("OTA", "PackageInstaller session committed with canonical OTAInstallReceiver callback.")
        } catch (e: Exception) {
            Logger.e("OTA", "Instalação por sessão falhou: ${e.message}.")
            if (OtaPolicy.podeAbrirTelaDoAndroid()) installApkWithIntent(file)
            else OtaStatus.versaoEmInstalacao?.let { OtaStatus.definir(Estado.AguardandoConfirmacao(it)) }
        }
    }

    private fun installApkWithIntent(file: File) {
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

            // [EXIT COUNTER P0] O instalador externo e configuracao necessaria do
            // proprio Player: nao conta como saida/abandono do usuario.
            DeviceControl.suppressExitCountUntilMs = System.currentTimeMillis() + 180_000L
            OtaStatus.versaoEmInstalacao?.let { OtaStatus.definir(Estado.AguardandoConfirmacao(it)) }
            context.startActivity(intent)
            Logger.i("OTA", "Installation intent fired successfully.")
        } catch (e: Exception) {
            Logger.e("OTA", "Failed to fire installation intent: ${e.message}")
            OtaStatus.versaoEmInstalacao?.let { OtaStatus.definir(Estado.Falhou(it)) }
        }
    }
}

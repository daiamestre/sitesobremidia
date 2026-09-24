@file:Suppress("DEPRECATION")
package com.antigravity.player.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import com.antigravity.core.util.Logger
import com.antigravity.player.ui.SplashActivity

/**
 * SOBRE MÍDIA — OTA Install Status Receiver
 *
 * Receptor dedicado para telemetria e governança de ciclos do PackageInstaller.
 * Processa os status de instalação OTA, registra erros de forma observável
 * e garante rollback automático (a versão atual continua ativa e ininterrupta se falhar).
 */
class OTAInstallReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_INSTALL_STATUS = "com.antigravity.player.OTA_INSTALL_STATUS"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "No status message"
        val otherPackage = intent.getStringExtra(PackageInstaller.EXTRA_OTHER_PACKAGE_NAME)

        Logger.i("OTA_INSTALL_RECEIVER", "OTA PackageInstaller callback received with status: $status ($message)")

        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                Logger.w("OTA_INSTALL_RECEIVER", "Instalação exige ação do usuário (fallback para intent manual).")
                val confirmationIntent = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirmationIntent != null) {
                    confirmationIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    try {
                        context.startActivity(confirmationIntent)
                    } catch (e: Exception) {
                        Logger.e("OTA_INSTALL_RECEIVER", "Falha ao abrir diálogo de confirmação: ${e.message}")
                    }
                }
            }

            PackageInstaller.STATUS_SUCCESS -> {
                Logger.i("OTA_INSTALL_RECEIVER", "🎉 OTA INSTALL SUCCESS: Pacote instalado com sucesso absoluto pelo sistema.")
                // Reinicia a aplicação de forma limpa para carregar a nova versão
                val restartIntent = Intent(context, SplashActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                }
                try {
                    context.startActivity(restartIntent)
                } catch (e: Exception) {
                    Logger.e("OTA_INSTALL_RECEIVER", "Falha ao reiniciar app pós-sucesso OTA: ${e.message}")
                }
            }

            PackageInstaller.STATUS_FAILURE -> {
                Logger.e("OTA_INSTALL_RECEIVER", "❌ OTA INSTALL FAILED (STATUS_FAILURE): $message")
                recordRollbackTelemetry(status, message)
            }

            PackageInstaller.STATUS_FAILURE_ABORTED -> {
                Logger.w("OTA_INSTALL_RECEIVER", "⚠️ OTA INSTALL ABORTED: Instalação abortada pelo sistema ou usuário: $message")
                recordRollbackTelemetry(status, message)
            }

            PackageInstaller.STATUS_FAILURE_BLOCKED -> {
                Logger.e("OTA_INSTALL_RECEIVER", "❌ OTA INSTALL BLOCKED: Instalação bloqueada por política ou administrador: $message")
                recordRollbackTelemetry(status, message)
            }

            PackageInstaller.STATUS_FAILURE_CONFLICT -> {
                Logger.e("OTA_INSTALL_RECEIVER", "❌ OTA INSTALL CONFLICT: Conflito com pacote existente ($otherPackage): $message")
                recordRollbackTelemetry(status, message)
            }

            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> {
                Logger.e("OTA_INSTALL_RECEIVER", "❌ OTA INSTALL INCOMPATIBLE: APK incompatível com hardware/SDK (ABI/minSdk): $message")
                recordRollbackTelemetry(status, message)
            }

            PackageInstaller.STATUS_FAILURE_INVALID -> {
                Logger.e("OTA_INSTALL_RECEIVER", "❌ OTA INSTALL INVALID: APK corrompido, assinatura inválida ou parse falhou: $message")
                recordRollbackTelemetry(status, message)
            }

            PackageInstaller.STATUS_FAILURE_STORAGE -> {
                Logger.e("OTA_INSTALL_RECEIVER", "❌ OTA INSTALL STORAGE: Espaço em disco insuficiente no dispositivo: $message")
                recordRollbackTelemetry(status, message)
            }

            else -> {
                Logger.w("OTA_INSTALL_RECEIVER", "Status desconhecido recebido do PackageInstaller: $status ($message)")
                recordRollbackTelemetry(status, message)
            }
        }
    }

    private fun recordRollbackTelemetry(statusCode: Int, errorMsg: String) {
        // Telemetria segura: a versão atual permanece ativa e a falha é registrada
        Logger.i("OTA_TELEMETRY", "SAFE ROLLBACK: Versão atual preservada e ativa. Status code: $statusCode. Erro: $errorMsg")
    }
}

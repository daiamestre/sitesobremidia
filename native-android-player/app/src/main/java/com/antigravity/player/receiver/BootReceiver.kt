package com.antigravity.player.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.antigravity.core.util.Logger
import com.antigravity.player.ui.SplashActivity

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Logger.i("BOOT_RECEIVER", "Intent recebido: $action")

        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON" ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED // F-183: acabou de ser atualizado — volta a tocar sem ninguém tocar na tela
        ) {
            // F-214: ROM Sobre Mídia com o Player ainda nunca aberto pela pessoa — liga só na launcher, o Player espera o 1º toque
            val launcherDoAparelho = com.antigravity.player.launcher.LauncherDoAparelho
            if (!launcherDoAparelho.playerLiberado(context)) {
                if (action != Intent.ACTION_MY_PACKAGE_REPLACED) Thread { launcherDoAparelho.aplicarRom(context.applicationContext) }.start()
                Logger.i("BOOT_RECEIVER", "ROM Sobre Mídia: o Player só abre depois que a pessoa o abrir pela 1ª vez.")
                return
            }
            // F-200: aparelho que usa a launcher Sobre Mídia: ao LIGAR aparece a launcher (nunca a original antes); ela
            // abre o Player sozinha depois da contagem. Atualização do app (MY_PACKAGE_REPLACED) volta direto ao Player.
            if (action != Intent.ACTION_MY_PACKAGE_REPLACED) {
                val launcher = com.antigravity.player.launcher.LauncherDoAparelho
                // F-201: ROM Sobre Mídia — a launcher já nasce escolhida (Player é app de sistema e tem root)
                if (launcher.ehRomSobreMidia()) Thread { launcher.aplicarRom(context.applicationContext) }.start()
                if (launcher.ativa(context) && launcher.ehPadrao(context)) {
                    Logger.i("BOOT_RECEIVER", "Launcher Sobre Mídia é a tela inicial: ela abre o Player após a contagem.")
                    return
                }
                if (launcher.precisaDeVigia(context)) {
                    Logger.i("BOOT_RECEIVER", "Launcher Sobre Mídia escolhida (modo forçado): abrindo a launcher.")
                    try {
                        context.startActivity(Intent(context, com.antigravity.player.launcher.LauncherActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        return
                    } catch (e: Exception) {
                        Logger.e("BOOT_RECEIVER", "Launcher não abriu (${e.message}); abrindo o Player.")
                    }
                }
            }
            Logger.i("BOOT_RECEIVER", "Iniciando Sobre Midia Player automaticamente...")
            
            // [O GUARDIÃO DO BOOT]
            // Inicia a SplashActivity para carregar o ciclo natural (Auth -> Main)
            val launchIntent = Intent(context, SplashActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            }
            
            try {
                context.startActivity(launchIntent)
            } catch (e: Exception) {
                Logger.e("BOOT_RECEIVER", "Falha ao iniciar Activity pós-boot: ${e.message}")
            }
        }
    }
}

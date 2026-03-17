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
            action == "com.htc.intent.action.QUICKBOOT_POWERON"
        ) {
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

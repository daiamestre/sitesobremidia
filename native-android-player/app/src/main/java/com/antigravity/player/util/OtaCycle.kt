package com.antigravity.player.util

import android.content.Context
import com.antigravity.core.util.Logger
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.OtaPolicy.Resultado
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * F-183 — o aparelho pergunta por versão nova do aplicativo LOGO que o aplicativo abre (antes: 10 s depois da tela de
 * reprodução, e depois só a cada 12 h) e segue perguntando a cada 15 minutos. Roda no processo, não na tela: vale também
 * quando o aparelho está parado no login ou na escolha de tela.
 */
object OtaCycle {
    private var job: Job? = null

    fun start(context: Context, scope: CoroutineScope) {
        if (job?.isActive == true) return
        val app = context.applicationContext
        job = scope.launch(Dispatchers.IO) {
            var falhasSeguidas = 0
            while (isActive) {
                val resultado = try {
                    ServiceLocator.init(app)
                    ServiceLocator.getOTAUpdateManager(app).checkForUpdates()
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    Logger.e("OTA", "Ciclo de atualização: ${e.message}")
                    Resultado.FALHOU
                }
                falhasSeguidas = if (resultado == Resultado.SEM_RESPOSTA || resultado == Resultado.FALHOU) falhasSeguidas + 1 else 0
                delay(OtaPolicy.proximaChecagemMs(resultado, falhasSeguidas))
            }
        }
    }

    /** Pergunta agora (comando "atualizar aplicativo" do painel). */
    suspend fun checarAgora(context: Context): Resultado = try {
        ServiceLocator.init(context.applicationContext)
        ServiceLocator.getOTAUpdateManager(context.applicationContext).checkForUpdates()
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        Resultado.FALHOU
    }
}

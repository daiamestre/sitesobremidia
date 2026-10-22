package com.antigravity.player.util

import android.content.Context
import com.antigravity.core.util.Logger
import com.antigravity.player.di.ServiceLocator
import com.antigravity.sync.service.SessionManager

/**
 * F-207 — o "anti-queda" do app (UserApplication) engolia os erros: a tela que quebrava sumia e o Player era reaberto, sem
 * ninguém saber o motivo (assim a launcher que quebrava no Android 7.1 aparecia só como "Home → Sincronizando mídias").
 * Agora o erro fica guardado no aparelho (gravação imediata, sobrevive à reabertura) e vai ao painel (device_logs,
 * tipo FALHA_APP) assim que houver aparelho vinculado.
 */
object FalhaDoApp {
    private const val PREFS = "falhas_do_app"
    private const val K_TEXTO = "ultima"

    /** Chamada de dentro do tratador de erro: só grava (sem rede). */
    fun guardar(ctx: Context, onde: String, erro: Throwable) {
        try {
            val pilha = android.util.Log.getStackTraceString(erro).take(6_000)
            val texto = "${System.currentTimeMillis()}|$onde|${erro.javaClass.name}: ${erro.message}\n$pilha"
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(K_TEXTO, texto).commit()
        } catch (e: Throwable) { }
    }

    /** Envia ao painel a falha guardada (se houver) e apaga. Rodar fora da thread principal. */
    suspend fun enviar(ctx: Context) {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val texto = prefs.getString(K_TEXTO, null) ?: return
        val aparelho = SessionManager.deviceIdentityHash ?: return
        try {
            val titulo = texto.substringBefore('\n').substringAfter('|')
            ServiceLocator.getRemoteDataSource().insertErrorLog(aparelho, "FALHA_APP", titulo.take(500), texto.substringAfter('\n'))
            prefs.edit().remove(K_TEXTO).apply()
        } catch (e: Exception) { Logger.w("FALHA_APP", "falha não enviada: ${e.message}") }
    }
}

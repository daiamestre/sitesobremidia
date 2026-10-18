package com.antigravity.core.util

import android.util.Log

/**
 * Centralized Logger for the Player.
 * Wraps Android Log and allows for future remote logging (Sentry/Supabase).
 *
 * F-197 — nada de segredo no registro: as falhas de rede da biblioteca do Supabase trazem na mensagem os cabeçalhos da
 * requisição (login "Bearer eyJ…", chave "apikey", X-Device-ID). Toda mensagem e todo erro passam por [limpar] antes de
 * ir para o registro do Android.
 */
object Logger {
    private const val TAG_PREFIX = "Antigravity_"

    private val JWT = Regex("eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}")
    private val LINHA_DE_CABECALHOS = Regex("(?m)^\\s*Headers:.*$")
    private val CABECALHO_SENSIVEL = Regex("(?i)(authorization|apikey|x-device-id|x-tenant-id)=\\[[^\\]]*\\]")

    /** Tira login (JWT), chaves e a linha de cabeçalhos de um texto de registro. */
    fun limpar(texto: String?): String {
        if (texto.isNullOrEmpty()) return texto ?: ""
        return texto
            .replace(LINHA_DE_CABECALHOS, "Headers: [ocultos]")
            .replace(CABECALHO_SENSIVEL) { "${it.groupValues[1]}=[oculto]" }
            .replace(JWT, "[token oculto]")
    }

    private fun comErro(message: String, e: Throwable?): String =
        if (e == null) limpar(message) else limpar(message) + "\n" + limpar(Log.getStackTraceString(e))

    fun d(tag: String, message: String) {
        Log.d("$TAG_PREFIX$tag", limpar(message))
    }

    fun i(tag: String, message: String) {
        Log.i("$TAG_PREFIX$tag", limpar(message))
    }

    fun w(tag: String, message: String, e: Throwable? = null) {
        Log.w("$TAG_PREFIX$tag", comErro(message, e))
    }

    fun e(tag: String, message: String, e: Throwable? = null) {
        Log.e("$TAG_PREFIX$tag", comErro(message, e))
        // TODO: Send to Remote Crash Reporting (Sentry/Supabase)
    }
}

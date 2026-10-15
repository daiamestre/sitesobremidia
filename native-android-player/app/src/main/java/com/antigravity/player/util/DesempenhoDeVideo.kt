package com.antigravity.player.util

/**
 * F-188 — fluidez de cada vídeo exibido, medida no próprio aparelho (quadros exibidos x perdidos e qual decodificador).
 * É o que permite testar no aparelho real qual formato roda liso (ex.: TV Box MXQ 4K: 1080p x 720p, 30 x 24 fps).
 */
object DesempenhoDeVideo {
    /** Decodificador por software (o processador faz tudo; em TV Box fraca = vídeo lento e travando). */
    fun porSoftware(decodificador: String?): Boolean {
        val n = decodificador.orEmpty().lowercase()
        return n.startsWith("omx.google.") || n.startsWith("c2.android.") || n.contains("ffmpeg") || n.contains(".sw.")
    }

    /** Quadros por segundo do formato "LxA@fps" (null se não informado). */
    fun fpsDoFormato(formato: String?): Float? = formato?.substringAfter('@', "")?.toFloatOrNull()?.takeIf { it > 0f }

    /** Quadros que deveriam ter sido exibidos no tempo do item. */
    fun quadrosEsperados(duracaoMs: Long, fps: Float?): Int = if (fps == null || duracaoMs <= 0) 0 else (duracaoMs / 1000f * fps).toInt()

    /** "fluido", "engasgos leves" ou "travando" (perdidos e/ou exibidos bem abaixo do esperado). */
    fun veredito(exibidos: Int, perdidos: Int, esperados: Int): String {
        val total = exibidos + perdidos
        val taxaPerdidos = if (total <= 0) 0f else perdidos.toFloat() / total
        val cobertura = if (esperados <= 0) 1f else exibidos.toFloat() / esperados
        return when {
            taxaPerdidos <= 0.01f && cobertura >= 0.95f -> "fluido"
            taxaPerdidos <= 0.05f && cobertura >= 0.85f -> "engasgos leves"
            else -> "travando"
        }
    }

    /**
     * Quadros do item: diferença entre a leitura inicial e a final quando é o MESMO decodificador (vídeos emendados); se o
     * decodificador foi reaberto no meio (ou não existia no início), a leitura final já conta só o item. Devolve 4 valores.
     */
    fun delta(inicio: IntArray?, fim: IntArray): IntArray {
        val mesmoDecodificador = inicio != null && inicio.size >= 5 && fim.size >= 5 && inicio[4] == fim[4]
        return IntArray(4) { i ->
            when {
                !mesmoDecodificador || i == 2 -> fim[i] // a maior sequência perdida não é somável
                else -> (fim[i] - inicio!![i]).coerceAtLeast(0)
            }
        }
    }
}

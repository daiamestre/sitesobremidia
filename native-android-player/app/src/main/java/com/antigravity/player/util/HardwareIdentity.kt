package com.antigravity.player.util

/**
 * F-182 — texto-base da identidade de hardware do aparelho (vira SHA-256 em DeviceControl.getHardwareIdentity).
 *
 * Aparelho com ANDROID_ID bom: o texto é EXATAMENTE o de antes, então a identidade (e as telas já conectadas) não mudam.
 * Aparelho com ANDROID_ID quebrado (vazio, "unknown", "9774d56d682e549c" — valor repetido em todas as unidades de alguns
 * TV Box/firmwares): todas as unidades do mesmo modelo geravam a MESMA identidade, e o servidor tratava o segundo aparelho
 * como "o mesmo aparelho já conectado a outra tela" (conexão negada). Agora essas unidades usam um sorteio próprio,
 * guardado no aparelho.
 */
object HardwareIdentity {
    private val ANDROID_IDS_QUEBRADOS = setOf("", "unknown", "null", "9774d56d682e549c")

    fun androidIdValido(androidId: String?): Boolean {
        val id = androidId?.trim().orEmpty()
        return id.length >= 5 && id.lowercase() !in ANDROID_IDS_QUEBRADOS
    }

    fun textoBase(androidId: String?, fingerprint: String?, sorteioDoAparelho: () -> String): String {
        val fp = fingerprint ?: "unknown"
        return if (androidIdValido(androidId)) "sobremidia::device::${androidId!!.trim()}::$fp"
        else "sobremidia::device::sorteio::${sorteioDoAparelho()}::$fp"
    }
}

package com.antigravity.player.ui

/**
 * F-194 — na escolha da tela (depois do login) aparece o NOME da tela, o mesmo do painel, e embaixo o ID dela.
 * Antes aparecia o "ID personalizado" no lugar do nome.
 */
object ScreenLabel {
    /** Nome oficial: o nome da tela; só se estiver vazio cai no ID personalizado (e por fim no id interno). */
    fun nome(nome: String?, idPersonalizado: String?, idInterno: String): String =
        nome?.trim()?.takeIf { it.isNotEmpty() } ?: idPersonalizado?.trim()?.takeIf { it.isNotEmpty() } ?: idInterno

    /** Linha de baixo: o código da tela (TEL-AAAA-NNNNNN); sem ele, o ID personalizado se for diferente do nome. */
    fun id(codigoOperacional: String?, idPersonalizado: String?, nome: String?): String? {
        codigoOperacional?.trim()?.takeIf { it.isNotEmpty() }?.let { return "ID: $it" }
        val pers = idPersonalizado?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return if (pers.equals(nome?.trim(), ignoreCase = true)) null else "ID: $pers"
    }
}

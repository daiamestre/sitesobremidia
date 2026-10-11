package com.antigravity.player.util

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * F-183 — o que o aparelho mostra na TELA enquanto o aplicativo se atualiza (e logo depois de atualizado), para quem
 * está olhando saber qual aparelho está atualizando. Sem dependência de Android: as mensagens e as regras de tempo
 * são testadas na JVM; o MainActivity só desenha o texto.
 */
object OtaStatus {

    sealed class Estado {
        object Nenhum : Estado()
        data class Baixando(val versao: String, val percentual: Int?) : Estado()
        data class Instalando(val versao: String) : Estado()
        /** O Android pediu confirmação na tela (aparelho que não é "Device Owner"). */
        data class AguardandoConfirmacao(val versao: String) : Estado()
        /** O Android só instala se o aplicativo tiver a permissão "instalar apps desconhecidos" (liberada uma única vez). */
        data class PrecisaPermissao(val versao: String) : Estado()
        data class Atualizado(val versao: String) : Estado()
        data class Falhou(val versao: String) : Estado()
    }

    private val _estado = MutableStateFlow<Estado>(Estado.Nenhum)
    val estado: StateFlow<Estado> = _estado.asStateFlow()

    /** Versão que está sendo instalada (o receptor do instalador não sabe qual é). */
    @Volatile var versaoEmInstalacao: String? = null
        private set

    fun definir(novo: Estado) {
        when (novo) {
            is Estado.Baixando -> versaoEmInstalacao = novo.versao
            is Estado.Instalando -> versaoEmInstalacao = novo.versao
            else -> Unit
        }
        _estado.value = novo
    }

    /** Texto para a tela (null = não mostrar nada). */
    fun mensagem(e: Estado): String? = when (e) {
        Estado.Nenhum -> null
        is Estado.Baixando -> "Atualizando o aplicativo para a versão ${e.versao}" +
            (e.percentual?.let { " — baixando $it%" } ?: " — baixando…")
        is Estado.Instalando -> "Instalando a versão ${e.versao}… o aplicativo vai reiniciar sozinho"
        is Estado.AguardandoConfirmacao -> "Confirme a instalação da versão ${e.versao} na tela do aparelho"
        is Estado.PrecisaPermissao -> "Para atualizar para a versão ${e.versao}, ative \"Permitir desta fonte\" para o Sobre Mídia Player na tela de configurações do aparelho"
        is Estado.Atualizado -> "Aplicativo atualizado para a versão ${e.versao}"
        is Estado.Falhou -> "Não foi possível atualizar para a versão ${e.versao} agora. O aparelho tenta de novo sozinho."
    }

    /** Quanto tempo o aviso fica na tela (0 = fica enquanto o estado durar). */
    fun duracaoDoAvisoMs(e: Estado): Long = when (e) {
        is Estado.Atualizado -> 10_000L
        is Estado.Falhou -> 20_000L
        is Estado.PrecisaPermissao -> 120_000L
        else -> 0L
    }

    /** O aplicativo acabou de ser atualizado? (código da versão guardado na última abertura × o atual). */
    fun versaoMudou(guardada: Int, atual: Int): Boolean = guardada in 1 until atual
}

/** Quando o aparelho pergunta ao servidor se há versão nova do aplicativo. */
object OtaPolicy {
    /** Resultado de uma checagem. */
    enum class Resultado { EM_DIA, ATUALIZANDO, FALHOU, SEM_RESPOSTA }

    /** Com tudo em dia: uma pergunta leve a cada 15 minutos. */
    const val INTERVALO_NORMAL_MS = 15 * 60_000L

    /** Instalação pendente de toque: o instalador não é reaberto antes disto (não incomoda quem está vendo a tela). */
    const val REPETIR_PEDIDO_DE_INSTALACAO_MS = 30 * 60_000L

    /** Quando perguntar de novo. Sem internet / com falha: tenta logo (20 s, 40 s, 60 s… até 5 min), sem martelar. */
    fun proximaChecagemMs(resultado: Resultado, falhasSeguidas: Int): Long = when (resultado) {
        Resultado.EM_DIA -> INTERVALO_NORMAL_MS
        Resultado.ATUALIZANDO -> 60_000L
        Resultado.SEM_RESPOSTA, Resultado.FALHOU -> (20_000L * falhasSeguidas.coerceAtLeast(1)).coerceAtMost(5 * 60_000L)
    }

    /** Pode abrir de novo o instalador do Android? */
    fun podePedirInstalacao(ultimoPedidoMs: Long, agoraMs: Long): Boolean =
        ultimoPedidoMs <= 0L || agoraMs - ultimoPedidoMs >= REPETIR_PEDIDO_DE_INSTALACAO_MS
}

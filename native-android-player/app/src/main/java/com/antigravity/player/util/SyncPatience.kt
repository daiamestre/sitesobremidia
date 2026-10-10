package com.antigravity.player.util

/**
 * F-181 — quanto o Player espera por uma sincronização antes de desistir dela.
 *
 * O defeito que isto corrige: a primeira sincronização (logo após o login e a escolha da tela) tinha um limite fixo de
 * 30 s para TUDO, inclusive baixar as mídias, e a espera pelos downloads tinha outro limite fixo de 60 s. Playlist com
 * vídeos (dezenas de MB) ou internet lenta estourava o limite: a sincronização era cancelada antes de guardar a playlist,
 * o Player entrava em "modo de contingência" sem ter nada guardado para tocar e ficava preso em "Sincronizando Mídias".
 *
 * Regra nova: enquanto os downloads andam, o Player espera. Só desiste se ficar muito tempo sem nenhum avanço, ou num
 * teto bem largo. O limite curto de 30 s continua valendo APENAS quando já existe uma playlist guardada para tocar
 * (aí a tela começa pelo que tem e a atualização segue em segundo plano).
 */
object SyncPatience {
    /** Com playlist guardada: começa a tocar o que tem depois disto (a atualização continua em segundo plano). */
    const val COM_PLAYLIST_GUARDADA_MS = 30_000L

    /** Sem nenhum avanço (nenhuma mídia concluída, nenhuma mudança de etapa) por este tempo: desiste e tenta de novo. */
    const val SEM_AVANCO_MS = 10 * 60_000L

    /** Teto absoluto de uma sincronização. */
    const val TETO_MS = 60 * 60_000L

    /** A sincronização da abertura do app deve ser abandonada agora? */
    fun desistirDaAbertura(temPlaylistGuardada: Boolean, decorridoMs: Long, semAvancoMs: Long): Boolean =
        if (temPlaylistGuardada) decorridoMs >= COM_PLAYLIST_GUARDADA_MS
        else desistirDosDownloads(decorridoMs, semAvancoMs)

    /** A espera pelos downloads deve ser abandonada agora? */
    fun desistirDosDownloads(decorridoMs: Long, semAvancoMs: Long): Boolean =
        semAvancoMs >= SEM_AVANCO_MS || decorridoMs >= TETO_MS

    /**
     * A orientação da TELA (coluna screens.orientation) mudou de verdade? Compara com o último valor visto da própria
     * coluna — nunca com a orientação efetiva do Player, que vem da playlist. Comparar com a efetiva fazia toda
     * atualização da linha da tela (inclusive o sinal de vida do próprio aparelho) pedir uma sincronização, e cada
     * sincronização atualiza a linha: um laço sem fim sempre que a tela e a playlist tinham orientações diferentes.
     */
    fun orientacaoDaTelaMudou(ultimaVista: String?, recebida: String?): Boolean =
        !recebida.isNullOrBlank() && ultimaVista != null && recebida != ultimaVista
}

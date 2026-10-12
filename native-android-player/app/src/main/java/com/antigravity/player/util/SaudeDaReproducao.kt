package com.antigravity.player.util

/**
 * F-187 — a verdade sobre a tela: há mídia APARECENDO agora? Quem responde é o vigia da imagem (MainActivity), que olha
 * a tela a cada 2 s. O sinal de vida enviado ao servidor usa esta resposta: antes dizia "playing" sempre que existia uma
 * playlist guardada, mesmo com a tela presa em "Sincronizando" ou preta — e o painel mostrava a tela como normal.
 * Sem dependência de Android (testado na JVM).
 */
object SaudeDaReproducao {
    const val STATUS_TOCANDO = "playing"
    const val STATUS_SEM_REPRODUCAO = "sem_reproducao"
    const val STATUS_SINCRONIZANDO = "syncing"
    const val STATUS_BLOQUEADA = "blocked"

    /** Sem item no ar por este tempo (tela liberada) = não está reproduzindo. */
    const val SEM_ITEM_TOLERANCIA_MS = 90_000L
    /** O vigia fala a cada 2 s; sem notícia dele por este tempo, a tela do Player não está aberta. */
    const val VIGIA_SILENCIO_MS = 30_000L
    /** Motor de vídeo reiniciado tantas vezes na janela = o vídeo não inicia neste aparelho. */
    const val REINICIOS_DEMAIS = 3
    const val REINICIOS_JANELA_MS = 5 * 60_000L

    @Volatile var reproduzindo: Boolean = true
        private set
    @Volatile var causa: String? = null
        private set
    @Volatile var atualizadoEmMs: Long = 0L
        private set

    fun informar(reproduzindo: Boolean, causa: String?, agoraMs: Long) {
        this.reproduzindo = reproduzindo
        this.causa = if (reproduzindo) null else causa
        this.atualizadoEmMs = agoraMs
    }

    /** O que o vigia conclui a cada olhada. Devolve (reproduzindo, causa). */
    fun avaliar(
        itemNoAr: Boolean,
        telaLiberada: Boolean,
        semItemHaMs: Long,
        presoNaSincronizacao: Boolean,
        reiniciosDoMotorNaJanela: Int
    ): Pair<Boolean, String?> = when {
        !telaLiberada -> true to null // tela suspensa/bloqueada no painel: não é defeito de reprodução
        reiniciosDoMotorNaJanela >= REINICIOS_DEMAIS ->
            false to "O vídeo não inicia neste aparelho: o motor de vídeo foi reiniciado $reiniciosDoMotorNaJanela vezes em 5 minutos"
        itemNoAr -> true to null
        semItemHaMs < SEM_ITEM_TOLERANCIA_MS -> true to null // abrindo / trocando de playlist
        presoNaSincronizacao ->
            false to "Preso na tela de sincronização há ${semItemHaMs / 1000} s: as mídias não terminaram de baixar (internet lenta, sem internet ou sem espaço)"
        else -> false to "Nenhuma mídia no ar há ${semItemHaMs / 1000} s: sem item válido para exibir (playlist vazia, fora do horário ou arquivos com defeito)"
    }

    /** Estado enviado ao servidor no sinal de vida. Devolve (status, causa). */
    fun statusParaOServidor(agoraMs: Long, telaAtiva: Boolean, temPlaylist: Boolean): Pair<String, String?> = when {
        !telaAtiva -> STATUS_BLOQUEADA to null
        !temPlaylist -> STATUS_SINCRONIZANDO to "Sem playlist guardada no aparelho: sincronizando, ou a tela está sem playlist no painel"
        atualizadoEmMs == 0L || agoraMs - atualizadoEmMs > VIGIA_SILENCIO_MS ->
            STATUS_SEM_REPRODUCAO to "A tela do Player não está aberta no aparelho (aplicativo em segundo plano, na tela de login ou travado)"
        reproduzindo -> STATUS_TOCANDO to null
        else -> STATUS_SEM_REPRODUCAO to (causa ?: "Sem mídia aparecendo na tela")
    }
}

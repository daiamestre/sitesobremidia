package com.antigravity.player.playback

/**
 * Linha do tempo da reprodução com prazos ABSOLUTOS (relógio monotônico), sem deriva.
 *
 * Antes cada item media "duração" a partir do início do PREPARO (vídeo) ou da emissão do carregamento (imagem): o tempo
 * de preparo do decoder entrava na conta e o vídeo de 6 s ocupava 7,1-7,3 s (medido no emulador).
 * Agora o item é "reivindicado" quando está PRONTO e recebe uma janela [startAt, endAt] de exatamente `durationMs`; a
 * próxima janela começa onde a anterior termina. Se o item ficou pronto antes do prazo (pré-carregado), espera o limite
 * (não encurta o anterior). Se ficou pronto um pouco depois (até LATE_SNAP_MS: o overhead normal do laço), mantém a
 * AGENDA (a mídia perde só esses milissegundos) — assim o ciclo fecha em exatamente a soma dos tempos, sem deriva. Se ficou
 * pronto MUITO depois (preparo lento), começa na hora e dura o tempo COMPLETO: nenhuma mídia é encurtada de forma visível.
 */
class PlaybackTimeline(private val clock: () -> Long) {

    data class Slot(val startAt: Long, val endAt: Long)

    private var nextStart: Long? = null

    fun claim(durationMs: Long): Slot {
        val now = clock()
        val planned = nextStart
        val start = when {
            planned == null -> now
            now <= planned + LATE_SNAP_MS -> planned   // pronto no prazo (ou levemente atrasado): mantém a agenda
            else -> now                                // muito atrasado: tempo completo a partir de agora
        }
        val end = start + durationMs
        nextStart = end
        return Slot(start, end)
    }

    fun reset() {
        nextStart = null
    }

    companion object {
        /** Atraso tolerado (overhead normal do laço) antes de deslocar a agenda. */
        const val LATE_SNAP_MS = 250L

        /** Folga depois do fim do cruzamento antes de começar a pré-carga (não competir com a animação). */
        private const val AFTER_FADE_MARGIN_MS = 150L

        /** Se sobrar menos que isso, a pré-carga não adianta: o próximo item prepara sob demanda. */
        private const val MIN_USEFUL_LEAD_MS = 300L

        /**
         * Instante (relógio monotônico) em que o item seguinte deve começar a ser pré-carregado, ou -1 se não vale a pena:
         * `leadMs` antes do fim, mas nunca antes de o cruzamento de entrada terminar.
         */
        fun preloadAt(startAt: Long, endAt: Long, fadeMs: Long, leadMs: Long): Long {
            val earliest = startAt + fadeMs + AFTER_FADE_MARGIN_MS
            val wanted = maxOf(endAt - leadMs, earliest)
            return if (endAt - wanted < MIN_USEFUL_LEAD_MS) -1L else wanted
        }
    }
}

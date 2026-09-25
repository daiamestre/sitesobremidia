package com.antigravity.player.util

import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.util.Logger

/**
 * [INDUSTRIAL QUEUE MANAGER]
 * Gerenciador de Fila de Reprodução Resiliente.
 * - Isola a lógica de "Wrap Around" (Fim da Playlist).
 * - Garante Avanço Atômico (Nunca tenta a mesma mídia corrompida 2x seguidas).
 * - Mantém uma "Lista de Quarentena" (Blacklist) temporária para pular arquivos estragados
 *   até o próximo Sync da Nuvem curá-los.
 *
 * O cursor é a POSIÇÃO do item na playlist (orderIndex), não o id da mídia: a mesma mídia pode aparecer várias vezes
 * (horários/ordem diferentes) e, por id, o cursor voltava sempre à 1ª ocorrência e a fila nunca passava da repetida
 * (A,B,A,C tocava A,B,A,B,...). Também sobrevive ao filtro de agendamento: se o item da vez saiu da janela, segue
 * para o próximo de posição maior.
 */
class QueueManager {
    private var lastPlayedOrder: Int? = null
    private var lastPlayedId: String? = null
    private val quarantineList = mutableSetOf<String>()
    private val failureCounts = mutableMapOf<String, Int>()

    /**
     * Calcula o próximo item seguro para reproduzir, ignorando os que estão em quarentena.
     * Retorna um Pair indicando a Mídia e se houve um "Wrap Around" (Fim de Ciclo Completo).
     * Retorna 'null' na mídia se a playlist estiver vazia.
     */
    fun getNextPlayableItem(playableItems: List<MediaItem>): Pair<MediaItem?, Boolean> {
        if (playableItems.isEmpty()) return Pair(null, false)

        // Se todo mundo falhou (Apocalipse Pessoal), a gente limpa a quarentena pra dar uma nova chance
        // senão a TV box ficaria presa numa tela preta para sempre.
        if (playableItems.all { quarantineList.contains(it.id) }) {
            Logger.w("QUEUE_MANAGER", "Amnésia Induzida: Todas as mídias falharam. Resetando quarentena e tentando de novo.")
            quarantineList.clear()
        }

        val startIndex = nextIndexAfterLast(playableItems)

        // A partir do índice ideal, o primeiro que não esteja na quarentena
        var probeIndex = startIndex
        for (i in playableItems.indices) {
            val candidate = playableItems[probeIndex]
            if (!quarantineList.contains(candidate.id)) {
                val last = lastPlayedOrder
                // [MEMORY LEAK GUARDIAN] "Volta Completa": o ponteiro voltou ao início da playlist.
                val isWrapAround = last != null && candidate.orderIndex <= last
                return Pair(candidate, isWrapAround)
            }
            probeIndex = (probeIndex + 1) % playableItems.size
        }

        return Pair(playableItems.firstOrNull(), lastPlayedOrder != null)
    }

    /** Índice (na lista atual) do item que vem logo depois do último tocado. */
    private fun nextIndexAfterLast(items: List<MediaItem>): Int {
        val lastOrder = lastPlayedOrder ?: return 0
        val exact = items.indexOfFirst { it.orderIndex == lastOrder && it.id == lastPlayedId }
        if (exact != -1) return (exact + 1) % items.size
        // O último tocado saiu da lista (agendamento/edição): vai para o primeiro de posição maior, senão recomeça.
        val greater = items.indexOfFirst { it.orderIndex > lastOrder }
        return if (greater != -1) greater else 0
    }

    /**
     * Informa qual será o item SEGUINTE ao selecionado, útil para Pre-Buffering.
     */
    fun peekNext(playableItems: List<MediaItem>, currentItem: MediaItem): MediaItem? {
        if (playableItems.isEmpty()) return null
        val currentIndex = playableItems.indexOfFirst { it.orderIndex == currentItem.orderIndex && it.id == currentItem.id }
        if (currentIndex == -1) return playableItems.firstOrNull()

        var probeIndex = (currentIndex + 1) % playableItems.size
        for (i in playableItems.indices) {
            val candidate = playableItems[probeIndex]
            if (!quarantineList.contains(candidate.id)) {
                return candidate
            }
            probeIndex = (probeIndex + 1) % playableItems.size
        }
        return playableItems.firstOrNull()
    }

    /**
     * Confirma que a mídia tocou OU que a tentativa de tocar falhou,
     * movendo obrigatoriamente o ponteiro para a frente.
     */
    fun markAsProcessed(item: MediaItem) {
        lastPlayedOrder = item.orderIndex
        lastPlayedId = item.id
        // Se tocou com sucesso, zera o contador de falhas contínuas
        failureCounts.remove(item.id)
    }

    /**
     * Coloca a mídia na lista negra temporária. Ela não será sorteada no getNext()
     * até a classe ser recriada ou a quarentena zerada pelo Sync.
     */
    fun quarantineItem(item: MediaItem, reason: String) {
        val itemId = item.id
        val currentFails = failureCounts.getOrDefault(itemId, 0) + 1
        failureCounts[itemId] = currentFails

        if (currentFails >= 3) {
            if (quarantineList.add(itemId)) {
                Logger.e("QUEUE_MANAGER", "Mídia Quarentenada [$itemId] após 3 falhas. Motivo: $reason")
            }
        } else {
            Logger.w("QUEUE_MANAGER", "Falha Mídia [$itemId] ($currentFails/3). Motivo: $reason")
        }

        // Garante que o avanço acontece para fugir do loop
        lastPlayedOrder = item.orderIndex
        lastPlayedId = itemId
    }

    /**
     * Limpa a quarentena e o histórico, chamado quando uma nova Playlist oficial chega da Nuvem.
     */
    fun resetState() {
        lastPlayedOrder = null
        lastPlayedId = null
        quarantineList.clear()
        failureCounts.clear()
        Logger.i("QUEUE_MANAGER", "Memória da Fila Redefinida (Novo Sync)")
    }
}

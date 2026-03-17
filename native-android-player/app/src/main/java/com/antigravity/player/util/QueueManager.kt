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
 */
class QueueManager {
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
        if (quarantineList.size >= playableItems.size) {
            Logger.w("QUEUE_MANAGER", "Amnésia Induzida: Todas as mídias falharam. Resetando quarentena e tentando de novo.")
            quarantineList.clear()
        }

        // Filtra opções válidas
        val safeItems = playableItems.filter { !quarantineList.contains(it.id) }
        if (safeItems.isEmpty()) return Pair(playableItems.firstOrNull(), true) 

        // Descobre onde a última mídia tocou na playlist inteira original
        val lastIndex = if (lastPlayedId != null) {
            playableItems.indexOfFirst { it.id == lastPlayedId }
        } else -1
        
        // Em um avanço normal, iteramos +1. Se a última midia (lastPlayed) sumiu da nuvem (-1), vamos de 0.
        val currentIndex = if (lastIndex != -1) (lastIndex + 1) % playableItems.size else 0
        
        // [MEMORY LEAK GUARDIAN] - O sinalizador de "Volta Completa" 
        // Vai disparar a faxina de RAM silenciosa se o ponteiro voltou ao início.
        val isWrapAround = (lastIndex != -1 && currentIndex <= lastIndex)

        // Agora procuramos, a partir do índice ideal, o primeiro que não esteja na quarentena
        var probeIndex = currentIndex
        for (i in playableItems.indices) {
            val candidate = playableItems[probeIndex]
            if (!quarantineList.contains(candidate.id)) {
                return Pair(candidate, isWrapAround)
            }
            probeIndex = (probeIndex + 1) % playableItems.size
        }

        return Pair(safeItems.firstOrNull(), isWrapAround)
    }

    /**
     * Informa qual será o item SEGUINTE ao selecionado, útil para Pre-Buffering.
     */
    fun peekNext(playableItems: List<MediaItem>, currentItem: MediaItem): MediaItem? {
        if (playableItems.isEmpty()) return null
        val currentIndex = playableItems.indexOfFirst { it.id == currentItem.id }
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
    fun markAsProcessed(itemId: String) {
        lastPlayedId = itemId
        // Se tocou com sucesso, zera o contador de falhas contínuas
        failureCounts.remove(itemId)
    }

    /**
     * Coloca a mídia na lista negra temporária. Ela não será sorteada no getNext()
     * até a classe ser recriada ou a quarentena zerada pelo Sync.
     */
    fun quarantineItem(itemId: String, reason: String) {
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
        lastPlayedId = itemId
    }

    /**
     * Limpa a quarentena e o histórico, chamado quando uma nova Playlist oficial chega da Nuvem.
     */
    fun resetState() {
        lastPlayedId = null
        quarantineList.clear()
        failureCounts.clear()
        Logger.i("QUEUE_MANAGER", "Memória da Fila Redefinida (Novo Sync)")
    }
}

package com.antigravity.core.domain.state.adapter

import com.antigravity.core.domain.state.SyncState

/**
 * Adapter somente de leitura para o Eixo de Sincronização.
 * Converte flags de execução de background sync e progresso para o SyncState canônico.
 * Não dispara sincronização nem altera o estado de download.
 */
object SyncStateAdapter {

    /**
     * Mapeia os estados observáveis de sincronização do runtime.
     * @param isSyncInProgress Indica se há sincronização em background em execução.
     * @param pendingCount Quantidade de itens pendentes de download (se conhecido).
     * @param totalCount Total de itens no lote atual (se conhecido).
     */
    fun adapt(
        isSyncInProgress: Boolean,
        pendingCount: Int = 0,
        totalCount: Int = 0
    ): SyncState {
        return if (!isSyncInProgress) {
            SyncState.Idle
        } else {
            if (totalCount > 0) {
                SyncState.DownloadingDelta(
                    pendingCount = pendingCount,
                    totalCount = totalCount
                )
            } else {
                SyncState.FetchingRemote
            }
        }
    }
}

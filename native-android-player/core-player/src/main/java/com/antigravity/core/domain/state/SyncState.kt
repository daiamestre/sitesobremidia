package com.antigravity.core.domain.state

/**
 * Eixo Canônico de Sincronização (SOBRE MÍDIA Android Player).
 * Representa as etapas do background sync sem bloquear playback.
 * Imutável e desacoplado da renderização.
 */
sealed interface SyncState {
    /**
     * Sincronização inativa / em repouso.
     */
    data object Idle : SyncState

    /**
     * Consultando backend/Supabase para metadados de playlist e assets.
     */
    data object FetchingRemote : SyncState

    /**
     * Baixando delta de arquivos/mídias em background para cache local.
     * @param pendingCount Quantidade de itens pendentes de download.
     * @param totalCount Total de itens no lote atual.
     */
    data class DownloadingDelta(
        val pendingCount: Int,
        val totalCount: Int
    ) : SyncState

    /**
     * Validando hashes SHA-256 e integridade de payloads baixados.
     */
    data object VerifyingIntegrity : SyncState

    /**
     * Gravando transação atômica no banco Room local.
     */
    data object CommittingRoom : SyncState
}

/**
 * Resultado transitório de uma operação de sincronização.
 * Conforme decisão P0.4.2, falha de sincronização é um resultado/evento transitório
 * e NÃO um estado persistente do eixo Sync.
 */
sealed interface SyncResult {
    data class Success(val itemsProcessed: Int) : SyncResult
    data class Failed(val reason: String, val canRetry: Boolean = true) : SyncResult
}

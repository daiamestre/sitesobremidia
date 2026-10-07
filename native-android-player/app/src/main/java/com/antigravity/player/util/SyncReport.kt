package com.antigravity.player.util

import com.antigravity.player.util.TelemetryCollector.TelemetryData
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * F-156 — Relatório de sincronização de mídia para o painel ("Mapa da Sincronização", "Conteúdo desatualizado").
 *
 * O Player já sabe quando está baixando ("Sincronizando: 3 de 10") e quando terminou ("Mídias prontas..."). Este objeto
 * só TRADUZ esse texto de progresso para os campos que o heartbeat já aceita (sync_status, media_count,
 * pending_media_count, last_sync_at) — não muda nenhum fluxo de download nem de reprodução. Sem informação
 * (aguardando, erro, bloqueio) o relatório fica como estava: o painel mostra "Sem informação" em vez de inventar.
 */
object SyncReport {
    const val UPDATED = "UPDATED"
    const val DOWNLOADING = "DOWNLOADING"

    data class Snapshot(val status: String, val mediaCount: Int?, val pendingMediaCount: Int?, val lastSyncAtIso: String?)

    private val COUNTER = Regex("""^Sincronizando:\s*(\d+)\s+de\s+(\d+)\s*$""")

    @Volatile private var current: Snapshot? = null

    /** Último relatório conhecido (null = o Player ainda não sincronizou nesta execução). */
    fun snapshot(): Snapshot? = current

    /** Chamado a cada mudança do texto de progresso da sincronização. */
    fun onProgress(raw: String?, now: Long = System.currentTimeMillis()) {
        parse(raw, current, isoUtc(now))?.let { current = it }
    }

    internal fun reset() { current = null }

    /**
     * Texto de progresso -> relatório. Devolve null quando o texto não diz nada sobre mídias (o relatório anterior vale).
     *  - "Sincronizando: X de Y"   -> baixando, faltam Y-X de Y;
     *  - "Sincronizando novas mídias..." / "Corrigindo mídias ausentes..." -> baixando (quantidade ainda desconhecida);
     *  - "Mídias prontas..."       -> atualizado, nada pendente, hora da última sincronização.
     */
    internal fun parse(raw: String?, anterior: Snapshot?, agoraIso: String): Snapshot? {
        if (raw.isNullOrBlank()) return null
        COUNTER.matchEntire(raw.trim())?.let {
            val feitas = it.groupValues[1].toInt()
            val total = it.groupValues[2].toInt()
            if (total <= 0) return null
            val faltam = (total - feitas).coerceIn(0, total)
            return Snapshot(DOWNLOADING, total, faltam, anterior?.lastSyncAtIso)
        }
        if (raw.startsWith("Mídias prontas")) {
            return Snapshot(UPDATED, anterior?.mediaCount, 0, agoraIso)
        }
        if (raw.startsWith("Sincronizando novas mídias") || raw.startsWith("Corrigindo mídias ausentes")) {
            return Snapshot(DOWNLOADING, anterior?.mediaCount, anterior?.pendingMediaCount, anterior?.lastSyncAtIso)
        }
        return null
    }

    private fun isoUtc(millis: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(millis))

    /** Telemetria com o relatório de sincronização preenchido (sem relatório, devolve a mesma telemetria). */
    fun TelemetryData.withSyncReport(s: Snapshot? = snapshot()): TelemetryData =
        if (s == null) this else copy(syncStatus = s.status, mediaCount = s.mediaCount, pendingMediaCount = s.pendingMediaCount, lastSyncAt = s.lastSyncAtIso)
}

package com.antigravity.player.util

import android.content.Context
import android.os.SystemClock
import com.antigravity.core.util.Logger
import com.antigravity.player.di.ServiceLocator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Regras puras do contador (testáveis sem Android). */
object AnalyticsFormat {
    /** Itens repetidos na playlist têm id "abc~1"; a exibição pertence à mídia "abc". */
    fun normalizeMediaId(id: String): String = id.substringBefore('~')

    /** O painel lê `started_at` como UTC: a data TEM que ser UTC (antes saía em hora local com sufixo "Z"). */
    fun utcTimestamp(date: Date): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(date)
}

/**
 * [CONTADOR DE EXIBIÇÕES - OFFLINE FIRST]
 * Cada mídia exibida é gravada num cofre local e enviada ao painel (playback_logs) em seguida.
 *
 * Antes o cofre só era descarregado à meia-noite ou no boot: o gráfico "Estatísticas de Exibição" ficava vazio o dia
 * inteiro e uma queda do aparelho perdia o dia. Agora: envio a cada exibição (no máximo 1 a cada 30 s) e a cada
 * batimento (60 s) enquanto houver pendência, com o lote em "envio" protegido contra perda:
 * o que está sendo enviado vai para um arquivo à parte, e só é apagado quando o servidor confirma.
 */
object DisplayAnalyticsManager {

    private const val FILE_NAME = "analytics_vault.json"
    private const val SENDING_FILE_NAME = "analytics_vault.sending.json"
    private const val FLUSH_MIN_INTERVAL_MS = 30_000L

    private val syncMutex = Mutex()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var lastFlushAt = 0L

    // 1. O Gatilho de Registro (Chamado pela MainActivity quando a mídia termina)
    fun registerPlayback(context: Context, mediaId: String, mediaName: String, duration: Int) {
        try {
            appendToVault(File(context.filesDir, FILE_NAME), mediaId, mediaName, duration)
        } catch (e: Exception) {
            Logger.e("ANALYTICS", "Falha ao registrar playback no Cofre: ${e.message}")
            return
        }
        flushSoon(context.applicationContext)
    }

    @Synchronized
    private fun appendToVault(file: File, mediaId: String, mediaName: String, duration: Int) {
        val vaultArray = readArray(file)
        vaultArray.put(JSONObject().apply {
            put("media_id", AnalyticsFormat.normalizeMediaId(mediaId))
            put("media_name", mediaName)
            put("duration_seconds", duration)
            put("played_at", AnalyticsFormat.utcTimestamp(Date()))
        })
        file.writeText(vaultArray.toString())
        Logger.d("ANALYTICS", "Mídia [$mediaName] computada no Cofre: ${vaultArray.length()} pendentes.")
    }

    /** Dispara o envio em segundo plano, no máximo 1 vez a cada 30 s (o batimento cobre as falhas). */
    private fun flushSoon(appContext: Context) {
        val now = SystemClock.elapsedRealtime()
        if (lastFlushAt != 0L && now - lastFlushAt < FLUSH_MIN_INTERVAL_MS) return
        lastFlushAt = now
        scope.launch {
            try {
                syncWithDashboard(appContext)
            } catch (e: Exception) {
                Logger.e("ANALYTICS", "Flush imediato falhou: ${e.message}")
            }
        }
    }

    @Synchronized
    private fun readArray(file: File): JSONArray =
        if (file.exists() && file.length() > 0) {
            try { JSONArray(file.readText()) } catch (e: Exception) {
                Logger.e("ANALYTICS", "Arquivo do cofre corrompido (${file.name}); descartado: ${e.message}")
                file.delete()
                JSONArray()
            }
        } else JSONArray()

    /** Move o cofre para o arquivo de envio (juntando com um envio anterior que falhou) de forma atômica. */
    @Synchronized
    private fun snapshotForSending(context: Context): JSONArray {
        val vault = File(context.filesDir, FILE_NAME)
        val sending = File(context.filesDir, SENDING_FILE_NAME)
        val merged = readArray(sending)
        val fresh = readArray(vault)
        for (i in 0 until fresh.length()) merged.put(fresh.get(i))
        if (merged.length() == 0) return merged
        sending.writeText(merged.toString())
        vault.delete()
        return merged
    }

    // 2. O Gatilho de Envio (a cada exibição e a cada batimento do PersistentHeartbeatService)
    suspend fun syncWithDashboard(context: Context) {
        syncMutex.withLock {
            val screenId = context.getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
                .getString("saved_screen_id", null)
            if (screenId.isNullOrBlank()) return // sem tela pareada: mantém tudo no cofre

            val batch = snapshotForSending(context)
            if (batch.length() == 0) return

            try {
                Logger.i("ANALYTICS", "Enviando ${batch.length()} exibições ao painel...")
                val logsList = mutableListOf<Map<String, Any>>()
                for (i in 0 until batch.length()) {
                    val item = batch.getJSONObject(i)
                    logsList.add(
                        mapOf(
                            "screen_id" to screenId,
                            "media_id" to item.getString("media_id"),
                            "media_name" to item.optString("media_name", ""),
                            "duration_seconds" to item.optInt("duration_seconds", 0),
                            "played_at" to item.getString("played_at")
                        )
                    )
                }
                val success = ServiceLocator.getRemoteDataSource().uploadAnalyticsBatch(logsList)
                if (success) {
                    File(context.filesDir, SENDING_FILE_NAME).delete() // só apaga com a confirmação do servidor
                    Logger.i("ANALYTICS", "Lote confirmado pelo servidor (${batch.length()}).")
                } else {
                    Logger.e("ANALYTICS", "Painel rejeitou o lote; ${batch.length()} exibições seguem guardadas para a próxima tentativa.")
                }
            } catch (e: Exception) {
                Logger.e("ANALYTICS", "Erro no envio de analytics (dados preservados): ${e.message}")
            }
        }
    }
}

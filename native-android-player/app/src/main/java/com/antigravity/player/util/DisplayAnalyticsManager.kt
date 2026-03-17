package com.antigravity.player.util

import android.content.Context
import com.antigravity.core.util.Logger
import com.antigravity.player.di.ServiceLocator
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * [O CONTADOR DE EXIBIÇÕES - OFFLINE FIRST]
 * Gerencia a contabilidade de reproduções localmente.
 * Evita sobrecarregar o Supabase com 1 requisição por vídeo.
 * Acumula os dados em um JSON local ("caixa preta") e descarrega tudo 
 * 1x por dia, garantindo que o Gráfico do Dashboard seja 100% preciso, 
 * mesmo que a TV Box perca o Wi-Fi durante a tarde toda.
 */
object DisplayAnalyticsManager {

    private const val FILE_NAME = "analytics_vault.json"

    // 1. O Gatilho de Registro (Chamado pela MainActivity quando a mídia termina)
    @Synchronized
    fun registerPlayback(context: Context, mediaId: String, mediaName: String, duration: Int) {
        try {
            val file = File(context.filesDir, FILE_NAME)
            val vaultArray = if (file.exists() && file.length() > 0) {
                JSONArray(file.readText())
            } else {
                JSONArray()
            }

            val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).format(Date())

            val record = JSONObject().apply {
                put("media_id", mediaId)
                put("media_name", mediaName)
                put("duration_seconds", duration)
                put("played_at", timestamp)
            }

            vaultArray.put(record)
            file.writeText(vaultArray.toString())
            Logger.d("ANALYTICS", "Mídia [$mediaName] computada no Cofre Offline: ${vaultArray.length()} pendentes.")

        } catch (e: Exception) {
            Logger.e("ANALYTICS", "Falha ao registrar playback no Cofre: ${e.message}")
        }
    }

    // 2. O Gatilho de Envio (Chamado pelo PersistentHeartbeatService à noite)
    suspend fun syncWithDashboard(context: Context) {
        val file = File(context.filesDir, FILE_NAME)
        if (!file.exists() || file.length() <= 0) {
            return // Nada a enviar
        }

        try {
            val pendingData = file.readText()
            val vaultArray = JSONArray(pendingData)

            if (vaultArray.length() == 0) return
            
            val screenId = context.getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
                .getString("saved_screen_id", null)

            if (screenId == null) {
                Logger.e("ANALYTICS", "Não é possível descarregar analíticos. Screen ID desconhecido.")
                return
            }

            Logger.i("ANALYTICS", "Descarregando ${vaultArray.length()} exibições no Dashboard...")

            // Convertendo JSON nativo para lista de Maps pro Supabase
            val logsList = mutableListOf<Map<String, Any>>()
            for (i in 0 until vaultArray.length()) {
                val item = vaultArray.getJSONObject(i)
                logsList.add(
                    mapOf(
                        "screen_id" to screenId,
                        "media_id" to item.getString("media_id"),
                        "media_name" to item.getString("media_name"),
                        "duration_seconds" to item.getInt("duration_seconds"),
                        "played_at" to item.getString("played_at")
                    )
                )
            }

            // [NÚCLEO DO UPLOAD] Chama o repositório para fazer o Batch Insert
            val success = ServiceLocator.getRemoteDataSource().uploadAnalyticsBatch(logsList)

            if (success) {
                Logger.i("ANALYTICS", "Sucesso no Upload BATCH. Limpando Cofre Offline.")
                file.delete() // Esvazia o cofre apenas se o upload confirmou (Garantia de Não-Perda)
            } else {
                Logger.e("ANALYTICS", "O Dashboard rejeitou o Batch de métricas. Elas continuarão no Cofre para amanhã.")
            }

        } catch (e: Exception) {
            Logger.e("ANALYTICS", "Erro catacrístico no Sync de Analytics: ${e.message}")
        }
    }
}

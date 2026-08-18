package com.antigravity.player.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.antigravity.player.di.ServiceLocator
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType
import okhttp3.RequestBody
import java.util.concurrent.TimeUnit
import com.antigravity.cache.entity.LogAuditoriaEntity
import com.antigravity.sync.config.SupabaseConfig
import com.antigravity.sync.service.SessionManager
import com.antigravity.sync.storage.TokenStorage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.util.Log

class AuditUploadWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val repository = ServiceLocator.getRepository(applicationContext)
        val logs = repository.buscarLogsAuditoria()

        if (logs.isEmpty()) {
            return@withContext Result.success()
        }

        val csvConteudo = gerarCSV(logs)
        val deviceId = repository.deviceId

        val sucesso = enviarRelatorioParaDashboard(csvConteudo, deviceId)

        if (sucesso) {
            // Limpa logs enviados (opcional: ou marca como enviados)
            // Para simplicidade, vamos limpar logs com mais de 1 hora para não repetir
            repository.limparLogsAuditoriaAntigos(System.currentTimeMillis() - (60 * 60 * 1000))
            Result.success()
        } else {
            Result.retry()
        }
    }

    private fun gerarCSV(logs: List<com.antigravity.core.domain.model.LogAuditoria>): String {
        val header = "ID;Data;Hora;Midia;Tipo;Duracao(s);Localidade\n"
        val body = StringBuilder()
        val sdfData = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
        val sdfHora = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())

        logs.forEach { log ->
            val data = sdfData.format(java.util.Date(log.dataHora))
            val hora = sdfHora.format(java.util.Date(log.dataHora))
            body.append("${log.id};$data;$hora;${log.midiaNome};${log.midiaTipo};${log.duracaoExibida};${log.cidadeNoMomento}\n")
        }
        return header + body.toString()
    }

    private suspend fun enviarRelatorioParaDashboard(csvConteudo: String, playerNome: String): Boolean {
        // [SECURITY FASE F] Endpoint derivado do BuildConfig (supabase.properties
        // gitignored) — sem URL hardcoded no código-fonte.
        val endpoint = "${SupabaseConfig.URL}/functions/v1/upload-audit-log"

        // [SECURITY FASE F] JWT obrigatório: a Edge Function rejeita chamadas
        // sem token (401). Sem token, não há como autenticar — aborta.
        val accessToken = SessionManager.currentAccessToken
            ?: TokenStorage(applicationContext).getAccessToken()
            ?: return false

        return try {
            val mediaType = "text/csv".toMediaTypeOrNull()
            val csvBody = csvConteudo.toRequestBody(mediaType)

            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("player_name", playerNome)
                .addFormDataPart("relatorio", "auditoria_${System.currentTimeMillis()}.csv", csvBody)
                .build()

            val request = Request.Builder()
                .url(endpoint)
                .post(requestBody)
                .header("apikey", SupabaseConfig.KEY)
                .header("Authorization", "Bearer $accessToken")
                .build()

            val response = client.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            Log.e("AuditUploadWorker", "Erro no upload de auditoria", e)
            false
        }
    }
}

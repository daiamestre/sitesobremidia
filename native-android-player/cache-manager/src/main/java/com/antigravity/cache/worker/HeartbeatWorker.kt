package com.antigravity.cache.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.antigravity.core.util.Logger

/**
 * [SCALE 10K] HeartbeatWorker - WorkManager-based Pulse
 * 
 * Tarefa periódica que envia o "batimento cardíaco" para a tabela device_health.
 * WorkManager garante resiliência ao reboot e economia de bateria.
 * 
 * Vantagens:
 * - Persiste no banco interno do Android: sobrevive a reboots
 * - Backoff exponencial automático em caso de falha
 * - Condicionado à rede (NetworkType.CONNECTED)
 */
class HeartbeatWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            Logger.d("PULSE_WORKER", "Iniciando envio de pulso de saude...")

            val deviceId = com.antigravity.sync.service.SessionManager.currentUserId
            if (deviceId.isNullOrBlank() || deviceId == "UNKNOWN") {
                Logger.w("PULSE_WORKER", "Device ID nao disponivel. Pulso ignorado.")
                return Result.success()
            }

            val heartbeat = com.antigravity.sync.service.HeartbeatManager(
                context = applicationContext,
                deviceId = deviceId
            )
            heartbeat.sendPulse()

            Logger.d("PULSE_WORKER", "Pulso enviado com sucesso.")
            Result.success()
        } catch (e: Exception) {
            Logger.e("PULSE_WORKER", "Falha ao enviar pulso: ${e.message}")
            // Tenta novamente com backoff exponencial
            Result.retry()
        }
    }
}

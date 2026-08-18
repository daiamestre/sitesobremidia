package com.antigravity.cache.util

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import com.antigravity.cache.worker.HeartbeatWorker
import com.antigravity.core.util.Logger
import java.util.concurrent.TimeUnit

/**
 * [SCALE 10K] WorkScheduler - Agendamento Resiliente de Workers
 * 
 * Centraliza o agendamento de tarefas periodicas do player.
 * Garante resiliencia a reboots e economia de bateria via WorkManager.
 * 
 * Resiliencia ao Reboot: WorkManager persiste no banco interno do Android.
 * Economia de Dados: Envio condicionado a rede (NetworkType.CONNECTED).
 * Backoff Exponencial: Evita "efeito manada" de milhares de telas.
 */
object WorkScheduler {

    private const val HEARTBEAT_WORK_NAME = "heartbeat_pulse_work"

    /**
     * Agenda o heartbeat periodico com intervalo de 15 minutos
     * (minimo permitido pelo Android para PeriodicWork).
     * 
     * Este worker complementa o PersistentHeartbeatService (60s loop):
     * - O Service garante pulso rapido enquanto o app esta ativo
     * - O Worker garante pulso mesmo se o app for fechado pelo sistema
     */
    fun scheduleHeartbeat(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val heartbeatRequest = PeriodicWorkRequestBuilder<HeartbeatWorker>(
            15, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            HEARTBEAT_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            heartbeatRequest
        )

        Logger.i("SCHEDULER", "HeartbeatWorker agendado (15min interval, reboot-safe)")
    }
}

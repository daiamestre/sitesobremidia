package com.antigravity.player.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.antigravity.core.util.Logger
import com.antigravity.player.di.ServiceLocator
import com.antigravity.sync.service.SessionManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.firstOrNull
import java.util.Calendar

/**
 * [O CORAÇÃO DE FERRO]
 * Este serviço Foreground garante que a TV Box "NUNCA" fique offline no Dashboard,
 * mesmo que o Android entre em Doze Mode (economia de energia) ou que o Memory 
 * Garbage Collector pause a Thread principal por peso de vídeos 4K.
 */
class PersistentHeartbeatService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isRunning = false
    private var lastSyncDay = -1

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Logger.i("HEARTBEAT_PROC", "🔥 PersistentHeartbeatService Iniciado na Trilha do Sistema.")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!isRunning) {
            isRunning = true
            
            // 1. Elevação de Privilégio: Torna o processo imune à limpeza de RAM nativa
            startForeground(NOTIFICATION_ID, createNotification())
            
            // 2. Trava o processador para que o painel de rede Wi-Fi/Ethernet não durma
            acquireWakeLock()
            
            // 3. Inicia o Loop de Batimento "Inquebrável" (Tick a cada 60s)
            startHeartbeatLoop()
        }
        
        // [SOBREVIVÊNCIA ABSOLUTA] "START_STICKY" 
        // Se o Android forçadamente fechar esse serviço, ele recria o processo automaticamente.
        return START_STICKY
    }

    private fun startHeartbeatLoop() {
        serviceScope.launch {
            while (isActive) {
                // [SILENCIADOR DE REDE] Pausa absoluta durantes screenshots pesados para liberar GPU/Rádio
                if (com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused) {
                    Logger.w("HEARTBEAT_PROC", "Pausando transmissão para ceder hardware ao Screenshot...")
                    while (com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused && isActive) {
                        delay(500)
                    }
                    Logger.i("HEARTBEAT_PROC", "Screenshot liberou o hardware. Retomando transmissões normais.")
                }

                try {
                    val repo = ServiceLocator.getRepository(applicationContext)
                    val playlist = repo.getActivePlaylist().firstOrNull()
                    val remoteDS = ServiceLocator.getRemoteDataSource()
                    val userId = SessionManager.currentUserId ?: "UNKNOWN"
                    
                    if (playlist != null) {
                        Logger.d("HEARTBEAT_PROC", "Enviando sinal de vida (Foreground)...")
                        remoteDS.updateScreenStatus(
                            id = userId,
                            status = "playing",
                            version = "1.0",
                            ipAddress = "N/A"
                        )
                    } else {
                        remoteDS.updateScreenStatus(
                            id = userId,
                            status = "syncing",
                            version = "1.0",
                            ipAddress = "N/A"
                        )
                    }
                    
                    // [SCALE 10K] Lightweight Pulse -> device_health via HeartbeatManager
                    try {
                        val heartbeat = com.antigravity.sync.service.HeartbeatManager(
                            context = applicationContext,
                            deviceId = userId
                        )
                        heartbeat.sendPulse(currentMediaId = null)
                    } catch (e: Exception) {
                        Logger.w("HEARTBEAT_PROC", "Pulse to device_health skipped: ${e.message}")
                    }
                } catch (e: Exception) {
                    Logger.e("HEARTBEAT_PROC", "Falha no envio do Heartbeat: ${e.message}")
                }
                
                // Dorme estritamente 60 segundos exatos antes do próximo pulso
                delay(60_000L)
                
                // [CONTABILIDADE DIÁRIA - ESTATÍSTICAS OFFLINE]
                // Se virou o dia (passou da meia-noite) E já começou um novo loop de 60s,
                // enviamos o pacote consolidado de exibições do dia inteiro para o Dashboard.
                val currentDay = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)
                if (currentDay != lastSyncDay && lastSyncDay != -1) { // Ignora o primeiro trigger logo no boot
                    try {
                        com.antigravity.player.util.DisplayAnalyticsManager.syncWithDashboard(applicationContext)
                        lastSyncDay = currentDay
                    } catch (e: Exception) {
                        Logger.e("HEARTBEAT_PROC", "Falha ao descarregar Analytics Diário: ${e.message}")
                    }
                } else if (lastSyncDay == -1) {
                    // Inicializa a referência no boot pra não atirar a carga à toa logo de cara,
                    // mas tenta mandar se sobrou lixo de ontem na primeira rodada
                    try {
                        com.antigravity.player.util.DisplayAnalyticsManager.syncWithDashboard(applicationContext)
                    } catch (e: Exception) {}
                    lastSyncDay = currentDay
                }
            }
        }
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "SobreMidia::HeartbeatWakeLock"
        ).apply {
            // Trava o Clock da CPU (Mas permite desligar a tela física se a TV mandar)
            acquire(10 * 60 * 1000L /*10 minutes max per lock cycle to avoid strict OS bans*/)
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Sinal de Manutenção do Player",
                NotificationManager.IMPORTANCE_MIN // MIN para não emitir som/popup invasivo
            ).apply {
                description = "Mantém a conexão com o Dashboard 24/7"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Sobre Mídia Online")
            .setContentText("Conexão direta com o Dashboard estabelecida.")
            .setSmallIcon(android.R.drawable.ic_menu_upload) // Icone padrão do Android
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }

    override fun onDestroy() {
        isRunning = false
        serviceScope.cancel()
        releaseWakeLock()
        super.onDestroy()
        Logger.w("HEARTBEAT_PROC", "⚠ PersistentHeartbeatService Encerrado.")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "HeartbeatChannelConfigurar"
        private const val NOTIFICATION_ID = 8881
    }
}

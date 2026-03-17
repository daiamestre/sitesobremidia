package com.antigravity.player

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import android.content.Intent
import android.content.Context
import android.app.AlarmManager
import android.app.PendingIntent
import android.graphics.Color
import android.os.Build
import android.content.pm.ActivityInfo
import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.view.PixelCopy
import androidx.core.content.FileProvider
import java.io.File
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.edit
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.graphics.toColorInt
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModelProvider
import com.antigravity.player.ui.PlayerViewModel
import com.antigravity.player.ui.PlayerViewModelFactory
import com.antigravity.core.domain.model.RegionalConfig
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import androidx.core.view.isVisible
import com.antigravity.player.util.DeviceTypeUtil
import com.antigravity.player.util.SmartCacheCleaner
import com.antigravity.player.service.ThermalGuard
import com.antigravity.player.service.AutoCleanManager
import com.antigravity.core.util.SchedulingEngine
import com.antigravity.core.util.TimeManager
import com.antigravity.player.util.DeviceControl
import com.antigravity.player.util.MasterClockBridge
import com.antigravity.media.exoplayer.ExoPlayerRenderer
import com.antigravity.media.util.PlaybackWatchdog
import com.antigravity.media.util.MediaIntegrityChecker
import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.player.di.ServiceLocator

import com.antigravity.player.ui.SplashActivity
import com.antigravity.player.util.RegionalContextManager
import com.antigravity.sync.service.SessionManager
import com.antigravity.core.domain.renderer.RendererState
import kotlinx.coroutines.flow.firstOrNull

import com.antigravity.core.util.Logger

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.channels.Channel
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy


@OptIn(UnstableApi::class)
class MainActivity : AppCompatActivity() {

    private lateinit var playerRenderer1: ExoPlayerRenderer
    private lateinit var playerRenderer2: ExoPlayerRenderer
    private var activePlayer: ExoPlayerRenderer? = null
    private var standbyPlayer: ExoPlayerRenderer? = null
    private var lastPlayedMediaId: String? = null
    
    private lateinit var viewModel: PlayerViewModel
    // [WATCHDOG] Playback freeze detector — restarts only video engine on freeze >6s
    private lateinit var playbackWatchdog: PlaybackWatchdog

    private lateinit var statusTextView: TextView
    private lateinit var syncGuard: com.antigravity.player.util.SyncGuard
    private lateinit var blockOverlay: FrameLayout
    private lateinit var playerView1: PlayerView
    private lateinit var playerView2: PlayerView
    private lateinit var standbyImage: ImageView
    private lateinit var staticImageLayer: ImageView // Motor Estático
    private lateinit var nativeWidgetContainer: FrameLayout
    // WebViews removidas permanentemente (Widgets 100% Nativos)
    
    // [SELF-HEALING] Protocol Flags
    private var consecutiveGlobalFailures = 0
    
    // [HARDENING] Idempotency Flags
    private var isSyncInProgress = false
    private var isSyncLoopRunning = false
    private var isThermalGuardStarted = false
    private var isAutoCleanStarted = false
    
    // [ADVANCED KIOSK] Maintenance Mode State
    private var isKioskEnforced = true // Global control for resilience
    
    // [ESCAPE PROTOCOL]
    private var maintenanceCounter = 0
    private var lastInputTime = 0L
    private var maintenanceJob: Job? = null
    
    private var isOTACycleStarted = false
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // [SANDBOX] Must be called BEFORE any WebView is instantiated (including XML inflation)
        if (Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            try {
                android.webkit.WebView.setDataDirectorySuffix("webview_sandbox")
            } catch (e: Exception) {
                Logger.w("WEBVIEW", "DataDirectorySuffix already set: ${e.message}")
            }
        }
        
        setContentView(R.layout.activity_main)

        // [SMART_CLEANER] 1. Faxina de Boot: Remove rastros de 0 bytes da sessão anterior
        lifecycleScope.launch(Dispatchers.IO) {
            SmartCacheCleaner.purgeOrphanedMedia(applicationContext)
        }

        // Keep screen on
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        // [ADAPTIVE UI] Detect hardware and set appropriate orientation
        val isTV = DeviceTypeUtil.isTelevision(applicationContext)
        requestedOrientation = if (isTV) {
            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
        
        // [MISSION CRITICAL] Native Immersive Mode (Zero-Touch)
        setFullscreenMode()

        

        // UI initialization
        statusTextView = findViewById<TextView>(R.id.status_text)
        syncGuard = com.antigravity.player.util.SyncGuard(this)
        playerView1 = findViewById<PlayerView>(R.id.playerView1)
        playerView2 = findViewById<PlayerView>(R.id.playerView2)
        standbyImage = findViewById<ImageView>(R.id.standbyImage)
        blockOverlay = findViewById<FrameLayout>(R.id.block_overlay)
        staticImageLayer = findViewById<ImageView>(R.id.static_image_layer)
        nativeWidgetContainer = findViewById<FrameLayout>(R.id.native_widget_container)
        
        hideAllLayers()
        
        // Show Standby initially
        standbyImage.visibility = View.VISIBLE
        // [TEORIA DO SURFACE] Mantém invisível em vez de GONE no boot para o Surface ser criado imediatamente
        playerView1.visibility = View.INVISIBLE
        playerView2.visibility = View.INVISIBLE
        blockOverlay.visibility = View.GONE

        try {
            // [MISSION CRITICAL] Initialize Time Module (Persistent NTP Offset)
            TimeManager.init(applicationContext)
            lifecycleScope.launch { 
                delay(5000) // Give network time to settle
                TimeManager.syncTime() 
                
                // [OFFLINE ANALYTICS - BOOT SYNC] Escoa qualquer métrica presa no cofre local se a box desligou ontem
                try {
                    com.antigravity.player.util.DisplayAnalyticsManager.syncWithDashboard(applicationContext)
                } catch (e: Exception) {
                    Logger.e("BOOT", "Falha no Analytics de Boot: ${e.message}")
                }
            }
            
            // [REGIONAL CONTEXT - OFFLINE FIRST] Inicialização profissional da ViewModel
            val repository = ServiceLocator.getRepository(applicationContext)
            
            // [NETWORK MONITOR] Reage fisicamente às mudanças da placa de rede
            val networkMonitor = com.antigravity.player.util.NetworkMonitor(applicationContext)
            networkMonitor.startMonitoring()
            
            viewModel = ViewModelProvider(this@MainActivity, PlayerViewModelFactory(repository, networkMonitor))[PlayerViewModel::class.java]

            // O SEGREDO: Observar os dados
            viewModel.localizacao.observe(this@MainActivity) { config: RegionalConfig? ->
                config?.let {
                    // Instantly load the Singleton for active injections
                    RegionalContextManager.loadFromCache(it.cidade, it.estado, it.timezone)
                }
            }

            // [GATEKEEPER] Observer de Estado do Fluxo de Inicialização
            lifecycleScope.launch {
                viewModel.playerState.collect { estado ->
                    runOnUiThread {
                        when (estado) {
                            com.antigravity.player.ui.PlayerUIState.SYNCING -> {
                                // BLOQUEIO: Garante que apenas a tela de sincronização apareça
                                syncGuard.lockScreen("Sincronizando mídias...")
                                statusTextView.visibility = View.VISIBLE
                                playerView1.visibility = View.GONE
                                playerView2.visibility = View.GONE
                                
                                // Log de depuração para o Mestre acompanhar
                                android.util.Log.d("PLAYER_FLUXO", "Estado: SYNCING - Usuário retido na tela de carregamento.")
                            }
                            com.antigravity.player.ui.PlayerUIState.PLAYING -> {
                                // LIBERAÇÃO: Só acontece quando o CacheManager termina tudo
                                // Transição atômica: uma sobe enquanto a outra desce
                                syncGuard.releaseLock()
                                statusTextView.visibility = View.GONE
                                playerView1.visibility = View.VISIBLE
                                standbyImage.visibility = View.GONE
                                
                                android.util.Log.d("PLAYER_FLUXO", "Estado: PLAYING - Mídias prontas. Iniciando reprodução.")
                            }
                            com.antigravity.player.ui.PlayerUIState.AUTH -> {
                                android.util.Log.d("PLAYER_FLUXO", "Estado: AUTH - Conexão de tela.")
                            }
                            com.antigravity.player.ui.PlayerUIState.PREPARING -> {
                                // O Observer mantém a tela de Sync Visível até termos o frame pintado.
                                // Na prática: LockScreen continua visualmente
                                syncGuard.lockScreen("Preparando Mídias...")
                                statusTextView.visibility = View.VISIBLE
                                playerView1.visibility = View.INVISIBLE
                                playerView2.visibility = View.INVISIBLE
                                android.util.Log.d("PLAYER_FLUXO", "Estado: PREPARING - Verificação de cache local e Pre-Roll.")
                            }
                        }
                    }
                }
            }

            // Background Sync: The ViewModel now handles this automatically when network is restored via observing NetworkMonitor.

            // Enable Kiosk Mode (Full Screen, Keep Screen On)
            DeviceControl.enableKioskMode(this)

            // [MISSION CRITICAL] Populate SessionManager from Disk
            val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
            val savedId = prefs.getString("saved_screen_id", null)
            SessionManager.currentUserId = savedId
            Logger.i("BOOT", "SessionManager Initialized with Screen ID: $savedId")

            // [BILLING BLOCK] Persistence: save/load screen active state
            val lastActiveState = prefs.getBoolean("screen_is_active", true)
            SessionManager.isScreenActive = lastActiveState
            SessionManager.onScreenActiveChanged = { active ->
                prefs.edit { putBoolean("screen_is_active", active) }
                Logger.w("BILLING", "Screen active state persisted: $active")
            }

            // [BILLING BLOCK] Boot Check: If last state was BLOCKED, show overlay immediately
            if (!lastActiveState) {
                Logger.w("BILLING", "BOOT BLOCKED: Last persisted state was DISABLED.")
                blockOverlay.visibility = View.VISIBLE
                playerView1.visibility = View.GONE
                playerView2.visibility = View.GONE
                // standbyImage stays VISIBLE as Layer 0
            }





            
            // RESET FEATURE: Long press status to clear screen ID
            statusTextView.setOnLongClickListener {
                getSharedPreferences("player_prefs", MODE_PRIVATE).edit {
                    remove("saved_screen_id")
                }
                ServiceLocator.resetRepository()
                
                if (!isFinishing && !isDestroyed) {
                    Toast.makeText(this, "ID Resetado! Reiniciando...", Toast.LENGTH_LONG).show()
                }
                
                isKioskEnforced = false // [FIX] Libera o Kiosk Lock antes de abrir a Splash
                val intent = Intent(this, SplashActivity::class.java)
                startActivity(intent)
                finish()
                true
            }

               // [OTA] Auto-Update Initial Check 
            lifecycleScope.launch {
                delay(10000) // Wait for network to stabilize
                ServiceLocator.getOTAUpdateManager(this@MainActivity).checkForUpdates()
            }

            // Initialize Dual Media Engine
            playerRenderer1 = ExoPlayerRenderer(this, "RENDERER_1")
            playerRenderer2 = ExoPlayerRenderer(this, "RENDERER_2")
            
            // [PROFESSIONAL REPRODUCTION MODE] 
            // Calcula e preenche a tela inteira sem distorcer (Center Crop real) no momento em que o hardware acorda
            playerRenderer1.onVideoSizeChanged = { width, height ->
                com.antigravity.player.util.AspectRatioManager.applyCenterCropScale(playerView1, width, height)
            }
            playerRenderer2.onVideoSizeChanged = { width, height ->
                com.antigravity.player.util.AspectRatioManager.applyCenterCropScale(playerView2, width, height)
            }
            
            activePlayer = playerRenderer1
            standbyPlayer = playerRenderer2
        
            // Attach ExoPlayers to Views
            playerView1.player = playerRenderer1.getPlayerInstance()
            playerView2.player = playerRenderer2.getPlayerInstance()
            
            // [HARDENING] Use solid black for shutter to prevent hardware glitches (like green flickering)
            playerView1.setShutterBackgroundColor(Color.BLACK)
            playerView2.setShutterBackgroundColor(Color.BLACK)
            playerView1.setBackgroundColor(Color.BLACK)
            playerView2.setBackgroundColor(Color.BLACK)

            // SMART OFFLINE RECOVERY
            // Listen for Internet Restoration to sync pending updates (Persistent Listener)
            lifecycleScope.launch {
                 var isFirstEmission = true
                 
                 networkMonitor.isConnected.collect { isConnected ->
                     if (isConnected) {
                         if (!isFirstEmission) {
                             runOnUiThread { 
                                 if (!isFinishing && !isDestroyed) {
                                     Toast.makeText(this@MainActivity, "Conexão Restaurada! Sincronizando...", Toast.LENGTH_SHORT).show() 
                                 }
                             }
                             // Internet is back! Force Sync + Reconnect Realtime
                             com.antigravity.player.util.PlaybackBufferManager(applicationContext).flushPendingLogs()
                             lifecycleScope.launch(Dispatchers.IO) { syncInBackground() }
                         }
                     } else {
                         if (!isFirstEmission) {
                             runOnUiThread { 
                                 if (!isFinishing && !isDestroyed) {
                                    updateStatus("Sem Internet. Modo Offline Ativo.")
                                    Toast.makeText(this@MainActivity, "Sem Internet. Modo Offline Ativo.", Toast.LENGTH_LONG).show() 
                                 }
                             }
                         }
                     }
                     isFirstEmission = false
                 }
            }

            // [ADVANCED KIOSK] Intelligent Boot & Service Initialization Flow
            lifecycleScope.launch {
                // 1. Intelligent Boot Delay (ensure hardware readiness de decodificação de vídeo)
                updateStatus("Aguardando Hardware (5s)...")
                delay(5000)

                // 2. Start Synchronization Loop (Cache-First)
                checkLocalCacheAndPlay()
                
                // 3. Start Screenshot Heartbeat (Proof of Life - 1 hour)
                startScreenshotHeartbeat()

                // 4. Initial Capture (Boot Evidence)
                lifecycleScope.launch(Dispatchers.Main) {
                    delay(2000) // Small extra delay to ensure first media is rendering
                    takeProofOfPlayScreenshot()
                }

                // 5. Start OTA Periodic Check (Every 12 hours)
                startOTACycle()

                // 6. Hybrid Player Services Initialization
                
                // Thermal Guard (Protection against Overheating)
                if (!isThermalGuardStarted) {
                    val thermalGuard = ThermalGuard(this@MainActivity)
                    thermalGuard.startMonitoring()
                    isThermalGuardStarted = true
                }
                
                // Auto-Clean Manager (Periodic Maintenance)
                if (!isAutoCleanStarted) {
                    val autoCleanManager = AutoCleanManager(this@MainActivity)
                    autoCleanManager.onRestartRequested = {
                        if (!isFinishing && !isDestroyed) {
                            Toast.makeText(this@MainActivity, "Manutenção Programada (Auto-Clean)...", Toast.LENGTH_SHORT).show()
                            if (::playerRenderer1.isInitialized) playerRenderer1.release()
                            if (::playerRenderer2.isInitialized) playerRenderer2.release()
                            startSyncAndPlay()
                            
                            // Take screenshot after recovery
                            takeProofOfPlayScreenshot()
                        }
                    }
                    autoCleanManager.startCycle()
                    isAutoCleanStarted = true
                }
            }



            
            // [DYNAMIC RECEIVER] Hot-Swap Orientation Listener
            lifecycleScope.launch {
                SessionManager.rotationEvents.collect { newOrientation ->
                    runOnUiThread {
                        applyScreenRotation(newOrientation)
                        Logger.i("HOT_SWAP", "Orientation changed in real-time: $newOrientation")
                    }
                }
            }

            // [REMOTE CONTROL] Hot-Swap Audio Listener
            lifecycleScope.launch {
                SessionManager.audioEvents.collect { isEnabled ->
                    runOnUiThread {
                        if (::playerRenderer1.isInitialized) playerRenderer1.setAudioEnabled(isEnabled)
                        if (::playerRenderer2.isInitialized) playerRenderer2.setAudioEnabled(isEnabled)
                    }
                }
            }

            // [BILLING BLOCK] Deactivation Listener: Block screen when admin disables
            lifecycleScope.launch {
                SessionManager.screenActiveEvents.collect { isActive ->
                    Logger.w("BILLING", "Screen active state changed: $isActive")
                    runOnUiThread {
                        if (!isActive) {
                            // BLOCK: Stop everything and show billing overlay
                            playerRenderer1.stop()
                            playerRenderer2.stop()
                            isSyncLoopRunning = false
                            
                            // Update dynamic message
                            findViewById<TextView>(R.id.block_title)?.text = SessionManager.blockMessage
                            
                            blockOverlay.visibility = View.VISIBLE
                            playerView1.visibility = View.GONE
                            playerView2.visibility = View.GONE
                            // standbyImage stays VISIBLE as Layer 0
                            Logger.w("BILLING", "SCREEN BLOCKED by admin. Message: ${SessionManager.blockMessage}")
                        } else {
                            // UNBLOCK: Hide overlay and resume
                            blockOverlay.visibility = View.GONE
                            statusTextView.visibility = View.VISIBLE
                            updateStatus("Tela reativada! Sincronizando...")
                            Logger.i("BILLING", "SCREEN UNBLOCKED. Resuming playback.")
                            lifecycleScope.launch(Dispatchers.IO) {
                                syncInBackground()
                            }
                        }
                    }
                }
            }

            // [INDUSTRIAL] Maintenance Reset
            lifecycleScope.launch {
                SessionManager.maintenanceEvents.collect {
                    Logger.w("MAIN", "Industrial Maintenance Ping recebido.")
                }
            }
            
            // [INDUSTRIAL] Realtime Maintenance: Remote Command Listener (The "Soberana" Control)
            // Note: Subscription is now handled by PlayerRepositoryImpl on boot
            lifecycleScope.launch {
                SessionManager.remoteCommandEvents.collect { (command, commandId) ->
                    Logger.i("COMMAND", ">>> EVENT RECEIVED: $command (ID: $commandId)")
                    if (command == "screenshot" || command == "take_screenshot") {
                        takeProofOfPlayScreenshot(commandId)
                    } else if (command == "sync") {
                        runOnUiThread { startSyncAndPlay() }
                    } else if (command == "rotate_portrait") {
                        applyScreenRotation("portrait")
                    } else if (command == "rotate_landscape") {
                        applyScreenRotation("landscape")
                    } else if (command == "reboot") {
                         runOnUiThread {
                             Toast.makeText(this@MainActivity, "Comando Remoto: Reiniciando Player...", Toast.LENGTH_LONG).show()
                             Handler(Looper.getMainLooper()).postDelayed({
                                  val intent = Intent(this@MainActivity, SplashActivity::class.java)
                                  startActivity(intent)
                                  finish()
                             }, 2000)
                         }
                    }
                }
            }

            // [HIGH-END] Reactive Playlist Observation (SSOT)
            lifecycleScope.launch {
                ServiceLocator.getRepository(this@MainActivity).getActivePlaylist()
                    .distinctUntilChanged { old, new ->
                        old?.id == new?.id && 
                        old?.items?.size == new?.items?.size && 
                        old?.version == new?.version &&
                        old?.orientation == new?.orientation
                    }
                    .collect { playlist ->
                    if (playlist != null && playlist.items.isNotEmpty()) {
                        com.antigravity.core.util.Logger.i("MAIN", "Reactive Update: Playlist '${playlist.name}' received.")
                        
                        runOnUiThread {
                            // [GATEKEEPER] Removido o fluxo de UI daqui. Apenas isPlaylistReady altera a visibilidade.
                            
                            // 2. Aplica rotação e inicia/atualiza o motor de vídeo
                            applyScreenRotation(playlist.orientation)
                            
                            // START PLAYBACK LOOP (Centralized SSOT)
                            // [ESTRATÉGIA ANTI-CAOS] Aguarda 2000ms antes de iniciar os renders para que o WindowManager
                            // tenha finalizado a rotação e a GPU esteja estável (Previne EGL_BAD_ATTRIBUTE nativo TVBox)
                            if (activePlayer?.getPlayerInstance() == null || activePlayer?.getPlayerInstance()?.playbackState == androidx.media3.common.Player.STATE_IDLE) {
                                Handler(Looper.getMainLooper()).postDelayed({
                                    startPlaybackLoop()
                                }, 2000)
                            } else {
                                startPlaybackLoop()
                            }
                        }
                    }
                }
            }

            // 1. Observe Sync Progress (Enterprise Sync UI)
            lifecycleScope.launch {
                ServiceLocator.getRepository(this@MainActivity).getSyncProgress().collect { progress ->
                    syncGuard.updateProgress(progress)
                    statusTextView.text = progress
                }
            }
            
        } catch (e: Exception) {
            Logger.e("CRITICAL_BOOT", e.message ?: "Unknown Boot Error")
            updateStatus("ERRO CRÍTICO: Reiniciando em 5s...", isError = true)
            
            // [SELF-HEALING] Restart to Login on fatal boot failures
            Handler(Looper.getMainLooper()).postDelayed({
                val intent = Intent(this, com.antigravity.player.ui.LoginActivity::class.java)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                startActivity(intent)
                finish()
            }, 5000)
        }
    }

    private fun checkLocalCacheAndPlay() {
        lifecycleScope.launch(Dispatchers.Main) {
            val repository = ServiceLocator.getRepository(applicationContext)
            
            // 1. Tenta buscar a última playlist que foi salva com sucesso no banco local
            // Usamos loadLocalCache primeiro para garantir que o SSOT (SessionManager) esteja atualizado
            val cacheResult = repository.loadLocalCache()
            val localPlaylist = repository.getActivePlaylist().firstOrNull()

            if (cacheResult.isSuccess && localPlaylist != null && localPlaylist.items.isNotEmpty()) {
                Logger.i("OFFLINE_FIRST", "Cache local encontrado. Iniciando reprodução imediata.")
                
                // 2. Trava a interface no estado PREPARING via Gatekeeper,
                // para que a tela de Sync continue travando o fundo até o motor de fato começar o frame 0.
                viewModel.prepararPrimeiraMidia()
                
                // 3. Aplica a orientação que já estava salva para este dispositivo
                applyScreenRotation(localPlaylist.orientation)
                
                // 4. Inicia o loop de reprodução com os arquivos locais
                // startPlaybackLoop() // Removed as per instruction

                // 5. APÓS iniciar o vídeo, dispara a sincronização em background (silenciosa)
                lifecycleScope.launch(Dispatchers.IO) {
                    Logger.i("SYNC", "Iniciando verificação de atualizações em segundo plano...")
                    syncInBackground()
                }
            } else {
                // Caso não tenha NADA no cache (primeira execução), mantém o fluxo de sincronismo visível
                Logger.w("OFFLINE_FIRST", "Sem cache local. Aguardando sincronização inicial.")
                startSyncAndPlay() 
            }
        }
    }

    private suspend fun syncInBackground() {
        val repo = ServiceLocator.getRepository(applicationContext)
        val syncUseCase = com.antigravity.core.domain.usecase.SyncPlaylistUseCase(repo)
        
        try {
            val result = syncUseCase()
            if (result.isSuccess) {
                Logger.i("SYNC", "Sincronização de background concluída. Novas mídias aplicadas no próximo ciclo.")
                
                // [NEW] Aciona a limpeza cirúrgica após baixar as novas mídias
                SmartCacheCleaner.purgeOrphanedMedia(applicationContext)
                
                // Aplicar configurações silenciosamente (sem piscar a tela)
                val currentPlaylist = repo.getActivePlaylist().firstOrNull()
                currentPlaylist?.let { playlist ->
                    runOnUiThread {
                        SessionManager.apply {
                            heartbeatIntervalSeconds = playlist.heartbeatIntervalSeconds
                            seamlessTransition = playlist.seamlessTransition
                            cacheNextMedia = playlist.cacheNextMedia
                        }
                        applyScreenRotation(playlist.orientation)
                    }
                }
            } else {
                val msg = result.exceptionOrNull()?.message ?: "Unknown"
                if (msg.contains("JWT expired", ignoreCase = true) || msg.contains("401", ignoreCase = true)) {
                    runOnUiThread { handleAuthError() }
                }
                // Silenciosamente tenta de novo em 1 minuto
                Handler(Looper.getMainLooper()).postDelayed({ 
                    lifecycleScope.launch(Dispatchers.IO) { syncInBackground() }
                }, 60000)
            }
        } catch (e: Exception) {
            Logger.e("SYNC", "Background sync error: ${e.message}")
            Handler(Looper.getMainLooper()).postDelayed({ 
                lifecycleScope.launch(Dispatchers.IO) { syncInBackground() }
            }, 60000)
        }
    }

    private fun startSyncAndPlay() {
        if (isSyncInProgress) {
            Logger.w("SYNC", "Sync already in progress. Skipping redundant call.")
            return
        }
        isSyncInProgress = true
        
        lifecycleScope.launch {
            // Sincronização VISÍVEL para primeira carga ou erro fatal de cache
            updateStatus("Sincronizando mídias...", isError = false)
            runOnUiThread { 
                syncGuard.lockScreen("Sincronizando mídias...") 
                statusTextView.visibility = View.VISIBLE
            }
            
            // [SMART_CLEANER] 2. Faxina Pré-Playlist: Limpa fantasmas antes de sincronizar o banco
            SmartCacheCleaner.purgeOrphanedMedia(applicationContext)
            
            val repo = ServiceLocator.getRepository(applicationContext)
            val syncUseCase = com.antigravity.core.domain.usecase.SyncPlaylistUseCase(repo)
            
            try {
                viewModel.iniciarFluxoDeMidia(
                    syncUseCase = syncUseCase,
                    onSyncSuccess = {
                        lifecycleScope.launch(Dispatchers.IO) {
                            val currentPlaylist = repo.getActivePlaylist().firstOrNull()
                            runOnUiThread {
                                if (currentPlaylist != null) {
                                    val playlist = currentPlaylist
                                    com.antigravity.sync.service.SessionManager.apply {
                                        heartbeatIntervalSeconds = playlist.heartbeatIntervalSeconds
                                        seamlessTransition = playlist.seamlessTransition
                                        cacheNextMedia = playlist.cacheNextMedia
                                    }
                                    applyScreenRotation(playlist.orientation)
                                }
                                updateStatus("Sincronizado!")
                            }
                        }
                    },
                    onSyncError = { errorMsg ->
                        val isAborted = errorMsg.contains("aborted", ignoreCase = true) || errorMsg.contains("timeout", ignoreCase = true)
                        Logger.e("SYNC", "Sync failed: $errorMsg. Is Aborted/Timeout: $isAborted")
                        
                        lifecycleScope.launch(Dispatchers.IO) {
                            val localResult = repo.loadLocalCache()
                            if (localResult.isSuccess) {
                                Logger.i("SYNC", "[RESILIENCE] Network failed ($errorMsg), mas cache local encontrado. Resumindo...")
                                runOnUiThread { updateStatus("Modo Offline Ativo") }
                                viewModel.prepararPrimeiraMidia()
                                return@launch 
                            }

                            runOnUiThread { updateStatus("Erro: $errorMsg", isError = true) }

                            if (errorMsg.contains("JWT expired", ignoreCase = true) || errorMsg.contains("401", ignoreCase = true)) {
                                handleAuthError("Sessão Expirada (401)")
                            } else if (errorMsg.contains("Tela não encontrada", ignoreCase = true) || errorMsg.contains("404", ignoreCase = true)) {
                                Logger.w("SYNC", "ID Inválido.")
                                runOnUiThread { updateStatus("ID Rejeitado pelo Painel", isError = true) }
                                handleAuthError("Aparelho não vinculado ou ID inválido.")
                            } else if (errorMsg.contains("[PERMANENT]") || errorMsg.contains("Invalid remote playlist", ignoreCase = true)) {
                                runOnUiThread { updateStatus("Playlist Inválida. Recuperando...", isError = true) }
                                performAutoRepair() 
                            } else {
                                val retryDelay = if (isAborted) 15000L else 30000L
                                Handler(Looper.getMainLooper()).postDelayed({ startSyncAndPlay() }, retryDelay)
                            }
                        }
                    }
                )
            } catch (e: Exception) {
                 val errorMsg = e.message ?: "Erro desconhecido"
                 Logger.e("SYNC", "Critical failure: $errorMsg", e)
                 runOnUiThread { 
                     syncGuard.releaseLock() 
                     updateStatus("Falha Crítica: $errorMsg", isError = true)
                 }
                 Handler(Looper.getMainLooper()).postDelayed({ startSyncAndPlay() }, 10000)
            } finally {
                isSyncInProgress = false
            }
        }
    }
    
    // [NEW] Helper for Permanent Errors
    private fun showChangeScreenOption() {
        runOnUiThread {
            if (!isFinishing && !isDestroyed) {
                Toast.makeText(this, "Dica: Mantenha pressionado o texto de status para trocar de tela.", Toast.LENGTH_LONG).show()
            }
        }
    }
    
     private fun handleAuthError(reason: String = "Sessão Expirada") {
          // [SAFEGUARD] Only redirect if screen is indeed not syncing and it's a hard 401
          lifecycleScope.launch(Dispatchers.IO) {
              val auth = ServiceLocator.authRepository
              val isSessionValid = auth.restoreSession(applicationContext)
              if (isSessionValid) {
                  Logger.i("AUTH", "Session is actually valid. Ignoring false auth error.")
                  return@launch
              }
              
              updateStatus(reason, isError = true)
              
              // 1. Centralized SignOut (Clears Tokens & SessionManager)
              ServiceLocator.authRepository.signOut(applicationContext)

              // 2. Clear Config Prefs
              val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
              prefs.edit().apply {
                  remove("saved_screen_id")
                  remove("current_orientation")
                  apply()
              }

              // 3. Reset Global State
              ServiceLocator.resetRepository() 
              withContext(Dispatchers.Main) {
                  isKioskEnforced = false // [FIX] Impede que a MainActivity roube a tela de volta antes de morrer
                  com.antigravity.player.util.DeviceControl.disableKioskMode(this@MainActivity)
         
                  // 4. Force Restart to Login
                  val intent = Intent(this@MainActivity, com.antigravity.player.ui.LoginActivity::class.java)
                  intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                  startActivity(intent)
                  finish()
              }
          }
     }
    
    // Updated for Professional UI
    private fun updateStatus(text: String, isError: Boolean = false) {
        runOnUiThread {
            // Main Status Text
            statusTextView.text = text
            
            // Device ID (Subtle)
            val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
            val deviceId = prefs.getString("saved_screen_id", "N/A") ?: "N/A"
            val deviceIdView = findViewById<TextView>(R.id.status_device_id) 
            if (deviceIdView != null) {
                deviceIdView.text = "ID: $deviceId"
                if (isError) deviceIdView.setTextColor(Color.RED)
                else deviceIdView.setTextColor("#64748B".toColorInt())
            }
 
            if (isError) {
                statusTextView.setTextColor(Color.RED)
            } else {
                statusTextView.setTextColor("#F8FAFC".toColorInt())
            }
        }
    }

    /**
     * [SEAMLESS ENGINE V3] Atômico e Estrito.
     * Troca de visibilidade com gap cirúrgico de 50ms para garantir refresh da GPU.
     */
    private fun performSeamlessSwap(viewToFadeOut: View, viewToFadeIn: View, newPlayer: ExoPlayerRenderer?) {
        runOnUiThread {
            playbackWatchdog.stop()

            // 1. O vídeo novo já está tocando e com frame push feito via listener. Liberamos o áudio.
            newPlayer?.setAudioEnabled(true)
            
            // 2. Delay Atômico para troca impecável
            Handler(Looper.getMainLooper()).postDelayed({
                // Troca simultânea instantânea (Visibility)
                viewToFadeOut.visibility = View.INVISIBLE
                viewToFadeIn.alpha = 1f
                
                // 3. Limpa a Mídia Antiga para a Próxima Rodada (-RAM)
                val oldPlayerView = (viewToFadeOut as? androidx.media3.ui.PlayerView)
                oldPlayerView?.player?.stop()
                oldPlayerView?.player?.clearMediaItems()
                
            }, 50)
            
            // Cleanup de overlays inativos
            Handler(Looper.getMainLooper()).postDelayed({
                staticImageLayer.visibility = View.GONE
                nativeWidgetContainer.visibility = View.GONE
                standbyImage.visibility = View.VISIBLE
            }, 100)
        }
    }

    private fun logBlackBox(state: String, details: String = "") {
        try {
            val timestamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
            Logger.i("BLACK_BOX", "[$timestamp] STATE: $state | DETAILS: $details")
        } catch (e: Exception) {}
    }

    // [DIAGNÓSTICO VISUAL] Fim do jogo de adivinhação
    private fun exibirAlertaDeMidiaCorrompida(nomeMidia: String) {
        runOnUiThread {
            if (!isFinishing && !isDestroyed) {
                val erroMsg = "⚠️ ERRO DE MÍDIA: [$nomeMidia]\nPrecisa de Re-upload"
                Toast.makeText(this@MainActivity, erroMsg, Toast.LENGTH_LONG).show()
                Logger.e("ANTIGRAVITY", erroMsg)
            }
        }
    }

    private fun startPersistentHeartbeat() {
        val intent = Intent(this, com.antigravity.player.service.PersistentHeartbeatService::class.java)
        try {
            androidx.core.content.ContextCompat.startForegroundService(this, intent)
        } catch (e: Exception) {
            Logger.e("HEARTBEAT_PROC", "Falha ao iniciar Foreground Service: ${e.message}")
        }
    }

    // ========================================================================
    // [INDUSTRIAL ENGINES] ISOLATED PLAYBACK MOTORS
    // ========================================================================
    
    private suspend fun engineVideo(item: MediaItem, nextItem: MediaItem): Boolean {
        logBlackBox("ENGINE_VIDEO", "Target: ${item.name}")
        val durationMs = item.durationSeconds * 1000L
        
        val fileName = "${item.id}.dat"
        val localFile = com.antigravity.player.util.CacheManager.verificarEBaixar(this@MainActivity, item.remoteUrl, fileName)
        
        if (!localFile.exists() || localFile.length() <= 0L) {
            Logger.e("ENGINE_VIDEO", "File critical failure: Mídia ${item.name} não existe ou tem 0 bytes.")
            exibirAlertaDeMidiaCorrompida(item.name)
            return true 
        }
        
        // Muta para cortar o estalo inicial
        activePlayer?.setAudioEnabled(false)
        
        val viewToFadeIn = if (activePlayer == playerRenderer1) playerView1 else playerView2
        val viewToFadeOut = if (activePlayer == playerRenderer1) playerView2 else playerView1
        
        runOnUiThread {
            viewToFadeIn.alpha = 0f 
            viewToFadeIn.visibility = View.VISIBLE
            viewToFadeIn.resizeMode = androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            
            lifecycleScope.launch {
                try {
                    activePlayer?.play() // Inicia B por trás, mutado.
                    
                    val listener = object : androidx.media3.common.Player.Listener {
                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            if (isPlaying) {
                                runOnUiThread {
                                    viewModel.confirmarMidiaPronta()
                                    statusTextView.visibility = View.GONE
                                    
                                    // [ATOMIC SWAP] 
                                    performSeamlessSwap(viewToFadeOut, viewToFadeIn, activePlayer)
                                    
                                    val rawPlayer = activePlayer?.getPlayerInstance()
                                    if (rawPlayer != null) {
                                        playbackWatchdog.watch(rawPlayer)
                                    }
                                }
                                activePlayer?.getPlayerInstance()?.removeListener(this)
                            }
                        }
                    }
                    activePlayer?.getPlayerInstance()?.addListener(listener)
                    
                } catch (e: Exception) {
                    Logger.e("ANTIGRAVITY", "Exceção no Play Async: ${e.message}")
                    runOnUiThread { viewToFadeOut.animate().alpha(0f).setDuration(300).start(); standbyImage.visibility = View.VISIBLE }
                }
            }
        }
        
        // [V3 STRICT DOUBLE BUFFER ENGINE] Active Polling Frame Loop
        val startTime = System.currentTimeMillis()
        var nextPreloaded = false
        
        while (kotlinx.coroutines.currentCoroutineContext().isActive) {
            val player = activePlayer?.getPlayerInstance()
            if (player == null) {
                delay(durationMs)
                break
            }
            
            val currentPos = player.currentPosition
            val realDurationMs = if (player.duration > 0) player.duration else durationMs
            val remaining = realDurationMs - currentPos
            
            // 1. Gatilho de Pre-Buffering (Exatos 5 Segundos antes do Fim)
            if (remaining <= 5000L && !nextPreloaded) {
                Logger.i("SEAMLESS_DIAGNOSTIC", "Buffer Readiness Triggered. Pre-Loading next: ${nextItem.name}")
                lifecycleScope.launch {
                    when (nextItem.type) {
                        MediaType.VIDEO, MediaType.IMAGE -> standbyPlayer?.preBuffer(nextItem)
                        else -> {}
                    }
                }
                nextPreloaded = true
            }
            
            // 2. Ponte de Corte (100ms antes do fim real para evitar a tela preta intrínseca de conclusão)
            if (remaining <= 100L && currentPos > 0) {
                Logger.i("SEAMLESS_DIAGNOSTIC", "Encerramento Seamless (-100ms). Devolvendo controle de engine.")
                break
            }
            
            // 3. Failsafe global
            if (System.currentTimeMillis() - startTime > realDurationMs + 5000L) {
                Logger.e("SEAMLESS_DIAGNOSTIC", "Tempo expirado forçadamente")
                break
            }
            
            delay(10) // Ultra-smooth 10ms frame polling
        }
        
        // [STABILITY] Reset watchdog for next item
        playbackWatchdog.reset()
        
        return false
    }

    private suspend fun engineStatic(item: MediaItem): Boolean {
        logBlackBox("ENGINE_STATIC", "Loading: ${item.name}")
        val durationMs = item.durationSeconds * 1000L
        
        // [SURVIVOR PLAN] Ensure file exists locally before loading image
        val fileName = "${item.id}.dat"
        val localFile = com.antigravity.player.util.CacheManager.verificarEBaixar(this@MainActivity, item.remoteUrl, fileName)
        
        // [ANTI-CAOS] Validação Física Categórica.
        if (!localFile.exists() || localFile.length() <= 0L) {
            Logger.e("ENGINE_STATIC", "File critical failure: Imagem ${item.name} não existe ou tem 0 bytes. Pulando.")
            exibirAlertaDeMidiaCorrompida(item.name)
            return true 
        }
        
        // Use local path for Glide to ensure ZERO egress
        val path = localFile.absolutePath
        
        runOnUiThread {
            val profile = com.antigravity.media.exoplayer.ChipsetDetector.getRecommendedProfile()
            val glideRequest = Glide.with(this@MainActivity)
                .load(path)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
            
            // [PERFORMANCE] Downsample images on legacy/emulator hardware to save RAM
            if (profile == com.antigravity.media.exoplayer.ChipsetDetector.HardwareProfile.LEGACY_STABILITY) {
                glideRequest.override(1280, 720) 
            }
            
            // [ZERO-GAP GATEKEEPER]
            // Atrela o destravamento da tela de Sincronismo apenas quando a imagem for carregada no ImageView
            glideRequest.listener(object : com.bumptech.glide.request.RequestListener<android.graphics.drawable.Drawable> {
                override fun onLoadFailed(
                    e: com.bumptech.glide.load.engine.GlideException?,
                    model: Any?,
                    target: com.bumptech.glide.request.target.Target<android.graphics.drawable.Drawable>,
                    isFirstResource: Boolean
                ): Boolean {
                    Logger.e("ENGINE_STATIC", "Falha ao carregar imagem para o pre-roll: ${e?.message}")
                    return false
                }

                override fun onResourceReady(
                    resource: android.graphics.drawable.Drawable,
                    model: Any,
                    target: com.bumptech.glide.request.target.Target<android.graphics.drawable.Drawable>?,
                    dataSource: com.bumptech.glide.load.DataSource,
                    isFirstResource: Boolean
                ): Boolean {
                    runOnUiThread {
                        viewModel.confirmarMidiaPronta()
                    }
                    return false
                }
            }).into(staticImageLayer)
            
            staticImageLayer.visibility = View.VISIBLE
            
            // Explicitly hide non-image layers to prevent overlap.
            // [DOUBLE BUFFERING] Usamos INVISIBLE invés de GONE para não quebrar as referências das Surfaces na memória
            playerView1.visibility = View.INVISIBLE
            playerView2.visibility = View.INVISIBLE
            nativeWidgetContainer.visibility = View.GONE
            standbyImage.visibility = View.GONE
            
            // [PERFORMANCE] Stop active video engine to free hardware decoders
            // DO NOT stop standby player as it is pre-buffering the next item.
            if (activePlayer == playerRenderer1) {
                playerRenderer1.stop()
            } else {
                playerRenderer2.stop()
            }
        }
        
        delay(durationMs)
        return false
    }

    private suspend fun engineWidget(item: MediaItem): Boolean {
        logBlackBox("ENGINE_WIDGET", "Native rendering: ${item.remoteUrl}")
        
        // Formato esperado da URL nativa: native_widget://[tipo]/[id]
        val widgetType = if (item.remoteUrl.startsWith("native_widget://")) {
            item.remoteUrl.substringAfter("native_widget://").substringBefore("/")
        } else {
            // Em caso de fallback onde o banco antigo guardava "weather" ou "clock" no nome
            item.name.lowercase()
        }

        // 1. Oculta todos os layers e mostra o container nativo
        runOnUiThread {
            nativeWidgetContainer.visibility = View.VISIBLE
            
            // Oculta vídeo e imagem
            // [DOUBLE BUFFERING] Usamos INVISIBLE invés de GONE para as Surfaces sobreviverem
            playerView1.visibility = View.INVISIBLE
            playerView2.visibility = View.INVISIBLE
            staticImageLayer.visibility = View.GONE
            standbyImage.visibility = View.GONE
            
            // Pausa processamento de vídeo do player ativo
            // [HARD LIMITER] Para o engine, mas mantém o Hard-Bind
            playerRenderer1.stop()
            playerRenderer2.stop()
        }

        // 2. Renderiza a Interface diretamente no Layout Nativo do Android
        com.antigravity.player.util.NativeWidgetEngine.renderWidget(this@MainActivity, nativeWidgetContainer, item.remoteUrl)

        // [ZERO-GAP GATEKEEPER]
        // Widgets nativos são carregados de forma quase instantânea na UI thread, 
        // então assim que a view é populada, podemos liberar a tela de Sync.
        runOnUiThread {
            viewModel.confirmarMidiaPronta()
        }

        // 3. Aguarda duração programada
        val durationMs = item.durationSeconds * 1000L
        kotlinx.coroutines.delay(durationMs)
        
        return false
    }

    private suspend fun engineLink(item: MediaItem): Boolean {
        return engineWidget(item) 
    }

    private fun hideAllLayers() {
        runOnUiThread {
            // [TEORIA DO SURFACE] Mantém os players invisíveis em vez de GONE no reset geral,
            // para que a Surface se prepare antes que o primeiro vídeo toque.
            playerView1.visibility = View.INVISIBLE
            playerView2.visibility = View.INVISIBLE
            staticImageLayer.visibility = View.GONE
            standbyImage.visibility = View.GONE
            nativeWidgetContainer.visibility = View.GONE
        }
    }

    /**
     * [CONTINGENCY] Modo de Emergência - Vídeo Interno
     * Tenta reproduzir o standby.mp4 da pasta assets se não houver internet nem cache.
     */
    private fun playStandbyVideo() {
        val standbyUri = android.net.Uri.parse("asset:///standby.mp4")
        val item = com.antigravity.core.domain.model.MediaItem(
            id = "STANDBY_FALLBACK",
            name = "Standby Loop",
            type = com.antigravity.core.domain.model.MediaType.VIDEO,
            remoteUrl = "",
            durationSeconds = 60,
            localPath = null,
            hash = "",
            orderIndex = 0
        )
        
        lifecycleScope.launch {
            try {
                // Previne crash se o player não estiver inicializado
                if (activePlayer == null) {
                    runOnUiThread { standbyImage.visibility = View.VISIBLE }
                    return@launch
                }

                // Substitui a URI real pela URI de Asset diretamente no ExoPlayer underlying
                val rawPlayer = activePlayer?.getPlayerInstance()
                if (rawPlayer != null) {
                    runOnUiThread {
                        rawPlayer.setMediaItem(androidx.media3.common.MediaItem.fromUri(standbyUri))
                        rawPlayer.prepare()
                        rawPlayer.play()
                        
                        // Swap atômico (invisível -> visível)
                        val viewIn = if (activePlayer == playerRenderer1) playerView1 else playerView2
                        val viewOut = if (activePlayer == playerRenderer1) playerView2 else playerView1
                        
                        performSeamlessSwap(viewOut, viewIn, activePlayer)
                    }
                }
            } catch (e: Exception) {
                Logger.e("CONTINGENCY", "Falha ao tocar standby.mp4: ${e.message}")
                runOnUiThread { standbyImage.visibility = View.VISIBLE }
            }
        }
    }

    private fun startPlaybackLoop() {
        if (isSyncLoopRunning) return
        isSyncLoopRunning = true
        
        lifecycleScope.launch {
            logBlackBox("BOOT", "Armor Initialized")
            delay(2000)
            
            val repository = ServiceLocator.getRepository(applicationContext)
            // Canal único para sinalização de fim de mídia (ExoPlayer)
            val playbackEndedChannel = kotlinx.coroutines.channels.Channel<Unit>(kotlinx.coroutines.channels.Channel.CONFLATED)
            
            // [WATCHDOG] Detector de Congelamento Global
            playbackWatchdog = PlaybackWatchdog {
                logBlackBox("WATCHDOG", "EMERGENCY_SKIP")
                runOnUiThread {
                    // [FAIL-SAFE VISUAL] Oculta o player travado e mostra a logo Neutra
                    val currentView = if (activePlayer == playerRenderer1) playerView1 else playerView2
                    currentView.animate().alpha(0f).setDuration(300).start()
                    standbyImage.visibility = View.VISIBLE
                }
                playbackEndedChannel.trySend(Unit)
            }
            
            // [INDUSTRIAL QUEUE MANAGER]
            val queueManager = com.antigravity.player.util.QueueManager()
            
            while (isActive) {
                try {
                    // 1. Atualização de Dados (Agendamento Automático)
                    val playlist = repository.getActivePlaylist().firstOrNull()
                    if (playlist == null) {
                        logBlackBox("IDLE", "No playlist found")
                        delay(10000)
                        continue
                    }
                    val playableItems = playlist.items.filter { SchedulingEngine.shouldPlay(it) }

                    if (playableItems.isEmpty()) {
                        logBlackBox("IDLE", "No items scheduled. Triggering Standby Fallback.")
                        runOnUiThread {
                            hideAllLayers()
                            playStandbyVideo()
                        }
                        delay(20000)
                        continue
                    }

                    // [DEBUG] Monitor the exact sequence seen by the player
                    val sequenceLog = playableItems.joinToString(", ") { it.id }
                    Logger.i("PLAYBACK_LOOP", "Active Sequence [Size=${playableItems.size}]: $sequenceLog")

                    // 2. [QUEUE MANAGER] Resilient Cursor and Blacklist Aware Iterator
                    val (item, isWrapAround) = queueManager.getNextPlayableItem(playableItems)
                    if (item == null) {
                        logBlackBox("ERROR", "QueueManager esgotou todas mídias válidas (Todos em Quarentena).")
                        delay(2000) 
                        continue
                    }
                    
                    // [HARDWARE RESILIENCE] Faxina Profunda de Memória
                    // Rodamos isso EXATAMENTE na virada de ciclo para esconder qualquer stutter (engasgo do Garbage Collector)
                    if (isWrapAround) {
                        com.antigravity.player.util.MemoryLeakGuardian.performSanityCheck(this@MainActivity)
                    }
                    
                    val nextItem = queueManager.peekNext(playableItems, item) ?: playableItems.first()
                    
                    // [AUTO-RESTART WATCHDOG] Postpone OS-level reboot alarm dynamically based on media duration
                    val watchdogTimeout = (item.durationSeconds * 1000L).coerceAtLeast(60000L) + 60000L
                    startWatchdog(watchdogTimeout)
                    startPersistentHeartbeat()
                    
                    // 3. EXECUÇÃO PELOS MOTORES (Isolamento de Hardware)
                    val skipOnFail = when (item.type) {
                        MediaType.VIDEO -> engineVideo(item, nextItem)
                        MediaType.IMAGE -> engineStatic(item)
                        MediaType.WEB_WIDGET -> engineWidget(item)
                        MediaType.EXTERNAL_LINK -> engineLink(item)
                        MediaType.STREAM_RTSP, MediaType.STREAM_HLS -> engineVideo(item, nextItem)
                        else -> {
                            logBlackBox("SKIP", "Untracked type: ${item.type}")
                            true
                        }
                    }

                    if (skipOnFail) {
                        logBlackBox("RECOVERY", "Skipping failed item: ${item.name}")
                        // [CRITICAL FIX] Quarentena Ativa: Avisa o QueueManager e freia o CPU
                        queueManager.quarantineItem(item.id, "EngineSkip (Hardware/Codec Reject)")
                        
                        // [TV BOX FREIO DE MÃO] Assíncrono Back-off para a GPU esfriar antes de tentar o próximo vídeo 
                        logBlackBox("RECOVERY", "Aguardando 2000ms GPU cooldown.")
                        delay(2000L) 
                    } else {
                        // 5. Swap de Players de Vídeo (SEMPRE)
                        // This ensures the standbyPlayer (which just prebuffered nextItem)
                        // becomes the activePlayer for the next loop iteration.
                        val temp = activePlayer
                        activePlayer = standbyPlayer
                        standbyPlayer = temp
                        
                        // [CRITICAL FIX] Marca como tocado garantindo o avanço
                        queueManager.markAsProcessed(item.id)

                        // [AUDIT LOG - OFFLINE FIRST] Registra o sucesso da exibição no cofre local
                        com.antigravity.player.util.DisplayAnalyticsManager.registerPlayback(
                            context = this@MainActivity,
                            mediaId = item.id,
                            mediaName = item.name,
                            duration = item.durationSeconds.toInt()
                        )
                    }
                } catch (e: Exception) {
                    Logger.e("LOOP_CRASH", "Exception in playback loop: ${e.message}", e)
                    logBlackBox("LOOP_CRASH", e.message ?: "Unknown")
                    reportErrorToSupabase("FATAL_LOOP_EXCEPTION", e.message ?: "Unknown")
                    delay(5000)
                }
            }
        }
    }


    override fun onDestroy() {
        super.onDestroy()
        if (::playerRenderer1.isInitialized) playerRenderer1.release()
        if (::playerRenderer2.isInitialized) playerRenderer2.release()
    }

    // --- KIOSK MODE ENFORCEMENT ---
    
    @SuppressLint("MissingSuperCall")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // Block Back Button in Kiosk Mode
    }

    override fun onResume() {
        super.onResume()
        
        // Se voltamos de uma configuração, reseta o flag global de travamento
        // 2. Ensure player resumes immediately if it was paused/stopped
        val resumePlayer = activePlayer?.getPlayerInstance()
        if (resumePlayer != null && !resumePlayer.isPlaying && resumePlayer.playbackState == androidx.media3.common.Player.STATE_READY) {
            resumePlayer.play()
        }
        
        // 3. Re-enforce Kiosk
        DeviceControl.enableKioskMode(this) 

    }


    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // [MISSION CRITICAL] Silent Immersive Enforcement (No prompts, no Toasts)
        if (hasFocus) {
            val windowInsetsController = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
            // Esconde barras de status e navegação
            windowInsetsController.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            // Garante que elas só apareçam se o usuário deslizar (e sumam logo depois)
            windowInsetsController.systemBarsBehavior = 
                androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            // [KIOSK LOCK] Se perdeu o foco (ex: Home pressionado, outra intent abrindo)
            // E o modo kiosk está ativo globalmente, force o redirecionamento imediato para a MainActivity.
            if (isKioskEnforced) {
                Logger.w("KIOSK", "Focus lost. Forcing MainActivity back to top (activityManager.moveTaskToFront).")
                try {
                    val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
                    am.moveTaskToFront(taskId, android.app.ActivityManager.MOVE_TASK_WITH_HOME)
                } catch (e: Exception) {
                    Logger.e("KIOSK", "Failed to moveTaskToFront: ${e.message}")
                }
            }
        }
    }

    private fun performAutoRepair() {
        if (isFinishing || isDestroyed) return
        
        Logger.w("SELF_HEALING", "INITIATING AUTO-REPAIR PROTOCOL (3 Failures Detected)")
        consecutiveGlobalFailures = 0
        
        // [WATCHDOG] Stop monitoring during repair
        if (::playbackWatchdog.isInitialized) playbackWatchdog.stop()
        
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // 1. Audit Log to Supabase
                reportErrorToSupabase("AUTO_REPAIR_EXECUTED", "Threshold reached. Resetting database state.")
                
                // 2. Data Hygiene: Mass Delete Tables
                val db = com.antigravity.cache.db.PlayerDatabase.getDatabase(applicationContext)
                db.playerDao().deleteAllPlaylists()
                db.playerDao().deleteAllMediaItems()
                Logger.i("SELF_HEALING", "Data Hygiene Complete: Local Tables Wiped.")
                
                // 3. Memory Hygiene — force GC after full cleanup
                System.gc()
                
                // 4. Force Sync 
                withContext(Dispatchers.Main) {
                    if (!this@MainActivity.isFinishing && !this@MainActivity.isDestroyed) {
                        Toast.makeText(this@MainActivity, "Reparo Automático: Atualizando Playlist...", Toast.LENGTH_LONG).show()
                        startSyncAndPlay()
                    }
                }
            } catch (e: Exception) {
                Logger.e("SELF_HEALING", "Auto-Repair Failed: ${e.message}")
            }
        }
    }

    private fun reportErrorToSupabase(type: String, detail: String) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val remoteDataSource = ServiceLocator.getRemoteDataSource()
                val screenId = getSharedPreferences("player_prefs", MODE_PRIVATE).getString("saved_screen_id", "UNKNOWN") ?: "UNKNOWN"
                
                remoteDataSource.insertErrorLog(
                    screenId = screenId,
                    type = "SAFE_LOADING_$type",
                    message = detail,
                    stackTrace = "Source: MainActivity.SafeLoading",
                    stats = mapOf("url" to detail)
                )
                Logger.e("SUPABASE_LOG", "Silent Error [$type] reported for Screen: $screenId")
            } catch (e: Exception) {
                Logger.e("SUPABASE_LOG", "Failed to report error: ${e.message}")
            }
        }
    }

    // --- SYSTEM UTILITIES (Recovered from regression) ---

    private fun setFullscreenMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
        windowInsetsController?.hide(WindowInsetsCompat.Type.systemBars())
        windowInsetsController?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private fun applyScreenRotation(orientation: String?) {
        runOnUiThread {
            when (orientation?.lowercase()) {
                "portrait", "retrato", "vertical" -> {
                    Logger.i("ORIENTATION", "Forcing Portrait Mode")
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                }
                "landscape", "paisagem", "horizontal" -> {
                    Logger.i("ORIENTATION", "Forcing Landscape Mode")
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                }
                else -> {
                    Logger.i("ORIENTATION", "No valid orientation received: $orientation. Keeping current.")
                }
            }
            // Trigger layout recalculation immediately for hardware constraints
            window.decorView.requestLayout()
        }
    }

    private fun startScreenshotHeartbeat() {
        lifecycleScope.launch {
            while (isActive) {
                delay(21600000) // 6 hours (Optimization: drastically reduce egress/quota)
                if (SessionManager.isScreenActive) {
                    takeProofOfPlayScreenshot()
                }
            }
        }
    }

    private fun startOTACycle() {
        lifecycleScope.launch {
            while (isActive) {
                delay(43200000) // 12 hours
                ServiceLocator.getOTAUpdateManager(this@MainActivity).checkForUpdates()
            }
        }
    }

    private fun takeProofOfPlayScreenshot(commandId: String? = null) {
        // [COMPATIBILITY] PixelCopy requires API Level 26 (Android O)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Logger.w("SCREENSHOT", "PixelCopy not supported on API < 26. Skipping.")
            return
        }

        lifecycleScope.launch {
            // 1. [SILENCIADOR] Bloqueia o tráfego do Heartbeat Service e processos secundários
            com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = true
            
            // 2. [LIXEIRO] Varre a RAM para liberar espaço na GPU de caixas baratas (O Pulo do Gato)
            System.gc()
            
            // 3. Aguarda 2 segundos estritos para a CPU/Rede/Memória estarem em Idle total
            delay(2000)

            val view = window.decorView
            if (view.width <= 0 || view.height <= 0) {
                com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = false
                return@launch
            }
            
            try {
                val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
                PixelCopy.request(window, bitmap, { copyResult ->
                    if (copyResult == PixelCopy.SUCCESS) {
                        lifecycleScope.launch(Dispatchers.IO) {
                            try {
                                val stream = java.io.ByteArrayOutputStream()
                                bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                                val byteArray = stream.toByteArray()
                                
                                val screenId = getSharedPreferences("player_prefs", MODE_PRIVATE).getString("saved_screen_id", "UNKNOWN") ?: "UNKNOWN"
                                ServiceLocator.getRemoteDataSource().uploadScreenshot(screenId, byteArray, "manual")
                                
                                if (commandId != null) {
                                    ServiceLocator.getRemoteDataSource().acknowledgeCommand(commandId, "success")
                                }
                            } catch (e: Exception) {
                                Logger.e("SCREENSHOT", "Upload failed: ${e.message}")
                            } finally {
                                // [LIBERAÇÃO] Devolve o controle ao Heartbeat
                                com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = false
                            }
                        }
                    } else {
                        com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = false
                    }
                }, Handler(Looper.getMainLooper()))
            } catch (e: Exception) {
                Logger.e("SCREENSHOT", "Hard Crash during capture: ${e.message}")
                com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = false
            }
        }
    }

    // ========================================================================
    // [ESCAPE PROTOCOL] DIRECT ESCAPE MAINTENANCE MODE
    // ========================================================================

    override fun onTouchEvent(event: android.view.MotionEvent?): Boolean {
        if (event?.action == android.view.MotionEvent.ACTION_DOWN) {
            triggerMaintenanceFree()
        }
        return super.onTouchEvent(event)
    }

    override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent?): Boolean {
        triggerMaintenanceFree()
        return super.onKeyDown(keyCode, event)
    }

    private fun triggerMaintenanceFree() {
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastInputTime > 1500) {
            maintenanceCounter = 1
        } else {
            maintenanceCounter++
        }
        lastInputTime = currentTime

        if (maintenanceCounter >= 3) {
            enableSystemNavigation()
            maintenanceCounter = 0
        }
    }

    private fun enableSystemNavigation() {
        if (!isKioskEnforced) {
            // Se já estiver liberado, zera o timer e reinicia os 4 min
            maintenanceJob?.cancel()
        } else {
            // 1. Pausa a blindagem (Kiosk Lock no onWindowFocusChanged)
            isKioskEnforced = false
            Logger.w("ESCAPE_PROTOCOL", "Modo Manutenção ativado. System UI liberada e MoveTaskToFront bloqueado.")

            // 2. Libera as barras de navegação (Home / Back Buttons) visíveis
            runOnUiThread {
                val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
                windowInsetsController?.show(WindowInsetsCompat.Type.systemBars())
                windowInsetsController?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT

                Toast.makeText(this, "MODO DE MANUTENÇÃO: Sistema Liberado por 4 Min. Pressione Home para sair.", Toast.LENGTH_LONG).show()
            }
        }

        // 3. Força o Timer de 4 minutos (240 segundos) independente do clique
        maintenanceJob = lifecycleScope.launch {
            delay(240_000L) // 4 Minutos

            runOnUiThread {
                Toast.makeText(this@MainActivity, "Tempo Exgotado. Retomando Controle (Kiosk Lock).", Toast.LENGTH_LONG).show()
                isKioskEnforced = true
                setFullscreenMode() // Esconde a barra e reativa Swipe Mode
                
                // Força um foco instantâneo caso tenha minimizado
                val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
                try {
                    am.moveTaskToFront(taskId, android.app.ActivityManager.MOVE_TASK_WITH_HOME)
                } catch (ignore: Exception) {}
            }
            Logger.i("ESCAPE_PROTOCOL", "Modo Kiosk Total restabelecido via Timer de Segurança.")
        }
    }

    fun exportarRelatorio() {
        viewModel.gerarRelatorioCSV { conteudoCsv ->
            val nomeArquivo = "Relatorio_SobreMidia_${System.currentTimeMillis()}.csv"
            
            try {
                // Criar o arquivo temporário para compartilhamento no cache
                val file = File(cacheDir, nomeArquivo)
                file.writeText(conteudoCsv)

                val uri = FileProvider.getUriForFile(this, "${applicationContext.packageName}.fileprovider", file)

                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/csv"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                
                startActivity(Intent.createChooser(intent, "Exportar Logs de Auditoria"))
            } catch (e: Exception) {
                Logger.e("EXPORT", "Falha ao exportar CSV: ${e.message}")
                Toast.makeText(this, "Erro ao exportar relatório", Toast.LENGTH_SHORT).show()
            }
        }
    }
    /**
     * [AUTO-RESTART WATCHDOG]
     * Configura um "Homem-Morto" (Dead Man's Switch) no Sistema Operacional.
     * Se o ExoPlayer travar a Main Thread ou a TV Box matar o app por falta de RAM,
     * este alarme do Android recriará a MainActivity daqui a exatos 60 segundos,
     * garantindo o Playback Eterno e a Recuperação Desassistida (Zero-Touch).
     */
    private fun startWatchdog(timeoutMs: Long = 60000L) {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        
        // Se o loop de mídia não rodar a tempo de cancelar e remarcar esse alarme (ex: engasgou total),
        // o Android acorda e invoca essa PendingIntent, ressuscitando o Player.
        alarmManager.set(
            AlarmManager.RTC_WAKEUP,
            System.currentTimeMillis() + timeoutMs, 
            pendingIntent
        )
    }
}

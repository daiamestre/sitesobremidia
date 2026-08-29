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
import com.antigravity.core.domain.model.Playlist
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
    private var playbackLoopJob: Job? = null
    private var isThermalGuardStarted = false
    private var isAutoCleanStarted = false
    
    // [ADVANCED KIOSK] Maintenance Mode State
    private var isKioskEnforced = true // Global control for resilience

    // [SIGNAGE NOTIFICATION SHIELD] Filtro de interrupcao anterior (restauro ao sair)
    private var previousInterruptionFilter: Int = android.app.NotificationManager.INTERRUPTION_FILTER_UNKNOWN
    private var dndAccessRequestedOnce = false
    
    // [ESCAPE PROTOCOL]
    private var maintenanceCounter = 0
    private var lastInputTime = 0L
    private var maintenanceJob: Job? = null

    companion object {
        // [EXIT COUNTER] Persistencia (sobrevive a recriacao da Activity/processo)
        private const val PREF_EXIT_COUNT = "exit_count"
        private const val PREF_LAST_EXIT_AT = "last_exit_at"
        private const val PREF_MAINTENANCE_UNTIL = "maintenance_until"
        private const val ACTION_MAINTENANCE_MODE = "com.antigravity.player.ACTION_MAINTENANCE_MODE"
        private const val EXTRA_RESTORE_MAINTENANCE = "extra_restore_maintenance"
        private const val REQUEST_CODE_MAINTENANCE_RECOVERY = 4242
        // [P0 SPEC] Timeout de manutencao: 3 minutos obrigatorios
        private const val MAINTENANCE_TIMEOUT_MS = 180_000L
        // Debounce: focus-loss + onStop do MESMO episodio nao contam duas saidas;
        // lifecycle consecutivo (rotacao/dialogo) nao conta (rotacao nem chega a onStop).
        private const val EXIT_DEBOUNCE_MS = 15_000L
        // Auto-reset: 10 min de operacao estavel zeram o contador (sem prisao eterna)
        private const val EXIT_COUNT_RESET_MS = 10 * 60_000L
    }

    // [DEVICE FLEET] Manager para Device Fleet / Device Health
    private var deviceFleetManager: com.antigravity.player.util.DeviceFleetManager? = null

    // [DEVICE FLEET] Inicializa Device Fleet Manager após sync bem-sucedido
    private fun initializeDeviceFleet(screenId: String) {
        if (deviceFleetManager != null) return
        
        deviceFleetManager = com.antigravity.player.util.DeviceFleetManager(
            context = applicationContext,
            remoteDataSource = com.antigravity.player.di.ServiceLocator.getRemoteDataSource()
        )
        
        deviceFleetManager?.initialize(screenId)
        Logger.i("DEVICE_FLEET", "Device Fleet Manager inicializado para screen: $screenId")
    }

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
        
        // [ADAPTIVE UI] Detect hardware and set appropriate orientation from Session/Prefs
        val isTV = DeviceTypeUtil.isTelevision(applicationContext)
        val savedPrefs = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
        val initialOrientation = SessionManager.currentOrientation 
            ?: savedPrefs.getString("current_orientation", if (isTV) "landscape" else "landscape")
        applyScreenRotation(initialOrientation)
        
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

                                // [SIGNAGE NOTIFICATION SHIELD] Dispositivo em operacao
                                // signage dedicada: bloqueia heads-up notifications de
                                // outros apps (WhatsApp, Shopee, etc.) via filtro oficial
                                // do Android. O filtro anterior e guardado para restaurar
                                // no modo manutencao/desvinculacao.
                                if (DeviceControl.isNotificationPolicyAccessGranted(this@MainActivity)) {
                                    if (previousInterruptionFilter == android.app.NotificationManager.INTERRUPTION_FILTER_UNKNOWN) {
                                        previousInterruptionFilter = (getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).currentInterruptionFilter
                                    }
                                    if (DeviceControl.suppressHeadsUpNotifications(this@MainActivity)) {
                                        Logger.i("KIOSK", "Modo signage: heads-up notifications suprimidas.")
                                    }
                                }

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

            // [P0 AUDIT] Verificacao explicita de Device Owner (nao fingir que esta provisionado)
            Logger.i("KIOSK", "DEVICE_OWNER = ${if (DeviceControl.isDeviceOwner(this)) "VERIFIED" else "NOT VERIFIED"} | LOCK_TASK_PERMITTED = ${
                try { DeviceControl.isLockTaskPermitted(this) } catch (e: Exception) { false }}")

            // [MAINTENANCE RECOVERY] Sobrevive a morte do processo durante a janela de manutencao.
            // Se renasceu com janela vigente: permanece liberado e reagenda o alarme de retorno.
            // Se a janela venceu enquanto morto: estado e limpo e o kiosk ja reforcado acima segue valendo.
            try {
                val maintUntil = getSharedPreferences("player_prefs", MODE_PRIVATE).getLong(PREF_MAINTENANCE_UNTIL, 0L)
                if (maintUntil > System.currentTimeMillis()) {
                    Logger.w("ESCAPE_PROTOCOL", "Processo renasceu durante manutencao. Mantendo janela ate $maintUntil.")
                    isKioskEnforced = false
                    DeviceControl.disableKioskMode(this)
                    releaseSystemBars()
                    scheduleMaintenanceRecoveryAlarm(maintUntil)
                } else if (maintUntil > 0L) {
                    restoreFromMaintenance()
                }
            } catch (e: Exception) {
                Logger.e("ESCAPE_PROTOCOL", "Falha ao avaliar manutencao no boot: ${e.message}")
            }

            // [MISSION CRITICAL] Populate SessionManager from Disk
            val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
            val savedId = prefs.getString("saved_screen_id", null)
            SessionManager.currentUserId = savedId
            val hardwareHash = DeviceControl.getHardwareIdentity(applicationContext)
            SessionManager.setIdentity(hardwareHash)
            Logger.i("BOOT", "SessionManager Initialized with Screen ID: $savedId, DeviceHash: ${SessionManager.deviceIdentityHash}")

            // [SECURITY & SESSION] O servidor e o Realtime são a autoridade de suspensão
            SessionManager.onScreenActiveChanged = { active ->
                prefs.edit { putBoolean("screen_is_active", active) }
                Logger.w("BILLING", "Screen active state persisted: $active")
            }





            
            // RESET FEATURE: Long press status or overlay to clear screen ID and pick screen again
            val syncOverlay = findViewById<View>(R.id.sync_guard_overlay)
            val resetScreenAction = {
                val currentScreenId = SessionManager.currentUserId
                val currentDeviceId = SessionManager.deviceIdentityHash
                
                lifecycleScope.launch(Dispatchers.IO) {
                    val repo = ServiceLocator.getRepository(applicationContext)
                    try {
                        if (currentScreenId != null && currentDeviceId != null) {
                            repo.unpairScreen(currentScreenId, currentDeviceId)
                        }
                    } catch (e: Exception) {
                        Logger.e("SYNC", "Failed to unpair on backend: ${e.message}")
                    }
                    
                    repo.clearLocalDatabase()
                    
                    withContext(Dispatchers.Main) {
                        getSharedPreferences("player_prefs", MODE_PRIVATE).edit {
                            remove("saved_screen_id")
                        }
                        ServiceLocator.resetRepository()
                        
                        if (!isFinishing && !isDestroyed) {
                            Toast.makeText(this@MainActivity, "Redirecionando para Seleção de Tela...", Toast.LENGTH_LONG).show()
                        }
                        
                        isKioskEnforced = false
                        // [DEVICE FLEET] Encerra Device Fleet Manager
                        deviceFleetManager?.shutdown()
                        deviceFleetManager = null
                        DeviceControl.restoreInterruptionFilter(this@MainActivity, previousInterruptionFilter)
                        val intent = Intent(this@MainActivity, com.antigravity.player.ui.ScreenSelectionActivity::class.java)
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                        startActivity(intent)
                        finish()
                    }
                }
                true
            }

            statusTextView.setOnLongClickListener { resetScreenAction() }
            syncOverlay?.setOnLongClickListener { resetScreenAction() }
            syncOverlay?.setOnClickListener {
                Toast.makeText(this@MainActivity, "Mantenha pressionado por 2s para trocar a Tela", Toast.LENGTH_SHORT).show()
            }

               // [OTA] Auto-Update Initial Check 
            lifecycleScope.launch {
                delay(10000) // Wait for network to stabilize
                ServiceLocator.getOTAUpdateManager(this@MainActivity).checkForUpdates()
            }

            // Initialize Dual Media Engine
            playerRenderer1 = ExoPlayerRenderer(this, "RENDERER_1").apply { currentScreenId = savedId }
            playerRenderer2 = ExoPlayerRenderer(this, "RENDERER_2").apply { currentScreenId = savedId }
            
            // [PROFESSIONAL REPRODUCTION MODE] 
            // A proporção (Aspect Ratio) agora é mantida nativamente pelo ExoPlayer (RESIZE_MODE_FIT),
            // garantindo que vídeos horizontais em telas verticais (e vice-versa) fiquem em Letterbox/Pillarbox 
            // sem NUNCA sofrer cortes ou distorções.
            playerRenderer1.onVideoSizeChanged = { width, height ->
                val displayMetrics = resources.displayMetrics
                val dmWidth = displayMetrics.widthPixels
                val dmHeight = displayMetrics.heightPixels
                val pvWidth = playerView1.width
                val pvHeight = playerView1.height
                val ratio = if (height > 0) String.format(java.util.Locale.US, "%.2f", width.toFloat() / height) else "N/A"
                val resMode = if (playerView1.resizeMode == androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT) "FIT" else "OTHER(${playerView1.resizeMode})"
                
                Logger.i("ORIENTATION_CONTRACT", """
                    [ORIENTATION_CONTRACT]
                    DISPLAY RAW: ${dmWidth}x${dmHeight}
                    ANDROID CONFIGURATION: ${if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "LANDSCAPE" else "PORTRAIT"}
                    ACTIVITY ORIENTATION: ${requestedOrientation}
                    SESSION ORIENTATION: ${SessionManager.currentOrientation}
                    PLAYER VIEW 1: ${pvWidth}x${pvHeight}
                    VIDEO: ${width}x${height} (Ratio: $ratio)
                    RESIZE MODE: $resMode
                    CROP: false | STRETCH: false
                """.trimIndent())
            }
            playerRenderer2.onVideoSizeChanged = { width, height ->
                val displayMetrics = resources.displayMetrics
                val dmWidth = displayMetrics.widthPixels
                val dmHeight = displayMetrics.heightPixels
                val pvWidth = playerView2.width
                val pvHeight = playerView2.height
                val ratio = if (height > 0) String.format(java.util.Locale.US, "%.2f", width.toFloat() / height) else "N/A"
                val resMode = if (playerView2.resizeMode == androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT) "FIT" else "OTHER(${playerView2.resizeMode})"
                
                Logger.i("ORIENTATION_CONTRACT", """
                    [ORIENTATION_CONTRACT]
                    DISPLAY RAW: ${dmWidth}x${dmHeight}
                    ANDROID CONFIGURATION: ${if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "LANDSCAPE" else "PORTRAIT"}
                    ACTIVITY ORIENTATION: ${requestedOrientation}
                    SESSION ORIENTATION: ${SessionManager.currentOrientation}
                    PLAYER VIEW 2: ${pvWidth}x${pvHeight}
                    VIDEO: ${width}x${height} (Ratio: $ratio)
                    RESIZE MODE: $resMode
                    CROP: false | STRETCH: false
                """.trimIndent())
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
                    when (command) {
                        "screenshot", "take_screenshot" -> takeProofOfPlayScreenshot(commandId)
                        "sync" -> {
                            ackRemoteCommand(commandId, "executed")
                            runOnUiThread { startSyncAndPlay() }
                        }
                        "reload" -> {
                            ackRemoteCommand(commandId, "executed")
                            runOnUiThread { startSyncAndPlay() }
                        }
                        "rotate_portrait" -> {
                            applyScreenRotation("portrait")
                            ackRemoteCommand(commandId, "executed")
                        }
                        "rotate_landscape" -> {
                            applyScreenRotation("landscape")
                            ackRemoteCommand(commandId, "executed")
                        }
                        "reboot" -> {
                            val dpm = getSystemService(android.content.Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                            val componentName = android.content.ComponentName(this@MainActivity, com.antigravity.player.receiver.AdminReceiver::class.java)
                            
                            if (dpm.isDeviceOwnerApp(packageName)) {
                                ackRemoteCommand(commandId, "executed")
                                runOnUiThread {
                                    Toast.makeText(this@MainActivity, "Comando Remoto: Reiniciando Player FÍSICO...", Toast.LENGTH_LONG).show()
                                    Handler(Looper.getMainLooper()).postDelayed({
                                        try {
                                            dpm.reboot(componentName)
                                        } catch (e: Exception) {
                                            Logger.e("COMMAND", "Falha ao reiniciar o dispositivo: ${e.message}")
                                            // Fallback para restart de App se houver exceção
                                            val intent = Intent(this@MainActivity, SplashActivity::class.java)
                                            startActivity(intent)
                                            finish()
                                        }
                                    }, 2000)
                                }
                            } else {
                                // Não mascarar limitação física (P0-04)
                                ackRemoteCommand(commandId, "unsupported - Device Owner required for physical reboot")
                                Logger.w("COMMAND", "Reboot Físico ignorado. App não é Device Owner.")
                            }
                        }
                        "unpair" -> {
                            Logger.w("COMMAND", ">>> UNPAIR COMMAND RECEIVED FROM SERVER. Unbinding device and redirecting...")
                            runOnUiThread {
                                try {
                                    // [EXIT COUNTER] Navegacao intencional: nao conta como saida do usuario
                                    isKioskEnforced = false
                                    // 1. Limpa o saved_screen_id nas SharedPreferences
                                    getSharedPreferences("player_prefs", MODE_PRIVATE).edit().remove("saved_screen_id").apply()

                                    // 2. Limpa o vínculo e contexto de sessão
                                    SessionManager.unpairScreen()
                                    playbackWatchdog.stop()

                                    // [DEVICE FLEET] Encerra Device Fleet Manager
                                    deviceFleetManager?.shutdown()
                                    deviceFleetManager = null

                                    // [SIGNAGE NOTIFICATION SHIELD] Saiu do modo signage: restaura notificacoes
                                    DeviceControl.restoreInterruptionFilter(this@MainActivity, previousInterruptionFilter)

                                    Toast.makeText(this@MainActivity, "Dispositivo desvinculado pelo painel.", Toast.LENGTH_LONG).show()

                                    // 3. Redireciona para ScreenSelectionActivity
                                    val intent = Intent(this@MainActivity, com.antigravity.player.ui.ScreenSelectionActivity::class.java).apply {
                                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                                    }
                                    startActivity(intent)

                                    // 4. Envia ACK 'executed' após conclusão local com sucesso
                                    ackRemoteCommand(commandId, "executed")

                                    finish()
                                } catch (e: Exception) {
                                    Logger.e("COMMAND", "Erro ao processar unpair localmente: ${e.message}", e)
                                    ackRemoteCommand(commandId, "executed")
                                    finish()
                                }
                            }
                        }
                        else -> Logger.w("COMMAND", "Comando desconhecido ignorado: $command")
                    }
                }
            }

            // [HIGH-END] Reactive Playlist Observation (SSOT)
            lifecycleScope.launch {
                ServiceLocator.getRepository(this@MainActivity).getActivePlaylist()
                    .distinctUntilChanged { old, new ->
                        // [FIX] Also detect changes in item order, count and individual durations
                        val oldFingerprint = old?.items?.joinToString("|") { "${it.id}:${it.orderIndex}:${it.durationSeconds}" }
                        val newFingerprint = new?.items?.joinToString("|") { "${it.id}:${it.orderIndex}:${it.durationSeconds}" }
                        old?.id == new?.id &&
                        old?.orientation == new?.orientation &&
                        oldFingerprint == newFingerprint
                    }
                    .collect { playlist ->
                    if (playlist != null && playlist.items.isNotEmpty()) {
                        com.antigravity.core.util.Logger.i("MAIN", "Reactive Update: Playlist '${playlist.name}' received (${playlist.items.size} items).")
                        
                        runOnUiThread {
                            // 2. Aplica rotação e inicia/atualiza o motor de vídeo
                            applyScreenRotation(playlist.orientation)
                            
                            // START PLAYBACK LOOP (Centralized SSOT)
                            // Aguarda 2000ms antes de iniciar os renders para que o WindowManager
                            // tenha finalizado a rotação e a GPU esteja estável
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

            // [FIX] Realtime Sync Nudge Listener: Triggers full re-sync when dashboard changes playlist
            lifecycleScope.launch {
                SessionManager.syncEvents.collect {
                    Logger.i("REALTIME", "Sync nudge received! Re-syncing playlist from server...")
                    isSyncLoopRunning = false // Allow new playback loop after sync
                    lifecycleScope.launch(Dispatchers.IO) {
                        syncInBackground()
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
            isKioskEnforced = false // [EXIT COUNTER] Navegacao intencional
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
            
            // 1. Tenta buscar a última playlist salva no banco local
            val cacheResult = repository.loadLocalCache()
            val localPlaylist = repository.getActivePlaylist().firstOrNull()

            // [FIX P3] Verificar se a screen ainda existe e está ativa no Dashboard.
            // A fonte de verdade deve ser o conjunto atual de Screens válidas do backend.
            // Se a screen foi deletada do painel, o player deve limpar o saved_screen_id
            // e voltar à seleção de tela, em vez de tentar reproduzir mídia de screen inexistente.
            val screenIdValid = verificarScreenNoBackend(localPlaylist)
            
            // [FIX P3] Se tem items locais MAS a screen foi removida do painel,
            // invalida o cache e força sync (que vai limpar o saved_screen_id)
            val hasLocalItems = localPlaylist != null && localPlaylist.items.isNotEmpty()
            
            if (hasLocalItems && screenIdValid) {
                Logger.i("OFFLINE_FIRST", "Cache local encontrado e screen válida. Iniciando reprodução imediata.")
                
                // 2. Trava a interface no estado PREPARING via Gatekeeper,
                // para que a tela de Sync continue travando o fundo até o motor de fato começar o frame 0.
                viewModel.prepararPrimeiraMidia()
                
                // 3. Aplica a orientação que já estava salva para este dispositivo
                applyScreenRotation(localPlaylist?.orientation)
                
                // 4. Inicia o loop de reprodução com os arquivos locais
                // Aguarda 2000ms antes de iniciar os renders para que o WindowManager
                // tenha finalizado a rotação e a GPU esteja estável
                Handler(Looper.getMainLooper()).postDelayed({
                    startPlaybackLoop()
                }, 2000)

                // 5. APÓS iniciar o vídeo, dispara a sincronização em background (silenciosa)
                // Para verificar se há atualizações, mas sem travar o início da reprodução
                lifecycleScope.launch(Dispatchers.IO) {
                    Logger.i("SYNC", "Verificando atualizações em segundo plano enquanto vídeo toca...")
                    syncInBackground()
                }
            } else if (hasLocalItems && !screenIdValid) {
                // Screen foi deletada/órfã do Dashboard. Invalida o saved_screen_id e força re-pareamento.
                Logger.w("OFFLINE_FIRST", "Screen do cache foi removida do painel. Invalidação do saved_screen_id.")
                val prefs = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
                prefs.edit().remove("saved_screen_id").apply()
                SessionManager.currentUserId = null
                // Reinicia o fluxo sem screen ID - vai para seleção
                startSyncAndPlay()
            } else if (!hasLocalItems && screenIdValid) {
                // Sem cache local, mas screen é válida no backend. Inicia sync para baixar playlist.
                Logger.i("OFFLINE_FIRST", "Sem cache local, screen válida no backend. Iniciando sincronização inicial.")
                startSyncAndPlay()
            } else {
                // Caso não tenha NADA no cache (primeira execução ou screen inválida),
                // inicia o fluxo de sincronização visível
                Logger.w("OFFLINE_FIRST", "Sem cache local suficiente ou screen inválida. Aguardando sincronização inicial.")
                startSyncAndPlay()
            }
        }
    }

    /**
     * Verifica se a screen corrente ainda existe e está ativa no Dashboard.
     * Usa a lista de screens autorizadas do RemoteDataSource como fonte de verdade.
     */
    private suspend fun verificarScreenNoBackend(localPlaylist: Playlist?): Boolean {
        // Se não há playlist local, não temos como determinar qual screen está ativa.
        // Em caso de primeiro fluxo, a validade sera checada quando o sync ocorrer.
        if (localPlaylist == null) return true // Permitir sync para verificar
        
        try {
            val remoteDS = ServiceLocator.getRemoteDataSource()
            val authorizedScreens = remoteDS.getAuthorizedScreens()
            
            val savedId = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
                .getString("saved_screen_id", null)
            
            if (savedId.isNullOrEmpty()) return true
            
            // Busca a screen na lista do backend por id, customId ou variações de caso
            val screenValida = authorizedScreens.any { screen ->
                val idMatch = (
                    (screen.id ?: "").equals(savedId, ignoreCase = true) ||
                    (screen.customId ?: "").equals(savedId, ignoreCase = true)
                )
                val isActive = screen.isActive ?: false
                idMatch && isActive
            }
            
            val statusStr = if (screenValida) "VÁLIDA" else "INVÁLIDA"
            Logger.i("SCREEN_VALIDATION", "Screen validation for $savedId: $statusStr (${authorizedScreens.size} screens authorized)")
            return screenValida
        } catch (e: Exception) {
            Logger.e("SCREEN_VALIDATION", "Falha ao validar screen no backend: ${e.message}")
            // Em caso de erro de rede, manter comportamento conservador: permitir playback
            return true
        }
    }

    private suspend fun syncInBackground() {
        val repo = ServiceLocator.getRepository(applicationContext)
        val syncUseCase = com.antigravity.core.domain.usecase.SyncPlaylistUseCase(repo)
        
        try {
            val result = syncUseCase()
            if (result.isSuccess) {
                Logger.i("SYNC", "Sincronização de background concluída. Aplicando nova sequência...")
                
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
                        
                        // [FIX] Restart playback loop to pick up new sequence and durations immediately
                        isSyncLoopRunning = false
                        startPlaybackLoop()
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
            // [DEVICE IDENTITY] Attest hardware identity BEFORE syncing content
            attestDeviceIdentity()
            
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
                                    viewModel.prepararPrimeiraMidia()
                                }
                            }

                            // [DEVICE FLEET] Inicializa Device Fleet Manager após sync bem-sucedido
                            val screenId = SessionManager.currentUUID ?: SessionManager.currentUserId
                            if (!screenId.isNullOrBlank() && screenId != "N/A" && screenId != "UNKNOWN") {
                                initializeDeviceFleet(screenId)
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
                            } else if (errorMsg.contains("Tela não encontrada", ignoreCase = true) || errorMsg.contains("404", ignoreCase = true) || errorMsg.contains("[PERMANENT]", ignoreCase = true)) {
                                Logger.w("SYNC", "Tela Inválida ou não encontrada. Abrindo seleção de tela...")
                                // [EXIT COUNTER] Navegacao intencional: nao conta como saida do usuario
                                isKioskEnforced = false
                                getSharedPreferences("player_prefs", MODE_PRIVATE).edit().remove("saved_screen_id").apply()
                                val intent = Intent(this@MainActivity, com.antigravity.player.ui.ScreenSelectionActivity::class.java)
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                                startActivity(intent)
                                finish()
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
    
    // [DEVICE IDENTITY] Bind/attest hardware identity; revoked device blocks playback
    private fun attestDeviceIdentity() {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val identity = com.antigravity.player.util.DeviceControl.getHardwareIdentity(applicationContext)
                val uuid = SessionManager.currentUUID
                    ?: ServiceLocator.getRepository(applicationContext).deviceId
                if (uuid.isBlank() || uuid == "UNKNOWN" || uuid == "UNKNOWN_DEVICE") {
                    return@launch
                }
                SessionManager.setIdentity(identity)

                val remoteDS = ServiceLocator.getRemoteDataSource()
                val firstBind = SessionManager.boundDeviceId == null
                val attested = if (firstBind) {
                    remoteDS.bindDevice(identity, uuid)
                } else {
                    remoteDS.attestDevice(identity, uuid)
                }

                if (!attested && SessionManager.isDeviceRevoked) {
                    Logger.e("DEVICE_ID", "DEVICE REVOKED BY ADMIN. Blocking playback.")
                    runOnUiThread {
                        SessionManager.triggerScreenActive(false, "Dispositivo revogado pelo administrador. Contate o suporte.")
                    }
                }
            } catch (e: Exception) {
                Logger.w("DEVICE_ID", "Attestation cycle failed (offline?): ${e.message}")
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
                   com.antigravity.player.util.DeviceControl.restoreInterruptionFilter(this@MainActivity, previousInterruptionFilter)
                   // [DEVICE FLEET] Encerra Device Fleet Manager
                   deviceFleetManager?.shutdown()
                   deviceFleetManager = null
          
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
    private fun performSeamlessSwap(viewToFadeOut: View, viewToFadeIn: View, newPlayer: ExoPlayerRenderer?, audioEnabled: Boolean) {
        runOnUiThread {
            playbackWatchdog.stop()

            Logger.i("AUDIO_POLICY", "[AUDIO_POLICY] Swap Executado. AudioEnabled da Playlist: $audioEnabled | Player: ${newPlayer?.instanceIdentifier}")
            
            // 1. Liberamos o áudio baseado na política da playlist.
            newPlayer?.setAudioEnabled(audioEnabled, reason = "performSeamlessSwap_firstFrame")
            
            // 2. Troca simultânea instantânea (Visibility) sem delay artificial
            viewToFadeOut.visibility = View.INVISIBLE
            viewToFadeIn.alpha = 1f
            
            // 3. Limpa a Mídia Antiga para a Próxima Rodada (-RAM)
            val oldPlayerView = (viewToFadeOut as? androidx.media3.ui.PlayerView)
            oldPlayerView?.player?.stop()
            oldPlayerView?.player?.clearMediaItems()
            
            // Cleanup de overlays inativos imediatamente
            // NÃO mostrar standbyImage (logo) durante transição seamless!
            staticImageLayer.visibility = View.GONE
            nativeWidgetContainer.visibility = View.GONE
            // standbyImage permanece GONE/INVISIBLE durante transição para evitar tela preta/logo
            
            Logger.i("SEAMLESS_SWAP", "[SEAMLESS_SWAP] Troca visual limpa concluída via FirstFrame.")
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
    
    private suspend fun engineVideo(item: MediaItem, nextItem: MediaItem, audioEnabled: Boolean): Boolean {
        logBlackBox("ENGINE_VIDEO", "Target: ${item.name}")
        val durationMs = item.durationSeconds * 1000L
        
        val storageManager = ServiceLocator.getFileStorageManager(applicationContext)
        val hashedFile = storageManager.getFileForMedia(item.id, item.hash)
        val legacyFile = java.io.File(java.io.File(filesDir, "media_content"), "${item.id}.dat")
        val directPathFile = if (!item.localPath.isNullOrBlank()) java.io.File(item.localPath) else null

        val localFile = when {
            directPathFile != null && directPathFile.exists() && directPathFile.length() > 0 -> directPathFile
            hashedFile.exists() && hashedFile.length() > 0 -> hashedFile
            legacyFile.exists() && legacyFile.length() > 0 -> legacyFile
            else -> com.antigravity.player.util.CacheManager.verificarEBaixar(this@MainActivity, item.remoteUrl, hashedFile.name)
        }
        
        if (!localFile.exists() || localFile.length() <= 0L) {
            Logger.e("ENGINE_VIDEO", "File critical failure: Mídia ${item.name} não existe ou tem 0 bytes.")
            exibirAlertaDeMidiaCorrompida(item.name)
            return true 
        }

        val resolvedItem = item.copy(localPath = localFile.absolutePath)
        
        val currentPlayingEngine = activePlayer
        // Muta para cortar o estalo inicial
        currentPlayingEngine?.setAudioEnabled(false, reason = "engineVideo_initial_mute", mediaId = item.id)
        
        val viewToFadeIn = if (currentPlayingEngine == playerRenderer1) playerView1 else playerView2
        val viewToFadeOut = if (currentPlayingEngine == playerRenderer1) playerView2 else playerView1
        
        var swapListener: androidx.media3.common.Player.Listener? = null
        var capturedRawPlayer: androidx.media3.common.Player? = null

        runOnUiThread {
            viewToFadeIn.alpha = 0f 
            viewToFadeIn.visibility = View.VISIBLE

            
            lifecycleScope.launch {
                try {
                    // [SINGLE DECODER FIX] TV Boxes will crash the hardware codec (DecoderInitFailed)
                    // if we try to prepare the activePlayer while the standbyPlayer is still holding the decoder!
                    // For non-high-performance devices, we sacrifice seamless transition to ensure playback continues.
                    val profile = com.antigravity.media.exoplayer.ChipsetDetector.getRecommendedProfile()
                    if (profile == com.antigravity.media.exoplayer.ChipsetDetector.HardwareProfile.LEGACY_STABILITY) {
                        standbyPlayer?.stop()
                    }

                    // Garante que o player ativo preparou este item
                    currentPlayingEngine?.prepare(resolvedItem)
                    
                    val rawPlayer = currentPlayingEngine?.getPlayerInstance()
                    capturedRawPlayer = rawPlayer
                    
                    val listener = object : androidx.media3.common.Player.Listener {
                        private var swapped = false

                        private fun executeSwap() {
                            if (!swapped) {
                                swapped = true
                                runOnUiThread {
                                    viewModel.confirmarMidiaPronta()
                                    statusTextView.visibility = View.GONE
                                    performSeamlessSwap(viewToFadeOut, viewToFadeIn, currentPlayingEngine, audioEnabled)
                                    val p = currentPlayingEngine?.getPlayerInstance()
                                    if (p != null) {
                                        playbackWatchdog.watch(p)
                                    }
                                }
                                rawPlayer?.removeListener(this)
                            }
                        }

                        override fun onRenderedFirstFrame() {
                            // [GATILHO PRIMARIO] Momento em que um frame REAL foi
                            // apresentado na superficie. Unico ponto seguro para a
                            // troca de visibilidade sem flash preto/logo.
                            // (Correcao: antes, STATE_READY disparava primeiro e a
                            // superficie ainda nao tinha frame -> tela preta + logo.)
                            if (!swapped) {
                                Logger.i("SEAMLESS_SWAP", "[SEAMLESS_SWAP] onRenderedFirstFrame recebido! Frame real na superficie. Swapping.")
                                executeSwap()
                            }
                        }

                        override fun onPlaybackStateChanged(playbackState: Int) {
                            // [FALLBACK 1] Apenas sinaliza que o player buffers Ready.
                            // A troca real eh gatilhoada pelo onRenderedFirstFrame (frame real na superficie).
                            // O delayed anterior de 350ms causava tela preta + logo porque a superficie
                            // ainda nao tinha frame desenhado. A flag swapped impede swap duplicado se
                            // onRenderedFirstFrame Chegar antes.
                            if (playbackState == androidx.media3.common.Player.STATE_READY && !swapped) {
                                Logger.i("SEAMLESS_SWAP", "[SEAMLESS_SWAP] STATE_READY: recebido, mas swap sera conduzido por onRenderedFirstFrame.")
                            }
                        }

                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            // [FALLBACK 2] Rede de seguranca final para hardwares que
                            // nao disparam nenhum dos dois eventos acima.
                            if (isPlaying && !swapped) {
                                Handler(Looper.getMainLooper()).postDelayed({ executeSwap() }, 1200)
                            }
                        }
                    }
                    swapListener = listener
                    rawPlayer?.addListener(listener)
                    
                    currentPlayingEngine?.play() // Inicia reprodução

                    
                } catch (e: Exception) {
                    Logger.e("ANTIGRAVITY", "Exceção no Play Async: ${e.message}")
                    runOnUiThread { 
                        viewModel.confirmarMidiaPronta()
                        viewToFadeOut.animate().alpha(0f).setDuration(300).start()
                        standbyImage.visibility = View.VISIBLE 
                    }
                }
            }
        }
        
        // [V3 STRICT DOUBLE BUFFER ENGINE] Active Polling Frame Loop
        val startTime = System.currentTimeMillis()
        var nextPreloaded = false
        
        while (kotlinx.coroutines.currentCoroutineContext().isActive) {
            val player = currentPlayingEngine?.getPlayerInstance()
            if (player == null) {
                delay(durationMs)
                break
            }
            
            val currentPos = player.currentPosition
            val rawVideoDurationMs = if (player.duration > 0) player.duration else durationMs
            val realDurationMs = if (durationMs > 0L) minOf(durationMs, rawVideoDurationMs) else rawVideoDurationMs
            val remaining = realDurationMs - currentPos
            
            // 1. Gatilho de Pre-Buffering (Exatos 5 Segundos antes do Fim)
            if (remaining <= 5000L && !nextPreloaded) {
                val profile = com.antigravity.media.exoplayer.ChipsetDetector.getRecommendedProfile()
                if (profile != com.antigravity.media.exoplayer.ChipsetDetector.HardwareProfile.LEGACY_STABILITY) {
                    Logger.i("SEAMLESS_DIAGNOSTIC", "Buffer Readiness Triggered. Pre-Loading next: ${nextItem.name}")
                    lifecycleScope.launch(kotlinx.coroutines.Dispatchers.Main) {
                        when (nextItem.type) {
                            MediaType.VIDEO, MediaType.IMAGE -> {
                                // [P0-A] Política de Áudio APLICADA ANTES DO PREPARE!
                                standbyPlayer?.setAudioEnabled(audioEnabled, reason = "preBuffer", mediaId = nextItem.id)
                                standbyPlayer?.preBuffer(nextItem)
                            }
                            else -> {}
                        }
                    }
                } else {
                    Logger.w("SEAMLESS_DIAGNOSTIC", "Hardware Fraco (1GB RAM): Pre-buffer desativado para economizar GPU/RAM.")
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
            
            delay(30) // Otimizado: 30ms (33Hz) economiza CPU/bateria em TV Boxes sem aquecer SoCs
        }
        
        // [STABILITY] Reset watchdog for next item
        playbackWatchdog.reset()
        
        return false
    }

    private suspend fun engineStatic(item: MediaItem): Boolean {
        logBlackBox("ENGINE_STATIC", "Loading: ${item.name}")
        val durationMs = item.durationSeconds * 1000L
        
        // [SURVIVOR PLAN] Ensure file exists locally before loading image
        val storageManager = ServiceLocator.getFileStorageManager(applicationContext)
        val hashedFile = storageManager.getFileForMedia(item.id, item.hash)
        val legacyFile = java.io.File(java.io.File(filesDir, "media_content"), "${item.id}.dat")
        val directPathFile = if (!item.localPath.isNullOrBlank()) java.io.File(item.localPath) else null

        val localFile = when {
            directPathFile != null && directPathFile.exists() && directPathFile.length() > 0 -> directPathFile
            hashedFile.exists() && hashedFile.length() > 0 -> hashedFile
            legacyFile.exists() && legacyFile.length() > 0 -> legacyFile
            else -> com.antigravity.player.util.CacheManager.verificarEBaixar(this@MainActivity, item.remoteUrl, hashedFile.name)
        }
        
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
                        
                        performSeamlessSwap(viewOut, viewIn, activePlayer, false)
                    }
                }
            } catch (e: Exception) {
                Logger.e("CONTINGENCY", "Falha ao tocar standby.mp4: ${e.message}")
                runOnUiThread { standbyImage.visibility = View.VISIBLE }
            }
        }
    }

    private fun startPlaybackLoop() {
        // [SINGLE LOOP OWNER] Um loop saudavel bloqueia novos spawns.
        // Chamadores que resetam isSyncLoopRunning=false forcam restart legitimo:
        // o novo Job CANCELA o anterior (cancelAndJoin) em vez de rodar em paralelo.
        // Correcao da causa raiz: cada sync bem-sucedido spawnava um loop ADICIONAL
        // eterno; N loops lutavam pelos mesmos renderers causando trocas rapidas,
        // tela preta e logo entre midias.
        if (isSyncLoopRunning && playbackLoopJob?.isActive == true) return
        isSyncLoopRunning = true

        val previousLoop = playbackLoopJob
        playbackLoopJob = lifecycleScope.launch {
            previousLoop?.cancelAndJoin()

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
                            viewModel.confirmarMidiaPronta()
                            syncGuard.releaseLock()
                            statusTextView.visibility = View.GONE
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
                        runOnUiThread {
                            hideAllLayers()
                            playStandbyVideo()
                            viewModel.confirmarMidiaPronta()
                            syncGuard.releaseLock()
                        }
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
                    
                    Logger.i("AUDIO_FORENSIC", "[AUDIO_FORENSIC] screenId=${com.antigravity.sync.service.SessionManager.currentUserId} playlistId=${playlist.id} audioEnabled=${playlist.audioEnabled} playerInstanceId=${activePlayer?.instanceIdentifier} mediaId=${item.id} volume=${activePlayer?.getPlayerInstance()?.volume}")
                    // 3. EXECUÇÃO PELOS MOTORES (Isolamento de Hardware)
                    val skipOnFail = when (item.type) {
                        MediaType.VIDEO -> engineVideo(item, nextItem, playlist.audioEnabled)
                        MediaType.IMAGE -> engineStatic(item)
                        MediaType.WEB_WIDGET -> engineWidget(item)
                        MediaType.EXTERNAL_LINK -> engineLink(item)
                        MediaType.STREAM_RTSP, MediaType.STREAM_HLS -> engineVideo(item, nextItem, playlist.audioEnabled)
                        else -> {
                            logBlackBox("SKIP", "Untracked type: ${item.type}")
                            true
                        }
                    }

                    if (skipOnFail) {
                        logBlackBox("RECOVERY", "Skipping failed item: ${item.name}")
                        // [CRITICAL FIX] Quarentena Ativa: Avisa o QueueManager e freia o CPU
                        queueManager.quarantineItem(item.id, "EngineSkip (Hardware/Codec Reject)")
                        runOnUiThread {
                            viewModel.confirmarMidiaPronta()
                            syncGuard.releaseLock()
                        }
                        
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
        
        // [DEVICE FLEET] Encerra Device Fleet Manager
        deviceFleetManager?.shutdown()
        deviceFleetManager = null
        
        if (::playerRenderer1.isInitialized) playerRenderer1.release()
        if (::playerRenderer2.isInitialized) playerRenderer2.release()
    }

    // --- KIOSK MODE ENFORCEMENT ---
    
    @SuppressLint("MissingSuperCall")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // Block Back Button in Kiosk Mode - do nothing
        if (isKioskEnforced) {
            Logger.d("KIOSK", "Back button blocked")
            return
        }
        super.onBackPressed()
    }

    override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent?): Boolean {
        // Block HOME, RECENT, and other system keys in Kiosk Mode
        if (isKioskEnforced) {
            when (keyCode) {
                android.view.KeyEvent.KEYCODE_HOME,
                android.view.KeyEvent.KEYCODE_APP_SWITCH,
                android.view.KeyEvent.KEYCODE_WINDOW -> {
                    Logger.d("KIOSK", "System key blocked: $keyCode")
                    return true // Consume the event
                }
            }
        }
        // [ESCAPE PROTOCOL] Trigger maintenance mode on any key press
        triggerMaintenanceFree()
        return super.onKeyDown(keyCode, event)
    }

    override fun onResume() {
        super.onResume()
        
        // Ensure player resumes immediately if it was paused/stopped
        val resumePlayer = activePlayer?.getPlayerInstance()
        if (resumePlayer != null && !resumePlayer.isPlaying && resumePlayer.playbackState == androidx.media3.common.Player.STATE_READY) {
            resumePlayer.play()
        }
        
        // Re-enforce Kiosk Mode (includes Lock Task if Device Owner)
        // [MAINTENANCE FIX] Somente quando o kiosk esta vigente: durante a janela
        // de manutencao o operador precisa das barras do sistema preservadas.
        if (isKioskEnforced) {
            DeviceControl.enableKioskMode(this)
        }

        // [MAINTENANCE RECOVERY] Rede de seguranca: restaura se a janela venceu
        evaluateMaintenanceState()
    }

    override fun onStop() {
        super.onStop()
        // [EXIT COUNTER P0] Perda efetiva de primeiro plano provocada pelo usuario.
        // Rotacao NAO chega aqui (configChanges no Manifest); dialogs internos tambem nao.
        registerValidExit()
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        // [MAINTENANCE RECOVERY] Alarme de 3 min entrega este intent quando a
        // Activity existe (singleInstance). Se morreu, onCreate cobre o caso.
        evaluateMaintenanceState()
    }


    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // [MISSION CRITICAL] Silent Immersive Enforcement (No prompts, no Toasts)
        if (hasFocus) {
            val windowInsetsController = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
            // Hide status and navigation bars
            windowInsetsController.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            // Ensure they only appear if user swipes (and disappear shortly after)
            windowInsetsController.systemBarsBehavior = 
                androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            
            // Re-apply Lock Task Mode if Device Owner (can be lost after focus changes)
            if (isKioskEnforced && com.antigravity.player.util.DeviceControl.isDeviceOwner(this)) {
                try {
                    startLockTask()
                } catch (e: Exception) {
                    // Already in lock task or not permitted
                }
            }
        } else {
            // [KIOSK LOCK] Lost focus (e.g., Home pressed, another intent opening)
            // If kiosk mode is enforced, force immediate return to MainActivity.
            if (isKioskEnforced) {
                // [EXIT COUNTER P0] Tentativa real de abandono (HOME/recents/outro app).
                // O debounce interno evita dupla contagem com onStop do mesmo episodio.
                registerValidExit()
                Logger.w("KIOSK", "Focus lost. Forcing MainActivity back to top.")
                // Post to handler to ensure it runs after focus change completes
                Handler(Looper.getMainLooper()).post {
                    if (!isFinishing && !isDestroyed) {
                        try {
                            val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
                            am.moveTaskToFront(taskId, android.app.ActivityManager.MOVE_TASK_WITH_HOME)
                        } catch (e: Exception) {
                            Logger.e("KIOSK", "Failed to moveTaskToFront: ${e.message}")
                        }
                    }
                }
            }
        }
    }
    
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // Ensure immersive mode is set when window attaches
        if (isKioskEnforced) {
            setFullscreenMode()
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

    private fun ackRemoteCommand(commandId: String?, status: String) {
        if (commandId.isNullOrBlank()) return
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                ServiceLocator.getRemoteDataSource().acknowledgeCommand(commandId, status)
                Logger.i("COMMAND", "ACK $commandId -> $status")
            } catch (e: Exception) {
                Logger.w("COMMAND", "ACK $commandId falhou: ${e.message}")
            }
        }
    }

    private fun reportErrorToSupabase(type: String, detail: String) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val remoteDataSource = ServiceLocator.getRemoteDataSource()
                val screenId = getSharedPreferences("player_prefs", MODE_PRIVATE).getString("saved_screen_id", "UNKNOWN") ?: "UNKNOWN"
                
                remoteDataSource.insertErrorLog(
                    deviceId = screenId,
                    type = "SAFE_LOADING_$type",
                    message = detail,
                    stackTrace = "Source: MainActivity.SafeLoading"
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
            when (orientation?.lowercase()?.trim()) {
                "portrait", "retrato", "vertical", "9x16", "9:16" -> {
                    Logger.i("ORIENTATION", "Forcing Portrait Mode (9:16)")
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                }
                "landscape", "paisagem", "horizontal", "16x9", "16:9" -> {
                    Logger.i("ORIENTATION", "Forcing Landscape Mode (16:9)")
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                }
                else -> {
                    Logger.i("ORIENTATION", "No valid orientation received: $orientation. Standardizing to Landscape.")
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                }
            }
            // Trigger layout recalculation immediately for hardware constraints
            try {
                val prefs = getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
                prefs.edit().putString("current_orientation", orientation ?: "landscape").apply()
            } catch (e: Exception) {}
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
        lifecycleScope.launch {
            // [COMPATIBILITY] API < 26 (Android Nougat e anteriores)
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                Logger.w("SCREENSHOT", "PixelCopy não suportado na API ${Build.VERSION.SDK_INT} < 26. Tentando fallback via Canvas...")
                try {
                    val view = window.decorView
                    if (view.width > 0 && view.height > 0) {
                        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
                        val canvas = android.graphics.Canvas(bitmap)
                        view.draw(canvas)
                        uploadScreenshotBitmap(bitmap, commandId)
                        return@launch
                    }
                } catch (e: Exception) {
                    Logger.e("SCREENSHOT", "Canvas fallback falhou: ${e.message}")
                }
                
                // Fallback não disponível ou falhou: avisa o Dashboard explicitamente
                Logger.e("SCREENSHOT", "Screenshot não suportado na API ${Build.VERSION.SDK_INT}")
                if (commandId != null) {
                    ServiceLocator.getRemoteDataSource().acknowledgeCommand(
                        commandId,
                        "failed",
                        "Screenshot não suportado nesta versão do Android (API ${Build.VERSION.SDK_INT} < 26)"
                    )
                }
                return@launch
            }

            // 1. [SILENCIADOR] Bloqueia o tráfego do Heartbeat Service e processos secundários
            com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = true
            
            // 2. [LIXEIRO] Varre a RAM para liberar espaço na GPU de caixas baratas (O Pulo do Gato)
            System.gc()
            
            // 3. Aguarda 2 segundos estritos para a CPU/Rede/Memória estarem em Idle total
            delay(2000)

            val view = window.decorView
            if (view.width <= 0 || view.height <= 0) {
                com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = false
                Logger.e("SCREENSHOT", "Window decorView com dimensões inválidas (${view.width}x${view.height})")
                if (commandId != null) {
                    ServiceLocator.getRemoteDataSource().acknowledgeCommand(
                        commandId,
                        "failed",
                        "View de exibição com dimensões inválidas (${view.width}x${view.height})"
                    )
                }
                return@launch
            }
            
            try {
                val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
                PixelCopy.request(window, bitmap, { copyResult ->
                    if (copyResult == PixelCopy.SUCCESS) {
                        uploadScreenshotBitmap(bitmap, commandId)
                    } else {
                        com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = false
                        Logger.e("SCREENSHOT", "PixelCopy falhou com código $copyResult")
                        if (commandId != null) {
                            lifecycleScope.launch(Dispatchers.IO) {
                                ServiceLocator.getRemoteDataSource().acknowledgeCommand(
                                    commandId,
                                    "failed",
                                    "PixelCopy falhou na GPU com código $copyResult"
                                )
                            }
                        }
                    }
                }, Handler(Looper.getMainLooper()))
            } catch (e: Exception) {
                Logger.e("SCREENSHOT", "Hard Crash during capture: ${e.message}")
                com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = false
                if (commandId != null) {
                    ServiceLocator.getRemoteDataSource().acknowledgeCommand(
                        commandId,
                        "failed",
                        "Exceção durante captura: ${e.message}"
                    )
                }
            }
        }
    }

    private fun uploadScreenshotBitmap(bitmap: Bitmap, commandId: String?) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val stream = java.io.ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                val byteArray = stream.toByteArray()
                
                val screenId = getSharedPreferences("player_prefs", MODE_PRIVATE).getString("saved_screen_id", "UNKNOWN") ?: "UNKNOWN"
                ServiceLocator.getRemoteDataSource().uploadScreenshot(screenId, byteArray, "manual")
                
                if (commandId != null) {
                    ServiceLocator.getRemoteDataSource().acknowledgeCommand(
                        commandId,
                        "executed",
                        null,
                        mapOf("url" to "screenshots/$screenId.jpg")
                    )
                }
                Logger.i("SCREENSHOT", "Screenshot manual salvo e ACK enviado com sucesso.")
            } catch (e: Exception) {
                Logger.e("SCREENSHOT", "Upload failed: ${e.message}")
                if (commandId != null) {
                    ServiceLocator.getRemoteDataSource().acknowledgeCommand(
                        commandId,
                        "failed",
                        "Falha no upload do screenshot para o servidor: ${e.message}"
                    )
                }
            } finally {
                // [LIBERAÇÃO] Devolve o controle ao Heartbeat
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
            // Se já estiver liberado, zera o timer e reinicia a janela de 3 min
            maintenanceJob?.cancel()
        } else {
            // 1. Pausa a blindagem (Kiosk Lock no onWindowFocusChanged)
            isKioskEnforced = false
            Logger.w("ESCAPE_PROTOCOL", "Modo Manutenção ativado. System UI liberada e MoveTaskToFront bloqueado.")

            // [SIGNAGE NOTIFICATION SHIELD] Sai do modo dedicado: restaura notificacoes
            DeviceControl.restoreInterruptionFilter(this, previousInterruptionFilter)

            // 2. Libera as barras de navegação (Home / Back Buttons) visíveis
            runOnUiThread {
                releaseSystemBars()
                Toast.makeText(this, "MODO DE MANUTENÇÃO: Sistema Liberado por 3 Min. Pressione Home para sair.", Toast.LENGTH_LONG).show()
            }

            // [MAINTENANCE P0] Persiste a janela, sincroniza o SelfHealingService
            // (para de brigar pelo foco durante a manutencao), congela o watchdog
            // de playback e agenda recuperacao via AlarmManager (sobrevive a morte
            // da Activity/processo).
            val until = System.currentTimeMillis() + MAINTENANCE_TIMEOUT_MS
            getSharedPreferences("player_prefs", MODE_PRIVATE).edit().putLong(PREF_MAINTENANCE_UNTIL, until).apply()
            notifySelfHealing(true)
            cancelPlaybackWatchdogAlarm()
            scheduleMaintenanceRecoveryAlarm(until)

            // [SIGNAGE NOTIFICATION SHIELD] Se o operador ainda nao concedeu o
            // acesso de "Nao Perturbe", oferece UMA vez durante manutencao
            // (momento interativo; sem prompts intrusivos durante playback).
            if (!DeviceControl.isNotificationPolicyAccessGranted(this) && !dndAccessRequestedOnce) {
                dndAccessRequestedOnce = true
                getSharedPreferences("player_prefs", MODE_PRIVATE).edit().putBoolean("dnd_access_requested", true).apply()
                try {
                    DeviceControl.requestNotificationPolicyAccess(this)
                } catch (e: Exception) {}
            }
        }

        // 3. Timer rapido (caminho comum): 3 MINUTOS obrigatorios.
        // A restauracao real acontece em restoreFromMaintenance(), que tambem e
        // acionada pelo AlarmManager se a Activity/processo morrer no intervalo.
        maintenanceJob = lifecycleScope.launch {
            delay(MAINTENANCE_TIMEOUT_MS)
            restoreFromMaintenance()
        }
    }

    /**
     * [MAINTENANCE P0] Retorno obrigatorio do controle apos a janela de 3 min.
     * Idempotente: valida o deadline persistido antes de agir; chamadores
     * redundantes (timer in-process, AlarmManager/onNewIntent, onCreate,
     * onResume) convergem aqui sem dupla execucao.
     */
    private fun restoreFromMaintenance() {
        val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
        val until = prefs.getLong(PREF_MAINTENANCE_UNTIL, 0L)
        if (until <= 0L) return
        val now = System.currentTimeMillis()
        if (now < until - 2000L) {
            // Janela ainda vigente (ex.: onCreate renasceu no meio): so garante o alarme
            scheduleMaintenanceRecoveryAlarm(until)
            return
        }

        prefs.edit().remove(PREF_MAINTENANCE_UNTIL).remove(PREF_EXIT_COUNT).putLong(PREF_LAST_EXIT_AT, 0L).apply()
        notifySelfHealing(false)
        Logger.i("ESCAPE_PROTOCOL", "Modo Kiosk Total restabelecido via Timer de Segurança.")
        if (isFinishing || isDestroyed) return

        runOnUiThread {
            Toast.makeText(this@MainActivity, "Tempo Exgotado. Retomando Controle (Kiosk Lock).", Toast.LENGTH_LONG).show()
            isKioskEnforced = true
            maintenanceCounter = 0
            lastInputTime = 0L
            setFullscreenMode() // Esconde a barra e reativa Swipe Mode

            // [SIGNAGE NOTIFICATION SHIELD] Volta ao modo dedicado: bloqueia heads-up
            if (DeviceControl.isNotificationPolicyAccessGranted(this@MainActivity)) {
                if (DeviceControl.suppressHeadsUpNotifications(this@MainActivity)) {
                    Logger.i("KIOSK", "Heads-up notifications suprimidas (retorno ao modo signage).")
                }
            }

            // Força um foco instantâneo caso tenha minimizado
            val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            try {
                am.moveTaskToFront(taskId, android.app.ActivityManager.MOVE_TASK_WITH_HOME)
            } catch (ignore: Exception) {}

            // Reativa o Dead Man's Switch ate o proximo ciclo do loop reagendar
            startWatchdog(MAINTENANCE_TIMEOUT_MS)
        }
    }

    /**
     * Avalia o estado da janela de manutencao persistida.
     * Chamado em onNewIntent/onResume (e no onCreate quando aplicavel).
     */
    private fun evaluateMaintenanceState() {
        val until = getSharedPreferences("player_prefs", MODE_PRIVATE).getLong(PREF_MAINTENANCE_UNTIL, 0L)
        if (until <= 0L) return
        restoreFromMaintenance()
    }

    /**
     * [EXIT COUNTER P0] Conta SOMENTE saidas reais provocadas pelo usuario ou
     * perda efetiva de controle. Falsos positivos filtrados:
     * - rotacao/configChanges (nao chegam a onStop nem perdem foco contavel);
     * - dialogs internos (nao param a Activity);
     * - debounce de 15s (focus-loss + onStop do mesmo episodio = 1 saida);
     * - auto-reset apos 10 min estaveis (sem prisao permanente em manutencao);
     * - navegacao intencional do proprio Player (isKioskEnforced=false antes).
     */
    private fun registerValidExit() {
        if (!isKioskEnforced) return
        if (!::playerRenderer1.isInitialized) return // boot/interno
        val now = System.currentTimeMillis()
        if (now < DeviceControl.suppressExitCountUntilMs) return // config interna (ex.: instalador OTA)

        val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
        val lastAt = prefs.getLong(PREF_LAST_EXIT_AT, 0L)
        if (now - lastAt < EXIT_DEBOUNCE_MS) {
            Logger.d("ESCAPE_PROTOCOL", "Saida ignorada por debounce (${now - lastAt}ms).")
            return
        }
        val count = if (lastAt == 0L || now - lastAt > EXIT_COUNT_RESET_MS) 1 else prefs.getInt(PREF_EXIT_COUNT, 0) + 1
        prefs.edit().putInt(PREF_EXIT_COUNT, count).putLong(PREF_LAST_EXIT_AT, now).apply()
        Logger.w("ESCAPE_PROTOCOL", "Saída válida registrada ($count/3).")

        if (count >= 3) {
            Logger.w("ESCAPE_PROTOCOL", "3 saídas válidas -> MODO MANUTENÇÃO (janela de 3 min).")
            enableSystemNavigation()
        }
    }

    /** Barras do sistema visiveis durante manutencao (usada na entrada e no boot renascido). */
    private fun releaseSystemBars() {
        try {
            val c = WindowCompat.getInsetsController(window, window.decorView)
            c?.show(WindowInsetsCompat.Type.systemBars())
            c?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
        } catch (e: Exception) {}
    }

    /** Sincroniza a blindagem do SelfHealingService com o estado da manutencao (contrato existente). */
    private fun notifySelfHealing(active: Boolean) {
        try {
            val i = Intent(this, com.antigravity.player.service.SelfHealingService::class.java).apply {
                action = ACTION_MAINTENANCE_MODE
                putExtra("is_active", active)
            }
            sendBroadcast(i)
        } catch (e: Exception) {
            Logger.w("ESCAPE_PROTOCOL", "Falha ao notificar SelfHealing: ${e.message}")
        }
    }

    /**
     * Backup confiavel da recuperacao de 3 min via AlarmManager (mecanismo ja
     * usado por startWatchdog). Sobrevive a morte da Activity/processo: entrega
     * via onNewIntent (singleInstance) ou onCreate.
     */
    private fun scheduleMaintenanceRecoveryAlarm(atMs: Long) {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                putExtra(EXTRA_RESTORE_MAINTENANCE, true)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            val pi = PendingIntent.getActivity(
                this, REQUEST_CODE_MAINTENANCE_RECOVERY, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val exactAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
            if (exactAllowed) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
            }
            Logger.i("ESCAPE_PROTOCOL", "Alarme de recuperação agendado (deadline=$atMs exact=$exactAllowed).")
        } catch (e: Exception) {
            Logger.e("ESCAPE_PROTOCOL", "Falha ao agendar recuperação: ${e.message}")
        }
    }

    private fun cancelMaintenanceRecoveryAlarm() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply { putExtra(EXTRA_RESTORE_MAINTENANCE, true) }
            val pi = PendingIntent.getActivity(
                this, REQUEST_CODE_MAINTENANCE_RECOVERY, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            (getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi)
        } catch (e: Exception) {}
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
        // [MAINTENANCE P0] Nao ressuscitar o Player no meio da janela de manutencao.
        // O loop de playback reagenda este alarme naturalmente apos o retorno.
        if (!isKioskEnforced) return
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

    /**
     * [MAINTENANCE P0] Cancela o alarme do Dead Man's Switch (mesmo requestCode 0
     * usado por startWatchdog) para que ele nao puxe o Player para frente durante
     * a janela de manutencao.
     */
    private fun cancelPlaybackWatchdogAlarm() {
        try {
            val intent = Intent(this, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            (getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pendingIntent)
        } catch (e: Exception) {}
    }
}

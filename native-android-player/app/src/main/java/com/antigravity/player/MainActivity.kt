package com.antigravity.player

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.FrameLayout
import android.widget.ImageView

import android.widget.TextView
import android.widget.Toast
import android.content.Intent
import android.graphics.Color
import android.content.res.Configuration
import android.os.Build
import android.content.pm.ActivityInfo
import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.HandlerThread
import android.view.PixelCopy
import android.graphics.Canvas

import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.edit
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.graphics.toColorInt
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import androidx.core.view.isVisible
import android.webkit.WebView
import android.webkit.WebSettings
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.webkit.WebViewClient


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
import com.antigravity.sync.service.SessionManager
import com.antigravity.core.domain.renderer.RendererState
import kotlinx.coroutines.flow.firstOrNull

import com.antigravity.core.util.Logger

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.channels.Channel
import kotlin.coroutines.resume
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy


@OptIn(UnstableApi::class)
class MainActivity : AppCompatActivity() {

    private lateinit var playerRenderer1: ExoPlayerRenderer
    private lateinit var playerRenderer2: ExoPlayerRenderer
    private var activePlayer: ExoPlayerRenderer? = null
    private var standbyPlayer: ExoPlayerRenderer? = null
    private var lastPlayedMediaId: String? = null
    
    // [WATCHDOG] Playback freeze detector — restarts only video engine on freeze >6s
    private lateinit var playbackWatchdog: PlaybackWatchdog

    private lateinit var statusTextView: TextView
    private lateinit var loadingOverlay: FrameLayout
    private lateinit var blockOverlay: FrameLayout
    private lateinit var playerView1: PlayerView
    private lateinit var playerView2: PlayerView
    private lateinit var standbyImage: ImageView
    private lateinit var staticImageLayer: ImageView // Motor Estático
    private lateinit var webOverlayContainer: FrameLayout // Placeholder do Motor Web
    
    // [SELF-HEALING] Protocol Flags
    private var consecutiveGlobalFailures = 0
    private var isWidgetProcessActive = false
    
    // [HARDENING] Idempotency Flags
    private var isSyncInProgress = false
    private var isSyncLoopRunning = false
    private var isThermalGuardStarted = false
    private var isAutoCleanStarted = false
    
    // [ADVANCED KIOSK] Maintenance Mode State
    private var isMaintenanceMode = false
    private var isKioskEnforced = true // Global control for resilience
    private var maintenanceCounter = 0
    private var lastInputTime = 0L
    private var isOTACycleStarted = false
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_Player) // Switch from Launcher to Player theme
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
        loadingOverlay = findViewById<FrameLayout>(R.id.loading_overlay)
        playerView1 = findViewById<PlayerView>(R.id.playerView1)
        playerView2 = findViewById<PlayerView>(R.id.playerView2)
        standbyImage = findViewById<ImageView>(R.id.standbyImage)
        blockOverlay = findViewById<FrameLayout>(R.id.block_overlay)
        staticImageLayer = findViewById<ImageView>(R.id.static_image_layer)
        webOverlayContainer = findViewById<FrameLayout>(R.id.web_overlay_container)
        
        hideAllLayers()
        
        // Show Standby initially
        standbyImage.visibility = View.VISIBLE
        playerView1.visibility = View.GONE
        playerView2.visibility = View.GONE
        blockOverlay.visibility = View.GONE

        try {
            // [MISSION CRITICAL] Initialize Time Module (Persistent NTP Offset)
            TimeManager.init(applicationContext)
            lifecycleScope.launch { 
                delay(5000) // Give network time to settle
                TimeManager.syncTime() 
            }

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
                loadingOverlay.visibility = View.GONE
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
                 val networkMonitor = com.antigravity.player.util.NetworkMonitor(applicationContext)
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
                // 1. Intelligent Boot Delay (ensure hardware readiness)
                updateStatus("Aguardando Hardware (2s)...")
                delay(2000)

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
                            loadingOverlay.visibility = View.GONE
                            Logger.w("BILLING", "SCREEN BLOCKED by admin. Message: ${SessionManager.blockMessage}")
                        } else {
                            // UNBLOCK: Hide overlay and resume
                            blockOverlay.visibility = View.GONE
                            loadingOverlay.visibility = View.VISIBLE
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

            // [INDUSTRIAL] Maintenance Reset: WebView Clean Cycle
            lifecycleScope.launch {
                SessionManager.maintenanceEvents.collect {
                    Logger.w("MAIN", "Industrial Maintenance: Refreshing WebView for memory health.")
                    findViewById<android.webkit.WebView>(R.id.player_webview)?.reload()
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
                            // 1. Esconde overlays se ainda estiverem visíveis
                            // 1. Esconde overlays se já houver itens na playlist
                            if (loadingOverlay.isVisible && playlist.items.isNotEmpty()) {
                                loadingOverlay.visibility = View.GONE
                                statusTextView.visibility = View.GONE
                                playerView1.visibility = View.VISIBLE
                                standbyImage.visibility = View.GONE
                            }
                            
                            // 2. Aplica rotação e inicia/atualiza o motor de vídeo
                            applyScreenRotation(playlist.orientation)
                            
                            // START PLAYBACK LOOP (Centralized SSOT)
                            startPlaybackLoop()
                        }
                    }
                }
            }

            // 1. Observe Sync Progress (Enterprise Sync UI)
            lifecycleScope.launch {
                ServiceLocator.getRepository(this@MainActivity).getSyncProgress().collect { progress ->
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
                
                // 2. Esconde o overlay de sincronismo/loading imediatamente (User Experience)
                loadingOverlay.visibility = View.GONE
                statusTextView.visibility = View.GONE
                // standbyImage stays VISIBLE as Layer 0
                playerView1.visibility = View.VISIBLE
                
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
                loadingOverlay.visibility = View.VISIBLE 
                statusTextView.visibility = View.VISIBLE
            }
            
            val repo = ServiceLocator.getRepository(applicationContext)
            val syncUseCase = com.antigravity.core.domain.usecase.SyncPlaylistUseCase(repo)
            
            try {
                val result = syncUseCase()

                if (result.isSuccess) {
                    val currentPlaylist = repo.getActivePlaylist().firstOrNull()
                    
                    runOnUiThread {
                        if (currentPlaylist != null) {
                            val playlist = currentPlaylist!!
                            com.antigravity.sync.service.SessionManager.apply {
                                heartbeatIntervalSeconds = playlist.heartbeatIntervalSeconds
                                seamlessTransition = playlist.seamlessTransition
                                cacheNextMedia = playlist.cacheNextMedia
                            }
                            applyScreenRotation(playlist.orientation)
                        }

                        updateStatus("Sincronizado!")
                        // If it's a silent fallback, we might still be in loadingOverlay
                        if (loadingOverlay.isVisible) {
                            loadingOverlay.visibility = View.GONE
                        }
                    }
                } else {
                    val msg = result.exceptionOrNull()?.message ?: "Unknown"
                    val isAborted = msg.contains("aborted", ignoreCase = true) || msg.contains("timeout", ignoreCase = true)
                    
                    Logger.e("SYNC", "Sync failed: $msg. Is Aborted/Timeout: $isAborted")
                    
                    // [RESILIENCE] If aborted/timeout, we try one last time to load from local cache silently
                    val localResult = repo.loadLocalCache()
                    if (localResult.isSuccess) {
                        Logger.i("SYNC", "[RESILIENCE] Network failed ($msg), but local cache found. Resuming playback silently.")
                        runOnUiThread { 
                            loadingOverlay.visibility = View.GONE 
                            updateStatus("Modo Offline Ativo")
                        }
                        return@launch 
                    }

                    runOnUiThread { 
                        loadingOverlay.visibility = View.GONE 
                        updateStatus("Erro: $msg", isError = true)
                    }

                    if (msg.contains("JWT expired", ignoreCase = true) || msg.contains("401", ignoreCase = true)) {
                        handleAuthError("Sessão Expirada (401)")
                    } else if (msg.contains("Tela não encontrada", ignoreCase = true)) {
                        updateStatus("ID Inválido para este Painel", isError = true)
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "ID não encontrado. Reiniciando...", Toast.LENGTH_LONG).show()
                        }
                        Handler(Looper.getMainLooper()).postDelayed({ 
                            handleAuthError("ID não encontrado. Faça login novamente.") 
                        }, 4000)
                    } else if (msg.contains("[PERMANENT]") || msg.contains("Invalid remote playlist", ignoreCase = true)) {
                        updateStatus("Playlist Inválida. Recuperando...", isError = true) 
                        performAutoRepair() // Trigger immediate repair as requested
                    } else {
                        // Retry loop
                        val retryDelay = if (isAborted) 15000L else 30000L
                        Handler(Looper.getMainLooper()).postDelayed({ startSyncAndPlay() }, retryDelay)
                    }
                }
            } catch (e: Exception) {
                 val errorMsg = e.message ?: "Erro desconhecido"
                 Logger.e("SYNC", "Critical failure: $errorMsg", e)
                 runOnUiThread { 
                     loadingOverlay.visibility = View.GONE 
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
     * [SEAMLESS ENGINE] Instant player swap optimized for SurfaceView.
     * SurfaceView doesn't support alpha animations natively (hardware composited),
     * so we use instant VISIBLE/GONE swap which is actually smoother on TV Boxes
     * since it avoids GPU compositing overhead.
     */
    private fun crossfadePlayers(viewToFadeOut: View, viewToFadeIn: View) {
        runOnUiThread {
            // [HARDENING] If we are starting playback, hide loading overlay
            if (loadingOverlay.visibility == View.VISIBLE) {
                loadingOverlay.visibility = View.GONE
            }

            // [STABILITY] Stop watchdog during transition to prevent false positives
            playbackWatchdog.stop()

            // Instant swap — SurfaceView is hardware composited, no alpha needed
            viewToFadeIn.visibility = View.VISIBLE
            viewToFadeOut.visibility = View.GONE 
            standbyImage.visibility = View.GONE // Ensure logo is hidden during media
        }
    }

    private fun logBlackBox(state: String, details: String = "") {
        try {
            val timestamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
            Logger.i("BLACK_BOX", "[$timestamp] STATE: $state | DETAILS: $details")
        } catch (e: Exception) {}
    }

    private var lastPulseTime = System.currentTimeMillis()
    private fun pulseHeartbeat(item: String) {
        lastPulseTime = System.currentTimeMillis()
        logBlackBox("PULSE", "Playing: $item")
    }

    // ========================================================================
    // [INDUSTRIAL ENGINES] ISOLATED PLAYBACK MOTORS
    // ========================================================================
    
    private suspend fun engineVideo(item: MediaItem, playbackEndedChannel: Channel<Unit>): Boolean {
        logBlackBox("ENGINE_VIDEO", "Target: ${item.name}")
        val durationMs = item.durationSeconds * 1000L
        
        // Setup renderer callbacks
        activePlayer?.prepare(item)
        activePlayer?.play()
        
        // [PRECISION] Wait for hardware to actually start rendering the first frame
        val startTime = System.currentTimeMillis()
        withTimeoutOrNull(5000) { // Max 5s wait for hardware start
            activePlayer?.getPlaybackState()?.first { it is RendererState.PLAYING }
        }
        val startupLag = System.currentTimeMillis() - startTime
        Logger.i("ENGINE_VIDEO", "Playback started for ${item.name} (Lag: ${startupLag}ms)")

        // Z-Order: Show the new layer only when it's ready
        runOnUiThread {
            val viewToFadeIn = if (activePlayer == playerRenderer1) playerView1 else playerView2
            val viewToFadeOut = if (activePlayer == playerRenderer1) playerView2 else playerView1
            crossfadePlayers(viewToFadeOut, viewToFadeIn)
        }
        
        // Wait for the FULL programmed duration from dashboard
        // We subtract nothing here because we want the item to STAY on screen for durationMs
        delay(durationMs)
        
        // [STABILITY] Reset watchdog for next item
        playbackWatchdog.reset()
        
        return false
    }

    private suspend fun engineStatic(item: MediaItem): Boolean {
        logBlackBox("ENGINE_STATIC", "Loading: ${item.name}")
        val durationMs = item.durationSeconds * 1000L
        
        runOnUiThread {
            val path = if (item.localPath != null && java.io.File(item.localPath!!).exists()) {
                item.localPath
            } else {
                item.remoteUrl
            }
            
            Glide.with(this@MainActivity)
                .load(path)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .into(staticImageLayer)
            
            staticImageLayer.visibility = View.VISIBLE
            playerView1.visibility = View.GONE
            playerView2.visibility = View.GONE
            standbyImage.visibility = View.GONE
            
            // [PERFORMANCE] Stop video engines to free hardware decoders
            playerRenderer1.stop()
            playerRenderer2.stop()
        }
        
        delay(durationMs)
        return false
    }

    private suspend fun engineWidget(item: MediaItem): Boolean {
        logBlackBox("ENGINE_WIDGET", "Launching Process :web_engine")
        
        runOnUiThread {
            webOverlayContainer.visibility = View.VISIBLE
            
            // Launch WidgetActivity in separate process
            val intent = Intent(this@MainActivity, com.antigravity.player.ui.WidgetActivity::class.java)
            intent.putExtra("url", item.remoteUrl)
            // Use FLAG_ACTIVITY_NEW_TASK because it's in a separate process
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
            startActivity(intent)
            isWidgetProcessActive = true
            
            // [PERFORMANCE] Stop video engines to free hardware decoders
            playerRenderer1.stop()
            playerRenderer2.stop()
            staticImageLayer.visibility = View.GONE
        }

        val durationMs = item.durationSeconds * 1000L
        delay(durationMs)

        // [LIFECYCLE] Force foreground recovery and close widget
        runOnUiThread {
            logBlackBox("ENGINE_WIDGET", "Finalizing Widget and recovering focus")
            
            // 1. Send signal to finish the WidgetActivity
            val finishIntent = Intent(this@MainActivity, com.antigravity.player.ui.WidgetActivity::class.java)
            finishIntent.putExtra("command", "FINISH")
            finishIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            startActivity(finishIntent)

            // 2. Clear local overlay container
            webOverlayContainer.visibility = View.GONE
            
            // 3. Force MainActivity to front (Hardware Z-Order enforcement)
            val focusIntent = Intent(this@MainActivity, MainActivity::class.java)
            focusIntent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            startActivity(focusIntent)
        }
        
        return false
    }

    private suspend fun engineLink(item: MediaItem): Boolean {
        return engineWidget(item) 
    }

    private fun hideAllLayers() {
        runOnUiThread {
            playerView1.visibility = View.GONE
            playerView2.visibility = View.GONE
            staticImageLayer.visibility = View.GONE
            standbyImage.visibility = View.GONE
            webOverlayContainer.visibility = View.GONE
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
                playbackEndedChannel.trySend(Unit)
            }
            
            var lastPlayedId: String? = null
            
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
                        logBlackBox("IDLE", "No items scheduled")
                        runOnUiThread {
                            hideAllLayers()
                            standbyImage.visibility = View.VISIBLE
                        }
                        delay(20000)
                        continue
                    }

                    // [DEBUG] Monitor the exact sequence seen by the player
                    val sequenceLog = playableItems.joinToString(", ") { it.id }
                    Logger.i("PLAYBACK_LOOP", "Active Sequence [Size=${playableItems.size}]: $sequenceLog")

                    // 2. Resilient Cursor: Find next item based on ID to survive reordering
                    val currentIndex = if (lastPlayedId != null) {
                        val foundIndex = playableItems.indexOfFirst { it.id == lastPlayedId }
                        // If found, take next. If not found (item removed), restart from 0
                        if (foundIndex != -1) (foundIndex + 1) % playableItems.size else 0
                    } else 0

                    val item = playableItems[currentIndex]
                    val nextItem = playableItems[(currentIndex + 1) % playableItems.size]
                    
                    pulseHeartbeat(item.name)
                    
                    // 3. Pré-Carregamento em Segundo Plano (Zero-Gap)
                    lifecycleScope.launch {
                        when (nextItem.type) {
                            MediaType.VIDEO, MediaType.IMAGE -> standbyPlayer?.preBuffer(nextItem)
                            else -> {}
                        }
                    }

                    // 4. EXECUÇÃO PELOS MOTORES (Isolamento de Hardware)
                    val skipOnFail = when (item.type) {
                        MediaType.VIDEO -> engineVideo(item, playbackEndedChannel)
                        MediaType.IMAGE -> engineStatic(item)
                        MediaType.WEB_WIDGET -> engineWidget(item)
                        MediaType.EXTERNAL_LINK -> engineLink(item)
                        MediaType.STREAM_RTSP, MediaType.STREAM_HLS -> engineVideo(item, playbackEndedChannel)
                        else -> {
                            logBlackBox("SKIP", "Untracked type: ${item.type}")
                            true
                        }
                    }

                    if (skipOnFail) {
                        logBlackBox("RECOVERY", "Skipping failed item: ${item.name}")
                    } else {
                        // 5. Swap de Players de Vídeo (Se necessário)
                        if (item.type == MediaType.VIDEO || item.type == MediaType.IMAGE) {
                            val temp = activePlayer
                            activePlayer = standbyPlayer
                            standbyPlayer = temp
                        }
                        // Important: Mark as played to move pointer
                        lastPlayedId = item.id
                    }

                } catch (e: Exception) {
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
            val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
            // Esconde barras de status e navegação
            windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
            // Garante que elas só apareçam se o usuário deslizar (e sumam logo depois)
            windowInsetsController.systemBarsBehavior = 
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            // [MISSION CRITICAL] Absolute Focus Management (< 1s recovery)
            if (!this@MainActivity.isMaintenanceMode && this@MainActivity.isKioskEnforced) {
                Logger.w("KIOSK", "Perda de Foco Detectada! Retomando em 500ms...")
                Handler(Looper.getMainLooper()).postDelayed({
                    if (!this@MainActivity.isFinishing && !this@MainActivity.isDestroyed) {
                        val intent = Intent(this@MainActivity, MainActivity::class.java)
                        intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                        startActivity(intent)
                    }
                }, 500)
            }

            // Collapse notification shade
            try {
                @SuppressLint("WrongConstant")
                val statusBarService = getSystemService("statusbar")
                val statusBarManager = Class.forName("android.app.StatusBarManager")
                val collapseMethod = statusBarManager.getMethod("collapsePanels")
                collapseMethod.invoke(statusBarService)
            } catch (e: Exception) {
                sendBroadcast(Intent(Intent.ACTION_CLOSE_SYSTEM_DIALOGS))
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
                "portrait" -> {
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                }
                "landscape" -> {
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                }
            }
        }
    }

    private fun startScreenshotHeartbeat() {
        lifecycleScope.launch {
            while (isActive) {
                delay(3600000) // 1 hour
                takeProofOfPlayScreenshot()
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

        val view = window.decorView
        if (view.width <= 0 || view.height <= 0) return
        
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
                        }
                    }
                }
            }, Handler(Looper.getMainLooper()))
        } catch (e: Exception) {
            Logger.e("SCREENSHOT", "Capture failed: ${e.message}")
        }
    }
}

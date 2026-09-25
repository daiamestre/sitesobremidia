package com.antigravity.player

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
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
import com.antigravity.player.util.PlayerFlowPolicy
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

import com.antigravity.core.domain.state.SurfaceState
import com.antigravity.core.domain.state.PlayerRuntimeState
import com.antigravity.core.domain.state.consumer.SurfaceTarget
import com.antigravity.core.domain.state.consumer.RuntimeSurfaceConsumer
import com.antigravity.core.domain.state.adapter.PlaybackStateAdapter
import com.antigravity.core.domain.state.adapter.SyncStateAdapter
import com.antigravity.core.domain.state.adapter.KioskStateAdapter
import com.antigravity.core.domain.state.adapter.MaintenanceStateAdapter
import com.antigravity.core.domain.state.adapter.SessionStateAdapter
import com.antigravity.core.domain.state.adapter.NetworkStateAdapter
import com.antigravity.core.domain.state.adapter.PlayerRuntimeStateComposer

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
    private lateinit var staticImageLayer2: ImageView // Motor Estático (revezamento p/ cruzamento)
    // Palco de reprodução profissional: tempo exato, pré-carga do próximo item e cruzamento entre mídias
    private lateinit var playbackStage: com.antigravity.player.playback.PlaybackStage
    private lateinit var nativeWidgetContainer: FrameLayout
    // WebViews removidas permanentemente (Widgets 100% Nativos)

    // [P0.4.6] Canonical Runtime Surface Consumer
    private lateinit var surfaceConsumer: RuntimeSurfaceConsumer

    // Ponte entre o palco de reprodução e o resto da Activity (arquivo local, widget, watchdog, tela de sincronização).
    private val stageHooks = object : com.antigravity.player.playback.PlaybackStage.Hooks {
        override suspend fun resolveFile(item: MediaItem): java.io.File? {
            val storageManager = ServiceLocator.getFileStorageManager(applicationContext)
            val hashedFile = storageManager.getFileForMedia(item.id, item.hash)
            val legacyFile = java.io.File(java.io.File(filesDir, "media_content"), "${item.id}.dat")
            val directPath = item.localPath
            val directPathFile = if (!directPath.isNullOrBlank()) java.io.File(directPath) else null
            val localFile = when {
                directPathFile != null && directPathFile.exists() && directPathFile.length() > 0 -> directPathFile
                hashedFile.exists() && hashedFile.length() > 0 -> hashedFile
                legacyFile.exists() && legacyFile.length() > 0 -> legacyFile
                else -> com.antigravity.player.util.CacheManager.verificarEBaixar(this@MainActivity, item.remoteUrl, hashedFile.name)
            }
            if (!localFile.exists() || localFile.length() <= 0L) {
                Logger.e("PLAYBACK_STAGE", "Arquivo crítico ausente/0 bytes: ${item.name}")
                exibirAlertaDeMidiaCorrompida(item.name)
                return null
            }
            return localFile
        }

        override suspend fun renderWidget(item: MediaItem) {
            com.antigravity.player.util.NativeWidgetEngine.renderWidget(this@MainActivity, nativeWidgetContainer, item.remoteUrl)
        }

        override fun mediaVisible() {
            viewModel.confirmarMidiaPronta()
            statusTextView.visibility = View.GONE
            standbyImage.visibility = View.GONE
        }

        override fun videoShown(player: androidx.media3.common.Player, active: ExoPlayerRenderer, standby: ExoPlayerRenderer) {
            activePlayer = active
            standbyPlayer = standby
            playbackWatchdog.watch(player)
        }

        override fun nonVideoShown() {
            if (::playbackWatchdog.isInitialized) playbackWatchdog.stop()
        }

        override fun itemFinished() {
            if (::playbackWatchdog.isInitialized) playbackWatchdog.reset()
        }

        // O detector força o EMULADOR em modo legado. Para TESTAR o caminho de decodificador duplo (aparelho moderno) no
        // emulador: criar files/force_dual_decoder (depuração; em produção o arquivo não existe).
        override fun isLegacyHardware(): Boolean =
            com.antigravity.media.exoplayer.ChipsetDetector.getRecommendedProfile() ==
                com.antigravity.media.exoplayer.ChipsetDetector.HardwareProfile.LEGACY_STABILITY &&
                !java.io.File(filesDir, "force_dual_decoder").exists()

        override fun log(state: String, details: String) {
            logBlackBox(state, details)
        }
    }

    private val surfaceTarget = object : SurfaceTarget {
        override fun showLoginSurface() {
            runOnUiThread {
                if (!isFinishing && !isDestroyed) {
                    val intent = Intent(this@MainActivity, com.antigravity.player.ui.LoginActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    }
                    startActivity(intent)
                    finish()
                }
            }
        }

        override fun showScreenSelectionSurface() {
            runOnUiThread {
                if (!isFinishing && !isDestroyed) {
                    val intent = Intent(this@MainActivity, com.antigravity.player.ui.ScreenSelectionActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    }
                    startActivity(intent)
                    finish()
                }
            }
        }

        override fun showSyncGuardSurface(message: String?) {
            runOnUiThread {
                syncGuard.lockScreen(message ?: "Sincronizando mídias...")
                statusTextView.visibility = View.GONE
                playerView1.visibility = View.INVISIBLE
                playerView2.visibility = View.INVISIBLE
                blockOverlay.visibility = View.GONE
            }
        }

        override fun showMediaOnlySurface() {
            runOnUiThread {
                syncGuard.releaseLock()
                statusTextView.visibility = View.GONE
                blockOverlay.visibility = View.GONE
                // Restaura a camada do item que está na tela (forçar o playerView1 aqui punha um retângulo preto por cima
                // da imagem/vídeo quando a camada atual era outra).
                if (::playbackStage.isInitialized) playbackStage.restoreShown()
                standbyImage.visibility = View.GONE
            }
        }

        override fun showBlockedSurface(message: String?) {
            runOnUiThread {
                findViewById<TextView>(R.id.block_title)?.text = message ?: SessionManager.blockMessage ?: "TELA BLOQUEADA"
                blockOverlay.visibility = View.VISIBLE
                playerView1.visibility = View.GONE
                playerView2.visibility = View.GONE
                syncGuard.releaseLock()
                statusTextView.visibility = View.GONE
            }
        }
    }

    // (P0.4.6) Aplica a projeção canônica SurfaceState através do RuntimeSurfaceConsumer.
    fun applySurface(surface: SurfaceState, message: String? = null): SurfaceState {
        return surfaceConsumer.applySurface(surface, message)
    }

    // (P0.4.6) Amostra o estado consolidado de runtime a partir dos 6 eixos canônicos.
    fun sampleRuntimeState(): PlayerRuntimeState {
        val currentRenderer = activePlayer ?: playerRenderer1
        val playback = PlaybackStateAdapter.adaptExoPlayerState(
            playbackState = currentRenderer.getPlayerInstance()?.playbackState ?: 1,
            isPlaying = currentRenderer.getPlayerInstance()?.isPlaying ?: false,
            mediaId = lastPlayedMediaId
        )
        val sync = SyncStateAdapter.adapt(
            isSyncInProgress = isSyncInProgress
        )
        val kiosk = KioskStateAdapter.adapt(
            isKioskEnforced = isKioskEnforced
        )
        val prefs = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
        val maintenanceUntil = prefs.getLong("maintenance_until", 0L)
        val maintenance = MaintenanceStateAdapter.adapt(
            maintenanceUntilMs = maintenanceUntil,
            currentTimeMs = System.currentTimeMillis()
        )
        // O SessionManager fica em UNKNOWN até o 1º sync ok e o token em memória some se o processo renasce:
        // com a tela já escolhida neste aparelho a sessão local é válida (senão a projeção mandava ao Login
        // e fechava o player logo depois de o usuário escolher a tela).
        val sessionInputs = PlayerFlowPolicy.effectiveSessionInputs(
            stateName = SessionManager.sessionState.value.name,
            accessToken = SessionManager.currentAccessToken,
            userId = SessionManager.currentUserId,
            savedScreenId = prefs.getString("saved_screen_id", null)
        )
        val session = SessionStateAdapter.adapt(
            sessionStateName = sessionInputs.stateName,
            isDeviceRevoked = SessionManager.isDeviceRevoked,
            isScreenActive = SessionManager.isScreenActive,
            currentAccessToken = sessionInputs.accessToken,
            currentUserId = sessionInputs.userId,
            deviceIdentityHash = SessionManager.deviceIdentityHash,
            blockMessage = SessionManager.blockMessage
        )
        val network = NetworkStateAdapter.adapt(
            isConnected = com.antigravity.player.util.NetworkMonitor(applicationContext).isConnected.value
        )
        return PlayerRuntimeStateComposer.compose(
            playback = playback,
            sync = sync,
            kiosk = kiosk,
            maintenance = maintenance,
            session = session,
            network = network
        )
    }

    // (P0.4.6) Sincroniza a superfície física com a projeção canônica do PlayerRuntimeState.
    fun syncSurfaceWithCanonicalProjection(): SurfaceState {
        return surfaceConsumer.consume(sampleRuntimeState())
    }
    
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

    // [P0-FIX RC3] Bootstrap guard: prevents onWindowFocusChanged / onStop events
    // that fire during the ScreenSelection→MainActivity transition from being counted
    // as real user-initiated exits. Set to true after checkLocalCacheAndPlay() completes.
    private var isBootstrapComplete = false

    companion object {
        // [EXIT COUNTER] Persistencia (sobrevive a recriacao da Activity/processo)
        private const val PREF_EXIT_COUNT = "exit_count"
        private const val PREF_LAST_EXIT_AT = "last_exit_at"
        private const val PREF_MAINTENANCE_UNTIL = "maintenance_until"
        private const val SCREENSHOT_CAPTURE_TIMEOUT_MS = 15_000L
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
            ?: savedPrefs.getString("current_orientation",
                // [P0-FIX RC2] Correct mobile fallback: MOBILE starts in portrait until the
                // first playlist sync delivers the content-defined orientation. The previous
                // hardcoded "landscape" for MOBILE caused orientation whiplash (PORTRAIT in
                // ScreenSelectionActivity → forced LANDSCAPE in MainActivity on mobile).
                if (isTV) "landscape" else "portrait")
        applyScreenRotation(initialOrientation)
        
        // [MISSION CRITICAL] Native Immersive Mode (Zero-Touch)
        setFullscreenMode()

        

        // UI initialization
        statusTextView = findViewById<TextView>(R.id.status_text)
        syncGuard = com.antigravity.player.util.SyncGuard(this)
        // O timer de segurança do SyncGuard só solta a tela quando já há mídia pronta (PLAYING).
        syncGuard.keepLockedWhile = {
            !::viewModel.isInitialized || PlayerFlowPolicy.keepSyncScreenLocked(viewModel.playerState.value)
        }
        // Já no primeiro quadro: "Sincronizando Mídias" (e arma o timer de segurança) — nada aparece antes disso.
        syncGuard.lockScreen()
        playerView1 = findViewById<PlayerView>(R.id.playerView1)
        playerView2 = findViewById<PlayerView>(R.id.playerView2)
        standbyImage = findViewById<ImageView>(R.id.standbyImage)
        blockOverlay = findViewById<FrameLayout>(R.id.block_overlay)
        staticImageLayer = findViewById<ImageView>(R.id.static_image_layer)
        staticImageLayer2 = findViewById<ImageView>(R.id.static_image_layer2)
        nativeWidgetContainer = findViewById<FrameLayout>(R.id.native_widget_container)
        
        // [P0.4.6] Inicializa consumidor de projeção de superfície
        surfaceConsumer = RuntimeSurfaceConsumer(surfaceTarget)
        
        hideAllLayers()
        com.antigravity.player.util.PlaybackProbe.startIfEnabled(this) // depuração: só liga com files/probe_enabled
        
        // A camada de standby (antes logo sobre preto) NÃO aparece no boot: o que o usuário vê primeiro é a
        // tela de sincronização, já visível no layout (nada pode piscar antes dela).
        standbyImage.visibility = View.GONE
        // [TEORIA DO SURFACE] Mantém invisível em vez de GONE no boot para o Surface ser criado imediatamente
        playerView1.visibility = View.INVISIBLE
        playerView2.visibility = View.INVISIBLE
        blockOverlay.visibility = View.GONE
        statusTextView.visibility = View.GONE

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
            // [P0.4.8] PlayerUIState continua orquestrando use cases e lifecycle interno do ViewModel.
            // A decisão de superfície foi removida deste observer — ela flui exclusivamente pelo
            // caminho canônico: RuntimeAuthorities → Adapters → PlayerRuntimeState
            //   → SurfaceProjectionEngine → RuntimeSurfaceConsumer → SurfaceTarget.
            // Os pontos de transição (startSyncAndPlay, onSyncSuccess, prepararPrimeiraMidia,
            // confirmarMidiaPronta) já chamam syncSurfaceWithCanonicalProjection() diretamente.
            lifecycleScope.launch {
                viewModel.playerState.collect { estado ->
                    when (estado) {
                        com.antigravity.player.ui.PlayerUIState.SYNCING -> {
                            android.util.Log.d("PLAYER_FLUXO", "Estado: SYNCING - Fluxo de sincronização em andamento.")
                        }
                        com.antigravity.player.ui.PlayerUIState.PLAYING -> {
                            // [SIGNAGE NOTIFICATION SHIELD] Dispositivo em operacao signage dedicada:
                            // bloqueia heads-up notifications de outros apps (WhatsApp, Shopee, etc.)
                            // via filtro oficial do Android. O filtro anterior e guardado para restaurar
                            // no modo manutencao/desvinculacao.
                            runOnUiThread {
                                if (DeviceControl.isNotificationPolicyAccessGranted(this@MainActivity)) {
                                    if (previousInterruptionFilter == android.app.NotificationManager.INTERRUPTION_FILTER_UNKNOWN) {
                                        previousInterruptionFilter = (getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).currentInterruptionFilter
                                    }
                                    if (DeviceControl.suppressHeadsUpNotifications(this@MainActivity)) {
                                        Logger.i("KIOSK", "Modo signage: heads-up notifications suprimidas.")
                                    }
                                }
                            }
                            // PLAYING = mídia válida sendo exibida => superfície MEDIA_ONLY: a tela de
                            // sincronização não pode ficar por cima (antes só sumia pelo timer de 25 s).
                            // Só libera o overlay; não força nenhum PlayerView (A/B renderer).
                            // ("Mídias sincronizadas" fica visível o tempo mínimo antes de a mídia assumir a tela.)
                            syncGuard.releaseWhenMediaReady()
                            android.util.Log.d("PLAYER_FLUXO", "Estado: PLAYING - Mídias prontas. Reprodução iniciada.")
                        }
                        com.antigravity.player.ui.PlayerUIState.AUTH -> {
                            android.util.Log.d("PLAYER_FLUXO", "Estado: AUTH - Conexão de tela.")
                        }
                        com.antigravity.player.ui.PlayerUIState.PREPARING -> {
                            android.util.Log.d("PLAYER_FLUXO", "Estado: PREPARING - Verificação de cache local e Pre-Roll.")
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
                    restoreFromMaintenance(force = true)
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
                            Logger.i("NAVIGATION", "Redirecionando para Seleção de Tela...")
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

            // Com o kiosk ativo o toque longo é consumido e NÃO desvincula/troca a tela: depois de escolher
            // a tela, o usuário não sai por aqui. A troca é feita pelo painel (Desvincular) ou na janela
            // de manutenção (kiosk liberado).
            statusTextView.setOnLongClickListener { if (isKioskEnforced) true else resetScreenAction() }
            syncOverlay?.setOnLongClickListener { if (isKioskEnforced) true else resetScreenAction() }

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
                val playlistOri = com.antigravity.core.domain.model.PlaylistOrientation.fromResolutionOrOrientation(
                    SessionManager.currentOrientation
                )
                val deviceOri = com.antigravity.core.domain.model.DevicePhysicalOrientation.fromConfig(
                    resources.configuration.orientation
                )
                val resolved = com.antigravity.core.domain.model.PresentationResolver.resolve(
                    playlistOri,
                    dmWidth,
                    dmHeight,
                    deviceOri
                )
                val ratio = if (height > 0) String.format(java.util.Locale.US, "%.2f", width.toFloat() / height) else "N/A"
                val resMode = if (playerView1.resizeMode == androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT) "FIT" else "OTHER(${playerView1.resizeMode})"
                
                Logger.i("ORIENTATION_CONTRACT", """
                    ${resolved.toLogString()}
                    PLAYER VIEW 1: ${pvWidth}x${pvHeight}
                    VIDEO: ${width}x${height} (Ratio: $ratio)
                    RESIZE MODE: $resMode
                """.trimIndent())
            }
            playerRenderer2.onVideoSizeChanged = { width, height ->
                val displayMetrics = resources.displayMetrics
                val dmWidth = displayMetrics.widthPixels
                val dmHeight = displayMetrics.heightPixels
                val pvWidth = playerView2.width
                val pvHeight = playerView2.height
                val playlistOri = com.antigravity.core.domain.model.PlaylistOrientation.fromResolutionOrOrientation(
                    SessionManager.currentOrientation
                )
                val deviceOri = com.antigravity.core.domain.model.DevicePhysicalOrientation.fromConfig(
                    resources.configuration.orientation
                )
                val resolved = com.antigravity.core.domain.model.PresentationResolver.resolve(
                    playlistOri,
                    dmWidth,
                    dmHeight,
                    deviceOri
                )
                val ratio = if (height > 0) String.format(java.util.Locale.US, "%.2f", width.toFloat() / height) else "N/A"
                val resMode = if (playerView2.resizeMode == androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT) "FIT" else "OTHER(${playerView2.resizeMode})"
                
                Logger.i("ORIENTATION_CONTRACT", """
                    ${resolved.toLogString()}
                    PLAYER VIEW 2: ${pvWidth}x${pvHeight}
                    VIDEO: ${width}x${height} (Ratio: $ratio)
                    RESIZE MODE: $resMode
                """.trimIndent())
            }
            
            activePlayer = playerRenderer1
            standbyPlayer = playerRenderer2

            playbackStage = com.antigravity.player.playback.PlaybackStage(
                activity = this,
                scope = lifecycleScope,
                layers = com.antigravity.player.playback.PlaybackStage.Layers(
                    video1 = playerView1, video2 = playerView2,
                    image1 = staticImageLayer, image2 = staticImageLayer2,
                    widget = nativeWidgetContainer
                ),
                r1 = playerRenderer1,
                r2 = playerRenderer2,
                hooks = stageHooks
            )
        
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
                             Logger.i("NETWORK", "Conexão Restaurada! Sincronizando em background...")
                             // Internet is back! Force Sync + Reconnect Realtime
                             com.antigravity.player.util.PlaybackBufferManager(applicationContext).flushPendingLogs()
                             lifecycleScope.launch(Dispatchers.IO) { syncInBackground() }
                         }
                     } else {
                         if (!isFirstEmission) {
                             Logger.w("NETWORK", "Sem Internet. Modo Offline Ativo (Playback ininterrupto).")
                         }
                     }
                     isFirstEmission = false
                 }
            }

            // [ADVANCED KIOSK] Intelligent Boot & Service Initialization Flow
            lifecycleScope.launch {
                // 1. Start Synchronization Loop (Cache-First) immediately
                checkLocalCacheAndPlay()

                // [P0-FIX RC3] Bootstrap is complete. Transition events from ScreenSelection
                // (focus-loss, onStop during task switch) have now settled. From this point
                // onward, registerValidExit() will count real user-initiated exits.
                isBootstrapComplete = true
                Logger.i("ESCAPE_PROTOCOL", "Bootstrap complete. Exit counter now active.")
                
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
                            Logger.i("AUTO_CLEAN", "Manutenção Programada (Auto-Clean) em execução...")
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
            // [P0.4.8] screenActiveEvents preserva responsabilidades operacionais legítimas:
            //   stop() dos renderers, reset do isSyncLoopRunning, syncInBackground.
            // A decisão de superfície (BLOCKED/SYNC_GUARD) foi removida deste ponto —
            // ela flui pelo caminho canônico via syncSurfaceWithCanonicalProjection().
            // SessionManager.triggerScreenActive(false) já chama transitionTo(SUSPENDED),
            // e SessionStateAdapter.adapt(isScreenActive=false) → SessionState.Suspended
            //   → SurfaceProjectionEngine → SurfaceState.BLOCKED.
            lifecycleScope.launch {
                SessionManager.screenActiveEvents.collect { isActive ->
                    Logger.w("BILLING", "Screen active state changed: $isActive")
                    runOnUiThread {
                        if (!isActive) {
                            // BLOCK: Stop everything (operational side effects — preservados)
                            // O laço de reprodução precisa MORRER: só parar os renderers deixava o laço vivo,
                            // que tocava a próxima mídia (e o áudio) por baixo do aviso de bloqueio.
                            playbackLoopJob?.cancel()
                            playbackLoopJob = null
                            if (::playbackStage.isInitialized) playbackStage.forget()
                            if (::playbackWatchdog.isInitialized) playbackWatchdog.stop()
                            playerRenderer1.stop()
                            playerRenderer2.stop()
                            isSyncLoopRunning = false
                            
                            // [P0.4.8] Superfície via projeção canônica.
                            // isScreenActive=false → SessionState.Suspended → SurfaceState.BLOCKED.
                            syncSurfaceWithCanonicalProjection()
                            Logger.w("BILLING", "SCREEN BLOCKED by admin. Message: ${SessionManager.blockMessage}")
                        } else {
                            // UNBLOCK: Only execute re-activation if screen was actually blocked
                            val wasBlocked = blockOverlay.visibility == View.VISIBLE
                            if (wasBlocked) {
                                // [P0.4.8] Superfície via projeção canônica.
                                // isScreenActive=true + Idle → SurfaceState.SYNC_GUARD.
                                syncSurfaceWithCanonicalProjection()
                                Logger.i("BILLING", "SCREEN UNBLOCKED. Resuming playback.")
                                resumeAfterReactivation()
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
                        "maintenance_open", "open_maintenance" -> {
                            Logger.i("COMMAND", ">>> MAINTENANCE OPEN COMMAND RECEIVED (ID: $commandId)")
                            ackRemoteCommand(commandId, "executed")
                            runOnUiThread { enableSystemNavigation("remote_command") }
                        }
                        "maintenance_close", "close_maintenance" -> {
                            Logger.i("COMMAND", ">>> MAINTENANCE CLOSE COMMAND RECEIVED (ID: $commandId)")
                            ackRemoteCommand(commandId, "executed")
                            runOnUiThread { restoreFromMaintenance(force = true) }
                        }
                        "sync" -> {
                            ackRemoteCommand(commandId, "executed")
                            runOnUiThread { startSyncAndPlay() }
                        }
                        "reload" -> updatePlayerNow(commandId)
                        "rotate_portrait" -> {
                            applyScreenRotation("portrait", forcePhysicalLock = true)
                            ackRemoteCommand(commandId, "executed")
                        }
                        "rotate_landscape" -> {
                            applyScreenRotation("landscape", forcePhysicalLock = true)
                            ackRemoteCommand(commandId, "executed")
                        }
                        // "Reiniciar Player" do painel: fecha e abre o Player (nova sincronização), sem depender de Device Owner.
                        "reboot", "restart_player" -> restartPlayerApp(commandId)
                        // Reinício FÍSICO do aparelho (só Device Owner). Não é enviado pelo botão do painel.
                        "reboot_device" -> {
                            val dpm = getSystemService(android.content.Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                            val componentName = android.content.ComponentName(this@MainActivity, com.antigravity.player.receiver.AdminReceiver::class.java)
                            
                            if (dpm.isDeviceOwnerApp(packageName)) {
                                ackRemoteCommand(commandId, "executed")
                                Logger.i("COMMAND", "Comando Remoto: Reiniciando Player FÍSICO...")
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

                                    Logger.i("COMMAND", "Dispositivo desvinculado pelo painel.")

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
                    // O reinício do laço é decidido em syncInBackground (só se a playlist mudou).
                    lifecycleScope.launch(Dispatchers.IO) {
                        syncInBackground()
                    }
                }
            }

            // 1. Observe Sync Progress (Enterprise Sync UI)
            lifecycleScope.launch {
                ServiceLocator.getRepository(this@MainActivity).getSyncProgress().collect { progress ->
                    // Tela de sincronização: nome "Sincronizando Mídias" + contador; ao final "Mídias sincronizadas".
                    // Textos de "aguarde"/erro/bloqueio internos não são exibidos ao usuário.
                    val shown = PlayerFlowPolicy.sanitizeSyncProgress(progress)
                    syncGuard.updateProgress(shown)
                    statusTextView.text = shown
                }
            }
            
        } catch (e: Exception) {
            Logger.e("CRITICAL_BOOT", e.message ?: "Unknown Boot Error")

            // [SELF-HEALING] Nunca expulsa o usuário (Login) nem solta o kiosk por uma falha de boot:
            // sem mensagem na tela, tenta reiniciar o fluxo local em silêncio.
            Handler(Looper.getMainLooper()).postDelayed({
                if (!isFinishing && !isDestroyed) checkLocalCacheAndPlay()
            }, 10_000)
        }
    }

private fun checkLocalCacheAndPlay() {
        lifecycleScope.launch(Dispatchers.IO) {
            val repository = ServiceLocator.getRepository(applicationContext)
            
            // 1. Tenta buscar a última playlist salva no banco local
            repository.loadLocalCache()
            val localPlaylist = repository.getActivePlaylist().firstOrNull()

            // [FIX P3] Verificar se a screen ainda existe e está ativa no Dashboard.
            // A fonte de verdade deve ser o conjunto atual de Screens válidas do backend.
            // Se a screen foi deletada do painel, o player deve limpar o saved_screen_id
            // e voltar à seleção de tela, em vez de tentar reproduzir mídia de screen inexistente.
            val screenIdValid = verificarScreenNoBackend(localPlaylist)
            
            // [FIX P3] Se tem items locais MAS a screen foi removida do painel,
            // invalida o cache e força sync (que vai limpar o saved_screen_id)
            val hasLocalItems = localPlaylist != null && localPlaylist.items.isNotEmpty()
            
            withContext(Dispatchers.Main) {
                if (hasLocalItems && screenIdValid) {
                    Logger.i("OFFLINE_FIRST", "Cache local encontrado e screen válida. Iniciando reprodução imediata.")
                    
                    // 2. Trava a interface no estado PREPARING via Gatekeeper,
                    // para que a tela de Sync continue travando o fundo até o motor de fato começar o frame 0.
                    viewModel.prepararPrimeiraMidia()
                    
                    // 3. Aplica a orientação que já estava salva para este dispositivo
                    applyScreenRotation(localPlaylist?.orientation)
                    
                    // 4. Inicia o loop de reprodução com os arquivos locais
                    Handler(Looper.getMainLooper()).postDelayed({
                        startPlaybackLoop()
                    }, 100)

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
                    screen.id.equals(savedId, ignoreCase = true) ||
                    (screen.customId ?: "").equals(savedId, ignoreCase = true)
                )
                val isActive = screen.isActive
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

    private suspend fun syncInBackground(): Boolean {
        var succeeded = false
        val repo = ServiceLocator.getRepository(applicationContext)
        val syncUseCase = com.antigravity.core.domain.usecase.SyncPlaylistUseCase(repo)
        
        try {
            // Assinatura ANTES do sync: permite saber se ESTE sync mudou a playlist em exibição.
            val signatureBefore = PlayerFlowPolicy.playlistSignature(repo.getActivePlaylist().firstOrNull())
            val result = syncUseCase()
            if (result.isSuccess) {
                Logger.i("SYNC", "Sincronização de background concluída. Aplicando nova sequência...")

                // [NEW] Aciona a limpeza cirúrgica após baixar as novas mídias
                SmartCacheCleaner.purgeOrphanedMedia(applicationContext)

                // Aplicar configurações silenciosamente (sem piscar a tela)
                val currentPlaylist = repo.getActivePlaylist().firstOrNull()
                currentPlaylist?.let { playlist ->
                    val signatureAfter = PlayerFlowPolicy.playlistSignature(playlist)
                    runOnUiThread {
                        SessionManager.apply {
                            heartbeatIntervalSeconds = playlist.heartbeatIntervalSeconds
                            seamlessTransition = playlist.seamlessTransition
                            cacheNextMedia = playlist.cacheNextMedia
                        }
                        applyScreenRotation(playlist.orientation)

                        // Reinicia o laço SOMENTE se este sync mudou a playlist (mídia nova/removida,
                        // ordem, duração, agenda). Sem mudança, a mídia em exibição não é interrompida.
                        val loopActive = isSyncLoopRunning && playbackLoopJob?.isActive == true
                        if (PlayerFlowPolicy.shouldRestartPlaybackLoop(signatureBefore, signatureAfter, loopActive)) {
                            isSyncLoopRunning = false
                            startPlaybackLoop()
                        }
                    }
                }
                succeeded = true
                lastBackgroundSyncError = null
                scheduleNextBackgroundSync()
            } else {
                val msg = result.exceptionOrNull()?.message ?: "Unknown"
                lastBackgroundSyncError = msg
                if (PlayerFlowPolicy.classifySyncError(msg) == PlayerFlowPolicy.SyncErrorAction.REAUTH) {
                    runOnUiThread { handleAuthError() }
                }
                // Silenciosamente tenta de novo em 1 minuto
                scheduleNextBackgroundSync()
            }
        } catch (e: Exception) {
            Logger.e("SYNC", "Background sync error: ${e.message}")
            lastBackgroundSyncError = e.message
            scheduleNextBackgroundSync()
        }
        return succeeded
    }

    @Volatile private var lastBackgroundSyncError: String? = null

    // Um único timer de sync periódico: cada execução cancela o agendamento anterior antes de
    // reagendar (antes, cada nudge/execução acumulava mais uma cadeia paralela de 60 s).
    private val backgroundSyncHandler = Handler(Looper.getMainLooper())
    private val backgroundSyncRunnable = Runnable {
        lifecycleScope.launch(Dispatchers.IO) { syncInBackground() }
    }

    private fun scheduleNextBackgroundSync(delayMs: Long = 60_000L) {
        backgroundSyncHandler.removeCallbacks(backgroundSyncRunnable)
        backgroundSyncHandler.postDelayed(backgroundSyncRunnable, delayMs)
    }

    /**
     * Tela Ativa reativada no painel: a reprodução tem que voltar NA HORA. O bloqueio cancelou o laço de reprodução
     * e o servidor pode ter apagado o cache local, então o sync silencioso de antes (que só reinicia o laço se a
     * playlist MUDAR) deixava a tela em "Sincronizando Mídias" até o timeout de 25 s liberar um logo sobre preto.
     * Agora: sincroniza (baixa/re-salva o que faltar) e reinicia o laço explicitamente; sem playlist pronta,
     * cai no fluxo visível completo do primeiro acesso, que tenta de novo sozinho.
     */
    private fun resumeAfterReactivation() {
        // Um sync iniciado durante o bloqueio não pode fazer a reativação ser ignorada.
        isSyncInProgress = false
        isSyncLoopRunning = false
        lifecycleScope.launch(Dispatchers.IO) {
            val syncOk = try {
                syncInBackground()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                false
            }
            val playlist = try {
                ServiceLocator.getRepository(applicationContext).getActivePlaylist().firstOrNull()
            } catch (e: Exception) {
                null
            }
            withContext(Dispatchers.Main) {
                if (isFinishing || isDestroyed || !SessionManager.isScreenActive) return@withContext
                if (syncOk && playlist != null && playlist.items.isNotEmpty()) {
                    Logger.i("BILLING", "Reativação: playlist pronta (${playlist.items.size} itens). Reiniciando a reprodução.")
                    applyScreenRotation(playlist.orientation)
                    isSyncLoopRunning = false
                    viewModel.prepararPrimeiraMidia()
                    startPlaybackLoop()
                } else {
                    Logger.w("BILLING", "Reativação: sem playlist pronta (sync=${syncOk}). Usando o fluxo visível de sincronização.")
                    startSyncAndPlay()
                }
            }
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
            
            // [P0.4.8] Superfície aplicada via caminho canônico.
            // SessionStateAdapter → SessionState.Authorized → PlaybackState.Idle → SYNC_GUARD.
            // Não mais via syncGuard.lockScreen() direto (decisão visual concorrente removida).
            updateStatus("Sincronizando mídias...", isError = false)
            runOnUiThread { 
                syncSurfaceWithCanonicalProjection()
                statusTextView.visibility = View.GONE
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
                        
                        lifecycleScope.launch(Dispatchers.IO) ioBlock@{
                            val localResult = repo.loadLocalCache()
                            if (localResult.isSuccess) {
                                Logger.i("SYNC", "[RESILIENCE] Network failed ($errorMsg), mas cache local encontrado. Resumindo...")
                                runOnUiThread { updateStatus("Modo Offline Ativo") }
                                viewModel.prepararPrimeiraMidia()
                                return@ioBlock 
                            }

                            // Sem mensagem de erro ao usuário: a tela de sincronização segue neutra.
                            val action = PlayerFlowPolicy.classifySyncError(errorMsg)
                            if (action == PlayerFlowPolicy.SyncErrorAction.REAUTH) {
                                handleAuthError("Sessão Expirada (401)")
                            } else if (action == PlayerFlowPolicy.SyncErrorAction.SELECT_SCREEN) {
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
                 // Sem mensagem de erro ao usuário: tenta de novo em silêncio (a tela de sync permanece).
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
                Logger.i("SCREEN_OPT", "Dica: Mantenha pressionado o texto de status para trocar de tela.")
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
            viewToFadeIn.visibility = View.VISIBLE
            viewToFadeIn.alpha = 1f
            
            // 3. Limpa a Mídia Antiga para a Próxima Rodada (-RAM)
            val oldPlayerView = (viewToFadeOut as? androidx.media3.ui.PlayerView)
            oldPlayerView?.player?.stop()
            oldPlayerView?.player?.clearMediaItems()
            
            // Cleanup de overlays inativos imediatamente
            // NÃO mostrar standbyImage (logo) durante reprodução ativa!
            standbyImage.visibility = View.GONE
            staticImageLayer.visibility = View.GONE
            nativeWidgetContainer.visibility = View.GONE
            statusTextView.visibility = View.GONE
            
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
        val erroMsg = "⚠️ ERRO DE MÍDIA: [$nomeMidia] Precisa de Re-upload"
        Logger.e("ANTIGRAVITY", erroMsg)
        logBlackBox("MEDIA_CORRUPT", erroMsg)
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
    
    private fun hideAllLayers() {
        runOnUiThread {
            // [TEORIA DO SURFACE] Mantém os players invisíveis em vez de GONE no reset geral,
            // para que a Surface se prepare antes que o primeiro vídeo toque.
            playerView1.visibility = View.INVISIBLE
            playerView2.visibility = View.INVISIBLE
            staticImageLayer.visibility = View.INVISIBLE
            if (::staticImageLayer2.isInitialized) staticImageLayer2.visibility = View.INVISIBLE
            standbyImage.visibility = View.GONE
            nativeWidgetContainer.visibility = View.GONE
            if (::playbackStage.isInitialized) playbackStage.forget()
        }
    }

    /**
     * [CONTINGENCY] Modo de Emergência - Vídeo Interno
     * Tenta reproduzir o standby.mp4 da pasta assets se não houver internet nem cache.
     */
    private fun playStandbyVideo() {
        val standbyUri = android.net.Uri.parse("asset:///standby.mp4")
        
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
            if (::playbackStage.isInitialized) playbackStage.restartTimeline()

            logBlackBox("BOOT", "Armor Initialized")
            delay(100)
            
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
                    // O palco cuida do tempo exato, da pré-carga do próximo item e do cruzamento entre mídias.
                    val skipOnFail = playbackStage.play(item, nextItem, playlist.audioEnabled)

                    if (skipOnFail) {
                        logBlackBox("RECOVERY", "Skipping failed item: ${item.name}")
                        // [CRITICAL FIX] Quarentena Ativa: Avisa o QueueManager e freia o CPU
                        queueManager.quarantineItem(item, "EngineSkip (Hardware/Codec Reject)")
                        runOnUiThread {
                            viewModel.confirmarMidiaPronta()
                            syncGuard.releaseLock()
                        }
                        
                        // [TV BOX FREIO DE MÃO] Assíncrono Back-off para a GPU esfriar antes de tentar o próximo vídeo 
                        logBlackBox("RECOVERY", "Aguardando 2000ms GPU cooldown.")
                        delay(2000L) 
                    } else {
                        
                        // [CRITICAL FIX] Marca como tocado garantindo o avanço
                        queueManager.markAsProcessed(item)

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
        backgroundSyncHandler.removeCallbacks(backgroundSyncRunnable)

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
        // [MICRO-GATE P0.1] Normal remote keys / navigation keys MUST NOT trigger maintenance.
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
        val isExplicitRestore = intent?.getBooleanExtra(EXTRA_RESTORE_MAINTENANCE, false) == true
        evaluateMaintenanceState(force = isExplicitRestore)

        // [P0-FIX RC2] Re-entry from ScreenSelectionActivity
        // If returning to existing singleInstance MainActivity after screen selection,
        // sync volatile state, restore Kiosk lock, and initiate the sync/playback loop.
        val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
        val savedId = prefs.getString("saved_screen_id", null)
        if (!savedId.isNullOrBlank()) {
            Logger.i("NAVIGATION", "MainActivity.onNewIntent: Screen ID $savedId active. Initiating synchronization...")
            // Clear any lingering maintenance or exit counters from selection navigation
            prefs.edit().remove(PREF_MAINTENANCE_UNTIL).remove(PREF_EXIT_COUNT).putLong(PREF_LAST_EXIT_AT, 0L).apply()
            cancelMaintenanceRecoveryAlarm()
            maintenanceCounter = 0
            lastInputTime = 0L

            val rendererScreenId = if (::playerRenderer1.isInitialized) playerRenderer1.currentScreenId else null
            val reentrySurface = resolveReentrySurface(sampleRuntimeState(), rendererScreenId, savedId)

            SessionManager.currentUserId = savedId
            SessionManager.currentUUID = savedId
            if (::playerRenderer1.isInitialized) playerRenderer1.currentScreenId = savedId
            if (::playerRenderer2.isInitialized) playerRenderer2.currentScreenId = savedId

            isKioskEnforced = true
            DeviceControl.enableKioskMode(this)
            setFullscreenMode()

            lifecycleScope.launch {
                isBootstrapComplete = false
                reentrySurface?.let { applySurface(it, "Sincronizando mídias...") }
                checkLocalCacheAndPlay()
                isBootstrapComplete = true
                Logger.i("NAVIGATION", "MainActivity.onNewIntent: Bootstrap complete.")
            }
        }
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
                        Logger.w("SELF_HEALING", "Reparo Automático: Atualizando Playlist...")
                        startSyncAndPlay()
                    }
                }
            } catch (e: Exception) {
                Logger.e("SELF_HEALING", "Auto-Repair Failed: ${e.message}")
            }
        }
    }

    /**
     * "Atualizar Player" (painel): sincroniza AGORA playlist, mídias (delta por hash) e sequência, sem tirar a
     * mídia do ar se nada mudou. O painel só recebe "executed" depois da sincronização de verdade
     * (antes confirmava no ato e a sincronização podia ser descartada por outra em andamento).
     */
    private fun updatePlayerNow(commandId: String) {
        lifecycleScope.launch(Dispatchers.IO) {
            Logger.i("COMMAND", "Atualizar Player: sincronizando playlist, mídias e sequência (ID: $commandId)")
            val ok = try {
                syncInBackground()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                lastBackgroundSyncError = e.message
                false
            }
            val (status, note) = PlayerFlowPolicy.updateAck(ok, lastBackgroundSyncError)
            ServiceLocator.getRemoteDataSource().acknowledgeCommand(commandId, status, note)
            Logger.i("COMMAND", "Atualizar Player concluído: $status ${note.orEmpty()}")
        }
    }

    /**
     * "Reiniciar Player" (painel): fecha e abre o Player como no primeiro acesso — a Splash reabre o app e ele volta
     * na tela "Sincronizando Mídias" sincronizando de novo. Serve para tela travada (ex.: ExoPlayer congelado),
     * por isso encerra o PROCESSO, não só a tela. O id do comando fica salvo: repetição (polling/Realtime) é ignorada.
     */
    private fun restartPlayerApp(commandId: String) {
        val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
        if (!PlayerFlowPolicy.shouldRunRestart(commandId, prefs.getString("last_restart_command_id", null))) {
            Logger.w("COMMAND", "Reiniciar Player ignorado (comando vazio ou já atendido): $commandId")
            return
        }
        prefs.edit().putString("last_restart_command_id", commandId).commit()
        Logger.w("COMMAND", ">>> REINICIANDO O PLAYER (ID: $commandId)")

        lifecycleScope.launch(Dispatchers.IO) {
            // Confirma ANTES de fechar (o painel mostra "reiniciando"), com teto para não prender o reinício.
            try {
                kotlinx.coroutines.withTimeoutOrNull(6_000L) {
                    ServiceLocator.getRemoteDataSource().acknowledgeCommand(commandId, "executed")
                }
            } catch (e: Exception) {
                Logger.w("COMMAND", "ACK do reinício falhou: ${e.message}")
            }
            withContext(Dispatchers.Main) { relaunchPlayerProcess() }
        }
    }

    private fun relaunchPlayerProcess() {
        // Nada pode "roubar" a tela de volta nem ressuscitar o Player antes da hora durante o reinício.
        isKioskEnforced = false
        backgroundSyncHandler.removeCallbacks(backgroundSyncRunnable)
        cancelPlaybackWatchdogAlarm()
        playbackLoopJob?.cancel()
        deviceFleetManager?.shutdown()
        deviceFleetManager = null
        try {
            if (::playerRenderer1.isInitialized) playerRenderer1.release()
            if (::playerRenderer2.isInitialized) playerRenderer2.release()
        } catch (e: Exception) {
            Logger.w("COMMAND", "Falha ao liberar renderers antes do reinício: ${e.message}")
        }

        try {
            val bridge = Intent(this, com.antigravity.player.ui.PlayerRestartActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
                putExtra(com.antigravity.player.ui.PlayerRestartActivity.EXTRA_MAIN_PID, android.os.Process.myPid())
            }
            startActivity(bridge)
            finishAndRemoveTask()
            // Se a ponte não derrubar o processo a tempo, derruba aqui (o novo nasce pela Splash aberta pela ponte).
            Handler(Looper.getMainLooper()).postDelayed({ android.os.Process.killProcess(android.os.Process.myPid()) }, 4_000L)
        } catch (e: Exception) {
            // Sem a ponte: reabre a Splash direto (reinicia dentro do mesmo processo, ainda re-sincroniza).
            Logger.e("COMMAND", "Ponte de reinício indisponível (${e.message}); reabrindo pela Splash.")
            startActivity(Intent(this, com.antigravity.player.ui.SplashActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            })
            finish()
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
        windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
        windowInsetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    /**
     * TV Box / Smart TV: 16x9 = TV deitada; 9x16 = TV virada em pé (totem). A TV ignora o pedido de orientação
     * do app, então o player gira o PRÓPRIO canvas (toda a tela: vídeo, imagem, widget, sync e bloqueio) 90°
     * quando a playlist não casa com o painel físico. Celular/tablet não passam por aqui (o sistema trava).
     */
    private fun applyTvCanvasOrientation() {
        val content = findViewById<android.view.ViewGroup>(android.R.id.content) ?: return
        val canvas = content.getChildAt(0) ?: return
        if (content.width <= 0 || content.height <= 0) {
            content.post { applyTvCanvasOrientation() }
            return
        }
        val t = PlayerFlowPolicy.tvCanvasTransform(
            isTelevision = DeviceTypeUtil.isTelevision(applicationContext),
            canonicalOrientation = SessionManager.currentOrientation,
            displayWidth = content.width,
            displayHeight = content.height
        )
        val lp = canvas.layoutParams
        val wantW = t?.width ?: android.view.ViewGroup.LayoutParams.MATCH_PARENT
        val wantH = t?.height ?: android.view.ViewGroup.LayoutParams.MATCH_PARENT
        val wantRot = t?.rotation ?: 0f
        if (lp.width == wantW && lp.height == wantH && canvas.rotation == wantRot) return
        lp.width = wantW
        lp.height = wantH
        canvas.layoutParams = lp
        canvas.rotation = wantRot
        canvas.translationX = t?.translationX ?: 0f
        canvas.translationY = t?.translationY ?: 0f
        Logger.i("ORIENTATION", "TV canvas: playlist=${SessionManager.currentOrientation} panel=${content.width}x${content.height} " +
            (if (t != null) "-> ${t.width}x${t.height} rot=${t.rotation}" else "-> normal"))
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        setFullscreenMode()
        // Painel mudou de tamanho/orientação: recalcula o canvas depois do novo layout.
        findViewById<android.view.ViewGroup>(android.R.id.content)?.post { applyTvCanvasOrientation() }
        val displayMetrics = resources.displayMetrics
        val dmWidth = displayMetrics.widthPixels
        val dmHeight = displayMetrics.heightPixels
        val playlistOri = com.antigravity.core.domain.model.PlaylistOrientation.fromResolutionOrOrientation(
            SessionManager.currentOrientation
        )
        val deviceOri = com.antigravity.core.domain.model.DevicePhysicalOrientation.fromConfig(newConfig.orientation)
        val resolved = com.antigravity.core.domain.model.PresentationResolver.resolve(
            playlistOri,
            dmWidth,
            dmHeight,
            deviceOri
        )
        Logger.i("ORIENTATION_CONTRACT", """
            [CONFIGURATION_CHANGED]
            ${resolved.toLogString()}
        """.trimIndent())
        window.decorView.requestLayout()
    }

    private fun applyScreenRotation(orientation: String?, forcePhysicalLock: Boolean = false) {
        runOnUiThread {
            val canonicalOrientation = com.antigravity.core.domain.model.PlaylistOrientation.fromResolutionOrOrientation(
                orientation
            ).canonicalName
            
            SessionManager.currentOrientation = canonicalOrientation
            try {
                val prefs = getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
                prefs.edit().putString("current_orientation", canonicalOrientation).apply()
            } catch (e: Exception) {}

            // Signage: celular/tablet travam na orientação da playlist (não giram com o sensor);
            // TV só trava por comando explícito do painel (rotate_*).
            val lock = PlayerFlowPolicy.physicalOrientationLock(
                canonicalOrientation,
                isTelevision = DeviceTypeUtil.isTelevision(applicationContext),
                forcedByPanel = forcePhysicalLock
            )
            if (lock != null && requestedOrientation != lock) {
                Logger.i("ORIENTATION", "Physical lock: $canonicalOrientation (playlist) -> requestedOrientation=$lock")
                requestedOrientation = lock
            }
            applyTvCanvasOrientation()

            val displayMetrics = resources.displayMetrics
            val dmWidth = displayMetrics.widthPixels
            val dmHeight = displayMetrics.heightPixels
            val playlistOri = com.antigravity.core.domain.model.PlaylistOrientation.fromResolutionOrOrientation(
                canonicalOrientation
            )
            val deviceOri = com.antigravity.core.domain.model.DevicePhysicalOrientation.fromConfig(
                resources.configuration.orientation
            )
            val resolved = com.antigravity.core.domain.model.PresentationResolver.resolve(
                playlistOri,
                dmWidth,
                dmHeight,
                deviceOri
            )
            Logger.i("ORIENTATION_CONTRACT", resolved.toLogString())

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
            // 1. [SILENCIADOR] Bloqueia o tráfego do Heartbeat Service enquanto o print sobe
            com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = true

            // 2. Captura NA HORA (sem espera): UI + vídeo (PixelCopy no Android 8+; fallback próprio no 6/7).
            //    A imagem sai reduzida (lado maior <= 1280 px) e vive só em memória até o upload:
            //    NADA é gravado no aparelho.
            // 2b. Vigia: se a captura nunca devolver (janela destruida, PixelCopy travado), o heartbeat volta
            //     e o painel recebe "failed" em vez de ficar carregando / mostrar o aparelho offline.
            val captureSettled = java.util.concurrent.atomic.AtomicBoolean(false)
            val mainHandler = Handler(Looper.getMainLooper())
            val captureWatchdog = Runnable {
                if (captureSettled.compareAndSet(false, true)) {
                    com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = false
                    Logger.e("SCREENSHOT", "Captura sem resposta em ${SCREENSHOT_CAPTURE_TIMEOUT_MS}ms; heartbeat liberado")
                    if (commandId != null) {
                        lifecycleScope.launch(Dispatchers.IO) {
                            ServiceLocator.getRemoteDataSource().acknowledgeCommand(commandId, "failed", "Captura sem resposta do player")
                        }
                    }
                }
            }
            mainHandler.postDelayed(captureWatchdog, SCREENSHOT_CAPTURE_TIMEOUT_MS)

            com.antigravity.media.util.ScreenCapture.capture(window, window.decorView, mainHandler) { bitmap, error ->
                mainHandler.removeCallbacks(captureWatchdog)
                if (!captureSettled.compareAndSet(false, true)) {
                    bitmap?.recycle() // o vigia ja respondeu "failed"
                    return@capture
                }
                if (bitmap != null) {
                    uploadScreenshotBitmap(bitmap, commandId)
                } else {
                    com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = false
                    Logger.e("SCREENSHOT", "Captura falhou: $error")
                    if (commandId != null) {
                        lifecycleScope.launch(Dispatchers.IO) {
                            ServiceLocator.getRemoteDataSource().acknowledgeCommand(commandId, "failed", error ?: "Falha na captura")
                        }
                    }
                }
            }
        }
    }

    private fun uploadScreenshotBitmap(bitmap: Bitmap, commandId: String?) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val stream = java.io.ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                bitmap.recycle() // libera a memória do print assim que foi comprimido
                val byteArray = stream.toByteArray()

                val screenId = getSharedPreferences("player_prefs", MODE_PRIVATE).getString("saved_screen_id", "UNKNOWN") ?: "UNKNOWN"
                // Um único print por tela no painel: o upload SOBRESCREVE screenshots/<tela>.jpg (upsert),
                // então o anterior deixa de existir. Sem comando = print automático (checagem de mídia).
                ServiceLocator.getRemoteDataSource().uploadScreenshot(screenId, byteArray, if (commandId == null) "heartbeat" else "manual")
                
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
                if (!bitmap.isRecycled) bitmap.recycle()
                // [LIBERAÇÃO] Devolve o controle ao Heartbeat
                com.antigravity.player.util.ScreenshotCoordinator.isHeartbeatPaused = false
            }
        }
    }

    // ========================================================================
    // [MICRO-GATE P0.1] KIOSK TOUCH & KEY ISOLATION
    // Ordinary touchscreen taps (single, double, triple, repeated) during PLAYING
    // are 100% ignored. Maintenance mode cannot be triggered by touch or keys.
    // ========================================================================

    override fun dispatchTouchEvent(event: android.view.MotionEvent?): Boolean {
        // [MICRO-GATE P0.1] Touch events during playing are passed normally to view hierarchy
        // and NEVER trigger maintenance mode or count towards maintenance escape.
        return super.dispatchTouchEvent(event)
    }

    /**
     * [MICRO-GATE P0.1] ENTRADA EM MODO MANUTENÇÃO (EXCLUSIVAMENTE AUTENTICADA)
     * Somente acionada por comando remoto autenticado ou mecanismo administrativo explícito.
     * Totalmente silenciosa: sem Toast de entrada.
     */
    private fun enableSystemNavigation(source: String = "authenticated_command") {
        Logger.i("KIOSK", "Ativando Modo Manutenção (origem: $source).")
        if (!isKioskEnforced) {
            // Se já estiver liberado, zera o timer e reinicia a janela de 3 min
            maintenanceJob?.cancel()
        } else {
            // 1. Pausa a blindagem (Kiosk Lock no onWindowFocusChanged)
            isKioskEnforced = false
            Logger.w("ESCAPE_PROTOCOL", "Modo Manutenção ativado ($source). System UI liberada.")

            // [SIGNAGE NOTIFICATION SHIELD] Sai do modo dedicado: restaura notificacoes
            DeviceControl.restoreInterruptionFilter(this, previousInterruptionFilter)

            // 2. Libera as barras de navegação (Home / Back Buttons) visíveis de forma silenciosa
            runOnUiThread {
                releaseSystemBars()
            }

            // [MAINTENANCE P0] Persiste a janela, sincroniza o SelfHealingService
            // (para de brigar pelo foco durante a manutencao), congela o watchdog
            // de playback e agenda recuperacao via AlarmManager (sobrevive a morte
            // da Activity/processo).
            val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
            val testTimeout = prefs.getLong("test_maintenance_timeout_ms", 0L)
            val timeoutMs = if (testTimeout > 0L) testTimeout else MAINTENANCE_TIMEOUT_MS
            val until = System.currentTimeMillis() + timeoutMs
            prefs.edit().putLong(PREF_MAINTENANCE_UNTIL, until).apply()
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

        // 3. Timer da sessão de manutenção: 3 MINUTOS obrigatórios para retorno ao Kiosk.
        // A restauracao real acontece em restoreFromMaintenance(), que tambem e
        // acionada pelo AlarmManager se a Activity/processo morrer no intervalo.
        val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
        val testTimeout = prefs.getLong("test_maintenance_timeout_ms", 0L)
        val timeoutMs = if (testTimeout > 0L) testTimeout else MAINTENANCE_TIMEOUT_MS
        maintenanceJob = lifecycleScope.launch {
            delay(timeoutMs)
            restoreFromMaintenance(force = true)
        }
    }

    /**
     * [MICRO-GATE P0.1] RETORNO SILENCIOSO E SEGURO DO CONTROLE AO KIOSK
     * Retorno obrigatório do controle após a janela de manutenção de 3 min.
     * Idempotente: valida o deadline persistido antes de agir.
     * 100% SILENCIOSO: NENHUM Toast, Snackbar ou Overlay emitido ao retornar ao Kiosk.
     */
    private fun restoreFromMaintenance(force: Boolean = false) {
        val prefs = getSharedPreferences("player_prefs", MODE_PRIVATE)
        val until = prefs.getLong(PREF_MAINTENANCE_UNTIL, 0L)
        val now = System.currentTimeMillis()
        if (!force) {
            if (until <= 0L) return
            if (now < until - 2000L) {
                // Janela ainda vigente (ex.: onCreate renasceu no meio): so garante o alarme
                scheduleMaintenanceRecoveryAlarm(until)
                return
            }
        }

        prefs.edit().remove(PREF_MAINTENANCE_UNTIL).remove(PREF_EXIT_COUNT).putLong(PREF_LAST_EXIT_AT, 0L).apply()
        cancelMaintenanceRecoveryAlarm()
        notifySelfHealing(false)
        Logger.i("ESCAPE_PROTOCOL", "Modo Kiosk Total restabelecido silenciosamente via Timer de Segurança.")
        if (isFinishing || isDestroyed) return

        runOnUiThread {
            // [MICRO-GATE P0.1] RETORNO SILENCIOSO: NENHUM Toast emitido
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
    private fun evaluateMaintenanceState(force: Boolean = false) {
        val until = getSharedPreferences("player_prefs", MODE_PRIVATE).getLong(PREF_MAINTENANCE_UNTIL, 0L)
        if (force || until > 0L) {
            restoreFromMaintenance(force = force)
        }
    }

    /**
     * [EXIT COUNTER P0] Conta SOMENTE saídas reais para auditoria interna.
     * [MICRO-GATE P0.1] Perdas de foco NUNCA acionam modo manutenção automaticamente.
     * O SelfHealingService e o Handler de foco recuperam o Kiosk silenciosamente.
     */
    private fun registerValidExit() {
        if (!isKioskEnforced) return
        if (!isBootstrapComplete) {
            Logger.d("ESCAPE_PROTOCOL", "registerValidExit() ignorado: bootstrap ainda em progresso.")
            return
        }
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
        Logger.w("ESCAPE_PROTOCOL", "Saída válida registrada ($count). Kiosk enforce ativo.")
    }

    /** Barras do sistema visiveis durante manutencao (usada na entrada e no boot renascido). */
    private fun releaseSystemBars() {
        try {
            val c = WindowCompat.getInsetsController(window, window.decorView)
            c.show(WindowInsetsCompat.Type.systemBars())
            c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
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
            startService(i)
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

/**
 * [P0.4.8R-F01] Superfície aplicada por MainActivity.onNewIntent() na re-entrada com saved_screen_id.
 * onNewIntent também é disparado com mídia válida em reprodução (tecla HOME, watchdog AlarmManager,
 * relaunch do UserApplication, retorno de manutenção). Retorna null quando nenhuma superfície deve ser
 * aplicada: nesse caso não há efeito visual.
 */
internal fun resolveReentrySurface(
    runtimeState: PlayerRuntimeState,
    rendererScreenId: String?,
    savedScreenId: String
): SurfaceState? {
    val isSameScreenPlaying = rendererScreenId == savedScreenId &&
        com.antigravity.core.domain.state.projection.SurfaceProjectionEngine.project(runtimeState) == SurfaceState.MEDIA_ONLY
    return if (isSameScreenPlaying) null else SurfaceState.SYNC_GUARD
}

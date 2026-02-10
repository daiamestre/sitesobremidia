package com.antigravity.player

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.media3.ui.PlayerView
import com.antigravity.media.exoplayer.ExoPlayerRenderer
import com.antigravity.player.di.ServiceLocator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var playerRenderer: ExoPlayerRenderer
    private lateinit var statusTextView: TextView
    private lateinit var loadingOverlay: FrameLayout
    private lateinit var playerView: androidx.media3.ui.PlayerView
    private lateinit var standbyImage: ImageView
    
    private val scope = CoroutineScope(Dispatchers.Main + Job())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Keep screen on
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // LOADING VIEW initialization
        loadingOverlay = findViewById(R.id.loading_overlay)
        statusTextView = findViewById(R.id.status_text)
        playerView = findViewById(R.id.playerView) // Fixed ID from player_view
        standbyImage = findViewById(R.id.standbyImage)
        
        // Show Standby initially
        standbyImage.visibility = View.VISIBLE
        playerView.visibility = View.GONE

        try {
            // Initialize DI
            ServiceLocator.init(applicationContext)

            // Enable Kiosk Mode (Full Screen, Keep Screen On)
            com.antigravity.player.util.DeviceControl.enableKioskMode(this)


            
            // RESET FEATURE: Long press status to clear screen ID
            statusTextView.setOnLongClickListener {
                val prefs = getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
                prefs.edit().remove("saved_screen_id").apply()
                
                android.widget.Toast.makeText(this, "ID Resetado! Reiniciando...", android.widget.Toast.LENGTH_LONG).show()
                
                // Restart to Splash
                val intent = android.content.Intent(this, com.antigravity.player.ui.SplashActivity::class.java)
                startActivity(intent)
                finish()
                true
            }

            // Initialize Media Engine
            playerRenderer = ExoPlayerRenderer(this)
        
            // Attach ExoPlayer to View
            playerRenderer.getPlayerInstance()?.let { exoPlayer ->
                 playerView.player = exoPlayer
            }

            // Start Logic Flow
            startSyncAndPlay()
            
        } catch (e: Exception) {
            // CRITICAL: SHOW ERROR ON SCREEN
            e.printStackTrace()
            updateStatus("CRASH: ${e.message}\n${e.stackTraceToString()}", isError = true)
            statusTextView.setTextColor(android.graphics.Color.RED)
        }
    }

    private fun startSyncAndPlay() {
        lifecycleScope.launch {
            // STABILITY FIX: Sequential Load to prevents Green Screen / Decoder race conditions
            updateStatus("Sincronizando...", isError = false)
            
            // Re-instantiate SyncUseCase
            val repo = ServiceLocator.getRepository(applicationContext)
            val syncUseCase = com.antigravity.core.domain.usecase.SyncPlaylistUseCase(repo)
            
            try {
                // SEQUENTIAL LOGIC: Sync first, then Play.
                // This ensures the device isn't overloaded during decoder init.
                val result = syncUseCase()

                if (result.isSuccess) {
                    updateStatus("Sincronizado!")
                    startPlaybackLoop()
                } else {
                    val msg = result.exceptionOrNull()?.message ?: "Unknown"
                    
                    if (msg.contains("JWT expired", ignoreCase = true) || msg.contains("401", ignoreCase = true)) {
                        updateStatus("Sessão Expirada", isError = true)
                        
                        // Clear Session
                        val prefs = getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
                        prefs.edit().remove("saved_screen_id").remove("auth_token").remove("auth_user_id").apply()
                        com.antigravity.sync.service.SessionManager.clear()
                        com.antigravity.player.util.DeviceControl.disableKioskMode(this@MainActivity)

                        // Restart to Login
                        val intent = android.content.Intent(this@MainActivity, com.antigravity.player.ui.LoginActivity::class.java)
                        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK)
                        startActivity(intent)
                        finish()
                    } else {
                        updateStatus("Erro Sync: $msg. Tentando novamente...", isError = true)
                        // Retry logic
                        Handler(Looper.getMainLooper()).postDelayed({ startSyncAndPlay() }, 10000)
                    }
                }
            } catch (e: Exception) {
                 updateStatus("Erro Crítico: ${e.message}", isError = true)
                 Handler(Looper.getMainLooper()).postDelayed({ startSyncAndPlay() }, 10000)
            }
        }
    }
    
    // Updated for Professional UI
    private fun updateStatus(text: String, isError: Boolean = false) {
        runOnUiThread {
            // Main Status Text
            statusTextView.text = text
            
            // Device ID (Subtle)
            val prefs = getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
            val deviceId = prefs.getString("saved_screen_id", "N/A") ?: "N/A"
            val deviceIdView = findViewById<TextView>(R.id.status_device_id) 
            if (deviceIdView != null) {
                deviceIdView.text = "ID: $deviceId"
                if (isError) deviceIdView.setTextColor(android.graphics.Color.RED)
                else deviceIdView.setTextColor(android.graphics.Color.parseColor("#64748B"))
            }

            if (isError) {
                statusTextView.setTextColor(android.graphics.Color.RED)
            } else {
                statusTextView.setTextColor(android.graphics.Color.parseColor("#F8FAFC"))
            }
        }
    }

    private fun startPlaybackLoop() {
        lifecycleScope.launch {
            val repository = ServiceLocator.getRepository(applicationContext)
            
            // Observe playlist changes
            // Enterprise Logic: seamless update
            repository.getActivePlaylist().collect { playlist ->
                // Ensure playlist is not null before checking items
                val items = playlist?.items ?: emptyList()

                if (items.isEmpty()) {
                    updateStatus("Playlist Vazia. Aguardando conteúdo...", isError = true)
                    standbyImage.visibility = View.VISIBLE
                    playerView.visibility = View.GONE
                    loadingOverlay.visibility = View.GONE
                } else {
                    val playlistName = playlist?.name ?: "Desconhecida"
                    updateStatus("Reproduzindo Playlist: '$playlistName' (${items.size} itens)\nGapless Engine Active")
                    
                    standbyImage.visibility = View.GONE
                    playerView.visibility = View.VISIBLE
                    loadingOverlay.visibility = View.GONE
                    
                    // Pass full playlist to Renderer (Seamless)
                    playerRenderer.preparePlaylist(items)
                    playerRenderer.play()
                }
            }
        }
    }

    override fun onStop() {
        super.onStop()
        // Stop renderer to release resources
        playerRenderer.stop()
    }
}

package com.antigravity.media.exoplayer

import android.content.Context
import androidx.media3.common.MediaItem as ExoMediaItem
import androidx.media3.common.Player
import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer
import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.renderer.MediaRenderer
import com.antigravity.core.domain.renderer.RendererState
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.util.Logger
import com.antigravity.media.util.MediaIntegrityChecker
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import android.net.Uri
import androidx.media3.datasource.DefaultDataSource
import java.io.File
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory

/**
 * Implementação Concreta do ExoPlayer (Media3).
 * 
 * [PERFORMANCE] Pipeline otimizado:
 * - Buffer de 5s pré-carregamento + 30s máximo
 * - WakeLock de rede para impedir sleep durante streaming
 * - Fallback automático HW→SW em <500ms
 * - Validação de integridade antes de prepare()
 * - Higiene de memória pós-reprodução de vídeos pesados
 */
@UnstableApi
class ExoPlayerRenderer(
    private val context: Context,
    private val instanceName: String = "PRIMARY"
) : MediaRenderer {

    companion object {
        private const val HEAVY_MEDIA_DURATION_MS = 30_000L // 30 seconds
    }

    private var exoPlayer: ExoPlayer? = null
    private val _playbackState = MutableStateFlow<RendererState>(RendererState.IDLE)
    private var currentlyPreparedMediaId: String? = null
    
    // [HARDWARE ONLY] Decodificação obrigatória por hardware
    private var currentPreparedItem: MediaItem? = null
    private var lastMediaDurationMs: Long = 0L
    private var lastPrepareStartTime: Long = 0L
    
    var onMediaItemTransition: ((String, Long) -> Unit)? = null
    var onPlaybackEnded: ((isSuccess: Boolean) -> Unit)? = null
    var onVideoSizeChanged: ((width: Int, height: Int) -> Unit)? = null

    /**
     * Exposes the underlying ExoPlayer instance for external monitoring (e.g., PlaybackWatchdog).
     * Returns as Player interface to avoid overload resolution ambiguity in Media3.
     */
    fun getPlayerInstance(): Player? = exoPlayer

    init {
        initializePlayer()
    }

    private fun initializePlayer() {
        if (exoPlayer == null) {
            // 1. Configure Optimized Buffering (5s pre-load, 30s max)
            val loadControl = androidx.media3.exoplayer.DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                    2500,   // Min Buffer (Pre-load): 2.5 seconds (Stabilizes emulator/low-endBox)
                    15000,  // Max Buffer: 15 seconds
                    500,    // Buffer for Playback: 500ms before starting (Smooth first frame)
                    2000    // Buffer for Rebuffer: 2 seconds on stall
                )
                .setPrioritizeTimeOverSizeThresholds(false)
                .build()

            // 2. Direct File Access 
            val dataSourceFactory = DefaultDataSource.Factory(context)

            // 3. Configure MediaSourceFactory
            val mediaSourceFactory = DefaultMediaSourceFactory(context)
                .setDataSourceFactory(dataSourceFactory)

            // 4. Renderers Factory — PURE HARDWARE ONLY with Decoder Fallback
            val renderersFactory = androidx.media3.exoplayer.DefaultRenderersFactory(context)
                .setEnableDecoderFallback(true)
                .setExtensionRendererMode(androidx.media3.exoplayer.DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)

            // 5. Build the Player 
            val builder = ExoPlayer.Builder(context, renderersFactory)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(mediaSourceFactory)

            // 6. Track Selection (Hardware Constraint: resolution limit)
            val params = HardwareConstraintManager.getTrackSelectorParameters(context)
            val trackSelector = androidx.media3.exoplayer.trackselection.DefaultTrackSelector(context, params)
            builder.setTrackSelector(trackSelector)

            exoPlayer = builder.build().apply {
                // [CRITICAL] WakeLock: Prevent CPU sleep during playback + WiFi lock for streaming
                setWakeMode(C.WAKE_MODE_NETWORK)
                
                // [ANTI-AUDIO-CRASH] Fix para "pcmWrite failed" em TV Boxes de lote genérico.
                // Revertido setAudioAttributes pois causou IllegalArgumentException: Invalid audio session ID no emulador API 31.
                // Manteremos apenas a mitigação de Volume.
                
                // 2. Muta o player se o Hardware for muito defasado, para que o Driver ALSA não trave a GPU.
                if (com.antigravity.media.exoplayer.ChipsetDetector.getRecommendedProfile() == com.antigravity.media.exoplayer.ChipsetDetector.HardwareProfile.LEGACY_STABILITY) {
                    volume = 0f
                    Logger.w("PLAYER_$instanceName", "Hardware Fraco Detectado: Áudio Mutado para prevenir travamento do Driver (pcmWrite null).")
                }
                
                // Video Scaling Mode
                try {
                   this.videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT
                } catch (e: Exception) {}

                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        Logger.d("PLAYER_$instanceName", "State: $playbackState")
                        when (playbackState) {
                            Player.STATE_IDLE -> _playbackState.value = RendererState.IDLE
                            Player.STATE_BUFFERING -> _playbackState.value = RendererState.PREPARING
                            Player.STATE_READY -> {
                                if (lastPrepareStartTime > 0) {
                                    val durationMs = System.currentTimeMillis() - lastPrepareStartTime
                                    Logger.i("SEAMLESS_DIAGNOSTIC", "Buffering Readiness: ${durationMs}ms for instance $instanceName")
                                    if (durationMs > 1000L) {
                                        Logger.e("SEAMLESS_DIAGNOSTIC", "⚠ PERFORMANCE ALERT: Buffer preparation took ${durationMs}ms (>1s)!")
                                    }
                                    lastPrepareStartTime = 0L
                                }
                                
                                if (isPlaying) {
                                    _playbackState.value = RendererState.PLAYING
                                    lastMediaDurationMs = duration
                                } else {
                                    _playbackState.value = RendererState.IDLE
                                }
                            }
                            Player.STATE_ENDED -> {
                                _playbackState.value = RendererState.ENDED
                                if (lastMediaDurationMs > HEAVY_MEDIA_DURATION_MS) {
                                    Logger.i("PLAYER_$instanceName", "Heavy media ended. Memory hygiene.")
                                    System.gc()
                                }
                                onPlaybackEnded?.invoke(true)
                            }
                        }
                    }
                    
                    override fun onVideoSizeChanged(videoSize: androidx.media3.common.VideoSize) {
                        onVideoSizeChanged?.invoke(videoSize.width, videoSize.height)
                    }

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        if (isPlaying) {
                            _playbackState.value = RendererState.PLAYING
                        }
                    }

                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        val errorCode = error.errorCode
                        val errorName = error.errorCodeName
                        
                        // Hardcore Deep Debugging Strategy
                        var erroExtra = "DESCONHECIDO"
                        when {
                            errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ||
                            errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT || 
                            errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND -> erroExtra = "FALHA DE REDE/ARQUIVO"
                            
                            errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED ||
                            errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED -> erroExtra = "FORMATO INVÁLIDO"
                            
                            errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_DECODER_INIT_FAILED ||
                            errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED -> erroExtra = "CODEC NÃO SUPORTADO"
                            
                            errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_TIMEOUT -> erroExtra = "TEMPO LIMITE EXCEDIDO"
                        }

                        val details = "Code: $errorCode ($errorName) | Instance: $instanceName | Extra: $erroExtra | Msg: ${error.message}"
                        _playbackState.value = RendererState.ERROR(details)
                        Logger.e("ANTIGRAVITY_DEBUG", "Falha na Mídia: $erroExtra | Detalhe: $details")
                        
                        // [MANDATORY SKIP] Se o hardware falhar, não tentamos software.
                        // Pulamos para o próximo item em < 500ms para manter a TV fluida.
                        if (errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_DECODER_INIT_FAILED ||
                            errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_DECODING_FAILED) {
                            Logger.w("ANTIGRAVITY_DEBUG", "HW Decoder FAILED. Triggering Mandatory Skip.")
                        }
                        
                        // ESTRATÉGIA: Recuperação rápida. No MainActivity a gente passa pro próximo arquivo em vez de engasgar na tela preta.
                        onPlaybackEnded?.invoke(false) 
                    }
                })
            }
        }
    }

    override suspend fun prepare(mediaItem: MediaItem) {
        if (exoPlayer == null) initializePlayer()
        
        if (currentlyPreparedMediaId == mediaItem.id && exoPlayer?.playbackState != Player.STATE_IDLE) {
            Logger.d("PLAYER_$instanceName", "Media ${mediaItem.id} already prepared. Skipping re-prepare.")
            return
        }

        // [INTEGRITY CHECK] Validate local file before attempting playback - DO IT IN BACKGROUND
        val localPath = mediaItem.localPath
        if (localPath != null) {
            val localFile = File(localPath)
            
            // Switch to IO dispatcher for heavy disk reads (MediaMetadataRetriever)
            val isPlayable = withContext(Dispatchers.IO) {
                if (mediaItem.type == MediaType.VIDEO) {
                    if (!MediaIntegrityChecker.isVideoPlayable(localFile)) {
                        Logger.w("PLAYER_$instanceName", "Local video FAILED integrity check: ${mediaItem.name}. Trying remote URL.")
                        MediaIntegrityChecker.deleteCorruptedFile(localFile)
                        false
                    } else true
                } else if (mediaItem.type == MediaType.IMAGE) {
                    if (!MediaIntegrityChecker.isImageValid(localFile)) {
                        Logger.w("PLAYER_$instanceName", "Local image FAILED integrity check: ${mediaItem.name}. Trying remote URL.")
                        MediaIntegrityChecker.deleteCorruptedFile(localFile)
                        false
                    } else true
                } else true
            }
            
            if (!isPlayable && mediaItem.remoteUrl.isEmpty()) {
                Logger.e("PLAYER_$instanceName", "No remote URL available for failed file. Skipping.")
                onPlaybackEnded?.invoke(false)
                return
            }
        }

        // Determine URI: prefer local if valid, fallback to remote
        // [HARDENING] Perform secondary disk check in default media directory as absolute fallback
        // [CRITICAL FIX] Use Uri.fromFile to automatically encode spaces (e.g. "MIDI 1.mp4") into valid file:// URIs
        val fallbackFile = File(File(context.filesDir, "media_content"), "${mediaItem.id}.dat")
        val uriString = when {
            localPath != null && File(localPath).exists() && File(localPath).length() > 0 -> Uri.fromFile(File(localPath)).toString()
            fallbackFile.exists() && fallbackFile.length() > 0 -> Uri.fromFile(fallbackFile).toString()
            else -> mediaItem.remoteUrl.replace(" ", "%20")
        }
        
        val uri = Uri.parse(uriString)
        val exoMediaItem = ExoMediaItem.Builder()
            .setUri(uri)
            .setMediaId(mediaItem.id)
            .build()
            
        exoPlayer?.let { player ->
            currentlyPreparedMediaId = mediaItem.id
            currentPreparedItem = mediaItem
            
            // [ESTRATÉGIA DE VALIDAÇÃO] Passo 1: Limpa o lixo da tentativa anterior (essencial para não dar tela preta)
            player.stop()
            player.clearMediaItems()
            
            lastPrepareStartTime = System.currentTimeMillis()
            player.setMediaItem(exoMediaItem)
            player.prepare()
            // [FIX] Ensure the player is ready to play automatically if we call prepare() directly
            player.playWhenReady = true
        }
    }

    override suspend fun preparePlaylist(items: List<MediaItem>) {
        if (items.isNotEmpty()) {
            prepare(items.first())
        }
    }

    /**
     * Prepara a mídia sem iniciar a reprodução.
     * Essencial para o modo "Seamless" (Instância oculta).
     */
    suspend fun preBuffer(item: MediaItem) {
        if (exoPlayer == null) initializePlayer()
        Logger.i("PLAYER_$instanceName", "Pre-buffering: ${item.name}")
        
        if (currentlyPreparedMediaId == item.id) {
             Logger.d("PLAYER_$instanceName", "Next Media ${item.id} already pre-buffered.")
             return
        }

        val localPath = item.localPath
        var useLocal = false
        if (localPath != null) {
            val localFile = File(localPath)
            useLocal = withContext(Dispatchers.IO) {
                 localFile.exists() && localFile.length() > 0
            }
        }

        exoPlayer?.let { player ->
            player.playWhenReady = false
            currentlyPreparedMediaId = item.id
            currentPreparedItem = item
            
            
            // Use same integrity-aware URI resolution pattern
            // [HARDENING] Perform secondary disk check in default media directory as absolute fallback
            val fallbackFile = File(File(context.filesDir, "media_content"), "${item.id}.dat")
            val uriString = when {
                useLocal && localPath != null -> "file://$localPath"
                fallbackFile.exists() && fallbackFile.length() > 0 -> "file://${fallbackFile.absolutePath}"
                else -> item.remoteUrl
            }
            
            val uri = Uri.parse(uriString)
            val exoItem = ExoMediaItem.Builder()
                .setUri(uri)
                .setMediaId(item.id)
                .build()
                
            // [ESTRATÉGIA DE VALIDAÇÃO] Limpa lixo antes do pre-buffer também
            player.stop()
            player.clearMediaItems()
            
            lastPrepareStartTime = System.currentTimeMillis()
            player.setMediaItem(exoItem)
            player.prepare()
        }
    }

    override fun play() {
        if (exoPlayer == null) initializePlayer()
        exoPlayer?.play()
    }

    override fun pause() {
        exoPlayer?.pause()
    }

    override fun stop() {
        exoPlayer?.stop()
        exoPlayer?.clearMediaItems()
        currentlyPreparedMediaId = null
        currentPreparedItem = null
    }

    fun release() {
        exoPlayer?.release()
        exoPlayer = null
        _playbackState.value = RendererState.IDLE
    }

    fun setAudioEnabled(enabled: Boolean) {
        exoPlayer?.volume = if (enabled) 1.0f else 0.0f
    }

    override fun getPlaybackState(): Flow<RendererState> = _playbackState.asStateFlow()
}

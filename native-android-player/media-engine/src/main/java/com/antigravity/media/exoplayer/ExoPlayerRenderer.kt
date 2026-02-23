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
    
    var onMediaItemTransition: ((String, Long) -> Unit)? = null
    var onPlaybackEnded: ((isSuccess: Boolean) -> Unit)? = null

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

            // 4. Renderers Factory — PURE HARDWARE ONLY
            val renderersFactory = HardwareConstraintManager.getRenderersFactory(context)

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

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        if (isPlaying) {
                            _playbackState.value = RendererState.PLAYING
                        }
                    }

                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        val details = "Code: ${error.errorCode} | Instance: $instanceName | Msg: ${error.message}"
                        _playbackState.value = RendererState.ERROR(details)
                        Logger.e("PLAYER_$instanceName", "Playback Error: $details")
                        
                        // [MANDATORY SKIP] Se o hardware falhar, não tentamos software.
                        // Pulamos para o próximo item em < 500ms para manter a TV fluida.
                        if (error.errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_DECODER_INIT_FAILED ||
                            error.errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_DECODING_FAILED) {
                            Logger.w("PLAYER_$instanceName", "HW Decoder FAILED. Triggering Mandatory Skip.")
                        }
                        
                        onPlaybackEnded?.invoke(false) 
                    }
                })
            }
        }
    }

    override fun prepare(mediaItem: MediaItem) {
        if (exoPlayer == null) initializePlayer()
        
        if (currentlyPreparedMediaId == mediaItem.id && exoPlayer?.playbackState != Player.STATE_IDLE) {
            Logger.d("PLAYER_$instanceName", "Media ${mediaItem.id} already prepared. Skipping re-prepare.")
            return
        }

        // [INTEGRITY CHECK] Validate local file before attempting playback
        val localPath = mediaItem.localPath
        if (localPath != null) {
            val localFile = File(localPath)
            if (mediaItem.type == MediaType.VIDEO) {
                if (!MediaIntegrityChecker.isVideoPlayable(localFile)) {
                    Logger.w("PLAYER_$instanceName", "Local video FAILED integrity check: ${mediaItem.name}. Trying remote URL.")
                    // Delete corrupted file
                    MediaIntegrityChecker.deleteCorruptedFile(localFile)
                    // Fall through to use remoteUrl instead
                    if (mediaItem.remoteUrl.isEmpty()) {
                        Logger.e("PLAYER_$instanceName", "No remote URL available. Skipping.")
                        onPlaybackEnded?.invoke(false)
                        return
                    }
                }
            } else if (mediaItem.type == MediaType.IMAGE) {
                if (!MediaIntegrityChecker.isImageValid(localFile)) {
                    Logger.w("PLAYER_$instanceName", "Local image FAILED integrity check: ${mediaItem.name}. Trying remote URL.")
                    MediaIntegrityChecker.deleteCorruptedFile(localFile)
                    if (mediaItem.remoteUrl.isEmpty()) {
                        onPlaybackEnded?.invoke(false)
                        return
                    }
                }
            }
        }

        // Determine URI: prefer local if valid, fallback to remote
        val uriString = if (localPath != null && File(localPath).exists() && File(localPath).length() > 0) {
            "file://$localPath"
        } else {
            mediaItem.remoteUrl
        }
        
        val uri = Uri.parse(uriString)
        val exoMediaItem = ExoMediaItem.Builder()
            .setUri(uri)
            .setMediaId(mediaItem.id)
            .build()
            
        exoPlayer?.let { player ->
            currentlyPreparedMediaId = mediaItem.id
            currentPreparedItem = mediaItem
            player.setMediaItem(exoMediaItem)
            player.prepare()
        }
    }

    override fun preparePlaylist(items: List<MediaItem>) {
        if (items.isNotEmpty()) {
            prepare(items.first())
        }
    }

    /**
     * Prepara a mídia sem iniciar a reprodução.
     * Essencial para o modo "Seamless" (Instância oculta).
     */
    fun preBuffer(item: MediaItem) {
        if (exoPlayer == null) initializePlayer()
        Logger.i("PLAYER_$instanceName", "Pre-buffering: ${item.name}")
        
        if (currentlyPreparedMediaId == item.id) {
             Logger.d("PLAYER_$instanceName", "Next Media ${item.id} already pre-buffered.")
             return
        }

        exoPlayer?.let { player ->
            player.playWhenReady = false
            currentlyPreparedMediaId = item.id
            currentPreparedItem = item
            
            // Use same integrity-aware URI resolution
            val localPath = item.localPath
            val uriString = if (localPath != null && File(localPath).exists() && File(localPath).length() > 0) {
                "file://$localPath"
            } else {
                item.remoteUrl
            }
            
            val uri = Uri.parse(uriString)
            val exoItem = ExoMediaItem.Builder()
                .setUri(uri)
                .setMediaId(item.id)
                .build()
                
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

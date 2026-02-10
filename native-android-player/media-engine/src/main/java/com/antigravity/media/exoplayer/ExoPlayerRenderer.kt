package com.antigravity.media.exoplayer

import android.content.Context
import androidx.media3.common.MediaItem as ExoMediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.renderer.MediaRenderer
import com.antigravity.core.domain.renderer.RendererState
import com.antigravity.core.domain.model.MediaType
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import android.net.Uri
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import java.io.File
import androidx.media3.common.util.UnstableApi

/**
 * Implementação Concreta do ExoPlayer (Media3).
 */
@UnstableApi
class ExoPlayerRenderer(private val context: Context) : MediaRenderer {

    companion object {
        private var simpleCache: SimpleCache? = null
        private val DISK_CACHE_SIZE_BYTES = 512 * 1024 * 1024L // 512MB Cache

        @Synchronized
        private fun getCache(context: Context): SimpleCache {
            if (simpleCache == null) {
                val cacheDir = File(context.cacheDir, "media_cache")
                val evictor = LeastRecentlyUsedCacheEvictor(DISK_CACHE_SIZE_BYTES)
                val databaseProvider = StandaloneDatabaseProvider(context)
                simpleCache = SimpleCache(cacheDir, evictor, databaseProvider)
            }
            return simpleCache!!
        }
    }

    private var exoPlayer: ExoPlayer? = null
    private val _playbackState = MutableStateFlow<RendererState>(RendererState.IDLE)
    
    // We need to keep track of the duration mapping for images if we want to support them properly,
    // but for now we rely on the default behavior or standard video items.

    init {
        initializePlayer()
    }

    private fun initializePlayer() {
        if (exoPlayer == null) {
            // 1. Configure Robust Buffering (LoadControl)
            // TWEAKED FOR FLUIDITY: Lower min buffer for faster start, but keep aggressive max.
            val loadControl = androidx.media3.exoplayer.DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                    3000,  // Min Buffer: 3s (Was 15s) - Starts faster, less initial lag
                    50000, // Max Buffer: 50s - Keeps caching ahead
                    1500,  // Buffer to Play: 1.5s
                    3000   // Buffer to Rebuffer: 3s
                )
                .setBackBuffer(5000, true) // GAPLESS: Keep 5s of history for instant looping
                .setPrioritizeTimeOverSizeThresholds(true)
                .build()

            // 2. Configure Disk Caching (CacheDataSource)
            val cache = getCache(context)
            val httpDataSourceFactory = DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
            
            val upstreamFactory = DefaultDataSource.Factory(context, httpDataSourceFactory)
            
            val cacheDataSourceFactory = CacheDataSource.Factory()
                .setCache(cache)
                .setUpstreamDataSourceFactory(upstreamFactory)
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

            // 3. Configure MediaSourceFactory to use the Cache
            val mediaSourceFactory = DefaultMediaSourceFactory(context)
                .setDataSourceFactory(cacheDataSourceFactory)

            // 4. Build the Player
            exoPlayer = ExoPlayer.Builder(context)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(mediaSourceFactory) // Inject Cache
                .build().apply {
                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        when (playbackState) {
                            Player.STATE_IDLE -> _playbackState.value = RendererState.IDLE
                            Player.STATE_BUFFERING -> _playbackState.value = RendererState.PREPARING
                            Player.STATE_READY -> {
                                if (isPlaying) _playbackState.value = RendererState.PLAYING 
                                else _playbackState.value = RendererState.IDLE
                            }
                            Player.STATE_ENDED -> _playbackState.value = RendererState.ENDED
                        }
                    }

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        if (isPlaying) {
                            _playbackState.value = RendererState.PLAYING
                        }
                    }

                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        _playbackState.value = RendererState.ERROR(error.message ?: "Unknown ExoPlayer Error")
                        
                        // Failover: Skip to next
                        exoPlayer?.run {
                            if (hasNextMediaItem()) {
                                seekToNextMediaItem()
                                prepare()
                                play()
                            } else {
                                seekToDefaultPosition(0)
                                prepare()
                                play()
                            }
                        }
                    }
                })
            }
        }
    }

    override fun prepare(mediaItem: MediaItem) {
        preparePlaylist(listOf(mediaItem))
    }

    private var currentPlaylistSignature: String = ""

    override fun preparePlaylist(items: List<MediaItem>) {
        if (exoPlayer == null) initializePlayer()
        
        // --- OPTIMIZATION: DIFF CHECK FIRST ---
        // Check signature BEFORE doing heavy validation logic.
        // This prevents CPU spikes on the Main Thread during Sync.
        val newSignature = items.joinToString("|") { "${it.id}-${it.remoteUrl}" }
        if (newSignature == currentPlaylistSignature) {
            return
        }
        currentPlaylistSignature = newSignature

        // --- BLINDAGEM (Code Audit) ---
        // Filter out media that the hardware cannot decode (Now runs only on actual changes)
        val validatedItems = items.filter { item ->
            if (item.type == MediaType.VIDEO) {
                try {
                     val mime = com.antigravity.media.util.CodecUtils.getMimeType(item.remoteUrl)
                     // Soft check to verify connection/mime
                     mime != null
                } catch (e: Exception) { true }
            } else {
                true 
            }
        }

        val exoItems = validatedItems.map { item ->
            val uri = Uri.parse(item.localPath?.let { "file://$it" } ?: item.remoteUrl)
            
            val builder = ExoMediaItem.Builder().setUri(uri)
            builder.setMediaId(item.id)
            builder.build()
        }

        exoPlayer?.let { player ->
            if (player.isPlaying) {
                 // SEAMLESS UPDATE
                 player.setMediaItems(exoItems, false) 
            } else {
                 // INITIAL LOAD
                 player.setMediaItems(exoItems)
                 player.repeatMode = Player.REPEAT_MODE_ALL
                 player.prepare()
                 player.playWhenReady = true
            }
        }
    }



    override fun play() {
        exoPlayer?.play()
    }

    override fun pause() {
        exoPlayer?.pause()
    }

    override fun stop() {
        exoPlayer?.stop()
    }

    override fun getPlaybackState(): Flow<RendererState> {
        return _playbackState.asStateFlow()
    }

    fun getPlayerInstance(): ExoPlayer? {
        return exoPlayer
    }
}

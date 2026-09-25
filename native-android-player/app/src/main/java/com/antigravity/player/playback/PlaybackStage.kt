package com.antigravity.player.playback

import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.activity.ComponentActivity
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.ui.PlayerView
import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.util.Logger
import com.antigravity.media.exoplayer.ExoPlayerRenderer
import com.bumptech.glide.Glide
import com.bumptech.glide.load.DataSource
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.load.engine.GlideException
import com.bumptech.glide.request.RequestListener
import com.bumptech.glide.request.target.Target
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File

/**
 * Palco de reprodução (motor "comercial digital"): cada mídia fica NO TEMPO configurado, o próximo item é PRÉ-CARREGADO
 * (imagem decodificada / vídeo com o 1º quadro já no decodificador) durante o item atual, e a troca é um cruzamento
 * (dissolve) DENTRO do tempo do item que entra — sem quadro preto, sem corte seco, sem somar tempo.
 *
 * Camadas: video1/video2 (ExoPlayer em revezamento), image1/image2 (Glide em revezamento) e widget (acima de tudo).
 * Modelo de tempo: [PlaybackTimeline] (prazos absolutos, sem deriva). Ver PlaybackEngineRulesTest e o ledger F-56.
 */
class PlaybackStage(
    private val activity: ComponentActivity,
    private val scope: CoroutineScope,
    private val layers: Layers,
    private val r1: ExoPlayerRenderer,
    private val r2: ExoPlayerRenderer,
    private val hooks: Hooks
) {
    class Layers(
        val video1: PlayerView,
        val video2: PlayerView,
        val image1: ImageView,
        val image2: ImageView,
        val widget: FrameLayout
    )

    interface Hooks {
        /** Arquivo local válido da mídia (baixa se faltar); null = ausente/corrompido (o item é pulado). Roda em IO. */
        suspend fun resolveFile(item: MediaItem): File?

        /** Desenha o widget nativo no contêiner (Main). */
        suspend fun renderWidget(item: MediaItem)

        /** Uma mídia está visível: libera a tela de sincronização, esconde status/standby. */
        fun mediaVisible()

        fun videoShown(player: Player, active: ExoPlayerRenderer, standby: ExoPlayerRenderer)
        fun nonVideoShown()
        fun itemFinished()
        fun isLegacyHardware(): Boolean
        fun log(state: String, details: String)
    }

    private enum class Kind { VIDEO, IMAGE, WIDGET }

    private class Preload(
        val key: String,
        val kind: Kind,
        val renderer: ExoPlayerRenderer?,
        val imageLayer: ImageView?,
        val ready: CompletableDeferred<Boolean>,
        val listener: Player.Listener?
    ) {
        @Volatile var failed = false

        /** >= 0: o vídeo foi ANEXADO à playlist do player atual (decodificador único); a virada é gapless. */
        var appendedIndex = -1
    }

    private val timeline = PlaybackTimeline { SystemClock.elapsedRealtime() }
    private val crossfader = LayerCrossfader()

    private var shownView: View? = null
    private var shownKind: Kind? = null
    private var shownType: MediaType? = null
    private var shownRenderer: ExoPlayerRenderer? = null
    private var shownImageLayer: ImageView? = null
    private var lastVideoRenderer: ExoPlayerRenderer? = null
    private var currentVideoLooping = false

    private var preloadJob: Job? = null
    private var preloadKey: String? = null
    private var preload: Preload? = null

    // ------------------------------------------------------------------ API pública

    /**
     * Reproduz [item] por exatamente o tempo dele. Retorna true se o item deve ser PULADO (falha de arquivo/decodificador).
     * Volta quando o tempo do item acaba; a saída visual do item é feita pelo cruzamento do próximo.
     */
    suspend fun play(item: MediaItem, next: MediaItem?, audioEnabled: Boolean): Boolean = when (kindOf(item)) {
        Kind.VIDEO -> playVideo(item, next, audioEnabled)
        Kind.IMAGE -> playImage(item, next, audioEnabled)
        Kind.WIDGET -> playWidget(item, next, audioEnabled)
        null -> {
            hooks.log("SKIP", "Tipo sem motor: ${item.type}")
            true
        }
    }

    /** O laço de reprodução reiniciou (nova playlist/sync): recomeça a linha do tempo; o que está na tela continua. */
    fun restartTimeline() {
        discardPreload()
        timeline.reset()
    }

    /** Tudo escondido/parado por fora (bloqueio, standby, sync): esquece o que estava na tela. */
    fun forget() {
        crossfader.finishNow()
        discardPreload()
        timeline.reset()
        shownView = null
        shownKind = null
        shownType = null
        shownRenderer = null
        shownImageLayer = null
    }

    /** A superfície pediu "só mídia": garante que a camada do item atual esteja visível e opaca. */
    fun restoreShown() {
        shownView?.let {
            it.animate().cancel()
            it.alpha = 1f
            it.visibility = View.VISIBLE
        }
    }

    // ------------------------------------------------------------------ imagem

    private suspend fun playImage(item: MediaItem, next: MediaItem?, audioEnabled: Boolean): Boolean {
        hooks.log("ENGINE_STATIC", "Loading: ${item.name}")
        val key = keyOf(item)
        var p = takePreload(key, Kind.IMAGE)
        if (p == null) {
            val file = withContext(Dispatchers.IO) { hooks.resolveFile(item) } ?: return true
            p = prepareImage(item, file, key)
        }
        val layer = p.imageLayer ?: return true
        val ok = awaitReady(p, IMAGE_READY_TIMEOUT_MS)
        if (!ok) {
            clearImageLayer(layer)
            return true
        }

        val durMs = maxOf(item.durationSeconds, 1L) * 1000L
        val slot = timeline.claim(durMs)
        awaitUntil(slot.startAt)
        val fade = TransitionPolicy.fadeMs(item.transitionEffect, durMs, shownView != null, false)
        show(layer, Kind.IMAGE, item, fade, null, layer)
        hold(slot, item, next, fade, audioEnabled) { false }
        hooks.itemFinished()
        return false
    }

    private fun prepareImage(item: MediaItem, file: File, key: String): Preload {
        val layer = idleImageLayer()
        layer.animate().cancel()
        layer.alpha = 1f
        layer.visibility = View.INVISIBLE // INVISIBLE (nunca GONE): o layout existe e o Glide decodifica no tamanho certo
        val ready = CompletableDeferred<Boolean>()
        val request = Glide.with(activity)
            .load(file.absolutePath)
            .dontAnimate()
            .diskCacheStrategy(DiskCacheStrategy.ALL)
            // Tamanho explícito (não espera o layout de uma camada escondida): lado maior da tela; TV Box legada 1280.
            .override(decodeBound(), decodeBound())
        request.listener(object : RequestListener<Drawable> {
            override fun onLoadFailed(e: GlideException?, model: Any?, target: Target<Drawable>, isFirstResource: Boolean): Boolean {
                Logger.e("PLAYBACK_STAGE", "Falha ao decodificar imagem ${item.name}: ${e?.message}")
                ready.complete(false)
                return false
            }

            override fun onResourceReady(resource: Drawable, model: Any, target: Target<Drawable>?, dataSource: DataSource, isFirstResource: Boolean): Boolean {
                ready.complete(true)
                return false
            }
        }).into(layer)
        return Preload(key, Kind.IMAGE, null, layer, ready, null)
    }

    private fun decodeBound(): Int {
        if (hooks.isLegacyHardware()) return 1280
        val dm = activity.resources.displayMetrics
        return maxOf(dm.widthPixels, dm.heightPixels)
    }

    private fun idleImageLayer(): ImageView =
        if (shownImageLayer === layers.image1) layers.image2 else layers.image1

    private fun clearImageLayer(layer: ImageView) {
        Glide.with(activity).clear(layer)
        layer.setImageDrawable(null)
        layer.visibility = View.INVISIBLE
    }

    // ------------------------------------------------------------------ vídeo

    private suspend fun playVideo(item: MediaItem, next: MediaItem?, audioEnabled: Boolean): Boolean {
        hooks.log("ENGINE_VIDEO", "Target: ${item.name}")
        val key = keyOf(item)
        val legacy = hooks.isLegacyHardware()
        var p = takePreload(key, Kind.VIDEO)
        if (p == null) {
            val file = withContext(Dispatchers.IO) { hooks.resolveFile(item) } ?: return true
            if (legacy) {
                // TV Box legada: UM decodificador. O vídeo anterior é encerrado ANTES de preparar este (sem cruzamento).
                shownRenderer?.let { old ->
                    crossfader.finishNow()
                    old.stop()
                    viewOf(old).visibility = View.INVISIBLE
                    shownView = null
                    shownKind = null
                    shownRenderer = null
                }
            }
            p = prepareVideo(item, file, key) ?: return true
        }
        if (p.appendedIndex >= 0) return playAppendedVideo(item, next, audioEnabled, p)
        val renderer = p.renderer ?: return true
        val player = renderer.getPlayerInstance() ?: return true
        val ok = awaitReady(p, VIDEO_READY_TIMEOUT_MS)
        if (!ok || p.failed) {
            p.listener?.let { player.removeListener(it) }
            renderer.stop()
            viewOf(renderer).visibility = View.INVISIBLE
            return true
        }

        // Tempo do item: cortado no configurado, repetido para preencher, ou inteiro (configurado 0).
        // Com o corte configurado no ExoPlayer, player.duration = min(configurado, real).
        val plan = VideoFillPlan.plan(item.durationSeconds * 1000L, player.duration.takeIf { it > 0L } ?: -1L)
        val durMs = if (plan.playMs > 0L) plan.playMs else maxOf(item.durationSeconds, 10L) * 1000L
        player.repeatMode = if (plan.loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        currentVideoLooping = plan.loop

        val slot = timeline.claim(durMs)
        awaitUntil(slot.startAt)
        val fade = TransitionPolicy.fadeMs(
            item.transitionEffect, durMs, shownView != null,
            legacy && TransitionPolicy.isVideoToVideo(shownType, MediaType.VIDEO)
        )

        renderer.setAudioEnabled(audioEnabled, reason = "stage_show", mediaId = item.id)
        if (audioEnabled && fade > 0L) {
            player.volume = 0f
            scope.launch { rampVolume(player, 0f, 1f, fade) }
        }
        val outgoingVideo = shownRenderer
        if (audioEnabled && fade > 0L && outgoingVideo != null) {
            outgoingVideo.getPlayerInstance()?.let { out -> scope.launch { rampVolume(out, 1f, 0f, fade) } }
        }

        renderer.play()
        show(viewOf(renderer), Kind.VIDEO, item, fade, renderer, null)
        val standby = if (renderer === r1) r2 else r1
        hooks.videoShown(player, renderer, standby)
        hold(slot, item, next, fade, audioEnabled) { p.failed }
        p.listener?.let { player.removeListener(it) }
        hooks.itemFinished()
        return p.failed
    }

    /**
     * TV Box de decodificador único: o próximo vídeo já foi ANEXADO à playlist do player que está tocando. A virada é feita
     * pelo próprio ExoPlayer (codec reaproveitado, último quadro fica na tela): sem buraco preto e sem segundo decodificador.
     */
    private suspend fun playAppendedVideo(item: MediaItem, next: MediaItem?, audioEnabled: Boolean, p: Preload): Boolean {
        val renderer = p.renderer ?: return true
        val player = renderer.getPlayerInstance() ?: return true
        // O prazo do item anterior já chegou: dá só uma janela curta para a virada natural; senão força já (esperar o fim do clipe
        // atrasaria o próximo item, pois o relógio do clipe começa só depois do primeiro quadro).
        val deadline = SystemClock.elapsedRealtime() + APPEND_TRANSITION_WAIT_MS
        while (!currentVideoLooping && player.currentMediaItemIndex < p.appendedIndex && SystemClock.elapsedRealtime() < deadline) {
            delay(15)
        }
        if (player.currentMediaItemIndex < p.appendedIndex) {
            player.repeatMode = Player.REPEAT_MODE_OFF
            player.seekTo(p.appendedIndex, 0L)
        }
        renderer.adoptCurrent(item)

        val plan = VideoFillPlan.plan(item.durationSeconds * 1000L, player.duration.takeIf { it > 0L } ?: -1L)
        val durMs = if (plan.playMs > 0L) plan.playMs else maxOf(item.durationSeconds, 10L) * 1000L
        player.repeatMode = if (plan.loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        currentVideoLooping = plan.loop

        val slot = timeline.claim(durMs)
        awaitUntil(slot.startAt)
        shownType = item.type
        hooks.mediaVisible()
        hooks.log("PLAYBACK_SLOT", "show item=${item.name} kind=VIDEO fadeMs=0 t=${SystemClock.elapsedRealtime()}")
        hold(slot, item, next, 0L, audioEnabled) { player.playerError != null }
        hooks.itemFinished()
        return player.playerError != null
    }

    private suspend fun prepareVideo(item: MediaItem, file: File, key: String): Preload? {
        val renderer = idleRenderer()
        val player = renderer.getPlayerInstance() ?: return null
        val view = viewOf(renderer)
        val ready = CompletableDeferred<Boolean>()
        lateinit var pre: Preload
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                ready.complete(true)
            }

            override fun onPlayerError(error: PlaybackException) {
                pre.failed = true
                ready.complete(false)
            }
        }
        pre = Preload(key, Kind.VIDEO, renderer, null, ready, listener)
        // "Teoria do Surface": a view precisa estar VISIBLE (alpha 0) para o decodificador ter onde desenhar o 1º quadro.
        view.animate().cancel()
        view.alpha = 0f
        view.visibility = View.VISIBLE
        renderer.setAudioEnabled(false, reason = "stage_prepare_mute", mediaId = item.id)
        player.addListener(listener)
        renderer.preBuffer(item.copy(localPath = file.absolutePath))
        return pre
    }

    private fun idleRenderer(): ExoPlayerRenderer = when {
        shownRenderer === r1 -> r2
        shownRenderer === r2 -> r1
        else -> if (lastVideoRenderer === r1) r2 else r1
    }

    private fun viewOf(renderer: ExoPlayerRenderer): PlayerView = if (renderer === r1) layers.video1 else layers.video2

    private suspend fun rampVolume(player: Player, from: Float, to: Float, ms: Long) {
        val steps = 8
        try {
            for (i in 1..steps) {
                delay(ms / steps)
                player.volume = from + (to - from) * i / steps
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // player já liberado: ignora
        }
    }

    // ------------------------------------------------------------------ widget / link

    private suspend fun playWidget(item: MediaItem, next: MediaItem?, audioEnabled: Boolean): Boolean {
        hooks.log("ENGINE_WIDGET", "Native rendering: ${item.remoteUrl}")
        val durMs = maxOf(item.durationSeconds, 1L) * 1000L
        val slot = timeline.claim(durMs)
        awaitUntil(slot.startAt)
        // Widget no lugar de outro widget: o conteúdo é trocado no mesmo contêiner (sem cruzamento).
        val fade = if (shownKind == Kind.WIDGET) 0L else TransitionPolicy.fadeMs(item.transitionEffect, durMs, shownView != null, false)
        hooks.renderWidget(item)
        show(layers.widget, Kind.WIDGET, item, fade, null, null)
        hold(slot, item, next, fade, audioEnabled) { false }
        hooks.itemFinished()
        return false
    }

    // ------------------------------------------------------------------ troca visual

    private fun show(incoming: View, kind: Kind, item: MediaItem, fadeMs: Long, renderer: ExoPlayerRenderer?, layer: ImageView?) {
        val outgoing = shownView
        val outKind = shownKind
        val outRenderer = shownRenderer
        val outLayer = shownImageLayer
        val now = SystemClock.elapsedRealtime()

        val incomingOnTop = when {
            incoming === layers.widget -> true          // o widget fica acima de tudo
            outgoing === layers.widget -> false         // saída é o widget: ele desce revelando a entrada
            else -> {
                incoming.bringToFront()                 // irmãos: a entrada sobe por cima da saída
                true
            }
        }
        // Mesma camada (widget no lugar de widget): nada a desmontar, o conteúdo novo já está nela.
        crossfader.crossfade(outgoing, incoming, fadeMs, incomingOnTop) {
            if (outgoing !== incoming) cleanup(outKind, outRenderer, outLayer)
        }

        shownView = incoming
        shownKind = kind
        shownType = item.type
        shownRenderer = renderer
        shownImageLayer = layer
        if (renderer != null) lastVideoRenderer = renderer
        if (kind != Kind.VIDEO) hooks.nonVideoShown()
        hooks.mediaVisible()
        hooks.log("PLAYBACK_SLOT", "show item=${item.name} kind=$kind fadeMs=$fadeMs t=$now")
    }

    private fun cleanup(kind: Kind?, renderer: ExoPlayerRenderer?, layer: ImageView?) {
        when (kind) {
            Kind.VIDEO -> renderer?.stop()
            Kind.IMAGE -> layer?.let { clearImageLayer(it) }
            Kind.WIDGET -> {
                layers.widget.visibility = View.GONE
                layers.widget.removeAllViews()
            }
            null -> {}
        }
    }

    // ------------------------------------------------------------------ tempo e pré-carga

    private suspend fun hold(slot: PlaybackTimeline.Slot, item: MediaItem, next: MediaItem?, fadeMs: Long, audioEnabled: Boolean, failed: () -> Boolean) {
        val leadMs = when (next?.let { kindOf(it) }) {
            Kind.VIDEO -> VIDEO_PRELOAD_LEAD_MS
            Kind.IMAGE -> IMAGE_PRELOAD_LEAD_MS
            else -> -1L
        }
        val preloadAt = if (next != null && leadMs > 0L) PlaybackTimeline.preloadAt(slot.startAt, slot.endAt, fadeMs, leadMs) else -1L
        var preloadStarted = preloadAt < 0L
        while (true) {
            val now = SystemClock.elapsedRealtime()
            if (now >= slot.endAt) break
            if (failed()) break
            if (!preloadStarted && now >= preloadAt && next != null) {
                startPreload(next, audioEnabled)
                preloadStarted = true
            }
            delay(minOf(slot.endAt - now, HOLD_TICK_MS))
        }
        hooks.log("PLAYBACK_SLOT", "end item=${item.name} plannedMs=${slot.endAt - slot.startAt} heldMs=${SystemClock.elapsedRealtime() - slot.startAt}")
    }

    private suspend fun awaitUntil(deadline: Long) {
        val wait = deadline - SystemClock.elapsedRealtime()
        if (wait > 0L) delay(wait)
    }

    private suspend fun awaitReady(p: Preload, timeoutMs: Long): Boolean {
        if (p.ready.isCompleted) return p.ready.getCompleted()
        return withTimeoutOrNull(timeoutMs) { p.ready.await() } ?: false
    }

    private fun startPreload(next: MediaItem, audioEnabled: Boolean) {
        val key = keyOf(next)
        if (preloadKey == key) return
        discardPreload()
        val kind = kindOf(next) ?: return
        if (kind == Kind.WIDGET) return
        // Decodificador único (TV Box legada): com um vídeo na tela, o próximo vídeo é ANEXADO ao mesmo player (virada sem
        // buraco). Com imagem/widget na tela o decodificador está livre: pré-carga normal.
        val appendToCurrent = kind == Kind.VIDEO && hooks.isLegacyHardware() && shownKind == Kind.VIDEO && shownRenderer != null
        preloadKey = key
        preloadJob = scope.launch {
            try {
                val file = withContext(Dispatchers.IO) { hooks.resolveFile(next) } ?: return@launch
                preload = when {
                    appendToCurrent -> {
                        val renderer = shownRenderer ?: return@launch
                        val index = renderer.appendNext(next.copy(localPath = file.absolutePath))
                        if (index < 0) null
                        else Preload(key, Kind.VIDEO, renderer, null, CompletableDeferred(true), null).also { it.appendedIndex = index }
                    }
                    kind == Kind.VIDEO -> prepareVideo(next, file, key)
                    kind == Kind.IMAGE -> prepareImage(next, file, key)
                    else -> null
                }
                hooks.log("PLAYBACK_SLOT", "preload ok next=${next.name} kind=$kind" + if (appendToCurrent) " (anexado)" else "")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Logger.w("PLAYBACK_STAGE", "Pré-carga falhou (${next.name}): ${e.message}")
            }
        }
    }

    private suspend fun takePreload(key: String, kind: Kind): Preload? {
        if (preloadKey != key) {
            discardPreload()
            return null
        }
        preloadJob?.join()
        val p = preload
        preloadJob = null
        preloadKey = null
        preload = null
        if (p == null || p.kind != kind) {
            p?.let { release(it) }
            return null
        }
        return p
    }

    private fun discardPreload() {
        preloadJob?.cancel()
        preloadJob = null
        preloadKey = null
        preload?.let { release(it) }
        preload = null
    }

    private fun release(p: Preload) {
        when (p.kind) {
            Kind.VIDEO -> p.renderer?.let { r ->
                if (p.appendedIndex >= 0) {
                    r.removeAppended(p.appendedIndex) // só o clipe anexado; o vídeo atual segue tocando
                } else {
                    p.listener?.let { r.getPlayerInstance()?.removeListener(it) }
                    r.stop()
                    viewOf(r).visibility = View.INVISIBLE
                }
            }
            Kind.IMAGE -> p.imageLayer?.let { clearImageLayer(it) }
            Kind.WIDGET -> {}
        }
    }

    // ------------------------------------------------------------------ util

    private fun kindOf(item: MediaItem): Kind? = when (item.type) {
        MediaType.VIDEO -> Kind.VIDEO
        MediaType.IMAGE -> Kind.IMAGE
        MediaType.WEB_WIDGET, MediaType.EXTERNAL_LINK -> Kind.WIDGET
        else -> null
    }

    /** Identidade do item NA playlist (a mesma mídia pode aparecer várias vezes: id + posição). */
    private fun keyOf(item: MediaItem): String = "${item.id}#${item.orderIndex}"

    private companion object {
        const val HOLD_TICK_MS = 30L
        const val VIDEO_PRELOAD_LEAD_MS = 5_000L
        const val IMAGE_PRELOAD_LEAD_MS = 2_500L
        const val VIDEO_READY_TIMEOUT_MS = 4_000L
        const val IMAGE_READY_TIMEOUT_MS = 3_000L
        const val APPEND_TRANSITION_WAIT_MS = 60L
    }
}

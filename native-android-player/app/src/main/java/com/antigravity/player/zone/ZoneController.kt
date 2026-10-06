package com.antigravity.player.zone

import android.content.Context
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem as ExoMediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.antigravity.core.util.Logger
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.NativeWidgetEngine
import com.antigravity.sync.service.MediaDownloader
import com.antigravity.sync.service.SessionManager
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.security.MessageDigest

/**
 * F-149 — Zonas no Player Android.
 *
 * Desenho de menor risco: o motor de reprodução existente (sincronização, cache, PlaybackStage) NÃO muda — ele continua
 * tocando a playlist da tela, só que dentro do retângulo da zona PRINCIPAL. As outras zonas são tocadas aqui, com ciclo,
 * arquivos e reprodutor próprios (pasta separada: a limpeza de cache do motor principal não mexe nelas).
 *
 * Sem layout (tela não dividida), este controlador não cria nada e as camadas principais ficam em tela cheia, como sempre.
 * REPRODUZINDO = SÓ MÍDIA: nenhuma mensagem é desenhada; zona sem conteúdo fica na cor de fundo.
 */
class ZoneController(
    /** Contexto da tela (a atividade do Player; nos testes de desenho, o contexto do aplicativo). */
    private val activity: Context,
    private val scope: CoroutineScope,
    /** Raiz da tela (o FrameLayout de activity_main). */
    private val root: FrameLayout,
    /** Camadas do motor principal, que passam a ocupar o retângulo da zona principal. */
    private val mainViews: List<View>,
    /** As zonas entram logo acima desta camada (abaixo da tela de sincronização e dos avisos de bloqueio). */
    private val insertAbove: View
) {
    private val prefs = activity.getSharedPreferences("zonas_do_player", Context.MODE_PRIVATE)
    private val principal = Handler(Looper.getMainLooper())
    /** Roda na linha principal (agora mesmo, se já estiver nela). */
    private fun naTela(acao: () -> Unit) { if (Looper.myLooper() == Looper.getMainLooper()) acao() else principal.post(acao) }
    private val cacheDir = File(activity.filesDir, "zonas_media")
    private val downloader by lazy { MediaDownloader() }

    private var layout: ZoneLayout? = null
    private var holder: FrameLayout? = null
    private val jobs = mutableListOf<Job>()
    private val players = mutableListOf<ExoPlayer>()
    private val zoneViews = HashMap<String, FrameLayout>()
    private var refreshJob: Job? = null
    private var lastSize = 0 to 0

    /** zona -> mídia que ela está mostrando agora ("principal" = motor principal). */
    private val inUse = HashMap<String, String>()
    private val interruptores = HashMap<String, CompletableDeferred<Unit>>()
    /** Vídeo simultâneo fora da zona principal: um por vez (aparelhos simples têm poucos decodificadores). */
    private val portaoDeVideo = Semaphore(1)
    /** Prova de exibição das zonas: gravada no aparelho a cada exibição e só apagada quando o servidor confirma. */
    private val provas = ArrayList<JsonObject>().apply {
        try {
            val salvo = activity.getSharedPreferences("zonas_do_player", Context.MODE_PRIVATE).getString(CHAVE_PROVAS, null)
            if (!salvo.isNullOrBlank()) (kotlinx.serialization.json.Json.parseToJsonElement(salvo) as? JsonArray)?.forEach { el -> (el as? JsonObject)?.let { o -> add(o) } }
        } catch (e: Exception) { /* fila ilegível: começa vazia */ }
    }
    private fun gravarProvas() { prefs.edit().putString(CHAVE_PROVAS, JsonArray(provas.toList()).toString()).apply() }

    private val aoMudarTamanho = View.OnLayoutChangeListener { _, l, t, r, b, _, _, _, _ ->
        val tamanho = (r - l) to (b - t)
        if (tamanho != lastSize && layout != null) { lastSize = tamanho; posicionar() }
    }

    // ------------------------------------------------------------------------------------------ ciclo de vida
    fun start() {
        root.addOnLayoutChangeListener(aoMudarTamanho)
        // sem rede no boot: volta a montar a última divisão conhecida
        prefs.getString(CHAVE_LAYOUT, null)?.let { salvo ->
            (ZoneLayoutParser.parse(salvo) as? ZoneLayoutResult.Ok)?.let { aplicar(it.layout) }
        }
        refreshJob?.cancel()
        refreshJob = scope.launch {
            while (isActive) {
                refresh()
                enviarProvas()
                delay(INTERVALO_MS)
            }
        }
    }

    fun stop() {
        refreshJob?.cancel()
        root.removeOnLayoutChangeListener(aoMudarTamanho)
        desmontar(restaurarPrincipal = false)
    }

    /** Pergunta ao servidor se a tela está dividida. Falha de rede não muda nada do que está no ar. */
    suspend fun refresh() {
        val tela = SessionManager.currentUUID ?: return
        val bruto = try {
            val aparelho = SessionManager.awaitIdentity()
            withContext(Dispatchers.IO) { ServiceLocator.getRemoteDataSource().getLayoutForScreenRaw(tela, aparelho) }
        } catch (e: Exception) {
            Logger.w("ZONAS", "layout indisponível agora (${e.message}); mantendo o que está no ar")
            return
        }
        when (val r = ZoneLayoutParser.parse(bruto)) {
            is ZoneLayoutResult.Ok -> if (r.layout.signature() != layout?.signature()) {
                prefs.edit().putString(CHAVE_LAYOUT, bruto).apply()
                aplicar(r.layout)
            }
            ZoneLayoutResult.None, ZoneLayoutResult.NoAccess -> if (layout != null || prefs.contains(CHAVE_LAYOUT)) {
                prefs.edit().remove(CHAVE_LAYOUT).apply()
                aplicar(null)
            }
            ZoneLayoutResult.Invalid -> Unit
        }
    }

    // ------------------------------------------------------------------------------------------ ligação com o motor principal
    /** Itens da playlist da tela que NÃO tocam na zona principal (anúncio vendido para outra zona). */
    fun <T> filterMain(items: List<T>, idDaMidia: (T) -> String): List<T> {
        val fora = layout?.principal?.excluirMidias.orEmpty()
        return if (fora.isEmpty()) items else items.filter { idDaMidia(it) !in fora }
    }

    /** O motor principal começou a mostrar esta mídia: nenhuma outra zona pode continuar com a mesma. */
    fun onMainItemStarted(mediaId: String) {
        naTela {
            inUse[PRINCIPAL] = mediaId
            for ((zona, midia) in inUse) if (zona != PRINCIPAL && midia == mediaId) interruptores[zona]?.complete(Unit)
        }
    }

    // ------------------------------------------------------------------------------------------ só para os testes de desenho
    /** Monta a divisão sem perguntar ao servidor (testes no emulador, sem login). */
    @androidx.annotation.VisibleForTesting internal fun aplicarParaTeste(l: ZoneLayout?) = aplicar(l)
    @androidx.annotation.VisibleForTesting internal fun midiaDaZona(zonaId: String): String? = inUse[zonaId]
    @androidx.annotation.VisibleForTesting internal fun quadroDaZona(zonaId: String): View? = zoneViews[zonaId]
    @androidx.annotation.VisibleForTesting internal fun provasPendentes(): List<String> = synchronized(provas) { provas.map { it.toString() } }

    // ------------------------------------------------------------------------------------------ montagem
    private fun aplicar(novo: ZoneLayout?) {
        naTela {
            desmontar(restaurarPrincipal = novo == null)
            layout = novo
            if (novo == null) { Logger.i("ZONAS", "tela sem divisão: tela cheia"); return@naTela }
            if (root.width <= 0 || root.height <= 0) { root.post { if (layout === novo) aplicar(novo) }; return@naTela }
            Logger.i("ZONAS", "montando ${novo.zonas.size} zona(s) em ${novo.largura}x${novo.altura} (versão ${novo.versao})")

            val h = FrameLayout(activity).apply { setBackgroundColor(Color.TRANSPARENT) }
            val indice = (root.indexOfChild(insertAbove) + 1).coerceIn(0, root.childCount)
            root.addView(h, indice, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            holder = h
            for (z in novo.secundarias.sortedBy { it.ordemZ }) {
                val v = FrameLayout(activity).apply { setBackgroundColor(corDeFundo(novo)); clipChildren = true; clipToPadding = true }
                h.addView(v)
                zoneViews[z.id] = v
            }
            lastSize = root.width to root.height
            posicionar()
            for (z in novo.secundarias) jobs += scope.launch(Dispatchers.Main) { tocarZona(z, novo) }
            scope.launch(Dispatchers.IO) { limparArquivos(novo) }
        }
    }

    private fun corDeFundo(l: ZoneLayout): Int = try { Color.parseColor(l.corFundo) } catch (e: Exception) { Color.BLACK }

    /** Coloca cada zona (e as camadas principais) no retângulo dela dentro do visor. */
    private fun posicionar() {
        val l = layout ?: return
        val canvas = ZoneGeometry.canvas(l.largura, l.altura, root.width, root.height)
        l.principal?.let { p ->
            val r = ZoneGeometry.zoneRect(p.x, p.y, p.largura, p.altura, l.largura, l.altura, canvas)
            for (v in mainViews) definir(v, r)
        }
        for (z in l.secundarias) {
            val v = zoneViews[z.id] ?: continue
            definir(v, ZoneGeometry.zoneRect(z.x, z.y, z.largura, z.altura, l.largura, l.altura, canvas))
        }
    }

    private fun definir(v: View, r: RectPx) {
        val lp = (v.layoutParams as? FrameLayout.LayoutParams) ?: FrameLayout.LayoutParams(r.width, r.height)
        lp.width = r.width; lp.height = r.height; lp.leftMargin = r.left; lp.topMargin = r.top
        lp.gravity = android.view.Gravity.TOP or android.view.Gravity.START
        v.layoutParams = lp
    }

    private fun desmontar(restaurarPrincipal: Boolean) {
        jobs.forEach { it.cancel() }
        jobs.clear()
        players.forEach { try { it.release() } catch (e: Exception) { /* já liberado */ } }
        players.clear()
        zoneViews.clear()
        interruptores.clear()
        inUse.keys.retainAll(setOf(PRINCIPAL))
        holder?.let { root.removeView(it) }
        holder = null
        if (restaurarPrincipal || layout != null) {
            // camadas principais de volta à tela cheia (o estado original de activity_main)
            for (v in mainViews) {
                val lp = v.layoutParams as? FrameLayout.LayoutParams ?: continue
                lp.width = ViewGroup.LayoutParams.MATCH_PARENT; lp.height = ViewGroup.LayoutParams.MATCH_PARENT
                lp.leftMargin = 0; lp.topMargin = 0
                v.layoutParams = lp
            }
        }
    }

    // ------------------------------------------------------------------------------------------ ciclo de uma zona
    private suspend fun tocarZona(zona: Zone, l: ZoneLayout) {
        val quadro = zoneViews[zona.id] ?: return
        val imagem = ImageView(activity).apply {
            scaleType = when (zona.fit) { ZoneFit.COVER -> ImageView.ScaleType.CENTER_CROP; ZoneFit.STRETCH -> ImageView.ScaleType.FIT_XY; ZoneFit.CONTAIN -> ImageView.ScaleType.FIT_CENTER }
            visibility = View.INVISIBLE
        }
        val areaWidget = FrameLayout(activity).apply { visibility = View.GONE }
        quadro.addView(imagem, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        quadro.addView(areaWidget, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        var telaDeVideo: PlayerView? = null
        var reprodutor: ExoPlayer? = null
        var videoIndisponivel = false
        var indice = -1
        var falhasSeguidas = 0

        while (scope.isActive && layout === l) {
            val outras = inUse.filterKeys { it != zona.id }.values.toSet()
            val prox = ZoneRotation.nextFree(zona.items, indice, outras)
            if (prox < 0) { inUse.remove(zona.id); delay(1500); continue }
            indice = prox
            val item = zona.items[prox]
            if (falhasSeguidas >= zona.items.size) { falhasSeguidas = 0; delay(5000) } // nada tocável agora: respira antes de tentar de novo

            val interromper = CompletableDeferred<Unit>()
            interruptores[zona.id] = interromper
            val inicio = System.currentTimeMillis()
            var exibiu = false
            try {
                when (item.kind) {
                    ZoneItemKind.IMAGE -> {
                        val arquivo = arquivoDe(item)
                        if (arquivo == null) { falhasSeguidas++; delay(300); continue }
                        inUse[zona.id] = item.mediaId
                        Glide.with(activity).load(arquivo).diskCacheStrategy(DiskCacheStrategy.NONE).dontAnimate().into(imagem)
                        areaWidget.visibility = View.GONE; telaDeVideo?.visibility = View.INVISIBLE; imagem.visibility = View.VISIBLE
                        withTimeoutOrNull(item.durationSeconds * 1000L) { interromper.await() }
                        exibiu = true
                    }
                    ZoneItemKind.WIDGET -> {
                        inUse[zona.id] = item.mediaId
                        imagem.visibility = View.INVISIBLE; telaDeVideo?.visibility = View.INVISIBLE; areaWidget.visibility = View.VISIBLE
                        NativeWidgetEngine.renderWidget(activity, areaWidget, item.url)
                        withTimeoutOrNull(item.durationSeconds * 1000L) { interromper.await() }
                        areaWidget.removeAllViews()
                    }
                    ZoneItemKind.VIDEO -> {
                        if (videoIndisponivel || !portaoDeVideo.tryAcquire()) { falhasSeguidas++; delay(300); continue }
                        try {
                            val arquivo = arquivoDe(item)
                            if (arquivo == null) { falhasSeguidas++; delay(300); continue }
                            if (reprodutor == null) {
                                val novoReprodutor = ExoPlayer.Builder(activity).build()
                                players += novoReprodutor
                                reprodutor = novoReprodutor
                                telaDeVideo = PlayerView(activity).apply {
                                    useController = false
                                    setShutterBackgroundColor(corDeFundo(l))
                                    resizeMode = when (zona.fit) { ZoneFit.COVER -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM; ZoneFit.STRETCH -> AspectRatioFrameLayout.RESIZE_MODE_FILL; ZoneFit.CONTAIN -> AspectRatioFrameLayout.RESIZE_MODE_FIT }
                                    player = novoReprodutor
                                    visibility = View.INVISIBLE
                                }.also { quadro.addView(it, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)) }
                            }
                            val p = reprodutor!!
                            val fim = CompletableDeferred<Boolean>()
                            val ouvinte = object : Player.Listener {
                                override fun onPlaybackStateChanged(state: Int) { if (state == Player.STATE_ENDED) fim.complete(true) }
                                override fun onPlayerError(error: PlaybackException) { fim.complete(false) }
                                override fun onRenderedFirstFrame() {
                                    imagem.visibility = View.INVISIBLE; areaWidget.visibility = View.GONE; telaDeVideo?.visibility = View.VISIBLE
                                }
                            }
                            p.addListener(ouvinte)
                            inUse[zona.id] = item.mediaId
                            p.volume = 0f // F-150: zona é complemento e nunca tem som; só a mídia principal pode ter
                            p.setMediaItem(ExoMediaItem.fromUri(android.net.Uri.fromFile(arquivo)))
                            p.prepare()
                            p.playWhenReady = true
                            // termina sozinho; o prazo é só a rede de segurança (duração informada + folga, no máximo 30 min)
                            val prazo = ((if (item.durationSeconds > 0) item.durationSeconds else 600L) * 1000L + 8000L).coerceAtMost(30 * 60 * 1000L)
                            val terminou = withTimeoutOrNull(prazo) {
                                kotlinx.coroutines.selects.select<Boolean?> {
                                    fim.onAwait { it }
                                    interromper.onAwait { null }
                                }
                            }
                            p.removeListener(ouvinte)
                            p.stop()
                            if (terminou == false) {
                                // este aparelho não conseguiu decodificar um segundo vídeo: a zona segue só com imagens e widgets
                                videoIndisponivel = true
                                telaDeVideo?.visibility = View.INVISIBLE
                                Logger.w("ZONAS", "zona ${zona.numero}: vídeo indisponível neste aparelho; seguindo sem vídeo")
                                falhasSeguidas++
                            } else exibiu = terminou == true || terminou == null
                        } finally {
                            portaoDeVideo.release()
                        }
                    }
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                Logger.w("ZONAS", "zona ${zona.numero}: item ${item.id} falhou (${e.message})")
                falhasSeguidas++
                delay(500)
                continue
            }
            if (exibiu) {
                falhasSeguidas = 0
                val segundos = ((System.currentTimeMillis() - inicio) / 1000L).coerceAtLeast(1)
                registrarProva(item, zona, inicio, segundos)
            }
        }
    }

    // ------------------------------------------------------------------------------------------ arquivos das zonas
    private fun nomeDoArquivo(url: String): String {
        val hash = MessageDigest.getInstance("SHA-1").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
        val ext = url.substringBefore('?').substringAfterLast('.', "").lowercase().takeIf { it.length in 2..5 && it.all(Char::isLetterOrDigit) } ?: "bin"
        return "$hash.$ext"
    }

    private suspend fun arquivoDe(item: ZoneItem): File? = withContext(Dispatchers.IO) {
        val f = File(cacheDir, nomeDoArquivo(item.url))
        if (f.exists() && f.length() > 0) return@withContext f
        val r = downloader.downloadFile(item.url, f)
        if (r.isSuccess && f.exists() && f.length() > 0) f else { Logger.w("ZONAS", "não foi possível baixar ${item.id}"); null }
    }

    /** Remove da pasta das zonas o que a divisão atual não usa mais. */
    private fun limparArquivos(l: ZoneLayout) {
        val usados = l.secundarias.flatMap { it.items }.filter { it.kind != ZoneItemKind.WIDGET }.map { nomeDoArquivo(it.url) }.toSet()
        cacheDir.listFiles()?.forEach { if (it.isFile && !it.name.endsWith(".tmp") && it.name !in usados) it.delete() }
    }

    // ------------------------------------------------------------------------------------------ prova de exibição por zona
    private fun registrarProva(item: ZoneItem, zona: Zone, inicioMs: Long, segundos: Long) {
        if (item.kind == ZoneItemKind.WIDGET) return // widget não é mídia do acervo
        synchronized(provas) {
            provas += buildJsonObject {
                put("media_id", item.mediaId); put("started_at", isoUtc(inicioMs)); put("duration", segundos)
                put("zona_id", zona.id); put("zona_numero", zona.numero)
            }
            if (provas.size > LIMITE_DE_PROVAS) provas.subList(0, provas.size - LIMITE_DE_PROVAS).clear()
            gravarProvas()
        }
    }

    private suspend fun enviarProvas() {
        val lote = synchronized(provas) { provas.take(100) }
        if (lote.isEmpty()) return
        val tela = SessionManager.currentUUID ?: return
        try {
            val aparelho = SessionManager.awaitIdentity()
            val aceito = withContext(Dispatchers.IO) { ServiceLocator.getRemoteDataSource().registrarExibicoesDasZonas(tela, aparelho, JsonArray(lote)) }
            if (aceito) synchronized(provas) { provas.removeAll(lote.toSet()); gravarProvas() }
        } catch (e: Exception) {
            Logger.w("ZONAS", "prova de exibição não enviada agora (${e.message}); fica para a próxima")
        }
    }

    private fun isoUtc(ms: Long): String =
        java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.format(java.util.Date(ms))

    companion object {
        private const val PRINCIPAL = "principal"
        private const val CHAVE_LAYOUT = "layout_bruto"
        private const val INTERVALO_MS = 60_000L
        private const val CHAVE_PROVAS = "provas_pendentes"
        private const val LIMITE_DE_PROVAS = 5000
    }
}

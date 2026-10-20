package com.antigravity.player.launcher

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.antigravity.core.util.Logger
import com.antigravity.player.R
import java.io.File

/**
 * F-200 — as 4 telas do cartão "Destaques Sobre Mídia": 2 TVs 16:9 (uma sobre a outra) e 2 totens 9:16, o maior
 * possível dentro do cartão. Mostra que o sistema funciona em TV deitada e em totem.
 */
class VitrineLayout @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : ViewGroup(context, attrs) {
    private val vao = (12 * resources.displayMetrics.density).toInt()

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        val medidas = LauncherPolicy.medidasDaVitrine(w - paddingLeft - paddingRight, h - paddingTop - paddingBottom, vao)
        for (i in 0 until childCount) {
            val m = medidas.getOrNull(i) ?: continue
            getChildAt(i).measure(MeasureSpec.makeMeasureSpec(m.largura, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(m.altura, MeasureSpec.EXACTLY))
        }
        setMeasuredDimension(w, h)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val medidas = LauncherPolicy.medidasDaVitrine(width - paddingLeft - paddingRight, height - paddingTop - paddingBottom, vao)
        for (i in 0 until childCount) {
            val m = medidas.getOrNull(i) ?: continue
            getChildAt(i).layout(paddingLeft + m.x, paddingTop + m.y, paddingLeft + m.x + m.largura, paddingTop + m.y + m.altura)
        }
    }
}

/**
 * F-200 — cada uma das 4 telas passa as suas mídias (escolhidas pelo dono/ADM no painel). Fotos trocam no tempo de cada
 * uma. Vídeos tocam **um de cada vez** (rodízio entre as telas): TV Box fraca não aguenta 4 vídeos juntos e o
 * decodificador tem de ficar livre para o Player. Enquanto espera a vez, a tela mostra um quadro parado do próprio vídeo.
 */
class VitrineDaLauncher(context: Context, private val layout: VitrineLayout) {

    private class Tela(val vitrine: String, val raiz: View) {
        val imagem: ImageView = raiz.findViewById(R.id.vitrine_imagem)
        val video: PlayerView = raiz.findViewById(R.id.vitrine_video)
        val vazia: View = raiz.findViewById(R.id.vitrine_vazia)
        var itens: List<Pair<LauncherPolicy.ItemDeFundo, File>> = emptyList()
        var indice = 0
        var avanco: Runnable? = null
        fun atual() = itens[indice % itens.size]
    }

    private val ctx = context.applicationContext
    private val principal = Handler(Looper.getMainLooper())
    private val telas: List<Tela>
    private var reprodutor: ExoPlayer? = null
    private var telaDoVideo: Tela? = null
    private val filaDeVideo = ArrayDeque<Tela>()
    private val quadros = HashMap<String, Bitmap?>()
    private val falharam = HashSet<String>()
    private var ativa = false

    init {
        val inflador = LayoutInflater.from(context)
        telas = LauncherPolicy.VITRINES.map { v ->
            val raiz = inflador.inflate(R.layout.launcher_vitrine_tela, layout, false)
            raiz.clipToOutline = true // a mídia fica dentro dos cantos arredondados da tela
            raiz.findViewById<TextView>(R.id.vitrine_formato).text = if (v.startsWith("tv")) "TV 16:9" else "TOTEM 9:16"
            layout.addView(raiz)
            Tela(v, raiz)
        }
    }

    /** Começa (ou recomeça) a passar as mídias de cada tela. */
    fun mostrar(fundo: List<Pair<LauncherPolicy.ItemDeFundo, File>>) {
        parar()
        ativa = true
        for (t in telas) {
            t.itens = fundo.filter { it.first.vitrine == t.vitrine }
            t.indice = 0
            exibir(t)
        }
    }

    /** Para tudo e libera o decodificador de vídeo (a launcher saiu da frente). */
    fun parar() {
        ativa = false
        principal.removeCallbacksAndMessages(null)
        filaDeVideo.clear()
        telas.forEach { it.avanco = null; it.video.player = null }
        telaDoVideo = null
        reprodutor?.release()
        reprodutor = null
    }

    private fun exibir(t: Tela) {
        if (!ativa) return
        t.avanco?.let { principal.removeCallbacks(it) }
        if (t.itens.isEmpty()) {
            t.vazia.visibility = View.VISIBLE; t.imagem.visibility = View.GONE; t.video.visibility = View.GONE
            return
        }
        t.vazia.visibility = View.GONE
        val (item, arquivo) = t.atual()
        if (!item.video) {
            t.video.visibility = View.GONE
            try { com.bumptech.glide.Glide.with(ctx).load(arquivo).into(t.imagem) } catch (e: Exception) { }
            t.imagem.visibility = View.VISIBLE
            agendarProximo(t, item.duracaoS * 1000L)
            return
        }
        mostrarQuadroParado(t, arquivo)
        if (arquivo.path in falharam) { agendarProximo(t, item.duracaoS * 1000L); return } // vídeo que não toca: fica a foto
        if (telaDoVideo !== t && t !in filaDeVideo) filaDeVideo.addLast(t)
        tocarProximoVideo()
    }

    private fun agendarProximo(t: Tela, ms: Long) {
        if (t.itens.size <= 1 && !t.atual().first.video) return // uma foto só: fica parada
        val r = Runnable { t.indice++; exibir(t) }
        t.avanco = r
        principal.postDelayed(r, ms.coerceAtLeast(3_000L))
    }

    private fun tocarProximoVideo() {
        if (!ativa || telaDoVideo != null) return
        val t = filaDeVideo.removeFirstOrNull() ?: return
        if (t.itens.isEmpty() || !t.atual().first.video) { tocarProximoVideo(); return }
        val arquivo = t.atual().second
        val p = reprodutor ?: ExoPlayer.Builder(ctx).build().also { novo ->
            novo.volume = 0f
            novo.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(estado: Int) {
                    if (estado == Player.STATE_READY) telaDoVideo?.video?.visibility = View.VISIBLE
                    if (estado == Player.STATE_ENDED) principal.post { terminouVideo(falhou = false) }
                }
                override fun onPlayerError(error: PlaybackException) {
                    Logger.w("LAUNCHER", "Vídeo de destaque não tocou: ${error.errorCodeName}")
                    principal.post { terminouVideo(falhou = true) }
                }
            })
            reprodutor = novo
        }
        telaDoVideo = t
        t.video.player = p
        p.setMediaItem(MediaItem.fromUri(Uri.fromFile(arquivo)))
        p.prepare()
        p.play()
    }

    private fun terminouVideo(falhou: Boolean) {
        val t = telaDoVideo ?: return
        if (falhou && t.itens.isNotEmpty()) falharam.add(t.atual().second.path)
        telaDoVideo = null
        reprodutor?.stop()
        t.video.player = null
        t.video.visibility = View.GONE
        t.indice++
        exibir(t)          // a próxima mídia desta tela (se for vídeo, entra no fim da fila: vez das outras telas)
        tocarProximoVideo()
    }

    /** Um quadro (do meio) do próprio vídeo enquanto ele espera a vez (lido uma vez, em segundo plano). */
    private fun mostrarQuadroParado(t: Tela, arquivo: File) {
        t.imagem.visibility = View.VISIBLE
        if (quadros.containsKey(arquivo.path)) { quadros[arquivo.path]?.let { t.imagem.setImageBitmap(it) }; return }
        t.imagem.setImageDrawable(null)
        Thread {
            val bmp = try {
                MediaMetadataRetriever().run {
                    try {
                        setDataSource(arquivo.path)
                        // o quadro do MEIO do vídeo (o começo costuma ser abertura branca/preta)
                        val duracaoMs = extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 2_000L
                        getFrameAtTime((duracaoMs / 2).coerceAtLeast(500L) * 1000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)?.let { reduzir(it) }
                    } finally { release() }
                }
            } catch (e: Exception) { null }
            principal.post {
                quadros[arquivo.path] = bmp
                if (ativa && t.itens.isNotEmpty() && t.atual().second.path == arquivo.path && telaDoVideo !== t) bmp?.let { t.imagem.setImageBitmap(it) }
            }
        }.start()
    }

    private fun reduzir(b: Bitmap): Bitmap {
        val maior = maxOf(b.width, b.height)
        if (maior <= 640) return b
        val f = 640f / maior
        return Bitmap.createScaledBitmap(b, (b.width * f).toInt().coerceAtLeast(1), (b.height * f).toInt().coerceAtLeast(1), true).also { if (it !== b) b.recycle() }
    }

}

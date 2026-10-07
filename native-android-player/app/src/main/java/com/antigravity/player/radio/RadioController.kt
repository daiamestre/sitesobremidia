package com.antigravity.player.radio

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem as ExoMediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.antigravity.core.util.Logger
import com.antigravity.player.di.ServiceLocator
import com.antigravity.sync.service.MediaDownloader
import com.antigravity.sync.service.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import java.io.File
import java.security.MessageDigest

/**
 * F-150 — Rádio Comércio no Player Android (contrato get_player_radio_for_screen).
 *
 * Toca em segundo plano a playlist de áudio que o usuário ligou na tela, enquanto as mídias seguem na tela. Reprodutor,
 * arquivos e ciclo próprios — o motor de vídeo/imagem não muda. Quando a rádio está ligada, o servidor já entrega as
 * mídias sem som. Sem rádio, este controlador não cria nada. Nada é desenhado na área de exibição.
 */
data class RadioFaixa(val id: String, val url: String)

data class Radio(val playlistId: String, val volume: Int, val embaralhar: Boolean, val faixas: List<RadioFaixa>) {
    /** Muda quando as faixas ou a ordem mudam (o volume não reinicia a rádio). */
    fun signature(): String = playlistId + "|" + embaralhar + "|" + faixas.joinToString(",") { it.id + "~" + it.url.hashCode() }
}

sealed class RadioResult {
    object None : RadioResult()      // tela sem rádio, sem acesso ou bloqueada: silêncio
    object Invalid : RadioResult()   // resposta que não deu para entender: mantém o que está tocando
    data class Ok(val radio: Radio) : RadioResult()
}

object RadioParser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private fun JsonObject.str(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull

    fun parse(raw: String?): RadioResult {
        if (raw.isNullOrBlank()) return RadioResult.Invalid
        val raiz = try {
            var el = json.parseToJsonElement(raw)
            if (el is JsonPrimitive && el.isString) el = json.parseToJsonElement(el.content)
            el as? JsonObject ?: return RadioResult.Invalid
        } catch (e: Exception) { return RadioResult.Invalid }
        return when (raiz.str("status")?.uppercase()) {
            "SEM_RADIO", "SEM_ACESSO" -> RadioResult.None
            "SUCCESS" -> {
                val r = raiz["radio"] as? JsonObject ?: return RadioResult.Invalid
                val id = r.str("playlist_id") ?: return RadioResult.Invalid
                val faixas = ((r["faixas"] as? JsonArray) ?: JsonArray(emptyList())).mapNotNull { f ->
                    val o = f as? JsonObject ?: return@mapNotNull null
                    val url = o.str("url")
                    val fid = o.str("id")
                    if (fid != null && url != null && (url.startsWith("https://") || url.startsWith("http://"))) RadioFaixa(fid, url) else null
                }
                if (faixas.isEmpty()) return RadioResult.None
                val volume = ((r["volume"] as? JsonPrimitive)?.intOrNull ?: 70).coerceIn(0, 100)
                val embaralhar = (r["embaralhar"] as? JsonPrimitive)?.booleanOrNull ?: false
                RadioResult.Ok(Radio(id, volume, embaralhar, faixas))
            }
            else -> RadioResult.Invalid
        }
    }
}

class RadioController(private val context: Context, private val scope: CoroutineScope) {
    private val prefs = context.getSharedPreferences("radio_do_player", Context.MODE_PRIVATE)
    private val cacheDir = File(context.filesDir, "radio_media")
    private val downloader by lazy { MediaDownloader() }
    private val principal = Handler(Looper.getMainLooper())
    private var atual: Radio? = null
    private var reprodutor: ExoPlayer? = null
    private var laco: Job? = null
    private var preparo: Job? = null

    fun start() {
        // sem rede no boot: volta a tocar a última rádio conhecida (com os arquivos já baixados)
        prefs.getString(CHAVE, null)?.let { (RadioParser.parse(it) as? RadioResult.Ok)?.let { r -> aplicar(r.radio) } }
        laco?.cancel()
        laco = scope.launch {
            while (isActive) { refresh(); delay(INTERVALO_MS) }
        }
    }

    fun stop() {
        laco?.cancel(); preparo?.cancel()
        principal.post { parar() }
    }

    suspend fun refresh() {
        val tela = SessionManager.currentUUID ?: return
        val bruto = try {
            val aparelho = SessionManager.awaitIdentity()
            withContext(Dispatchers.IO) { ServiceLocator.getRemoteDataSource().getRadioForScreenRaw(tela, aparelho) }
        } catch (e: Exception) {
            Logger.w("RADIO", "rádio indisponível agora (${e.message}); mantendo o que está tocando")
            return
        }
        when (val r = RadioParser.parse(bruto)) {
            is RadioResult.Ok -> {
                if (r.radio.signature() != atual?.signature()) { prefs.edit().putString(CHAVE, bruto).apply(); aplicar(r.radio) }
                else if (r.radio.volume != atual?.volume) { atual = r.radio; principal.post { reprodutor?.volume = r.radio.volume / 100f } }
            }
            RadioResult.None -> if (atual != null || prefs.contains(CHAVE)) { prefs.edit().remove(CHAVE).apply(); atual = null; principal.post { parar() } }
            RadioResult.Invalid -> Unit
        }
    }

    /** Só para o teste no aparelho (sem login): toca esta rádio sem perguntar ao servidor. */
    @androidx.annotation.VisibleForTesting internal fun aplicarParaTeste(radio: Radio) = aplicar(radio)
    @androidx.annotation.VisibleForTesting internal fun reprodutorParaTeste(): ExoPlayer? = reprodutor
    @androidx.annotation.VisibleForTesting internal fun pararParaTeste() = principal.post { parar() }

    private fun aplicar(radio: Radio) {
        atual = radio
        preparo?.cancel()
        preparo = scope.launch(Dispatchers.IO) {
            // baixa o que falta; a rádio começa com o que já estiver no aparelho e completa a lista ao terminar
            val arquivos = radio.faixas.mapNotNull { f -> arquivoDe(f)?.let { f to it } }
            if (arquivos.isEmpty()) { Logger.w("RADIO", "nenhuma faixa pôde ser baixada"); return@launch }
            val usados = radio.faixas.map { nomeDoArquivo(it.url) }.toSet()
            cacheDir.listFiles()?.forEach { if (it.isFile && !it.name.endsWith(".tmp") && it.name !in usados) it.delete() }
            withContext(Dispatchers.Main) {
                if (atual !== radio) return@withContext
                val p = reprodutor ?: ExoPlayer.Builder(context).build().also { reprodutor = it }
                p.stop()
                p.setMediaItems(arquivos.map { ExoMediaItem.fromUri(android.net.Uri.fromFile(it.second)) })
                p.repeatMode = Player.REPEAT_MODE_ALL
                p.shuffleModeEnabled = radio.embaralhar
                p.volume = radio.volume / 100f
                p.prepare()
                p.playWhenReady = true
                Logger.i("RADIO", "tocando ${arquivos.size} faixa(s), volume ${radio.volume}%")
            }
        }
    }

    private fun parar() {
        try { reprodutor?.release() } catch (e: Exception) { /* já liberado */ }
        reprodutor = null
    }

    internal fun nomeDoArquivo(url: String): String {
        val hash = MessageDigest.getInstance("SHA-1").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
        val ext = url.substringBefore('?').substringAfterLast('.', "").lowercase().takeIf { it.length in 2..5 && it.all(Char::isLetterOrDigit) } ?: "bin"
        return "$hash.$ext"
    }

    private suspend fun arquivoDe(f: RadioFaixa): File? {
        val arquivo = File(cacheDir, nomeDoArquivo(f.url))
        if (arquivo.exists() && arquivo.length() > 0) return arquivo
        val r = downloader.downloadFile(f.url, arquivo)
        return if (r.isSuccess && arquivo.exists() && arquivo.length() > 0) arquivo else null
    }

    companion object {
        private const val CHAVE = "radio_bruta"
        private const val INTERVALO_MS = 60_000L
    }
}

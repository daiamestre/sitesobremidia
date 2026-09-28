package com.antigravity.player.util

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Color
import android.view.View
import android.widget.ImageView
import com.antigravity.core.util.Logger
import com.antigravity.player.R
import com.antigravity.sync.service.RemoteDataSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * F-103 — Marca do Gestor de Mídias no Player.
 *
 * Quem faz login no Player define a marca: se o usuário for um gestor com "Minha Marca"
 * cadastrada, o logo dele substitui o da SOBRE MÍDIA na abertura, na escolha da tela,
 * no "Sincronizando Mídias" e no aviso de suspensão. A marca fica guardada no aparelho
 * (SharedPreferences + arquivo do logo), então continua valendo offline e após reiniciar.
 * Qualquer falha mantém o que já estava (nunca deixa a tela sem logo).
 */
object MarcaDoGestor {
    private const val PREFS = "marca_player"
    private const val K_STATUS = "status"
    private const val K_NOME = "nome"
    private const val K_LOGO_URL = "logo_url"
    private const val K_COR_FUNDO = "cor_secundaria"
    private const val ARQUIVO_LOGO = "marca_logo.img"
    private const val MAX_BYTES = 5L * 1024 * 1024

    private val http by lazy {
        OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build()
    }

    /** Regras puras (testadas em JVM). */
    internal fun corValida(hex: String?): Boolean = hex != null && Regex("^#[0-9A-Fa-f]{6}$").matches(hex)

    internal fun precisaBaixar(urlGuardada: String?, urlNova: String?, arquivoExiste: Boolean): Boolean =
        !urlNova.isNullOrBlank() && urlNova.startsWith("https://") && (urlNova != urlGuardada || !arquivoExiste)

    private fun arquivo(context: Context) = File(context.filesDir, ARQUIVO_LOGO)

    /** Consulta o servidor com a sessão atual e atualiza a marca guardada. Devolve true se mudou. */
    suspend fun atualizar(context: Context): Boolean = withContext(Dispatchers.IO) {
        val marca = RemoteDataSource().getMarcaDoPlayer() ?: return@withContext false
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val antes = prefs.all.toString()

        if (marca.status != "OK") {
            prefs.edit().clear().apply()
            arquivo(context).delete()
            return@withContext antes != prefs.all.toString()
        }

        val destino = arquivo(context)
        if (precisaBaixar(prefs.getString(K_LOGO_URL, null), marca.logoUrl, destino.exists())) {
            try {
                http.newCall(Request.Builder().url(marca.logoUrl!!).build()).execute().use { r ->
                    val corpo = r.body
                    if (!r.isSuccessful || corpo == null || corpo.contentLength() > MAX_BYTES) error("HTTP ${r.code}")
                    val tmp = File(context.filesDir, "$ARQUIVO_LOGO.tmp")
                    corpo.byteStream().use { input -> tmp.outputStream().use { input.copyTo(it) } }
                    if (tmp.length() == 0L || tmp.length() > MAX_BYTES || BitmapFactory.decodeFile(tmp.path) == null) {
                        tmp.delete(); error("imagem inválida")
                    }
                    if (!tmp.renameTo(destino)) { destino.delete(); tmp.renameTo(destino) }
                }
            } catch (e: Exception) {
                Logger.e("MARCA", "Logo do gestor não baixado (mantém o anterior): ${e.message}")
                return@withContext false
            }
        } else if (marca.logoUrl.isNullOrBlank()) {
            destino.delete()
        }

        prefs.edit()
            .putString(K_STATUS, "OK")
            .putString(K_NOME, marca.nomeMarca)
            .putString(K_LOGO_URL, marca.logoUrl)
            .putString(K_COR_FUNDO, marca.corSecundaria?.takeIf { corValida(it) })
            .apply()
        antes != prefs.all.toString()
    }

    /** Troca o logo da SOBRE MÍDIA pelo do gestor (se houver); senão mantém o padrão. */
    fun aplicarLogo(context: Context, imageView: ImageView?) {
        imageView ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val f = arquivo(context)
        if (prefs.getString(K_STATUS, null) == "OK" && f.exists()) {
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(f.path, opts)
            var amostra = 1
            while (opts.outWidth / amostra > 1600 || opts.outHeight / amostra > 1600) amostra *= 2
            val bmp = BitmapFactory.decodeFile(f.path, BitmapFactory.Options().apply { inSampleSize = amostra })
            if (bmp != null) {
                imageView.setImageBitmap(bmp)
                imageView.contentDescription = prefs.getString(K_NOME, null) ?: imageView.contentDescription
                return
            }
        }
        imageView.setImageResource(R.drawable.logo)
    }

    /** Cor de fundo da marca para telas de espera/sincronização (null = manter a do layout). */
    fun aplicarFundo(context: Context, view: View?) {
        view ?: return
        val cor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .takeIf { it.getString(K_STATUS, null) == "OK" }?.getString(K_COR_FUNDO, null)
        if (corValida(cor)) view.setBackgroundColor(Color.parseColor(cor))
    }
}

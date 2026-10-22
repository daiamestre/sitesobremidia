package com.antigravity.player.launcher

import android.content.Context
import com.antigravity.core.util.Logger
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.DeviceControl
import com.antigravity.sync.service.RemoteDataSource
import com.antigravity.sync.service.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * F-200 — configuração da launcher (vem do painel do dono/ADM) e mídias de fundo guardadas no aparelho.
 * Tudo fica guardado: a launcher abre igual sem internet. Mídia que saiu do fundo é apagada do aparelho.
 */
object ConfigDaLauncher {
    private const val PREFS = "launcher_prefs"
    private const val K_JSON = "config_json"
    private const val K_BUSCADA_EM = "config_buscada_em"
    private const val K_APPS_ASSINATURA = "apps_assinatura"
    private const val K_APPS_ENVIADOS_EM = "apps_enviados_em"
    private const val BUSCAR_A_CADA_MS = 60_000L
    /** F-204: o Player deixa a launcher pronta a cada 5 min (mídias do painel e logo); visível, ela confere a cada 1 min. */
    const val PREPARAR_A_CADA_MS = 5 * 60_000L
    const val CONFERIR_VISIVEL_A_CADA_MS = 60_000L
    private const val REENVIAR_APPS_MS = 24 * 60 * 60_000L
    private const val PASTA = "launcher_fundo"
    private const val MAX_BYTES = 200L * 1024 * 1024

    private val baixando = Mutex()
    private val http by lazy {
        OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).build()
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    fun pasta(ctx: Context) = File(ctx.filesDir, PASTA).apply { mkdirs() }

    /** A configuração guardada (ou a padrão: YouTube/Netflix/apps de TV ocultos, Player em 30 s). */
    fun atual(ctx: Context): LauncherPolicy.Config = LauncherPolicy.lerConfig(prefs(ctx).getString(K_JSON, null)) ?: LauncherPolicy.Config()

    /** Mídias de fundo já baixadas, na ordem do painel. */
    fun fundoPronto(ctx: Context, cfg: LauncherPolicy.Config = atual(ctx)): List<Pair<LauncherPolicy.ItemDeFundo, File>> =
        cfg.fundo.mapNotNull { item -> File(pasta(ctx), item.arquivo).takeIf { it.isFile && it.length() > 0 }?.let { item to it } }

    /** F-209: a imagem de capa já baixada (null = sem capa ou ainda baixando). */
    fun capaPronta(ctx: Context, cfg: LauncherPolicy.Config = atual(ctx)): File? =
        cfg.capa?.let { c -> File(pasta(ctx), c.arquivo).takeIf { it.isFile && it.length() > 0 } }

    /** Há sessão do Player neste aparelho? (a launcher pode abrir antes do Player, logo ao ligar) */
    private suspend fun garantirSessao(ctx: Context): Boolean {
        val atual = SessionManager.currentAccessToken
        if (!atual.isNullOrBlank() && atual != "LOCAL_SESSION") return true
        val cred = try { ServiceLocator.getRepository(ctx.applicationContext).getStoredCredentials() } catch (e: Exception) { null }
        val token = cred?.first?.takeIf { it.isNotBlank() && it != "LOCAL_SESSION" } ?: return false
        SessionManager.currentAccessToken = token
        return true
    }

    /** Busca no servidor (no máximo a cada 1 min, ou já se [forcar]) e baixa o que faltar do fundo. true = mudou. */
    suspend fun atualizar(ctx: Context, forcar: Boolean = false): Boolean = withContext(Dispatchers.IO) {
        val p = prefs(ctx)
        val agora = System.currentTimeMillis()
        if (!forcar && agora - p.getLong(K_BUSCADA_EM, 0L) in 0 until BUSCAR_A_CADA_MS) return@withContext baixarFundo(ctx, atual(ctx))
        if (!garantirSessao(ctx)) return@withContext false
        val json = RemoteDataSource().getLauncherDoPlayer() ?: return@withContext baixarFundo(ctx, atual(ctx))
        val cfg = LauncherPolicy.lerConfig(json) ?: return@withContext false
        val mudou = p.getString(K_JSON, null) != json
        p.edit().putString(K_JSON, json).putLong(K_BUSCADA_EM, agora).apply()
        baixarFundo(ctx, cfg) || mudou
    }

    /** Baixa as mídias de fundo que faltam (uma por vez) e apaga as que saíram. true = algo novo ficou pronto. */
    private suspend fun baixarFundo(ctx: Context, cfg: LauncherPolicy.Config): Boolean = baixando.withLock {
        val dir = pasta(ctx)
        // F-209: a capa (se houver) é baixada junto com as mídias dos Destaques e sai do aparelho quando é trocada
        val baixar = cfg.fundo.map { it.arquivo to it.url } + listOfNotNull(cfg.capa?.let { it.arquivo to it.url })
        val nomes = baixar.map { it.first }.toSet()
        dir.listFiles()?.forEach { if (it.name !in nomes) it.delete() } // inclui .tmp de download interrompido
        var novo = false
        for ((arquivo, url) in baixar) {
            val destino = File(dir, arquivo)
            if (destino.isFile && destino.length() > 0) continue
            val tmp = File(dir, arquivo + ".tmp")
            try {
                http.newCall(Request.Builder().url(url).build()).execute().use { r ->
                    val corpo = r.body
                    if (!r.isSuccessful || corpo == null) error("HTTP ${r.code}")
                    if (corpo.contentLength() > MAX_BYTES) error("arquivo grande demais")
                    corpo.byteStream().use { i -> tmp.outputStream().use { o -> i.copyTo(o) } }
                }
                if (tmp.length() == 0L || !tmp.renameTo(destino)) error("arquivo vazio")
                novo = true
                Logger.i("LAUNCHER", "Fundo baixado: ${arquivo}")
            } catch (e: Exception) {
                tmp.delete()
                Logger.w("LAUNCHER", "Fundo não baixado (${arquivo}): ${e.message}")
            }
        }
        novo
    }

    /** Envia ao painel os apps instalados (só quando a lista muda, ou uma vez por dia). */
    suspend fun reportarApps(ctx: Context, apps: List<Pair<String, String>>) = withContext(Dispatchers.IO) {
        val p = prefs(ctx)
        val assinatura = apps.sortedBy { it.first }.joinToString("|") { it.first }.hashCode().toString()
        val agora = System.currentTimeMillis()
        if (p.getString(K_APPS_ASSINATURA, null) == assinatura && agora - p.getLong(K_APPS_ENVIADOS_EM, 0L) in 0 until REENVIAR_APPS_MS) return@withContext
        if (!garantirSessao(ctx)) return@withContext
        val aparelho = SessionManager.deviceIdentityHash?.takeIf { it.length >= 4 } ?: DeviceControl.getOrCreateDeviceId(ctx)
        if (RemoteDataSource().reportarAppsDaLauncher(aparelho, apps)) {
            p.edit().putString(K_APPS_ASSINATURA, assinatura).putLong(K_APPS_ENVIADOS_EM, agora).apply()
        }
    }
}

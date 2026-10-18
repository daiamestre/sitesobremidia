package com.antigravity.player.util

import android.content.Context
import com.antigravity.core.util.Logger
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * F-194 — Atualização SILENCIOSA em aparelho com acesso de administrador (root), comum em TV Box genérica.
 * O Android só instala sem perguntar em três casos: Device Owner, app do sistema ou root. Com root, o Player instala a
 * versão nova com `pm install -r` por baixo, sem abrir instalador nenhum, e o aparelho reabre o Player sozinho
 * (`am start` no fim do comando + MY_PACKAGE_REPLACED no BootReceiver, o que chegar primeiro).
 *
 * A verificação do root é feita só quando há versão nova para instalar e fica guardada por 6 h (um aparelho com
 * gerenciador de root que pergunta na tela não é incomodado a cada 15 minutos).
 */
object RootInstaller {

    private val CAMINHOS_DO_SU = listOf(
        "/system/xbin/su", "/system/bin/su", "/sbin/su", "/su/bin/su", "/system/sbin/su", "/vendor/bin/su", "/debug_ramdisk/su"
    )
    private const val PREFS = "ota_prefs"
    private const val CHAVE_ROOT_OK = "root_ok"
    private const val CHAVE_ROOT_EM = "root_verificado_em"
    const val REVERIFICAR_MS = 6 * 60 * 60_000L
    private const val LIMITE_TESTE_MS = 8_000L
    private const val ARQUIVO_TEMPORARIO = "/data/local/tmp/sobremidia_update.apk"

    data class Resposta(val codigo: Int, val saida: String, val terminou: Boolean)

    /** Há um binário `su` no aparelho? (barato: só olha os caminhos de sempre) */
    fun temSu(): Boolean = CAMINHOS_DO_SU.any { try { File(it).exists() } catch (_: Exception) { false } }

    /** A resposta de `su -c id` prova root? */
    fun provaDeRoot(r: Resposta): Boolean = r.terminou && r.codigo == 0 && r.saida.contains("uid=0")

    /** Root utilizável neste aparelho (resposta guardada por 6 h). */
    fun disponivel(context: Context, agoraMs: Long = System.currentTimeMillis()): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val verificadoEm = prefs.getLong(CHAVE_ROOT_EM, 0L)
        if (verificadoEm > 0L && agoraMs - verificadoEm in 0 until REVERIFICAR_MS) return prefs.getBoolean(CHAVE_ROOT_OK, false)
        val ok = temSu() && provaDeRoot(executar("id", LIMITE_TESTE_MS))
        prefs.edit().putBoolean(CHAVE_ROOT_OK, ok).putLong(CHAVE_ROOT_EM, agoraMs).apply()
        Logger.i("OTA_ROOT", if (ok) "Aparelho com root: atualizações serão instaladas em silêncio." else "Aparelho sem root utilizável.")
        return ok
    }

    /**
     * Comando de instalação (texto puro, testado na JVM). Copia o APK para /data/local/tmp (lugar que o `pm` sempre lê),
     * instala por cima mantendo os dados, apaga a cópia e reabre o Player. O shell sai do grupo de processos do app antes,
     * para o `am start` não morrer junto quando o Android encerra a versão antiga.
     */
    fun comandoDeInstalacao(apk: String, pacote: String, atividade: String): String {
        require(!apk.contains('\'')) { "caminho do APK inválido" }
        val t = ARQUIVO_TEMPORARIO
        return "echo \$\$ > /acct/tasks 2>/dev/null; echo \$\$ > /sys/fs/cgroup/cgroup.procs 2>/dev/null; " +
            "cat '$apk' > $t && chmod 644 $t && pm install -r $t; R=\$?; rm -f $t; " +
            "am start -n $pacote/$atividade >/dev/null 2>&1; exit \$R"
    }

    /** A saída do `pm install` diz que deu certo? (versões antigas do Android devolvem 0 mesmo falhando) */
    fun instalouComSucesso(r: Resposta): Boolean = r.terminou && r.saida.contains("Success")

    /**
     * Instala em silêncio. Se der certo, o Android encerra este processo no meio (é esperado) e a versão nova abre
     * sozinha. Se voltar daqui, falhou: devolve o motivo para o painel.
     */
    fun instalar(context: Context, apk: File): String {
        val cmd = comandoDeInstalacao(apk.absolutePath, context.packageName, "com.antigravity.player.ui.SplashActivity")
        Logger.i("OTA_ROOT", "Instalando ${apk.name} em silêncio (root)…")
        val r = executar(cmd, 180_000L)
        return if (instalouComSucesso(r)) "instalada (root)" else "root falhou: ${r.saida.trim().take(160).ifBlank { "sem resposta (código ${r.codigo})" }}"
    }

    /** Roda um comando como root com tempo limite (sem waitFor(timeout), que só existe no Android 8+). */
    fun executar(comando: String, limiteMs: Long): Resposta {
        return try {
            val processo = ProcessBuilder("su").redirectErrorStream(true).start()
            processo.outputStream.bufferedWriter().use { it.write(comando); it.write("\nexit\n") }
            val saida = StringBuilder()
            val leitor = Thread {
                try { processo.inputStream.bufferedReader().forEachLine { synchronized(saida) { saida.appendLine(it) } } } catch (_: Exception) { }
            }.apply { isDaemon = true; start() }
            val fim = System.currentTimeMillis() + limiteMs
            var codigo: Int? = null
            while (codigo == null && System.currentTimeMillis() < fim) {
                codigo = try { processo.exitValue() } catch (_: IllegalThreadStateException) { null }
                if (codigo == null) TimeUnit.MILLISECONDS.sleep(100)
            }
            if (codigo == null) {
                processo.destroy()
                return Resposta(-1, synchronized(saida) { saida.toString() }, terminou = false)
            }
            leitor.join(1_000)
            Resposta(codigo, synchronized(saida) { saida.toString() }, terminou = true)
        } catch (e: Exception) {
            Resposta(-1, e.message ?: "su indisponível", terminou = false)
        }
    }
}

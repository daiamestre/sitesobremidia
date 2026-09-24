package com.antigravity.player.util

import java.io.File
import com.antigravity.core.util.Logger

/**
 * [SURVIVOR PLAN] CleanupManager (Garbage Collector)
 * Esta rotina garante que apenas as mídias que estão na sua playlist atual permaneçam no disco.
 * Tudo o que for "lixo" (arquivos de playlists antigas) será deletado.
 */
object CleanupManager {

    // Timeout máximo de download alinhado com MediaDownloader (5 minutos)
    const val ACTIVE_DOWNLOAD_MAX_TIMEOUT_MS = 300_000L

    /**
     * Função para limpar arquivos que não estão na playlist ativa.
     * Alinhado com o sistema de IDs reais do player para máxima segurança.
     */
    fun executarFaxina(context: android.content.Context, idsAtivos: List<String>) {
        val pastaLocal = File(context.filesDir, "media_content")
        executarFaxina(pastaLocal, idsAtivos)
    }

    /**
     * Sobrecarga desacoplada para execução em diretório arbitrário e testabilidade unitária determinística.
     */
    fun executarFaxina(pastaLocal: File, idsAtivos: List<String>): Int {
        try {
            if (!pastaLocal.exists()) return 0

            val arquivosNoDisco = pastaLocal.listFiles() ?: return 0

            // No nosso sistema, os arquivos são salvos como "ID.dat" ou "ID_HASH.dat"
            val validPrefixes = idsAtivos.toSet()

            logI("CLEANUP", "Iniciando faxina em ${arquivosNoDisco.size} arquivos com ${validPrefixes.size} IDs ativos...")

            var deletados = 0
            arquivosNoDisco.forEach { arquivo ->
                if (arquivo.isFile) {
                    val fileName = arquivo.name
                    if (fileName.endsWith(".dat")) {
                        // Se o arquivo pertence a algum dos IDs ativos (seja ID.dat ou ID_HASH.dat), preserva
                        val isOrphan = validPrefixes.none { prefix ->
                            fileName == "$prefix.dat" || fileName.startsWith("${prefix}_")
                        }
                        if (isOrphan) {
                            if (arquivo.delete()) {
                                deletados++
                                logD("CLEANUP", "Lixo removido: ${arquivo.name}")
                            }
                        }
                    } else if (fileName.endsWith(".tmp")) {
                        // [ORPHAN TEMP CLEANUP] Remove apenas arquivos .tmp que NÃO estão sendo ativamente gravados.
                        // Um arquivo .tmp é considerado órfão se sua última modificação for anterior ao timeout máximo de download (5 minutos).
                        val isStale = (System.currentTimeMillis() - arquivo.lastModified()) > ACTIVE_DOWNLOAD_MAX_TIMEOUT_MS
                        if (isStale) {
                            if (arquivo.delete()) {
                                deletados++
                                logD("CLEANUP", "Arquivo temporário órfão removido: ${arquivo.name}")
                            }
                        }
                    }
                }
            }

            logI("CLEANUP", "Faxina concluída! $deletados arquivos obsoletos removidos.")
            return deletados
        } catch (e: Exception) {
            logE("CLEANUP", "Erro durante a faxina: ${e.message}")
            return 0
        }
    }

    private fun logI(tag: String, message: String) {
        try {
            Logger.i(tag, message)
        } catch (_: Throwable) {
            // Preserva execução em ambientes de testes unitários onde android.util.Log não está mockado
        }
    }

    private fun logD(tag: String, message: String) {
        try {
            Logger.d(tag, message)
        } catch (_: Throwable) {
            // Preserva execução em ambientes de testes unitários onde android.util.Log não está mockado
        }
    }

    private fun logE(tag: String, message: String) {
        try {
            Logger.e(tag, message)
        } catch (_: Throwable) {
            // Preserva execução em ambientes de testes unitários onde android.util.Log não está mockado
        }
    }
}

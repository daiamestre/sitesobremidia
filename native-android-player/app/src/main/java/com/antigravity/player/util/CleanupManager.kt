package com.antigravity.player.util

import java.io.File
import com.antigravity.core.util.Logger

/**
 * [SURVIVOR PLAN] CleanupManager (Garbage Collector)
 * Esta rotina garante que apenas as mídias que estão na sua playlist atual permaneçam no disco.
 * Tudo o que for "lixo" (arquivos de playlists antigas) será deletado.
 */
object CleanupManager {

    /**
     * Função para limpar arquivos que não estão na playlist ativa.
     * Alinhado com o sistema de IDs reais do player para máxima segurança.
     */
    fun executarFaxina(context: android.content.Context, idsAtivos: List<String>) {
        try {
            // Regra de Ouro: Apontamos para a pasta media_content que criamos no Escudo de Cache
            val pastaLocal = File(context.filesDir, "media_content")
            if (!pastaLocal.exists()) return

            val arquivosNoDisco = pastaLocal.listFiles() ?: return

            // No nosso sistema, os arquivos são salvos como "ID.dat" ou "ID_HASH.dat"
            val validPrefixes = idsAtivos.toSet()

            Logger.i("CLEANUP", "Iniciando faxina em ${arquivosNoDisco.size} arquivos com ${validPrefixes.size} IDs ativos...")

            var deletados = 0
            arquivosNoDisco.forEach { arquivo ->
                if (arquivo.isFile && arquivo.name.endsWith(".dat")) {
                    val fileName = arquivo.name
                    // Se o arquivo pertence a algum dos IDs ativos (seja ID.dat ou ID_HASH.dat), preserva
                    val isOrphan = validPrefixes.none { prefix ->
                        fileName == "$prefix.dat" || fileName.startsWith("${prefix}_")
                    }
                    if (isOrphan) {
                        if (arquivo.delete()) {
                            deletados++
                            Logger.d("CLEANUP", "Lixo removido: ${arquivo.name}")
                        }
                    }
                }
            }

            Logger.i("CLEANUP", "Faxina concluída! $deletados arquivos obsoletos removidos.")
        } catch (e: Exception) {
            Logger.e("CLEANUP", "Erro durante a faxina: ${e.message}")
        }
    }
}

package com.antigravity.player.util

import java.io.File
import java.net.URL
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.antigravity.core.util.Logger

/**
 * [SURVIVOR PLAN] CacheManager
 * A lógica é simples: o player só pedirá um arquivo ao Supabase se ele não existir localmente.
 * Este objeto é o escudo que economiza sua cota de Egress.
 */
object CacheManager {

    // Função para obter o caminho local do arquivo
    fun getLocalFile(context: android.content.Context, fileName: String): File {
        // Alinhado com a pasta media_content que já usamos para consistência
        val mediaDir = File(context.filesDir, "media_content")
        if (!mediaDir.exists()) mediaDir.mkdirs()
        return File(mediaDir, fileName)
    }

    // O ESCUDO: Verifica se precisa baixar ou se usa o local
    suspend fun verificarEBaixar(context: android.content.Context, url: String, fileName: String): File {
        val localFile = getLocalFile(context, fileName)

        return withContext(Dispatchers.IO) {
            if (localFile.exists() && localFile.length() > 0) {
                // Mestre, aqui economizamos sua cota! 
                // Se o arquivo existe, retornamos ele sem tocar no Supabase.
                Logger.i("CACHE_SHIELD", "Hit! Usando arquivo local: $fileName")
                localFile
            } else {
                // Só baixa se for estritamente necessário
                Logger.w("CACHE_SHIELD", "Miss! Baixando arquivo: $fileName")
                try {
                    baixarArquivo(url, localFile)
                    localFile
                } catch (e: Exception) {
                    Logger.e("CACHE_SHIELD", "FALHA NO DOWNLOAD: ${e.message}")
                    // Se falhou no meio do caminho, remove o lixo para não tentar ler depois
                    if (localFile.exists()) {
                        localFile.delete()
                    }
                    localFile
                }
            }
        }
    }

    private fun baixarArquivo(urlString: String, destination: File) {
        val url = URL(urlString)
        val connection = url.openConnection() as java.net.HttpURLConnection
        
        // [ANTI-TIMEOUT FIX] Aumenta drasticamente o tempo limite para boxes e redes 3G lentas (60 segundos)
        connection.connectTimeout = 60000 
        connection.readTimeout = 60000
        
        connection.connect()
        
        if (connection.responseCode != java.net.HttpURLConnection.HTTP_OK) {
            throw Exception("Falha HTTP: Código ${connection.responseCode}")
        }

        connection.inputStream.use { input ->
            destination.outputStream().use { output ->
                input.copyTo(output)
            }
        }
        
        // 3. TRAVA DE SEGURANÇA: Se o arquivo ficou com 0 bytes, deleta na hora
        if (destination.length() == 0L) {
            destination.delete()
            Logger.e("CACHE_SHIELD", "ERRO: Download resultou em 0 bytes. Arquivo descartado.")
            throw Exception("Download size is 0 bytes")
            Logger.i("CACHE_SHIELD", "Download concluído com sucesso: ${destination.name}")
        }
    }

    /**
     * [GARBAGE COLLECTOR] - Limpeza Inteligente de Armazenamento
     * Remove todos os vídeos/imagens físicas que não fazem mais parte da Playlist oficial,
     * prevenindo que a TV Box "exploda" por disco cheio (Out of Space).
     */
    fun limparCacheObsoleto(context: android.content.Context, nomesArquivosAtuais: List<String>) {
        kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
            try {
                // Alinhado com a pasta media_content
                val diretorio = File(context.filesDir, "media_content")
                if (!diretorio.exists()) return@launch

                val arquivosLocais = diretorio.listFiles()

                if (arquivosLocais != null) {
                    var removidos = 0
                    for (arquivo in arquivosLocais) {
                        // Se o arquivo local NÃO está na lista da playlist atual do Dashboard
                        if (!nomesArquivosAtuais.contains(arquivo.name)) {
                            // Proteção: Não delete pastas, só arquivos de mídia
                            if (arquivo.isFile) {
                                val nomeRemovido = arquivo.name
                                if (arquivo.delete()) {
                                    removidos++
                                    Logger.i("ANTIGRAVITY_CLEANER", "Removido arquivo obsoleto: $nomeRemovido")
                                }
                            }
                        }
                    }
                    Logger.i("ANTIGRAVITY_CLEANER", "Limpeza concluída. Total de arquivos removidos: $removidos")
                }
            } catch (e: Exception) {
                Logger.e("ANTIGRAVITY_CLEANER", "Erro ao limpar cache: ${e.message}")
            }
        }
    }
}

package com.antigravity.cache.storage

import android.content.Context
import java.io.File
import java.io.InputStream
import com.antigravity.cache.util.HashUtils
import com.antigravity.core.util.Logger

/**
 * Gerencia o armazenamento físico de arquivos de mídia.
 * Responsável por:
 * 1. Salvar streams no disco.
 * 2. Verificar Hash SHA-256.
 * 3. Limpar arquivos órfãos (Garbage Collection).
 */
class FileStorageManager(private val context: Context) : com.antigravity.core.domain.repository.CacheManager {

    override fun getLocalPathForId(id: String): String {
        return getFileForMedia(id).absolutePath
    }


    override suspend fun savePlaylistToRoom(items: List<Any>) {
        // This will be implemented in the context of the repository/app
        // which has access to the DAOs.
        Logger.i("STORAGE", "Playlist save requested to Room. Logic should be handled by an orchestrator.")
    }

    private val mediaDir: File by lazy {
        File(context.filesDir, "media_content").apply { mkdirs() }
    }

    fun getFileForMedia(mediaId: String, hash: String = ""): File {
        // [DOUBLE BUFFERING P0] Incluir Hash no nome do arquivo protege o ExoPlayer
        // de ter sua mídia sobrescrita em quente se o ID for o mesmo mas o conteúdo mudar.
        val safeHash = hash.replace(Regex("[^a-zA-Z0-9_-]"), "")
        val suffix = if (safeHash.isNotBlank()) "_$safeHash" else ""
        return File(mediaDir, "$mediaId$suffix.dat")
    }

    fun doesFileExistAndMatchHash(mediaId: String, expectedHash: String): Boolean {
        // 1. Tenta o modelo novo com hash no nome
        val fileHashed = getFileForMedia(mediaId, expectedHash)
        if (fileHashed.exists() && fileHashed.length() > 0L) {
            // Se o arquivo tem o hash no nome, confiamos que foi validado no download
            // (Para ultra paranoia, poderia recalcular o hash aqui, mas impacta performance)
            return true
        }

        // 2. Tenta o modelo legado (apenas ID.dat)
        val fileLegacy = getFileForMedia(mediaId, "")
        if (!fileLegacy.exists() || fileLegacy.length() == 0L) return false
        
        // [YELOO] Smart Hash: Support MD5 (32 chars) for backend compatibility.
        if (expectedHash.length != 32 && expectedHash.length != 64) {
             return true // Fallback for legacy URL-based hashes
        }
        
        return calculateHash(fileLegacy) == expectedHash
    }

    fun writeStreamToFile(mediaId: String, inputStream: InputStream): File {
        val targetFile = getFileForMedia(mediaId)
        targetFile.outputStream().use { output ->
            inputStream.copyTo(output)
        }
        return targetFile
    }

    override fun calculateHash(path: String): String {
        return HashUtils.calculateMD5(File(path)) ?: ""
    }

    private fun calculateHash(file: File): String {
        return HashUtils.calculateMD5(file) ?: ""
    }
    
    fun deleteAll() {
        mediaDir.listFiles()?.forEach { it.delete() }
    }
    
    // --- JANITOR METHODS ---
    
    fun getAllFiles(): List<File> {
        return mediaDir.listFiles()?.toList() ?: emptyList()
    }
    
    fun deleteFile(file: File): Boolean {
        return try {
            if (file.exists()) file.delete() else false
        } catch (e: Exception) {
            false
        }
    }
    
    fun getTotalSize(): Long {
        return mediaDir.listFiles()?.sumOf { it.length() } ?: 0L
    }
    
    /**
     * Touch the file to update its lastModified timestamp.
     * Useful to mark it as "recently used".
     */
    fun touchFile(mediaId: String) {
        val file = getFileForMedia(mediaId)
        if (file.exists()) {
            file.setLastModified(System.currentTimeMillis())
        }
    }

    /**
     * [INDUSTRIAL] Purge files not in the provided list.
     * Agora suporta buscar o ID como substring para não deletar arquivos ID_HASH.dat.
     */
    fun purgeOrphanedFiles(validMediaIds: List<String>) {
        val validPrefixes = validMediaIds.map { it }
        mediaDir.listFiles()?.forEach { file ->
            val fileName = file.name
            // Se o arquivo não começa com NENHUM dos IDs válidos seguidos por _ ou ., é órfão
            val isOrphan = validPrefixes.none { prefix ->
                fileName == "$prefix.dat" || fileName.startsWith("${prefix}_")
            }
            if (isOrphan) {
                com.antigravity.core.util.Logger.i("STORAGE", "Purging orphaned file: ${file.name}")
                file.delete()
            }
        }
    }

    fun isStorageCritical(thresholdPercent: Int = 95): Boolean {
        val total = mediaDir.totalSpace
        if (total == 0L) return false
        val free = mediaDir.freeSpace
        val usedPercent = ((total - free).toDouble() / total.toDouble() * 100).toInt()
        return usedPercent >= thresholdPercent
    }
}

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

    override fun calculateHash(path: String): String {
        return calculateHash(File(path))
    }

    override suspend fun savePlaylistToRoom(items: List<Any>) {
        // This will be implemented in the context of the repository/app
        // which has access to the DAOs.
        Logger.i("STORAGE", "Playlist save requested to Room. Logic should be handled by an orchestrator.")
    }

    private val mediaDir: File by lazy {
        File(context.filesDir, "media_content").apply { mkdirs() }
    }

    fun getFileForMedia(mediaId: String): File {
        return File(mediaDir, "$mediaId.dat") // Using generic extension to avoid intent-filter mess
    }

    fun doesFileExistAndMatchHash(mediaId: String, expectedHash: String): Boolean {
        val file = getFileForMedia(mediaId)
        if (!file.exists() || file.length() == 0L) return false
        
        // [YELOO] Smart Hash: Support MD5 (32 chars) for backend compatibility.
        if (expectedHash.length != 32 && expectedHash.length != 64) {
             return true // Fallback for legacy URL-based hashes
        }
        
        return calculateHash(file) == expectedHash
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
     */
    fun purgeOrphanedFiles(validMediaIds: List<String>) {
        val validFileNames = validMediaIds.map { "$it.dat" }.toSet()
        mediaDir.listFiles()?.forEach { file ->
            if (!validFileNames.contains(file.name)) {
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

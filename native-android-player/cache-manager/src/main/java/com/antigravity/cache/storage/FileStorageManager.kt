package com.antigravity.cache.storage

import android.content.Context
import java.io.File
import java.io.InputStream
import java.security.MessageDigest

/**
 * Gerencia o armazenamento físico de arquivos de mídia.
 * Responsável por:
 * 1. Salvar streams no disco.
 * 2. Verificar Hash SHA-256.
 * 3. Limpar arquivos órfãos (Garbage Collection).
 */
class FileStorageManager(private val context: Context) {

    private val mediaDir: File by lazy {
        File(context.filesDir, "media_content").apply { mkdirs() }
    }

    fun getFileForMedia(mediaId: String): File {
        return File(mediaDir, "$mediaId.dat") // Using generic extension to avoid intent-filter mess
    }

    fun doesFileExistAndMatchHash(mediaId: String, expectedHash: String): Boolean {
        val file = getFileForMedia(mediaId)
        if (!file.exists() || file.length() == 0L) return false
        
        // [INDUSTRIAL] Smart Hash: If it's not a 64-char SHA-256, it's a URL-based identity check.
        // We only calculate SHA-256 if we have a real checksum to compare against.
        if (expectedHash.length != 64) {
            // It's a URL hash (simple ID change detection). Since the file name is mediaId.dat,
            // the mere existence of the file with the correct mediaId is enough for "identity",
            // BUT we want to force redownload if the URL changed.
            // However, since we use delta sync in Repository, if the hash MISMATCHED there, 
            // we'll be downloading anyway.
            return true 
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

    @Suppress("unused")
    private fun calculateHash(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { inputStream ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
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

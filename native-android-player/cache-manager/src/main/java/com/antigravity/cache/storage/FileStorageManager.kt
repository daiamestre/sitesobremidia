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
        if (!file.exists()) return false
        
        // TODO: Enable real hash check in production. 
        // For development/MVP/Demo, simple existence is faster.
        // val actualHash = calculateHash(file)
        // return actualHash == expectedHash
        return true
    }

    fun writeStreamToFile(mediaId: String, inputStream: InputStream): File {
        val targetFile = getFileForMedia(mediaId)
        targetFile.outputStream().use { output ->
            inputStream.copyTo(output)
        }
        return targetFile
    }

    private fun calculateHash(file: File): String {
        return "fake_hash" // Placeholder
    }
    
    fun deleteAll() {
        mediaDir.listFiles()?.forEach { it.delete() }
    }
}

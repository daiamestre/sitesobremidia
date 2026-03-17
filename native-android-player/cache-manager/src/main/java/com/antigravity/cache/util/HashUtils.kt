package com.antigravity.cache.util

import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

object HashUtils {

    /**
     * Calcula o MD5 de um arquivo de forma eficiente usando Buffer.
     * Ideal para arquivos de vídeo grandes no Android.
     */
    fun calculateMD5(file: File): String? {
        if (!file.exists()) return null
        
        return try {
            val digest = MessageDigest.getInstance("MD5")
            val inputStream = FileInputStream(file)
            val buffer = ByteArray(8192) // Buffer de 8KB para performance
            var read: Int
            
            while (inputStream.read(buffer).also { read = it } > 0) {
                digest.update(buffer, 0, read)
            }
            inputStream.close()
            
            val md5sum = digest.digest()
            val bigInt = java.math.BigInteger(1, md5sum)
            
            // Retorna o Hash em String Hexadecimal com 32 caracteres
            var output = bigInt.toString(16)
            output = String.format("%32s", output).replace(' ', '0')
            output
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}

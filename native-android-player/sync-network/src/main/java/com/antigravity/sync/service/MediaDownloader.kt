package com.antigravity.sync.service

import java.io.File
import io.ktor.client.HttpClient
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsChannel
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.core.isEmpty
import io.ktor.utils.io.core.readBytes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.FileOutputStream

class MediaDownloader {

    private val client = HttpClient()

    suspend fun downloadFile(url: String, outputFile: File): Result<File> {
        return withContext(Dispatchers.IO) {
            try {
                // If already likely correct size/exists, skip? For now, force overwrite or simple check.
                if (outputFile.exists() && outputFile.length() > 0) {
                    // Primitive caching: assume verified by hash logic elsewhere
                    // return@withContext Result.success(outputFile)
                }

                val httpResponse = client.prepareGet(url).execute()
                val channel: ByteReadChannel = httpResponse.bodyAsChannel()
                
                outputFile.parentFile?.mkdirs()
                val outputStream = FileOutputStream(outputFile)
                
                while (!channel.isClosedForRead) {
                    val packet = channel.readRemaining(8192)
                    while (!packet.isEmpty) {
                        val bytes = packet.readBytes()
                        outputStream.write(bytes)
                    }
                }
                outputStream.close()
                
                Result.success(outputFile)
            } catch (e: Exception) {
                e.printStackTrace()
                if (outputFile.exists()) outputFile.delete()
                Result.failure(e)
            }
        }
    }
}

package com.antigravity.sync.service

import java.io.File
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.*
import io.ktor.client.request.prepareRequest
import io.ktor.client.statement.bodyAsChannel
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readAvailable
import okhttp3.OkHttpClient
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.*
import android.annotation.SuppressLint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MediaDownloader {

    private val client = HttpClient(OkHttp) {
        engine {
            config { // this: OkHttpClient.Builder
                @Suppress("CustomX509TrustManager")
                val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
                    @SuppressLint("TrustAllX509TrustManager")
                    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    @SuppressLint("TrustAllX509TrustManager")
                    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
                })

                val sslContext = SSLContext.getInstance("SSL")
                sslContext.init(null, trustAllCerts, SecureRandom())
                
                sslSocketFactory(sslContext.socketFactory, trustAllCerts[0] as X509TrustManager)
                hostnameVerifier { _, _ -> true }
            }
        }
    }

    suspend fun downloadFile(url: String, outputFile: File): Result<File> {
        return withContext(Dispatchers.IO) {
            val tmpFile = File(outputFile.parentFile, "${outputFile.name}.tmp")
            try {
                // 1. GARANTIA DE DIRETÓRIO: Força a criação da pasta media_content
                outputFile.parentFile?.let {
                    if (!it.exists()) {
                        val created = it.mkdirs()
                        if (!created && !it.exists()) throw java.io.IOException("Falha crítica: Emulador não permitiu criar diretório ${it.absolutePath}")
                    }
                }

                if (tmpFile.exists()) tmpFile.delete()

                // 2. DOWNLOAD COM TIMEOUT E VALIDAÇÃO
                client.prepareRequest(url).execute { httpResponse ->
                    val status = httpResponse.status
                    val contentLength = httpResponse.headers["Content-Length"]
                    android.util.Log.d("MediaDownloader", "Starting Download: $url | Status: $status | Content-Length: $contentLength")

                    if (status.value !in 200..299) {
                        throw java.io.IOException("Erro de servidor: $status")
                    }

                    if (contentLength != null && contentLength == "0") {
                        throw java.io.IOException("ERRO CRÍTICO: O servidor retornou Content-Length: 0. O arquivo está vazio na origem.")
                    }

                    val channel: ByteReadChannel = httpResponse.bodyAsChannel()
                    java.io.FileOutputStream(tmpFile).use { fos ->
                        val buffer = ByteArray(8192)
                        var totalRead = 0L
                        while (!channel.isClosedForRead) {
                            val read = channel.readAvailable(buffer, 0, buffer.size)
                            if (read <= 0) break
                            fos.write(buffer, 0, read)
                            totalRead += read
                        }
                        fos.flush()
                        fos.fd.sync() // FORÇA A GRAVAÇÃO NO DISCO DO EMULADOR
                        android.util.Log.d("MediaDownloader", "Bytes written to disk: $totalRead")
                    }
                }

                // 3. VERIFICAÇÃO DE INTEGRIDADE
                if (!tmpFile.exists() || tmpFile.length() <= 0L) {
                    android.util.Log.e("MediaDownloader", "DOWNLOAD_INCOMPLETE: Arquivo vazio detectado (0 bytes).")
                    throw java.io.IOException("DOWNLOAD_INCOMPLETE: O emulador criou o arquivo, mas ele está vazio.")
                }

                if (outputFile.exists()) outputFile.delete()

                // 4. MOVIMENTAÇÃO SEGURA
                if (tmpFile.renameTo(outputFile)) {
                    Result.success(outputFile)
                } else {
                    tmpFile.copyTo(outputFile, overwrite = true)
                    tmpFile.delete()
                    Result.success(outputFile)
                }

            } catch (e: java.net.ConnectException) {
                android.util.Log.e("MediaDownloader", "FALHA DE CONEXÃO: O emulador não consegue alcançar o servidor. Verifique se o PC tem internet e se o endereço está correto.", e)
                if (tmpFile.exists()) tmpFile.delete()
                Result.failure(e)
            } catch (e: java.net.SocketTimeoutException) {
                android.util.Log.e("MediaDownloader", "TIMEOUT: O servidor demorou muito para responder. Conexão lenta ou instável.", e)
                if (tmpFile.exists()) tmpFile.delete()
                Result.failure(e)
            } catch (e: java.net.UnknownHostException) {
                android.util.Log.e("MediaDownloader", "DNS ERROR: Não foi possível resolver o endereço da URL. Verifique a URL.", e)
                if (tmpFile.exists()) tmpFile.delete()
                Result.failure(e)
            } catch (e: Exception) {
                android.util.Log.e("MediaDownloader", "ERRO GENÉRICO NO DOWNLOAD", e)
                if (tmpFile.exists()) tmpFile.delete()
                Result.failure(e)
            }
        }
    }
}


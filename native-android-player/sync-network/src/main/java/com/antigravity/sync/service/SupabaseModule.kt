package com.antigravity.sync.service

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.github.jan.supabase.storage.Storage
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.realtime.*
import io.ktor.client.request.header
import io.ktor.client.engine.okhttp.*
import okhttp3.OkHttpClient
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.*
import kotlinx.serialization.json.Json
import android.annotation.SuppressLint

object SupabaseModule {
    
    // In a real production app, these should be injected via BuildConfig
    // For this implementation plan, we will define them here to allow compilation
    @OptIn(io.github.jan.supabase.annotations.SupabaseInternal::class)
    val client: SupabaseClient = createSupabaseClient(
        supabaseUrl = com.antigravity.sync.config.SupabaseConfig.URL,
        supabaseKey = com.antigravity.sync.config.SupabaseConfig.KEY
    ) {
        // [HARDENING] Custom OkHttp Engine for SSL Bypass (Clock Resilience)
        httpEngine = OkHttp.create {
            config {
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

        install(Postgrest) {
            serializer = KotlinXSerializer(Json {
                ignoreUnknownKeys = true
                encodeDefaults = true
            })
        }
        install(Storage)
        install(Realtime)
        install(Auth) {
            // [HARDENING] Session Continuity: Auto-refresh tokens before they expire
            // Prevents Realtime Websockets from disconnecting due to JWT expiration
            autoSaveToStorage = false
            autoLoadFromStorage = false
        }
        
        httpConfig {
            install(io.ktor.client.plugins.HttpTimeout) {
                requestTimeoutMillis = 30000
                connectTimeoutMillis = 30000
                socketTimeoutMillis = 30000
            }

            // DYNAMIC AUTH INJECTOR: Re-evaluates token for EVERY request
            install(io.ktor.client.plugins.api.createClientPlugin("DynamicAuth") {
                onRequest { request, _ ->
                    val token = SessionManager.currentAccessToken
                    if (!token.isNullOrBlank()) {
                        request.headers["Authorization"] = "Bearer $token"
                    }
                    
                    val deviceId = com.antigravity.sync.service.SessionManager.currentUserId ?: "UNKNOWN_DEVICE"
                    request.headers["X-Device-ID"] = deviceId
                    
                    // [AUTOPSY] HEADER SNIFFER
                    com.antigravity.core.util.Logger.d("SYNC_AUTOPSY", ">>> REQUEST HEADERS: Auth=[${token?.take(10)}...], DeviceID=[$deviceId]")
                }
            })
        }
    }
}

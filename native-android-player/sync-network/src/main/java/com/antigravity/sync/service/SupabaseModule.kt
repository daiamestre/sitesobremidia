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
import kotlinx.serialization.json.Json

object SupabaseModule {

    // In a real production app, these should be injected via BuildConfig
    // For this implementation plan, we will define them here to allow compilation
    @OptIn(io.github.jan.supabase.annotations.SupabaseInternal::class)
    val client: SupabaseClient = createSupabaseClient(
        supabaseUrl = com.antigravity.sync.config.SupabaseConfig.URL,
        supabaseKey = com.antigravity.sync.config.SupabaseConfig.KEY
    ) {
        // [SECURITY HARDENING] TLS PADRÃO do Android/OkHttp.
        // Removido o TrustManager que aceitava TODOS os certificados e o
        // HostnameVerifier que aceitava qualquer host (P0 da auditoria).
        // Certificados inválidos agora são REJEITADOS (DENY).
        httpEngine = OkHttp.create {
            config {
                connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
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
                    
                    val deviceId = SessionManager.deviceIdentityHash ?: SessionManager.currentUserId
                    if (!deviceId.isNullOrBlank() && deviceId != "UNKNOWN_DEVICE" && deviceId != "UNKNOWN") {
                        request.headers["X-Device-ID"] = deviceId
                    }

                    // [OBSERVABILITY] Tenant context (screen UUID) + correlation
                    SessionManager.currentUUID?.let { request.headers["X-Tenant-ID"] = it }
                    SessionManager.currentCorrelationId?.let { request.headers["X-Correlation-ID"] = it }
                }
            })
        }
    }
}
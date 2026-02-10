package com.antigravity.sync.service

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.github.jan.supabase.storage.Storage
import kotlinx.serialization.json.Json

object SupabaseModule {
    
    // In a real production app, these should be injected via BuildConfig
    // For this implementation plan, we will define them here to allow compilation
    private const val SUPABASE_URL = "https://ixdvgbgtqwuvworzdnhm.supabase.co"
    private const val SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4ZHZnYmd0cXd1dndvcnpkbmhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjkzNjAsImV4cCI6MjA4MzMwNTM2MH0.1mIhhwDsjgPEydLvluULkXlBMei6uyruZnN3dB9eehI"

    @OptIn(io.github.jan.supabase.annotations.SupabaseInternal::class)
    val client: SupabaseClient by lazy {
        createSupabaseClient(
            supabaseUrl = SUPABASE_URL,
            supabaseKey = SUPABASE_KEY
        ) {
            
            // Safe Token Injection:
            // We verify if we have a user token. If yes, we force the Authorization header.
            // This is required for RLS (Row Level Security) to work.
            httpConfig {
                install(io.ktor.client.plugins.DefaultRequest) {
                    val token = com.antigravity.sync.service.SessionManager.currentAccessToken
                    if (!token.isNullOrBlank()) {
                        if (headers.contains("Authorization")) {
                            headers.remove("Authorization")
                        }
                        headers.append("Authorization", "Bearer $token")
                    }
                }
            }

            install(Postgrest) {
                serializer = KotlinXSerializer(Json {
                    ignoreUnknownKeys = true
                    encodeDefaults = true
                })
            }
            install(Storage)
        }
    }
}

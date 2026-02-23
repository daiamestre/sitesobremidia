package com.antigravity.sync.repository

import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.request.header
import io.ktor.client.call.body
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import kotlinx.serialization.json.Json
import kotlinx.serialization.Serializable

class AuthRepository {

    // Simple Ktor Client for Auth Requests
    private val client = HttpClient {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
        install(io.ktor.client.plugins.HttpTimeout) {
            requestTimeoutMillis = com.antigravity.sync.config.SupabaseConfig.TIMEOUT_READ_MS
            connectTimeoutMillis = com.antigravity.sync.config.SupabaseConfig.TIMEOUT_CONNECT_MS
            socketTimeoutMillis = com.antigravity.sync.config.SupabaseConfig.TIMEOUT_READ_MS
        }
    }




    // Session State managed by SessionManager

    @Serializable
    data class LoginRequest(val email: String, val password: String)

    @Serializable
    data class AuthResponse(
        val access_token: String, 
        val refresh_token: String? = null,
        val expires_in: Long? = 3600,
        val user: UserArg
    )
    
    @Serializable
    data class UserArg(val id: String)

    suspend fun signIn(email: String, pass: String, context: android.content.Context): Result<Unit> {
        return try {
            val endpoint = "${com.antigravity.sync.config.SupabaseConfig.URL}/auth/v1/token?grant_type=password"
            
            val response = client.post(endpoint) {
                header("apikey", com.antigravity.sync.config.SupabaseConfig.KEY)
                contentType(ContentType.Application.Json)
                setBody(LoginRequest(email, pass))
            }
            
            val bodyString = response.body<String>() 
            
            if (response.status.value in 200..299) {
                val json = Json { ignoreUnknownKeys = true }
                val authData = json.decodeFromString<AuthResponse>(bodyString)
                
                // Update Session Manager
                com.antigravity.sync.service.SessionManager.currentAccessToken = authData.access_token
                com.antigravity.sync.service.SessionManager.currentUserId = authData.user.id
                
                // Persist
                val tokenStorage = com.antigravity.sync.storage.TokenStorage(context)
                tokenStorage.saveSession(
                    authData.access_token, 
                    authData.refresh_token, 
                    authData.user.id, 
                    authData.expires_in ?: 3600
                )
                
                Result.success(Unit)
            } else {
                Result.failure(Exception("Login Failed: ${response.status} - $bodyString"))
            }

        } catch (e: Exception) {
             e.printStackTrace()
            Result.failure(e)
        }
    }
    
    // Auto-Login Implementation
    suspend fun restoreSession(context: android.content.Context): Boolean {
        val storage = com.antigravity.sync.storage.TokenStorage(context)
        val accessToken = storage.getAccessToken()
        val refreshToken = storage.getRefreshToken()
        val userId = storage.getUserId()
        
        if (accessToken != null && userId != null) {
            // Check expiry
            if (storage.isTokenExpired() && refreshToken != null) {
                println("AUTH: Token expired. Refreshing...")
                return refreshToken(refreshToken, context)
            }
            
            com.antigravity.sync.service.SessionManager.currentAccessToken = accessToken
            com.antigravity.sync.service.SessionManager.currentUserId = userId
            println("AUTH: Session Restored from Disk.")
            return true
        }
        return false
    }

    private suspend fun refreshToken(refreshToken: String, context: android.content.Context): Boolean {
         return try {
            val endpoint = "${com.antigravity.sync.config.SupabaseConfig.URL}/auth/v1/token?grant_type=refresh_token"
            
            val response = client.post(endpoint) {
                header("apikey", com.antigravity.sync.config.SupabaseConfig.KEY)
                contentType(ContentType.Application.Json)
                setBody(RefreshRequest(refreshToken))
            }
            
            if (response.status.value in 200..299) {
                val bodyString = response.body<String>()
                val json = Json { ignoreUnknownKeys = true }
                val authData = json.decodeFromString<AuthResponse>(bodyString)
                
                // Update & Persist
                com.antigravity.sync.service.SessionManager.currentAccessToken = authData.access_token
                 val tokenStorage = com.antigravity.sync.storage.TokenStorage(context)
                tokenStorage.saveSession(
                    authData.access_token, 
                    authData.refresh_token, 
                    authData.user.id, 
                    authData.expires_in ?: 3600
                )
                true
            } else {
                println("AUTH: Refresh failed")
                false
            }
         } catch (e: Exception) {
             e.printStackTrace()
             false
         }
    }

    @Serializable
    data class RefreshRequest(val refresh_token: String)
    
    // Stub
    suspend fun signOut(context: android.content.Context) {
        // 1. Clear In-Memory
        com.antigravity.sync.service.SessionManager.clear()
        
        // 2. Clear Persistent Storage
        com.antigravity.sync.storage.TokenStorage(context).clear()
    }

    fun isUserLoggedIn(): Boolean {
        return com.antigravity.sync.service.SessionManager.currentAccessToken != null
    }
    
    fun getCurrentUserIdString(): String? {
        return com.antigravity.sync.service.SessionManager.currentUserId
    }
}

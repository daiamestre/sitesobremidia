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
import kotlinx.serialization.decodeFromString

class AuthRepository {

    // Simple Ktor Client for Auth Requests
    private val client = HttpClient {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    }

    private val SUPABASE_URL = "https://ixdvgbgtqwuvworzdnhm.supabase.co"
    private val API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4ZHZnYmd0cXd1dndvcnpkbmhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjkzNjAsImV4cCI6MjA4MzMwNTM2MH0.1mIhhwDsjgPEydLvluULkXlBMei6uyruZnN3dB9eehI"

    // Session State managed by SessionManager

    @Serializable
    data class LoginRequest(val email: String, val password: String)

    @Serializable
    data class AuthResponse(val access_token: String, val user: UserArg)
    
    @Serializable
    data class UserArg(val id: String)

    suspend fun signIn(email: String, pass: String): Result<Unit> {
        return try {
            val endpoint = "$SUPABASE_URL/auth/v1/token?grant_type=password"
            
            val response = client.post(endpoint) {
                header("apikey", API_KEY)
                contentType(ContentType.Application.Json)
                setBody(LoginRequest(email, pass))
            }
            
            val bodyString = response.body<String>() // Raw string to safe debug
            
            if (response.status.value in 200..299) {
                // Parse logic manual to be safe
                val json = Json { ignoreUnknownKeys = true }
                val authData = json.decodeFromString<AuthResponse>(bodyString)
                
                // Update Session Manager
                com.antigravity.sync.service.SessionManager.currentAccessToken = authData.access_token
                com.antigravity.sync.service.SessionManager.currentUserId = authData.user.id
                
                Result.success(Unit)
            } else {
                Result.failure(Exception("Login Failed: ${response.status} - $bodyString"))
            }

        } catch (e: Exception) {
             e.printStackTrace()
            Result.failure(e)
        }
    }
    
    // Stub
    suspend fun signOut() {
        com.antigravity.sync.service.SessionManager.clear()
    }

    fun isUserLoggedIn(): Boolean {
        return com.antigravity.sync.service.SessionManager.currentAccessToken != null
    }
    
    fun getCurrentUserIdString(): String? {
        return com.antigravity.sync.service.SessionManager.currentUserId
    }
}

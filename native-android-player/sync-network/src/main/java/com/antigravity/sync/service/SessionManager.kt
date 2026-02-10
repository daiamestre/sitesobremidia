package com.antigravity.sync.service

object SessionManager {
    var currentAccessToken: String? = null
    var currentUserId: String? = null
    
    fun clear() {
        currentAccessToken = null
        currentUserId = null
    }
}

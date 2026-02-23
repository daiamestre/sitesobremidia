package com.antigravity.core.util

import java.security.MessageDigest

object SecurityHelper {

    private const val SECRET_SALT = "antigravity_enterprise_salt_v1" // In production, this should be obfuscated/dynamic

    fun generateLogSignature(screenId: String, mediaId: String, timestamp: Long): String {
        val raw = "$screenId|$mediaId|$timestamp|$SECRET_SALT"
        return sha256(raw)
    }

    private fun sha256(input: String): String {
        return try {
            val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
            bytes.joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            e.printStackTrace()
            "error_generating_hash"
        }
    }
}

package com.antigravity.sync.service

import okhttp3.Dns
import java.net.InetAddress
import java.net.UnknownHostException
import com.antigravity.core.util.Logger

/**
 * Robust DNS resolver designed for resilient operation on Smart TVs, TV Boxes (MXQ, etc.),
 * mobile devices, and tablets.
 * 
 * Many Android TV boxes and Smart TVs suffer from router DNS timeouts or IPv6 resolution bugs
 * in their native libc getaddrinfo. This resolver tries standard system DNS first, but if that
 * fails, it provides guaranteed Cloudflare Anycast edge IP fallbacks for Supabase clusters,
 * ensuring uninterrupted connectivity across all device generations (Android 6 up to Android 14).
 */
object RobustDns : Dns {

    // Verified Cloudflare Anycast Edge IPs serving *.supabase.co globally
    private val SUPABASE_ANYCAST_IPS = listOf(
        byteArrayOf(104.toByte(), 18.toByte(), 38.toByte(), 10.toByte()),
        byteArrayOf(172.toByte(), 64.toByte(), 149.toByte(), 246.toByte()),
        byteArrayOf(104.toByte(), 18.toByte(), 39.toByte(), 10.toByte()),
        byteArrayOf(172.toByte(), 64.toByte(), 148.toByte(), 246.toByte())
    )

    override fun lookup(hostname: String): List<InetAddress> {
        // 1. Tenta a resolução padrão do sistema operacional Android
        try {
            val systemAddresses = Dns.SYSTEM.lookup(hostname)
            if (systemAddresses.isNotEmpty()) {
                return systemAddresses
            }
        } catch (e: Exception) {
            Logger.w("RobustDns", "System DNS resolution failed for '$hostname': ${e.message}. Attempting resilient fallback...")
        }

        // 2. Fallback resiliente para o cluster Supabase (evita falha em TV Box / Smart TV com DNS local quebrado)
        if (hostname.endsWith(".supabase.co") || hostname.contains("supabase")) {
            Logger.i("RobustDns", "Applying Cloudflare Anycast resilient fallback for Supabase host: $hostname")
            try {
                val fallbackAddresses = SUPABASE_ANYCAST_IPS.map { bytes ->
                    InetAddress.getByAddress(hostname, bytes)
                }
                if (fallbackAddresses.isNotEmpty()) {
                    return fallbackAddresses
                }
            } catch (e: Exception) {
                Logger.e("RobustDns", "Failed to construct fallback IP addresses for $hostname", e)
            }
        }

        throw UnknownHostException("Não foi possível resolver o endereço do servidor ($hostname). Verifique a conexão do seu aparelho à internet.")
    }
}

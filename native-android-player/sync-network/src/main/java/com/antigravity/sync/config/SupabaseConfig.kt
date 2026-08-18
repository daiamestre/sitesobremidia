package com.antigravity.sync.config

import com.antigravity.sync.BuildConfig

/**
 * Centralized Configuration for Supabase Connection.
 * [SECURITY HARDENING] URL e chave anon vêm do BuildConfig, injetadas
 * pelo gradle a partir de supabase.properties (gitignored).
 * Sem o arquivo local, o build usa placeholders e o runtime falha claro.
 */
object SupabaseConfig {
    val URL: String = BuildConfig.SUPABASE_URL
    val KEY: String = BuildConfig.SUPABASE_ANON_KEY

    // Timeouts
    const val TIMEOUT_CONNECT_MS = 10_000L
    const val TIMEOUT_READ_MS = 30_000L
}
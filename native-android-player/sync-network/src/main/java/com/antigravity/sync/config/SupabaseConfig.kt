package com.antigravity.sync.config

/**
 * Centralized Configuration for Supabase Connection.
 * Keeps keys and URLs in one place for easy management.
 */
object SupabaseConfig {
    const val URL = "https://bhwsybgsyvvhqtkdqozb.supabase.co"
    const val KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI"
    
    // Timeouts
    const val TIMEOUT_CONNECT_MS = 10_000L
    const val TIMEOUT_READ_MS = 30_000L
}

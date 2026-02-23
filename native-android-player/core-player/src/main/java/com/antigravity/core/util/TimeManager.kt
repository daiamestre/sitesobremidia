package com.antigravity.core.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*
import java.lang.ref.WeakReference

/**
 * Bulletproof Time Synchronization.
 * Fetches time from reliable HTTP headers (NTP fallback over HTTP).
 */
object TimeManager {
    private const val PREFS_NAME = "time_prefs"
    private const val KEY_OFFSET = "time_offset_ms"
    private const val KEY_TIMEZONE = "timezone_offset_h"
    
    private var timeOffsetMs: Long = 0
    private var timezoneOffsetH: Int = 0 
    private var isSynced: Boolean = false
    private var contextRef: WeakReference<android.content.Context>? = null

    fun init(ctx: android.content.Context) {
        this.contextRef = WeakReference(ctx.applicationContext)
        val prefs = ctx.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        timeOffsetMs = prefs.getLong(KEY_OFFSET, 0L)
        timezoneOffsetH = prefs.getInt(KEY_TIMEZONE, -3) // Default to BRT (GMT-3)
        isSynced = timeOffsetMs != 0L
        Logger.i("TimeManager", "Initialized. Persisted Offset: ${timeOffsetMs}ms, Timezone: GMT$timezoneOffsetH")
    }

    fun currentTimeMillis(): Long {
        // Add GMT offset to the synced UTC time
        return System.currentTimeMillis() + timeOffsetMs + (timezoneOffsetH * 3600000L)
    }

    fun getSyncedDate(): Date = Date(currentTimeMillis())

    suspend fun syncTime() = withContext(Dispatchers.IO) {
        // LAYER 1: NTP (UDP 123) - The Gold Standard
        val ntpSuccess = syncViaNTP("a.st1.ntp.br")
        if (ntpSuccess) return@withContext

        // LAYER 2: HTTP Fallback (Google/Cloud)
        try {
            val url = URL("https://www.google.com")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "HEAD"
            connection.connectTimeout = 5000
            
            val dateStr = connection.getHeaderField("Date")
            if (dateStr != null) {
                val format = SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", Locale.US)
                val serverDate = format.parse(dateStr)
                if (serverDate != null) {
                    updateOffset(serverDate.time - System.currentTimeMillis())
                    Logger.i("TimeManager", "Time synced via HTTP. Offset: ${timeOffsetMs}ms")
                }
            }
            connection.disconnect()
        } catch (e: Exception) {
            Logger.e("TimeManager", "HTTP Sync Failed: ${e.message}")
        }
    }

    private fun syncViaNTP(host: String): Boolean {
        return try {
            val address = java.net.InetAddress.getByName(host)
            val buffer = ByteArray(48)
            buffer[0] = 0x1B // LI = 0 (no warning), VN = 3 (IPv4 only), Mode = 3 (Client)

            val socket = java.net.DatagramSocket()
            socket.soTimeout = 5000
            val request = java.net.DatagramPacket(buffer, buffer.size, address, 123)
            
            val t1 = System.currentTimeMillis()
            socket.send(request)
            
            val response = java.net.DatagramPacket(buffer, buffer.size)
            socket.receive(response)
            val t4 = System.currentTimeMillis()
            socket.close()

            // Extract Transmit Timestamp (seconds from 1900)
            val seconds = (buffer[40].toLong() and 0xFF shl 24) or
                          (buffer[41].toLong() and 0xFF shl 16) or
                          (buffer[42].toLong() and 0xFF shl 8) or
                          (buffer[43].toLong() and 0xFF)
            
            val fraction = (buffer[44].toLong() and 0xFF shl 24) or
                           (buffer[45].toLong() and 0xFF shl 16) or
                           (buffer[46].toLong() and 0xFF shl 8) or
                           (buffer[47].toLong() and 0xFF)

            val ntpTime = (seconds - 2208988800L) * 1000L + (fraction * 1000L / 0x100000000L)
            
            // Offset calculation: ((t2 - t1) + (t3 - t4)) / 2
            // Simplification for unstable TV boxes: (ntpTime - average_transit_time)
            updateOffset(ntpTime - (t1 + t4) / 2)
            
            Logger.i("TimeManager", "NTP Sync Success ($host). Offset: ${timeOffsetMs}ms")
            true
        } catch (e: Exception) {
            Logger.e("TimeManager", "NTP Sync Failed ($host): ${e.message}")
            false
        }
    }

    fun updateOffset(newOffset: Long) {
        // [SAFETY] Don't accept huge jumps unless first sync
        if (isSynced && Math.abs(newOffset - timeOffsetMs) > 3600000) {
            Logger.w("TimeManager", "Rejecting massive drift: ${newOffset}ms (Current: ${timeOffsetMs}ms)")
            return
        }
        
        timeOffsetMs = newOffset
        isSynced = true
        
        contextRef?.get()?.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)?.edit()?.let {
            it.putLong(KEY_OFFSET, timeOffsetMs)
            it.apply()
        }
    }

    fun setTimeZoneOffset(offsetHours: Int) {
        this.timezoneOffsetH = offsetHours
        contextRef?.get()?.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)?.edit()?.let {
            it.putInt(KEY_TIMEZONE, timezoneOffsetH)
            it.apply()
        }
    }
    
    fun getSyncedCalendar(): Calendar {
        val cal = Calendar.getInstance()
        cal.timeInMillis = currentTimeMillis()
        return cal
    }
    
    fun isTimeValid(): Boolean = isSynced
}

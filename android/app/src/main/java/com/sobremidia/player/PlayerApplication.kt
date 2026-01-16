package com.sobremidia.player

import android.app.Application
import android.content.Intent
import com.sobremidia.player.service.PlayerService

class PlayerApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        startPlayerService()
    }

    private fun startPlayerService() {
        val serviceIntent = Intent(this, PlayerService::class.java)
        startForegroundService(serviceIntent)
    }
}

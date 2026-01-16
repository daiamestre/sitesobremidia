package com.sobremidia.player.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.sobremidia.player.MainActivity
import com.sobremidia.player.service.PlayerService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || 
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            
            // Start Service
            val serviceIntent = Intent(context, PlayerService::class.java)
            context.startForegroundService(serviceIntent)
            
            // Start Activity (if configured to auto-launch UI)
            val activityIntent = Intent(context, MainActivity::class.java)
            activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(activityIntent)
        }
    }
}

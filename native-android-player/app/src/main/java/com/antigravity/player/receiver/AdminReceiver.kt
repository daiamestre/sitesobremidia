package com.antigravity.player.receiver

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import com.antigravity.core.util.Logger

class AdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Logger.i("DEVICE_ADMIN", "Device Admin Enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Logger.w("DEVICE_ADMIN", "Device Admin Disabled")
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        Logger.i("DEVICE_ADMIN", "Device Owner Provisioning Complete")
    }
}

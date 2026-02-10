package com.sobremidia.player.update

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.io.File

class UpdateManager(private val context: Context) {

    private val SUPABASE_URL = "https://bhwsybgsyvvhqtkdqozb.supabase.co"
    private val VERSION_URL = "$SUPABASE_URL/storage/v1/object/public/releases/version.json"
    private val TAG = "UpdateManager"

    fun checkForUpdate() {
        Log.i(TAG, "🔍 Checking for updates...")
        Thread {
            try {
                val url = URL(VERSION_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.requestMethod = "GET"

                if (conn.responseCode == 200) {
                    val reader = BufferedReader(InputStreamReader(conn.inputStream))
                    val response = StringBuilder()
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        response.append(line)
                    }
                    reader.close()

                    val json = JSONObject(response.toString())
                    val remoteVersionCode = json.optInt("versionCode", 0)
                    val apkUrl = json.optString("url", "")
                    
                    val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
                    val currentVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        pInfo.longVersionCode.toInt()
                    } else {
                        @Suppress("DEPRECATION")
                        pInfo.versionCode
                    }

                    Log.i(TAG, "Versions - Remote: $remoteVersionCode, Local: $currentVersionCode")

                    if (remoteVersionCode > currentVersionCode && apkUrl.isNotEmpty()) {
                        Log.i(TAG, "🚀 Update Found! Downloading...")
                        startDownload(apkUrl)
                    } else {
                        Log.i(TAG, "✅ App is up to date.")
                    }
                } else {
                    Log.w(TAG, "Failed to fetch version.json: ${conn.responseCode}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Update check failed", e)
            }
        }.start()
    }

    private fun startDownload(apkUrl: String) {
        try {
            val fileName = "update.apk"
            val file = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
            if (file.exists()) file.delete()

            val request = DownloadManager.Request(Uri.parse(apkUrl))
                .setTitle("Atualizando Player")
                .setDescription("Baixando nova versão...")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)

            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val downloadId = downloadManager.enqueue(request)

            // Register Receiver for Completion
            val onComplete = object : BroadcastReceiver() {
                override fun onReceive(ctxt: Context, intent: Intent) {
                    val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                    if (id == downloadId) {
                        Log.i(TAG, "📥 Download Complete. Installing...")
                        installApk(file)
                        context.unregisterReceiver(this)
                    }
                }
            }
            context.registerReceiver(onComplete, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))

        } catch (e: Exception) {
            Log.e(TAG, "Download failed", e)
        }
    }

    private fun installApk(file: File) {
        try {
            val validFile = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "update.apk")
            if (!validFile.exists()) {
                Log.e(TAG, "Update file not found at ${validFile.absolutePath}")
                return
            }

            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                validFile
            )

            val intent = Intent(Intent.ACTION_VIEW)
            intent.setDataAndType(uri, "application/vnd.android.package-archive")
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Install failed", e)
        }
    }
}

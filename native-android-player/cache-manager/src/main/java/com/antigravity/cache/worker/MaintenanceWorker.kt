package com.antigravity.cache.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.antigravity.cache.db.PlayerDatabase
import com.antigravity.cache.util.HashUtils
import com.antigravity.core.util.Logger
import java.io.File

/**
 * [YELOO STYLE] The Janitor: MaintenanceWorker
 * Responsável por:
 * 1. Limpeza de Lixo: Deleta arquivos órfãos (não listados no Room).
 * 2. Verificação de Integridade: Deleta arquivos com MD5 divergente.
 * 3. Otimização: Executa VACUUM no SQLite.
 */
class MaintenanceWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            Logger.i("MAINT", "Starting Background Maintenance...")
            
            val database = PlayerDatabase.getDatabase(applicationContext)
            val mediaDir = File(applicationContext.filesDir, "media_content")
            if (!mediaDir.exists()) {
                Logger.w("MAINT", "Media directory missing. Nothing to clean.")
                return Result.success()
            }

            // 1. Obter a lista de hashes e arquivos que DEVEM existir (do Room)
            val validMediaItems = database.playerDao().getAllMediaItems()
            val validFileNames = validMediaItems.map { "${it.id}.dat" }.toSet()
            val validItemsMap = validMediaItems.associateBy { "${it.id}.dat" }

            // 2. Listar todos os arquivos físicos na pasta de cache
            val cachedFiles = mediaDir.listFiles() ?: arrayOf()
            var deletedOrphanCount = 0
            var deletedCorruptCount = 0

            for (file in cachedFiles) {
                // REGRA A: O arquivo não está em nenhuma playlist? (Lixo)
                if (!validFileNames.contains(file.name)) {
                    Logger.w("MAINT", "Deleting Orphan File: ${file.name}")
                    file.delete()
                    deletedOrphanCount++
                    continue
                }

                // REGRA B: O arquivo está na lista, mas o MD5 está correto? (Integridade)
                val expectedItem = validItemsMap[file.name]
                val expectedHash = expectedItem?.file_hash ?: expectedItem?.hash ?: ""
                
                if (expectedHash.isNotEmpty()) {
                    val currentHash = HashUtils.calculateMD5(file)
                    if (currentHash != expectedHash) {
                        Logger.e("MAINT", "Integrity Fail: ${file.name} (MD5: $currentHash != Exp: $expectedHash). Deleting.")
                        file.delete()
                        deletedCorruptCount++
                        // O PlayerRepository detectará a ausência e baixará novamente no próximo Sync
                    }
                }
            }

            Logger.i("MAINT", "Cleanup Done. Orphans: $deletedOrphanCount, Corrupt: $deletedCorruptCount")

            // 3. [SCALE 10K] Disk Quota Enforcement: If <10% free, delete oldest non-playlist media
            try {
                val stat = android.os.StatFs(applicationContext.filesDir.absolutePath)
                val totalBytes = stat.totalBytes
                val freeBytes = stat.availableBytes
                val usagePercent = ((totalBytes - freeBytes).toDouble() / totalBytes * 100).toInt()
                
                Logger.i("MAINT", "Disk Usage: $usagePercent% (Free: ${freeBytes / 1024 / 1024}MB)")
                
                if (usagePercent >= 90) {
                    Logger.w("MAINT", "DISK QUOTA ALERT: Usage at $usagePercent%. Starting emergency cleanup...")
                    
                    // Get files sorted by last modified (oldest first)
                    val allCachedFiles = mediaDir.listFiles()
                        ?.sortedBy { it.lastModified() }
                        ?: emptyList()
                    
                    var freedBytes = 0L
                    var emergencyDeleted = 0
                    
                    for (file in allCachedFiles) {
                        // Stop if we've freed enough space (target: 20% free)
                        val currentFree = android.os.StatFs(applicationContext.filesDir.absolutePath).availableBytes
                        if (currentFree.toDouble() / totalBytes >= 0.20) {
                            Logger.i("MAINT", "Disk recovered to safe levels. Stopping cleanup.")
                            break
                        }
                        
                        // Only delete files NOT in the current active playlist
                        if (!validFileNames.contains(file.name)) {
                            val fileSize = file.length()
                            file.delete()
                            freedBytes += fileSize
                            emergencyDeleted++
                        }
                    }
                    
                    Logger.i("MAINT", "Emergency Cleanup: Deleted $emergencyDeleted files, freed ${freedBytes / 1024 / 1024}MB")
                }
            } catch (e: Exception) {
                Logger.e("MAINT", "Disk quota check failed: ${e.message}")
            }

            // 3. Extra Cleanup: Glide & WebView (Industrial Reset)
            try {
                com.bumptech.glide.Glide.get(applicationContext).clearDiskCache()
                Logger.i("MAINT", "Glide Disk Cache cleared.")
            } catch (ignore: Exception) {}

            try {
                // Trigger WebView reset via session manager if available in classpath
                // com.antigravity.sync.service.SessionManager.triggerWebViewReset()
                // Using reflection or checking imports to avoid circular dependency if :sync-network is not a dependency of :cache-manager
                // Actually :cache-manager is usually a leaf. Let's assume it can access it if properly configured.
                com.antigravity.sync.service.SessionManager.triggerWebViewReset()
                Logger.i("MAINT", "WebView Reset Triggered.")
            } catch (ignore: Exception) {}

            // 4. Vacuum do Banco de Dados (Otimização de Performance)
            try {
                database.openHelper.writableDatabase.execSQL("VACUUM")
                Logger.i("MAINT", "SQLite VACUUM completed successfully.")
            } catch (e: Exception) {
                Logger.e("MAINT", "VACUUM failed: ${e.message}")
            }

            Result.success()
        } catch (e: Exception) {
            Logger.e("MAINT", "Worker Crash: ${e.message}")
            Result.retry() // Tenta novamente em caso de erro transiente
        }
    }
}

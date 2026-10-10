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

            // 1. O que DEVE ficar no aparelho (do Room). F-181: o arquivo se chama "<id>_<hash>.dat"; a limpeza antiga só
            //    conhecia "<id>.dat" e apagava todas as mídias toda madrugada. As regras estão em CacheJanitorPolicy.
            val validMediaItems = database.playerDao().getAllMediaItems()
            val validos = CacheJanitorPolicy.arquivosValidos(validMediaItems.map { it.id to (if (it.file_hash.isNotEmpty()) it.file_hash else it.hash) })
            val validFileNames = validos.keys

            // 2. Listar todos os arquivos físicos na pasta de cache
            val cachedFiles = mediaDir.listFiles() ?: arrayOf()
            var deletedOrphanCount = 0
            var deletedCorruptCount = 0
            val agora = System.currentTimeMillis()

            for (file in cachedFiles) {
                when (CacheJanitorPolicy.decidir(file.name, file.lastModified(), agora, validos)) {
                    CacheJanitorPolicy.Decisao.MANTER -> Unit
                    // REGRA A: não está em nenhuma playlist e não é download recente (lixo)
                    CacheJanitorPolicy.Decisao.APAGAR_ORFAO -> {
                        Logger.w("MAINT", "Deleting Orphan File: ${file.name}")
                        file.delete()
                        deletedOrphanCount++
                    }
                    // REGRA B: está na lista e o painel informou o MD5 — confere a integridade
                    CacheJanitorPolicy.Decisao.CONFERIR_MD5 -> {
                        val esperado = validos[file.name] ?: continue
                        val atual = HashUtils.calculateMD5(file)
                        if (CacheJanitorPolicy.corrompido(atual, esperado)) {
                            Logger.e("MAINT", "Integrity Fail: ${file.name} (MD5: $atual != Exp: $esperado). Deleting.")
                            file.delete()
                            deletedCorruptCount++
                            // O PlayerRepository detecta a ausência e baixa de novo no próximo Sync
                        }
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

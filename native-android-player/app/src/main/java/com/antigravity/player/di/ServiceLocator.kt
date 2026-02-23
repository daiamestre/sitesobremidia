package com.antigravity.player.di

import android.content.Context
import com.antigravity.cache.dao.OfflineLogDao
import com.antigravity.cache.db.PlayerDatabase
import com.antigravity.cache.storage.FileStorageManager
import com.antigravity.core.domain.repository.PlayerRepository
import com.antigravity.core.domain.usecase.SyncPlaylistUseCase
import com.antigravity.core.fsm.StateMachine
import com.antigravity.core.util.Logger
import com.antigravity.player.data.PlayerRepositoryImpl
import com.antigravity.player.util.DeviceControl
import com.antigravity.player.util.OTAUpdateManager
import com.antigravity.sync.repository.AuthRepository
import com.antigravity.sync.service.MediaDownloader
import com.antigravity.sync.service.RemoteDataSource
import com.antigravity.sync.service.SessionManager
import com.antigravity.sync.storage.TokenStorage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * Service Locator manual para injeção de dependências.
 * Centraliza a criação e gerenciamento de instâncias singleton.
 */
object ServiceLocator {

    val stateMachine = StateMachine()
    val authRepository = AuthRepository()

    private val remoteDataSource = RemoteDataSource()
    private val mediaDownloader = MediaDownloader()

    private val globalScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    fun getCoroutineScope() = globalScope

    private var databaseInstance: PlayerDatabase? = null
    private var storageManager: FileStorageManager? = null

    fun init(context: Context) {
        if (databaseInstance == null) {
            try {
                databaseInstance = PlayerDatabase.getDatabase(context)
                storageManager = FileStorageManager(context)
                remoteDataSource.init(context) // Initialize with context for TokenStorage

                // Restore Session via TokenStorage
                val tokenStorage = TokenStorage(context)
                val savedToken = tokenStorage.getAccessToken()
                val savedUserId = tokenStorage.getUserId()
                val savedUUID = tokenStorage.getUUID()

                if (savedToken != null) {
                    SessionManager.currentAccessToken = savedToken
                    SessionManager.currentUserId = savedUserId
                    SessionManager.currentUUID = savedUUID // Recover real Supabase UUID

                    val playerPrefs = context.getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
                    SessionManager.currentOrientation = playerPrefs.getString("current_orientation", "landscape")
                }
            } catch (e: Exception) {
                Logger.e("DI_CRITICAL", "ServiceLocator.init failed: ${e.message}")
            }
        }
    }

    fun getRemoteDataSource(): RemoteDataSource = remoteDataSource

    private var repositoryInstance: PlayerRepository? = null

    fun getRepository(context: Context): PlayerRepository {
        init(context)

        val prefs = context.getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
        val savedScreenId = prefs.getString("saved_screen_id", null)
        val currentScreenId = savedScreenId ?: DeviceControl.getOrCreateDeviceId(context)

        // Force Re-creation if repository exists but has a different ID
        if (repositoryInstance != null) {
            val repoImpl = repositoryInstance as? PlayerRepositoryImpl
            if (repoImpl != null && repoImpl.deviceId != currentScreenId) {
                Logger.i("ServiceLocator", "ID changed from ${repoImpl.deviceId} to $currentScreenId. Resetting Repo instance.")
                repositoryInstance = null
            }
        }

        if (repositoryInstance == null) {
            val db = requireNotNull(databaseInstance) { "Database not initialized. Call init() first." }
            val storage = requireNotNull(storageManager) { "StorageManager not initialized. Call init() first." }

            repositoryInstance = PlayerRepositoryImpl(
                context,
                remoteDataSource,
                db.playerDao(),
                db.logDao(),
                storage,
                currentScreenId
            )
        }

        return repositoryInstance!!
    }

    fun getOfflineLogDao(context: Context): OfflineLogDao {
        init(context)
        val db = requireNotNull(databaseInstance) { "Database not initialized." }
        return db.offlineLogDao()
    }

    fun getOTAUpdateManager(context: Context): OTAUpdateManager {
        return OTAUpdateManager(
            context,
            remoteDataSource,
            mediaDownloader
        )
    }

    fun getFileStorageManager(context: Context): FileStorageManager {
        init(context)
        return requireNotNull(storageManager) { "StorageManager not initialized." }
    }

    /**
     * Resets the repository instance.
     * Call this when the User/Screen ID changes (Login/Logout).
     */
    fun resetRepository() {
        repositoryInstance = null
    }
}

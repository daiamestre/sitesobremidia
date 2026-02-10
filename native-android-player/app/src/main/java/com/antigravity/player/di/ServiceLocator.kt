package com.antigravity.player.di

import com.antigravity.core.domain.repository.PlayerRepository
import com.antigravity.core.domain.usecase.SyncPlaylistUseCase
import com.antigravity.core.fsm.StateMachine
import com.antigravity.player.data.PlayerRepositoryImpl
import com.antigravity.sync.service.RemoteDataSource
import com.antigravity.sync.service.MediaDownloader

object ServiceLocator {

    // Removed lazy delegates to avoid "Property delegate must have a getValue" compilation error
    // Static instantiation is reliable for this scale.

    val stateMachine = StateMachine()
    
    val authRepository = com.antigravity.sync.repository.AuthRepository()

    private val remoteDataSource = RemoteDataSource()
    private val mediaDownloader = MediaDownloader()

    private var databaseInstance: com.antigravity.cache.db.PlayerDatabase? = null
    private var storageManager: com.antigravity.cache.storage.FileStorageManager? = null

    fun init(context: android.content.Context) {
        if (databaseInstance == null) {
            databaseInstance = com.antigravity.cache.db.PlayerDatabase.getDatabase(context)
            storageManager = com.antigravity.cache.storage.FileStorageManager(context)
            
            // Restore Session
            val prefs = context.getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
            val savedToken = prefs.getString("auth_token", null)
            val savedUserId = prefs.getString("auth_user_id", null)
            
            if (savedToken != null) {
                com.antigravity.sync.service.SessionManager.currentAccessToken = savedToken
                com.antigravity.sync.service.SessionManager.currentUserId = savedUserId
            }
        }
    }
    
    private var repositoryInstance: PlayerRepository? = null

    fun getRepository(context: android.content.Context): PlayerRepository {
        init(context)
        
        if (repositoryInstance == null) {
            val prefs = context.getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
            val screenId = prefs.getString("saved_screen_id", "UNKNOWN_DEVICE") ?: "UNKNOWN"
            
            repositoryInstance = PlayerRepositoryImpl(
                remoteDataSource,
                mediaDownloader,
                databaseInstance!!.playerDao(),
                storageManager!!,
                screenId
            )
        }
        
        return repositoryInstance!!
    }
}

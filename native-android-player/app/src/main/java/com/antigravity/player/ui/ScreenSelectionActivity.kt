package com.antigravity.player.ui

import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.antigravity.player.MainActivity
import com.antigravity.player.R
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.DeviceTypeUtil
import com.antigravity.sync.dto.AuthorizedScreenDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ScreenSelectionActivity : AppCompatActivity() {

    private lateinit var loading: ProgressBar
    private lateinit var recyclerView: RecyclerView
    private lateinit var adapter: ScreensAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // [ADAPTIVE UI] Detect hardware and set appropriate orientation
        val isTV = DeviceTypeUtil.isTelevision(applicationContext)
        requestedOrientation = if (isTV) {
            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
        
        setContentView(R.layout.activity_screen_selection)

        loading = findViewById(R.id.selection_loading)
        recyclerView = findViewById(R.id.screens_recycler_view)
        
        recyclerView.layoutManager = LinearLayoutManager(this)
        adapter = ScreensAdapter(emptyList()) { selectedScreen ->
            if (selectedScreen.boundDeviceId != null && selectedScreen.boundDeviceId != com.antigravity.sync.service.SessionManager.deviceIdentityHash) {
                Toast.makeText(this, "Esta tela já está em uso por outro aparelho.", Toast.LENGTH_SHORT).show()
                return@ScreensAdapter
            }
            saveScreenAndProceed(selectedScreen.id)
        }
        recyclerView.adapter = adapter

        fetchScreens()
    }

    private fun fetchScreens() {
        loading.visibility = View.VISIBLE
        recyclerView.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val screens = com.antigravity.sync.service.RemoteDataSource().getAuthorizedScreens()
                
                // Filter out inactive screens (deleted/deactivated in dashboard)
                val activeScreens = screens.filter { it.isActive }
                
                withContext(Dispatchers.Main) {
                    loading.visibility = View.GONE
                    recyclerView.visibility = View.VISIBLE
                    if (activeScreens.isEmpty()) {
                        Toast.makeText(this@ScreenSelectionActivity, "Nenhuma tela disponível.", Toast.LENGTH_LONG).show()
                    } else {
                        adapter.updateData(activeScreens)
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    loading.visibility = View.GONE
                    
                    val msg = e.message ?: ""
                    if (msg.contains("JWT expired", ignoreCase = true) || msg.contains("401", ignoreCase = true) || msg.contains("UNAUTHORIZED", ignoreCase = true)) {
                        Toast.makeText(this@ScreenSelectionActivity, "Sessão Expirada. Faça login novamente.", Toast.LENGTH_LONG).show()
                        
                        // Clear session thoroughly
                        lifecycleScope.launch(Dispatchers.IO) {
                            ServiceLocator.authRepository.signOut(applicationContext)
                            withContext(Dispatchers.Main) {
                                // Go to Login
                                val intent = Intent(this@ScreenSelectionActivity, com.antigravity.player.ui.LoginActivity::class.java)
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                                startActivity(intent)
                                finish()
                            }
                        }
                    } else {
                        Toast.makeText(this@ScreenSelectionActivity, "Erro ao buscar telas: $msg", Toast.LENGTH_LONG).show()
                        e.printStackTrace()
                    }
                }
            }
        }
    }

    private fun saveScreenAndProceed(screenId: String) {
        val prefs = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("saved_screen_id", screenId).apply()
        
        // [SECURITY HARDENING] Explicitamente atualiza identidade volátil da tela
        com.antigravity.sync.service.SessionManager.currentUUID = screenId
        com.antigravity.sync.service.SessionManager.currentUserId = screenId
        
        // [SECURITY HARDENING] Token lido da memória volátil (sessão ativa)
        val token = com.antigravity.sync.service.SessionManager.currentAccessToken ?: ""
        
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                ServiceLocator.getRepository(applicationContext).salvarCredenciais(token, screenId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
            
            withContext(Dispatchers.Main) {
                // [CRITICAL] Reset Repository to use NEW Screen ID immediately
                ServiceLocator.resetRepository()
                
                Toast.makeText(this@ScreenSelectionActivity, "Conectado com Sucesso!", Toast.LENGTH_SHORT).show()
                
                // Start MainActivity (Sync Stage)
                val intent = Intent(this@ScreenSelectionActivity, MainActivity::class.java)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                startActivity(intent)
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
                finish()
            }
        }
    }
}

class ScreensAdapter(
    private var screens: List<AuthorizedScreenDto>,
    private val onClick: (AuthorizedScreenDto) -> Unit
) : RecyclerView.Adapter<ScreensAdapter.ScreenViewHolder>() {

    fun updateData(newScreens: List<AuthorizedScreenDto>) {
        screens = newScreens
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ScreenViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_screen_selection, parent, false)
        return ScreenViewHolder(view)
    }

    override fun onBindViewHolder(holder: ScreenViewHolder, position: Int) {
        holder.bind(screens[position])
    }

    override fun getItemCount(): Int = screens.size

    inner class ScreenViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val nameTextView: TextView = itemView.findViewById(R.id.screen_name)
        private val statusTextView: TextView = itemView.findViewById(R.id.screen_status)
        private val iconView: ImageView = itemView.findViewById(R.id.screen_icon)

        fun bind(screen: AuthorizedScreenDto) {
            val displayName = screen.customId ?: screen.name
            nameTextView.text = displayName

            val deviceHash = com.antigravity.sync.service.SessionManager.deviceIdentityHash

            if (screen.boundDeviceId == null) {
                statusTextView.text = "Disponível para Parear"
                statusTextView.setTextColor(android.graphics.Color.parseColor("#10B981")) // Green
                itemView.alpha = 1.0f
                itemView.setOnClickListener { onClick(screen) }
            } else if (screen.boundDeviceId == deviceHash) {
                statusTextView.text = "Já vinculado a este aparelho"
                statusTextView.setTextColor(android.graphics.Color.parseColor("#3B82F6")) // Blue
                itemView.alpha = 1.0f
                itemView.setOnClickListener { onClick(screen) }
            } else {
                statusTextView.text = "Ocupado por outro aparelho"
                statusTextView.setTextColor(android.graphics.Color.parseColor("#EF4444")) // Red
                itemView.alpha = 0.5f
                itemView.setOnClickListener { onClick(screen) }
            }
        }
    }
}

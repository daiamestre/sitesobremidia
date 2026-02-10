package com.antigravity.player.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.antigravity.player.MainActivity
import com.antigravity.player.R
import com.antigravity.player.di.ServiceLocator
import kotlinx.coroutines.launch

class ScreenSelectionActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_screen_selection)

        val idInput = findViewById<EditText>(R.id.custom_id_input)
        val connectBtn = findViewById<Button>(R.id.connect_button)
        val loading = findViewById<ProgressBar>(R.id.selection_loading)

        connectBtn.setOnClickListener {
            val customId = idInput.text.toString().trim()
            
            if (customId.isBlank()) {
                Toast.makeText(this, "Digite o ID da tela", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            loading.visibility = View.VISIBLE
            connectBtn.isEnabled = false

            lifecycleScope.launch {
                try {
                    // Search for the screen by Custom ID
                    val screen = com.antigravity.sync.service.RemoteDataSource().findScreenByCustomId(customId)
                    
                    if (screen != null) {
                        // FIX: Save the Custom ID (e.g. "LOJA-01"), not the UUID
                        saveScreenAndProceed(customId)
                    } else {
                        Toast.makeText(this@ScreenSelectionActivity, "Tela não encontrada com este ID!", Toast.LENGTH_LONG).show()
                        loading.visibility = View.GONE
                        connectBtn.isEnabled = true
                    }
                } catch (e: Exception) {
                    loading.visibility = View.GONE
                    connectBtn.isEnabled = true
                    
                    val msg = e.message ?: ""
                    if (msg.contains("JWT expired", ignoreCase = true) || msg.contains("401", ignoreCase = true)) {
                        Toast.makeText(this@ScreenSelectionActivity, "Sessão Expirada. Faça login novamente.", Toast.LENGTH_LONG).show()
                        
                        // Clear prefs
                        val prefs = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
                        prefs.edit().remove("auth_token").remove("auth_user_id").apply()
                        
                        // Go to Login
                        val intent = Intent(this@ScreenSelectionActivity, com.antigravity.player.ui.LoginActivity::class.java)
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                        startActivity(intent)
                        finish()
                    } else {
                        Toast.makeText(this@ScreenSelectionActivity, "Erro ao buscar: $msg", Toast.LENGTH_LONG).show()
                        e.printStackTrace()
                    }
                }
            }
        }
    }

    private fun saveScreenAndProceed(screenId: String) {
        val prefs = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("saved_screen_id", screenId).apply()
        
        Toast.makeText(this, "Conectado com Sucesso!", Toast.LENGTH_SHORT).show()
        
        val intent = Intent(this, MainActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        startActivity(intent)
        finish()
    }
}

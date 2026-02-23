package com.antigravity.player.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.Toast
import android.content.pm.ActivityInfo
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.antigravity.player.R
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.DeviceTypeUtil
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        
        // [ADAPTIVE UI] Detect hardware and set appropriate orientation
        val isTV = DeviceTypeUtil.isTelevision(applicationContext)
        requestedOrientation = if (isTV) {
            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
        
        setContentView(R.layout.activity_login)

        val emailInput = findViewById<EditText>(R.id.email_input)
        val passInput = findViewById<EditText>(R.id.password_input)
        val loginBtn = findViewById<Button>(R.id.login_button)
        val loading = findViewById<ProgressBar>(R.id.login_loading)

        // [UX 10-foot UI] Increase font for TVs
        if (isTV) {
            emailInput.textSize = 24f
            passInput.textSize = 24f
            loginBtn.textSize = 24f
        }

        loginBtn.setOnClickListener {
            val email = emailInput.text.toString()
            val pass = passInput.text.toString()

            if (email.isBlank() || pass.isBlank()) {
                Toast.makeText(this, "Preencha email e senha", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            loading.visibility = View.VISIBLE
            loginBtn.isEnabled = false

            lifecycleScope.launch {
                val authResult = ServiceLocator.authRepository.signIn(email, pass, applicationContext)
                
                if (authResult.isSuccess) {
                    val context = applicationContext
                    val deviceId = com.antigravity.player.util.DeviceControl.getOrCreateDeviceId(context)
                    
                    // 1. Save Session
                    val prefs = getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
                    prefs.edit().apply {
                        putString("auth_token", com.antigravity.sync.service.SessionManager.currentAccessToken)
                        putString("auth_user_id", com.antigravity.sync.service.SessionManager.currentUserId)
                        apply()
                    }

                    // 1. Redirect to Screen Selection (Correct Flow per user request)
                    Toast.makeText(this@LoginActivity, "Login realizado com sucesso!", Toast.LENGTH_SHORT).show()
                    
                    val intent = Intent(this@LoginActivity, com.antigravity.player.ui.ScreenSelectionActivity::class.java)
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    
                    
                    startActivity(intent)
                    finish()
                } else {
                    loading.visibility = View.GONE
                    loginBtn.isEnabled = true
                    val error = authResult.exceptionOrNull()?.message ?: "Login falhou"
                    Toast.makeText(this@LoginActivity, "Autenticação falhou: $error", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
    // Locked to Portrait in Manifest
}

package com.antigravity.player.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.antigravity.player.R
import com.antigravity.player.di.ServiceLocator
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val emailInput = findViewById<EditText>(R.id.email_input)
        val passInput = findViewById<EditText>(R.id.password_input)
        val loginBtn = findViewById<Button>(R.id.login_button)
        val loading = findViewById<ProgressBar>(R.id.login_loading)

        loginBtn.setOnClickListener {
            val email = emailInput.text.toString()
            val pass = passInput.text.toString()

            if (email.isBlank() || pass.isBlank()) {
                Toast.makeText(this, "Preencha todos os campos", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            loading.visibility = View.VISIBLE
            loginBtn.isEnabled = false

            lifecycleScope.launch {
                val result = ServiceLocator.authRepository.signIn(email, pass)
                loading.visibility = View.GONE
                loginBtn.isEnabled = true

                if (result.isSuccess) {
                    // 1. Save Session to Disk (Persistence)
                    val prefs = getSharedPreferences("player_prefs", android.content.Context.MODE_PRIVATE)
                    prefs.edit().apply {
                        putString("auth_token", com.antigravity.sync.service.SessionManager.currentAccessToken)
                        putString("auth_user_id", com.antigravity.sync.service.SessionManager.currentUserId)
                        apply()
                    }

                    // 2. Navigate
                    startActivity(Intent(this@LoginActivity, ScreenSelectionActivity::class.java))
                    finish()
                } else {
                    val error = result.exceptionOrNull()?.message ?: "Erro desconhecido"
                    Toast.makeText(this@LoginActivity, "Login falhou: $error", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}

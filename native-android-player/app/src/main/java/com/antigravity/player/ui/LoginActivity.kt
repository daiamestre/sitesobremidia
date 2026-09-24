@file:Suppress("DEPRECATION")
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

        val autoEmail = intent.getStringExtra("extra_email")
        val autoPass = intent.getStringExtra("extra_password")
        if (!autoEmail.isNullOrBlank()) emailInput.setText(autoEmail)
        if (!autoPass.isNullOrBlank()) passInput.setText(autoPass)

        // [UX 10-foot UI] Increase font for TVs
        if (isTV) {
            emailInput.textSize = 24f
            passInput.textSize = 24f
            loginBtn.textSize = 24f
        }

        loginBtn.setOnClickListener {
            val email = emailInput.text.toString().trim()
            val pass = passInput.text.toString().trim()

            if (email.isBlank() || pass.isBlank()) {
                Toast.makeText(this, "Preencha email e senha", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val cm = getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
            val activeNet = cm?.activeNetworkInfo
            if (activeNet == null || !activeNet.isConnected) {
                Toast.makeText(this, "Sem conexão com a internet. Verifique o Wi-Fi ou cabo de rede do aparelho.", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            loading.visibility = View.VISIBLE
            loginBtn.isEnabled = false

            lifecycleScope.launch {
                val authResult = ServiceLocator.authRepository.signIn(email, pass, applicationContext)
                
                if (authResult.isSuccess) {
                    // [INITIALIZE DEVICE ID]
                    com.antigravity.player.util.DeviceControl.getOrCreateDeviceId(applicationContext)
                    
                    // 1. Redirect to Screen Selection (Correct Flow per user request)
                    Toast.makeText(this@LoginActivity, "Login realizado com sucesso!", Toast.LENGTH_SHORT).show()

                    val intent = Intent(this@LoginActivity, com.antigravity.player.ui.ScreenSelectionActivity::class.java).apply {
                        this@LoginActivity.intent.extras?.let { putExtras(it) }
                    }
                    startActivity(intent)
                    overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
                    finish()
                } else {
                    loading.visibility = View.GONE
                    loginBtn.isEnabled = true
                    val exc = authResult.exceptionOrNull()
                    val errorMsg = exc?.message.orEmpty()
                    val friendlyMsg = when {
                        errorMsg.contains("Unable to resolve host", ignoreCase = true) ||
                        errorMsg.contains("UnknownHostException", ignoreCase = true) ->
                            "Falha ao conectar com o servidor. Verifique a internet da sua TV/Aparelho."
                        errorMsg.contains("Invalid login credentials", ignoreCase = true) ->
                            "Email ou senha incorretos."
                        else -> "Não foi possível entrar. Verifique email, senha e a internet."
                    }
                    Toast.makeText(this@LoginActivity, friendlyMsg, Toast.LENGTH_LONG).show()
                }
            }
        }
        if (intent.getBooleanExtra("extra_auto_submit", false) && !autoEmail.isNullOrBlank() && !autoPass.isNullOrBlank()) {
            loginBtn.post { loginBtn.performClick() }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val emailInput = findViewById<EditText>(R.id.email_input)
        val passInput = findViewById<EditText>(R.id.password_input)
        val loginBtn = findViewById<Button>(R.id.login_button)
        val autoEmail = intent.getStringExtra("extra_email")
        val autoPass = intent.getStringExtra("extra_password")
        if (!autoEmail.isNullOrBlank()) emailInput.setText(autoEmail)
        if (!autoPass.isNullOrBlank()) passInput.setText(autoPass)
        if (intent.getBooleanExtra("extra_auto_submit", false) && !autoEmail.isNullOrBlank() && !autoPass.isNullOrBlank()) {
            loginBtn.post { loginBtn.performClick() }
        }
    }
    // Locked to Portrait in Manifest
}

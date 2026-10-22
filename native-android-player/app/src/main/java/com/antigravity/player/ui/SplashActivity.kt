@file:Suppress("DEPRECATION")
package com.antigravity.player.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.content.pm.ActivityInfo
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.antigravity.player.MainActivity
import com.antigravity.player.UserApplication
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.DeviceTypeUtil
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // [ADAPTIVE UI] Detect hardware and force appropriate orientation
        val isTV = DeviceTypeUtil.isTelevision(applicationContext)
        requestedOrientation = if (isTV) {
            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
        
        setContentView(com.antigravity.player.R.layout.activity_splash)
        com.antigravity.player.util.OrientacaoDoAparelho.girarActivity(this) // F-212: TV em pé = tela em pé
        // F-103: logo do gestor de mídias guardado no aparelho (senão, SOBRE MÍDIA)
        com.antigravity.player.util.MarcaDoGestor.aplicarLogo(this, findViewById(com.antigravity.player.R.id.app_logo))
        
        // Ensure DI is ready
        ServiceLocator.init(applicationContext) 
        // F-201: ROM Sobre Mídia — a launcher já nasce escolhida, sem pergunta
        if (com.antigravity.player.launcher.LauncherDoAparelho.ehRomSobreMidia()) {
            Thread { com.antigravity.player.launcher.LauncherDoAparelho.aplicarRom(applicationContext) }.start()
        }
        
        checkOverlayPermission()
    }

    private var isRequestingPermission = false
    private var routingStarted = false

    private val overlayPermissionLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) {
        // User returned from settings, proceed with routing
        isRequestingPermission = false
        if (!routingStarted) {
            routingStarted = true
            checkRouting()
        }
    }

    private fun checkOverlayPermission() {
        if (routingStarted) return

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            val hasOverlay = android.provider.Settings.canDrawOverlays(this)
            android.util.Log.i("OVERLAY", "[OVERLAY] packageName=$packageName, canDrawOverlays=$hasOverlay")
            if (!hasOverlay) {
                if (!isRequestingPermission) {
                    isRequestingPermission = true
                    android.util.Log.i("OVERLAY", "[OVERLAY] opening overlay settings for $packageName")
                    try {
                        val intent = android.content.Intent(
                            android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            android.net.Uri.parse("package:$packageName")
                        )
                        overlayPermissionLauncher.launch(intent)
                    } catch (e: Exception) {
                        android.util.Log.w("OVERLAY", "[OVERLAY] specific package intent failed, trying generic intent", e)
                        try {
                            val fallback = android.content.Intent(
                                android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION
                            )
                            overlayPermissionLauncher.launch(fallback)
                        } catch (e2: Exception) {
                            android.util.Log.e("OVERLAY", "[OVERLAY] generic overlay intent also failed", e2)
                        }
                    }
                }
                return
            } else {
                android.util.Log.i("OVERLAY", "[OVERLAY] overlay permission granted")
            }
        }
        
        // Permission granted or not needed, proceed with routing
        if (!routingStarted) {
            routingStarted = true
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                checkRouting()
            }, 1000)
        }
    }

    override fun onResume() {
        super.onResume()
        // Safety: If user returned and ActivityResult didn't fire, check again
        if (!routingStarted && !isRequestingPermission) {
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                checkOverlayPermission()
            }, 500)
        }
    }

    /**
     * F-200/F-204: na abertura do app pelo ícone, enquanto a pessoa não decidiu, oferece a launcher Sobre Mídia.
     * "Usar" → a launcher vira a tela inicial, aparece e o Player abre logo em seguida (login → tela).
     * "Agora não" → só o Player (login), e o ícone não pergunta mais. Boot, atualização, a contagem da launcher e o
     * quiosque NÃO perguntam. 30 s sem resposta num aparelho que já exibe: segue o Player, nada é escolhido sozinho.
     */
    private fun checkRouting() {
        val launcher = com.antigravity.player.launcher.LauncherDoAparelho
        if (!launcher.devePerguntar(applicationContext) || !launcher.aberturaPeloUsuario(intent)) { rotear(); return }
        val exibindo = !getSharedPreferences("player_prefs", Context.MODE_PRIVATE).getString("saved_screen_id", null).isNullOrBlank()
        var respondeu = false
        // F-212: deitada é o diálogo de sempre; com a TV em pé a caixa gira junto (CaixaNaTela)
        val fecharPergunta = com.antigravity.player.util.CaixaNaTela.mostrar(this, "Launcher Sobre Mídia", com.antigravity.player.launcher.PerguntaLauncherActivity.TEXTO, listOf(
            com.antigravity.player.util.CaixaNaTela.Opcao("Usar a launcher Sobre Mídia") {
                respondeu = true
                launcher.marcarPerguntado(applicationContext)
                launcher.ativar(applicationContext) // pode ter sido desligada por "usar a launcher original como padrão"
                // a launcher vira a tela inicial, aparece e abre o Player logo em seguida (login → tela)
                startActivity(Intent(this, com.antigravity.player.launcher.LauncherActivity::class.java)
                    .putExtra(com.antigravity.player.launcher.LauncherActivity.EXTRA_PEDIR_PADRAO, true)
                    .putExtra(com.antigravity.player.launcher.LauncherActivity.EXTRA_ABRIR_PLAYER, true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                finish()
            },
            com.antigravity.player.util.CaixaNaTela.Opcao("Agora não") {
                respondeu = true
                launcher.marcarPerguntado(applicationContext)
                rotear()
            }
        ), cancelavel = false)
        if (exibindo) {
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                if (!respondeu && !isFinishing && !isDestroyed) {
                    respondeu = true
                    fecharPergunta()
                    rotear() // sem resposta: o Player segue tocando; nada é escolhido sozinho
                }
            }, 30_000)
        }
    }

    private fun rotear() {
        val auth = ServiceLocator.authRepository
        val prefs = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)

        // Make it async to allow network calls (refresh token)
        lifecycleScope.launch {
            // F-205: desvinculado no painel: tela de suporte (ela espera o painel ligar o aparelho a uma tela)
            if (AparelhoDesvinculadoActivity.estaDesvinculado(applicationContext)) {
                startActivity(Intent(this@SplashActivity, AparelhoDesvinculadoActivity::class.java))
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
                finish()
                return@launch
            }
            
            // [AUTO-LOGIN] Prioridade Máxima: Checar Banco Persistente (Room)
            val credentials = try {
                ServiceLocator.getRepository(applicationContext).getStoredCredentials()
            } catch (e: Exception) { null }
            
            if (credentials != null) {
                com.antigravity.core.util.Logger.i("BOOT", "Auto-Login: Credenciais robustas encontradas no Room. Pulando para Sincronização.")
                
                // Carrega memória volátil para não quebrar requests HTTP do Supabase
                com.antigravity.sync.service.SessionManager.currentAccessToken = credentials.first

                // [SECURITY HARDENING] Não persiste mais o token em player_prefs (plaintext).
                // O token já vive criptografado no TokenStorage (Android Keystore).
                // Mantém apenas o UUID da tela (não-secreto) para roteamento.
                prefs.edit().putString("saved_screen_id", credentials.second).apply()
                
                val intent = Intent(this@SplashActivity, com.antigravity.player.MainActivity::class.java)
                startActivity(intent)
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
                finish()
                return@launch
            }
            
            val savedScreenId = prefs.getString("saved_screen_id", null)
            
            // Restore Session from Secure Storage (Disk) -> Auto Refresh if needed
            // [HARDENING] Safety Timeout to prevent Splash Hang
            val isSessionValid = withTimeoutOrNull(15000) {
                auth.restoreSession(applicationContext)
            } ?: false
            
            com.antigravity.core.util.Logger.i("BOOT", "Routing Check: SessionValid=$isSessionValid, SavedScreen=$savedScreenId")

            val intent = if (!isSessionValid) {
                Intent(this@SplashActivity, LoginActivity::class.java).apply {
                    this@SplashActivity.intent.extras?.let { putExtras(it) }
                }
            } else if (savedScreenId == null) {
                Intent(this@SplashActivity, ScreenSelectionActivity::class.java).apply {
                    this@SplashActivity.intent.extras?.let { putExtras(it) }
                }
            } else {
                Intent(this@SplashActivity, com.antigravity.player.MainActivity::class.java).apply {
                    this@SplashActivity.intent.extras?.let { putExtras(it) }
                }
            }
            
            startActivity(intent)
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            finish()
        }
    }

    // Orientation is now locked in Manifest/Splash for initialization stability.
}

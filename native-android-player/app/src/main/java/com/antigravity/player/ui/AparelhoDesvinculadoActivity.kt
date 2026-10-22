package com.antigravity.player.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import com.antigravity.core.util.Logger
import com.antigravity.player.R
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.util.DeviceControl
import com.antigravity.sync.service.RemoteDataSource
import com.antigravity.sync.service.SessionManager
import kotlinx.coroutines.launch

/**
 * F-205 — o painel desvinculou este aparelho: mostra a tela de suporte (a mesma da tela desativada, com a logo) e fica
 * esperando. Quando alguém usa "Vincular outro aparelho" no painel e escolhe este aparelho, ele vai sozinho para a tela
 * nova (escolha automática da tela → sincroniza as mídias dela). Fica assim também depois de reiniciar.
 */
class AparelhoDesvinculadoActivity : AppCompatActivity() {
    private val principal = Handler(Looper.getMainLooper())
    private var saindo = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_aparelho_desvinculado)
        com.antigravity.player.util.OrientacaoDoAparelho.girarActivity(this) // F-212: TV em pé = tela em pé
        ServiceLocator.init(applicationContext)
        marcar(this, true)
        com.antigravity.player.util.MarcaDoGestor.aplicarLogo(this, findViewById(R.id.desvinculado_logo))
        findViewById<android.view.View>(R.id.desvinculado_escolher).setOnClickListener { irParaTela(null) }
    }

    override fun onResume() {
        super.onResume()
        telaCheia()
        principal.post(conferir)
    }

    override fun onPause() {
        super.onPause()
        principal.removeCallbacks(conferir)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() { /* tela de suporte: "voltar" não sai */ }

    /** A cada 15 s pergunta ao servidor se o painel já ligou este aparelho a uma tela. */
    private val conferir = object : Runnable {
        override fun run() {
            val repetir = this
            lifecycleScope.launch {
                if (garantirSessao()) {
                    val aparelho = SessionManager.deviceIdentityHash?.takeIf { it.isNotBlank() }
                        ?: DeviceControl.getHardwareIdentity(applicationContext).also { SessionManager.setIdentity(it) }
                    val vinculo = RemoteDataSource().telaDoAparelho(aparelho)
                    val tela = vinculo?.second
                    if (vinculo?.first == true && !tela.isNullOrBlank()) {
                        Logger.i("VINCULO", "Painel ligou este aparelho à tela $tela: indo para ela.")
                        irParaTela(tela)
                        return@launch
                    }
                }
                if (!saindo) principal.postDelayed(repetir, INTERVALO_MS)
            }
        }
    }

    /** A sessão do Player (login) continua guardada no aparelho: usa ela para perguntar ao servidor. */
    private suspend fun garantirSessao(): Boolean {
        val atual = SessionManager.currentAccessToken
        if (!atual.isNullOrBlank() && atual != "LOCAL_SESSION") return true
        val cred = try { ServiceLocator.getRepository(applicationContext).getStoredCredentials() } catch (e: Exception) { null }
        val token = cred?.first?.takeIf { it.isNotBlank() && it != "LOCAL_SESSION" } ?: return false
        SessionManager.currentAccessToken = token
        return true
    }

    /** [tela] null = a pessoa quer escolher a tela aqui mesmo (lista da conta logada). */
    private fun irParaTela(tela: String?) {
        if (saindo) return
        saindo = true
        marcar(this, false)
        startActivity(Intent(this, ScreenSelectionActivity::class.java).apply {
            if (tela != null) putExtra("extra_select_screen_id", tela)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        })
        finish()
    }

    private fun telaCheia() {
        try {
            WindowCompat.getInsetsController(window, window.decorView).apply {
                hide(WindowInsetsCompat.Type.systemBars())
                systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } catch (e: Exception) { }
    }

    companion object {
        const val INTERVALO_MS = 15_000L
        private const val K_DESVINCULADO = "aparelho_desvinculado"

        /** O aparelho está desvinculado (a abertura do Player e o boot vão direto para a tela de suporte). */
        fun estaDesvinculado(ctx: Context): Boolean =
            ctx.getSharedPreferences("player_prefs", Context.MODE_PRIVATE).getBoolean(K_DESVINCULADO, false)

        fun marcar(ctx: Context, desvinculado: Boolean) {
            ctx.getSharedPreferences("player_prefs", Context.MODE_PRIVATE).edit().apply {
                if (desvinculado) putBoolean(K_DESVINCULADO, true).remove("saved_screen_id") else remove(K_DESVINCULADO)
            }.apply()
        }
    }
}

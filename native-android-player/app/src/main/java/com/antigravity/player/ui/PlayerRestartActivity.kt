package com.antigravity.player.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Process

/**
 * Ponte do "Reiniciar Player" (padrao ProcessPhoenix). Roda em processo proprio (":restart", ver manifest),
 * por isso sobrevive a morte do processo principal e, por ser aberta em primeiro plano pelo Player,
 * pode abrir a Splash sem esbarrar nas restricoes de Android 10+ para iniciar Activity em segundo plano.
 *
 * Fluxo: MainActivity abre esta Activity -> o processo principal encerra -> aqui a Splash e aberta
 * (processo novo, como no primeiro acesso: Splash -> Player -> "Sincronizando Mídias") -> esta ponte encerra.
 */
class PlayerRestartActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mainPid = intent.getIntExtra(EXTRA_MAIN_PID, -1)
        // Garante que o processo antigo (possivelmente travado) morreu antes de abrir o novo.
        if (mainPid > 0 && mainPid != Process.myPid()) Process.killProcess(mainPid)

        val relaunch = Intent(this, SplashActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        }
        try {
            startActivity(relaunch)
        } catch (e: Exception) {
            android.util.Log.e("PLAYER_RESTART", "Falha ao reabrir o Player: ${e.message}")
        }
        finish()
        Runtime.getRuntime().exit(0)
    }

    companion object {
        const val EXTRA_MAIN_PID = "main_pid"
    }
}

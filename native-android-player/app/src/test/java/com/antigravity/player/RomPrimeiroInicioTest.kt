package com.antigravity.player

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * F-214 — ROM Sobre Mídia: o aparelho liga na launcher e o Player só passa a abrir/voltar sozinho depois que a pessoa
 * o abre pela 1ª vez. Fora da ROM nada muda.
 */
class RomPrimeiroInicioTest {
    private fun ler(c: String) = File("src/main/java/com/antigravity/player/$c").readText()

    @Test
    fun `a regra vale so na ROM e libera com o 1o toque ou com uma tela ja em uso`() {
        val l = ler("launcher/LauncherDoAparelho.kt")
        assertTrue(l.contains("fun playerLiberado(ctx: Context): Boolean = !ehRomSobreMidia() || prefs(ctx).getBoolean(K_PLAYER_INICIADO, false) ||"))
        assertTrue(l.contains("getString(\"saved_screen_id\", null).isNullOrBlank()"))
        assertTrue("a abertura pela pessoa libera", ler("ui/SplashActivity.kt").contains("LauncherDoAparelho.marcarPlayerIniciado(applicationContext)"))
        assertTrue("o toque no cartão do Player libera", ler("launcher/LauncherActivity.kt").contains("LauncherDoAparelho.marcarPlayerIniciado(this) // F-214"))
        assertTrue("o Player aberto libera", ler("MainActivity.kt").contains("LauncherDoAparelho.marcarPlayerIniciado(applicationContext)"))
    }

    @Test
    fun `nada abre o Player sozinho antes do 1o toque - ligar, atualizacao e falha da launcher`() {
        val boot = ler("receiver/BootReceiver.kt")
        assertTrue(boot.contains("if (!launcherDoAparelho.playerLiberado(context)) {"))
        assertTrue("antes de qualquer outra decisão do boot", boot.indexOf("playerLiberado(context)") < boot.indexOf("launcher.ativa(context)"))
        assertTrue(ler("receiver/OTAInstallReceiver.kt").contains("if (!com.antigravity.player.launcher.LauncherDoAparelho.playerLiberado(context)) return"))
        assertTrue(ler("UserApplication.kt").contains("if (!com.antigravity.player.launcher.LauncherDoAparelho.playerLiberado(this)) return"))
    }
}

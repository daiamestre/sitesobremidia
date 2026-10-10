package com.antigravity.player

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.antigravity.sync.storage.TokenStorage
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * F-181 — entrada de TESTE no Player (emulador/aparelho de bancada), sem digitar senha: grava no cofre do app a sessão
 * de uma conta de teste (gerada por scripts/ops) e a tela escolhida, como se o usuário tivesse feito login e escolhido
 * a tela. Depois é só abrir o app e acompanhar o fluxo real "Sincronizando Mídias" → reprodução pelo logcat.
 *
 *   adb shell am instrument -w -e class com.antigravity.player.EntradaDeTeste \
 *     -e access <token> -e refresh <token> -e user <uuid> -e tela <uuid da tela> \
 *     com.antigravity.player.test/androidx.test.runner.AndroidJUnitRunner
 *
 * Sem os argumentos, não faz nada (não atrapalha a suíte de testes no aparelho).
 */
@RunWith(AndroidJUnit4::class)
class EntradaDeTeste {
    @Test
    fun gravarSessaoETela() {
        val a = InstrumentationRegistry.getArguments()
        val access = a.getString("access")
        val user = a.getString("user")
        val tela = a.getString("tela")
        assumeTrue("sem argumentos de entrada de teste", !access.isNullOrBlank() && !user.isNullOrBlank() && !tela.isNullOrBlank())
        val ctx: Context = InstrumentationRegistry.getInstrumentation().targetContext
        TokenStorage(ctx).saveSession(access!!, a.getString("refresh"), user!!, 3600)
        ctx.getSharedPreferences("player_prefs", Context.MODE_PRIVATE).edit().putString("saved_screen_id", tela).commit()
        Thread.sleep(2000) // o cofre grava em segundo plano
    }
}

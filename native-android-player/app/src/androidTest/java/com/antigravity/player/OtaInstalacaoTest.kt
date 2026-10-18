package com.antigravity.player

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.ui.SplashActivity
import com.antigravity.player.util.OtaStatus
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * F-183 — ensaio da atualização no aparelho/emulador: abre o Player, mostra o aviso "baixando", e instala um APK de versão
 * maior pelo MESMO caminho da atualização (sessão do PackageInstaller). Sem o argumento "apk", não faz nada.
 *
 *   adb shell am instrument -w -e class com.antigravity.player.OtaInstalacaoTest -e apk /sdcard/.../update.apk \
 *     com.antigravity.player.test/androidx.test.runner.AndroidJUnitRunner
 *
 * Quando o Android troca o aplicativo pela versão nova, este processo é encerrado: é o esperado.
 */
@RunWith(AndroidJUnit4::class)
class OtaInstalacaoTest {
    @Test
    fun avisarEInstalar() {
        val caminho = InstrumentationRegistry.getArguments().getString("apk")
        assumeTrue("sem APK de teste", !caminho.isNullOrBlank())
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        ctx.startActivity(Intent(ctx, SplashActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        Thread.sleep(40_000) // o Player começa a tocar
        OtaStatus.definir(OtaStatus.Estado.Baixando("9.9.9-teste", 45))
        Thread.sleep(15_000) // tempo para a captura da tela com o aviso
        // F-194: "-e pedido 1" = como se o painel tivesse mandado "Instalar atualização agora" (o instalador pode abrir)
        if (InstrumentationRegistry.getArguments().getString("pedido") == "1") com.antigravity.player.util.OtaPolicy.registrarPedidoDoPainel()
        ServiceLocator.getOTAUpdateManager(ctx).instalarArquivoParaTeste(File(caminho!!), "9.9.9-teste")
        Thread.sleep(180_000) // o aplicativo é substituído e este processo morre
    }
}

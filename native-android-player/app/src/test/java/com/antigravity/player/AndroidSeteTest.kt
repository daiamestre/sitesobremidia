package com.antigravity.player

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * F-207 — TV Box com Android 7.1 (SDK 25): a launcher quebrava ao abrir pelo Home (java.time.Instant não existe antes do
 * Android 8; a biblioteca do Supabase usa) e o anti-queda reabria o Player do zero ("Sincronizando mídias").
 */
class AndroidSeteTest {

    @Test
    fun `java time incluido no app para Android anterior ao 8 (desugaring)`() {
        val gradle = File("build.gradle.kts").readText()
        assertTrue(gradle.contains("isCoreLibraryDesugaringEnabled = true"))
        assertTrue(gradle.contains("coreLibraryDesugaring(\"com.android.tools:desugar_jdk_libs:"))
    }

    @Test
    fun `erro de classe na autenticacao do tempo real nao derruba o app`() {
        val rede = File("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt").readText()
        val auth = rede.substringAfter("private suspend fun ensureRealtimeAuth()").substringBefore("suspend fun subscribeToRealtimeSync")
        assertTrue(auth.contains("} catch (e: Throwable) {"))
    }

    @Test
    fun `anti-queda nao refaz a sincronizacao e guarda o erro para o painel`() {
        val app = File("src/main/java/com/antigravity/player/UserApplication.kt").readText()
        assertTrue(app.contains("if (MainActivity.viva) putExtra(MainActivity.EXTRA_SO_TRAZER_PARA_FRENTE, true)"))
        assertTrue(app.contains("FalhaDoApp.guardar(this, \"principal\", e)") && app.contains("FalhaDoApp.guardar(this, thread.name, throwable)"))
        assertTrue(File("src/main/java/com/antigravity/player/MainActivity.kt").readText().contains("FalhaDoApp.enviar(applicationContext)"))
        val launcher = File("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt").readText()
        assertTrue("painel da launcher protegido", launcher.contains("catch (e: Throwable) { Logger.w(\"LAUNCHER\", \"painel:"))
        assertTrue("lista de apps protegida", launcher.contains("catch (e: Throwable) { Logger.w(\"LAUNCHER\", \"apps:"))
    }
}

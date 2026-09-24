package com.antigravity.player

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Regressão do crash "player fecha na cara do usuário" (celular, Android 16, reproduzido em emulador):
 * DeviceInfoCollector.getGpu() chamava GLES20.glGetString() em thread de fundo sem contexto OpenGL
 * -> SIGSEGV nativo (null pointer dereference em libGLESv1_CM.so) ~10 s após a 1ª sincronização.
 * Crash nativo não é capturável por try/catch; nenhum código do app pode chamar glGetString fora do GL.
 */
class NoOffThreadGlCallsTest {

    private val glCall = Regex("""GLES\d*\.glGetString\s*\(""")

    @Test
    fun appSources_neverCallGlGetString() {
        val root = File("src/main/java")
        assertTrue("fontes não encontradas em ${root.absolutePath}", root.isDirectory)
        val offenders = root.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filter { glCall.containsMatchIn(it.readText()) }
            .map { it.path }
            .toList()
        assertTrue("glGetString fora de contexto GL derruba o processo (SIGSEGV): $offenders", offenders.isEmpty())
    }
}

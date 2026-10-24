package com.antigravity.player

import com.antigravity.player.launcher.TemaDaLauncher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** F-213 — a cor escolhida no painel pinta o app inteiro da launcher (também com imagem de capa). */
class TemaDaLauncherTest {

    private fun hsv(cor: Int) = TemaDaLauncher.hsvDe(cor and 0xFFFFFF)

    @Test
    fun `sem cor fica o tema padrao, cor invalida tambem`() {
        assertNull(TemaDaLauncher.paleta(null))
        assertNull(TemaDaLauncher.paleta("verde"))
        assertNull(TemaDaLauncher.paleta("#12345"))
    }

    @Test
    fun `verde escolhido deixa os botoes verdes, vivos e legiveis`() {
        val p = TemaDaLauncher.paleta("#064E3B")!!
        val base = hsv(0x064E3B)
        assertEquals("mesmo tom da cor escolhida", base[0], hsv(p.botaoInicio)[0], 3f)
        assertTrue("botão claro o bastante para o texto branco", hsv(p.botaoInicio)[2] > 0.7f)
        assertTrue("cor viva", hsv(p.botaoInicio)[1] >= 0.6f)
        assertEquals("botões opacos", 0xFF, p.botaoInicio ushr 24)
        assertTrue("véu da capa translúcido", (p.veu ushr 24) in 100..160)
    }

    @Test
    fun `cinza continua cinza e a conta e a mesma do painel`() {
        val p = TemaDaLauncher.paleta("#2B2B2B")!!
        assertTrue(hsv(p.botaoInicio)[1] < 0.5f)
        val ts = File("../../src/lib/temaLauncher.ts").readText()
        assertTrue(ts.contains("const viva = s < 0.12 ? s : Math.max(s, 0.62);"))
        assertTrue(ts.contains("botaoInicio: hsvParaHex(h, viva, 0.78)"))
    }

    @Test
    fun `a launcher aplica o tema em botoes, Menu, apps, pilulas e veu da capa`() {
        val l = File("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt").readText()
        assertTrue(l.contains("aplicarTema() // F-213"))
        for (trecho in listOf("TemaDaLauncher.botaoPrincipal(this, p)", "TemaDaLauncher.botaoDoMenu(this, p)", "TemaDaLauncher.pilula(this, p)",
                "TemaDaLauncher.gaveta(p)", "TemaDaLauncher.veu(p)", "TemaDaLauncher.botaoDoMenu(this@LauncherActivity, it, 18f)"))
            assertTrue(trecho, l.contains(trecho))
    }

    @Test
    fun `F-215 - selecao, selo App Oficial e telas dos Destaques na cor e formato some da TV`() {
        val p = TemaDaLauncher.paleta("#15803D")!!
        val base = hsv(0x15803D)
        for (c in listOf(p.brilho, p.verificado, p.tela)) assertEquals(base[0], hsv(c)[0], 3f)
        assertTrue("brilho bem claro", hsv(p.brilho)[2] > 0.95f)
        val tema = File("src/main/java/com/antigravity/player/launcher/TemaDaLauncher.kt").readText()
        assertTrue(tema.contains("forma(ctx, 36f, borda = alfa(p.brilho, 0x1A)"))
        assertTrue(!tema.contains("0x1A00D4FF"))
        val l = File("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt").readText()
        assertTrue(l.contains("TemaDaLauncher.seloOficial(this, p)") && l.contains("TemaDaLauncher.iconeVerificado(this, it)") && l.contains("vitrine.aplicarTema(p)"))
        val tela = File("src/main/res/layout/launcher_vitrine_tela.xml").readText()
        assertTrue("TV 16:9 / TOTEM 9:16 não aparecem na TV", tela.substringAfter("vitrine_formato").substringBefore("/>").contains("android:visibility=\"gone\""))
    }
}

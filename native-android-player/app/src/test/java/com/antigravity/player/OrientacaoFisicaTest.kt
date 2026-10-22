package com.antigravity.player

import com.antigravity.player.launcher.LauncherPolicy
import com.antigravity.player.util.OrientacaoDoAparelho
import com.antigravity.player.util.OrientacaoDoAparelho.Fonte
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** F-212 — orientação física do aparelho (TV em pé / totem) como autoridade única e o modo retrato 9:16. */
class OrientacaoFisicaTest {

    private fun ler(caminho: String) = File(caminho).readText()

    @Test
    fun `posicao fisica - painel manda, depois o aparelho, depois a ROM, senao fica a orientacao do sistema`() {
        assertEquals(OrientacaoDoAparelho.Estado(270, Fonte.PAINEL), OrientacaoDoAparelho.resolver(270, 0, 90))
        assertEquals(OrientacaoDoAparelho.Estado(0, Fonte.PAINEL), OrientacaoDoAparelho.resolver(0, 270, 270))
        assertEquals(OrientacaoDoAparelho.Estado(90, Fonte.APARELHO), OrientacaoDoAparelho.resolver(-1, 90, 270))
        assertEquals(OrientacaoDoAparelho.Estado(270, Fonte.ROM), OrientacaoDoAparelho.resolver(-1, -1, 270))
        val nada = OrientacaoDoAparelho.resolver(-1, null, null)
        assertEquals(Fonte.SISTEMA, nada.fonte)
        assertNull("sem configuração não se inventa posição", nada.emPe)
        assertEquals(true, OrientacaoDoAparelho.Estado(90, Fonte.APARELHO).emPe)
        assertEquals(false, OrientacaoDoAparelho.Estado(180, Fonte.ROM).emPe)
        assertNull("valor fora da régua não vale", OrientacaoDoAparelho.valida(45))
    }

    @Test
    fun `ROM de totem - propriedade ro_sobremidia_orientacao aceita graus e nomes`() {
        assertEquals(270, OrientacaoDoAparelho.lerValorDaRom("270"))
        assertEquals(270, OrientacaoDoAparelho.lerValorDaRom(" retrato "))
        assertEquals(270, OrientacaoDoAparelho.lerValorDaRom("TOTEM"))
        assertEquals(0, OrientacaoDoAparelho.lerValorDaRom("paisagem"))
        assertEquals(90, OrientacaoDoAparelho.lerValorDaRom("90"))
        assertNull(OrientacaoDoAparelho.lerValorDaRom(""))
        assertNull(OrientacaoDoAparelho.lerValorDaRom(null))
        assertNull(OrientacaoDoAparelho.lerValorDaRom("45"))
        val kit = ler("../../scripts/rom/montar-system.py")
        assertTrue(kit.contains("ro.sobremidia.orientacao={posicao}"))
        assertEquals("nomes iguais aos do painel", "Em pé — base à esquerda", OrientacaoDoAparelho.titulo(270))
    }

    @Test
    fun `Destaques em pe - TV 1 em cima, TV 2 embaixo dela e os 2 totens 9x16 lado a lado no fim`() {
        val largura = 672; val altura = 900; val vao = 12
        val m = LauncherPolicy.medidasDaVitrineEmPe(largura, altura, vao)
        assertEquals(4, m.size)
        for (tv in m.take(2)) assertEquals("TV 16:9", 16.0 / 9.0, tv.largura.toDouble() / tv.altura, 0.02)
        for (to in m.drop(2)) assertEquals("totem 9:16", 9.0 / 16.0, to.largura.toDouble() / to.altura, 0.02)
        assertEquals("TV 2 embaixo da TV 1 (mesma coluna)", m[0].x, m[1].x)
        assertTrue("TV 2 embaixo da TV 1", m[1].y >= m[0].y + m[0].altura)
        assertEquals("totens lado a lado", m[2].y, m[3].y)
        assertTrue("totens embaixo da TV 2", m[2].y >= m[1].y + m[1].altura)
        assertTrue("totem 2 à direita do totem 1", m[3].x >= m[2].x + m[2].largura)
        assertTrue("TV da largura dos 2 totens", Math.abs((m[3].x + m[3].largura - m[2].x) - m[0].largura) <= 2)
        assertTrue("cabe na largura", m[3].x + m[3].largura <= largura && m[0].x >= 0)
        assertTrue("cabe na altura", m[2].y + m[2].altura <= altura && m[0].y >= 0)
        // o maior possível: encosta na largura ou na altura, com sobra igual dos dois lados (centralizado)
        val sobraX = largura - (m[3].x + m[3].largura) - m[2].x
        val sobraY = altura - (m[2].y + m[2].altura) - m[0].y
        assertTrue("centralizado", Math.abs(sobraX) <= 2 && Math.abs(sobraY) <= 2)
        assertTrue("ocupa a largura ou a altura", m[0].x <= 2 || m[0].y <= 2)
        assertTrue(LauncherPolicy.medidasDaVitrineEmPe(0, 0, 12).all { it.largura == 0 })
    }

    @Test
    fun `launcher - em pe se arruma como celular e a posicao vem da autoridade unica`() {
        val l = ler("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt")
        assertTrue(l.contains("OrientacaoDoAparelho.transformacao(this, raiz.width, raiz.height"))
        assertTrue(l.contains("private fun organizar(retrato: Boolean)"))
        assertTrue("Destaques em grade quando em pé", l.contains("vitrine.emPe(retrato)"))
        assertTrue("apps em 3 colunas em pé", l.contains("spanCount = if (retrato) 3 else 6"))
        assertTrue("Posição da tela no Menu", l.contains("botao(R.id.launcher_menu_posicao) { escolherPosicao() }"))
        assertFalse("nenhum diálogo deitado numa TV em pé", l.contains("AlertDialog.Builder"))
        val xml = ler("src/main/res/layout/activity_launcher.xml")
        for (id in listOf("launcher_coluna", "launcher_topo", "launcher_botoes", "launcher_gaveta_funcoes", "launcher_menu_posicao"))
            assertTrue(id, xml.contains("@+id/$id"))
        assertTrue(ler("src/main/java/com/antigravity/player/launcher/VitrineDaLauncher.kt").contains("LauncherPolicy.medidasDaVitrineEmPe"))
    }

    @Test
    fun `telas de entrada e perguntas giram com a TV em pe`() {
        for (tela in listOf("SplashActivity", "LoginActivity", "ScreenSelectionActivity", "AparelhoDesvinculadoActivity"))
            assertTrue(tela, ler("src/main/java/com/antigravity/player/ui/$tela.kt").contains("OrientacaoDoAparelho.girarActivity(this)"))
        for (arq in listOf("ui/SplashActivity.kt", "ui/ScreenSelectionActivity.kt", "launcher/PerguntaLauncherActivity.kt")) {
            val t = ler("src/main/java/com/antigravity/player/$arq")
            assertTrue(arq, t.contains("CaixaNaTela.mostrar("))
            assertFalse(arq, t.contains("AlertDialog.Builder"))
        }
        val caixa = ler("src/main/java/com/antigravity/player/util/CaixaNaTela.kt")
        assertTrue("em pé a caixa é desenhada dentro da tela girada", caixa.contains("OrientacaoDoAparelho.aplicar(camada, t"))
        assertTrue("o que está atrás não rouba o foco", caixa.contains("FOCUS_BLOCK_DESCENDANTS"))
    }

    @Test
    fun `teclado em pe - com a tela girada o login usa o teclado proprio, desenhado dentro da tela em pe`() {
        val k = ler("src/main/java/com/antigravity/player/util/TecladoNaTela.kt")
        assertTrue("deitada fica o teclado do Android", k.contains("OrientacaoDoAparelho.transformacao(activity, content.width, content.height) ?: return"))
        assertTrue("o do Android não abre de lado", k.contains("campo.showSoftInputOnFocus = false"))
        assertTrue("gira junto com a tela", k.contains("OrientacaoDoAparelho.aplicar(camada, t, content.width, content.height)"))
        assertTrue("letras, números e símbolos", k.contains("\"qwertyuiop\"") && k.contains("\"1234567890\"") && k.contains("\"#+=\""))
        assertTrue(ler("src/main/java/com/antigravity/player/ui/LoginActivity.kt")
            .contains("TecladoNaTela.ligar(this, listOf(emailInput, passInput))"))
        assertTrue("o teclado do Android não abre sozinho com a tela girada",
            ler("src/main/java/com/antigravity/player/util/OrientacaoDoAparelho.kt").contains("SOFT_INPUT_STATE_ALWAYS_HIDDEN"))
    }

    @Test
    fun `Player - posicao do aparelho vale antes do painel e nunca e guardada como se fosse do painel`() {
        val main = ler("src/main/java/com/antigravity/player/MainActivity.kt")
        assertTrue(main.contains("rotacaoDoPainel ?: com.antigravity.player.util.OrientacaoDoAparelho.rotacaoSemPainel(applicationContext)"))
        assertFalse(main.contains(".putInt(PREF_ROTACAO_TELA, SessionManager.rotacaoTela ?: -1)"))
        assertTrue(main.contains("if (SessionManager.rotacaoVeioDoPainel) SessionManager.rotacaoTela ?: -1 else p.getInt(PREF_ROTACAO_TELA, -1)"))
        assertTrue(ler("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt")
            .contains("if (rotacao != null) SessionManager.rotacaoVeioDoPainel = true"))
    }
}

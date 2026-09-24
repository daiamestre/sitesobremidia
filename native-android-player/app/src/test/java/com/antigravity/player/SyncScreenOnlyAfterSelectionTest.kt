package com.antigravity.player

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * F-44: apos escolher a tela, o usuario via PISCAR uma tela preta com o logo da Sobre Midia (e depois um quadro
 * preto puro) ANTES da "Sincronizando Midias". Provado no emulador (dumpsys, abertura a frio):
 *   standbyImage VISIVEL (logo) + sync_guard_overlay GONE  ->  ambos GONE (~1,5 s)  ->  sync_guard VISIVEL.
 * Causa: `standbyImage` (logo sobre preto) nasce visivel no layout e o onCreate ainda a mostra de proposito
 * ("Show Standby initially"), enquanto a tela de sincronizacao nasce GONE e so e travada depois.
 * Regra do produto: depois de escolher a tela, so a tela "Sincronizando Midias" — nada antes, nada por cima.
 */
class SyncScreenOnlyAfterSelectionTest {
    private fun file(rel: String): String =
        listOf(rel, "app/$rel").map { File(it) }.first { it.isFile }.readText()

    private fun mainLayout() = file("src/main/res/layout/activity_main.xml")
    private fun syncLayout() = file("src/main/res/layout/sync_guard_screen.xml")
    private fun mainActivity() = file("src/main/java/com/antigravity/player/MainActivity.kt")

    private fun standbyTag(): String {
        val t = mainLayout()
        val a = t.indexOf("android:id=\"@+id/standbyImage\"")
        assertTrue(a >= 0)
        return t.substring(a, t.indexOf("/>", a))
    }

    @Test fun standbyLayer_hasNoLogo() =
        assertFalse("a tela preta com o logo foi removida", standbyTag().contains("@drawable/logo"))

    @Test fun standbyLayer_isNotVisibleByDefault() =
        assertFalse("standbyImage nao pode nascer visivel", standbyTag().contains("android:visibility=\"visible\""))

    @Test fun syncScreen_isVisibleFromTheFirstFrame() {
        val root = syncLayout().substringBefore("<LinearLayout")
        assertTrue("a tela de sincronizacao deve nascer visivel", root.contains("android:visibility=\"visible\""))
    }

    @Test fun onCreate_doesNotShowStandbyAtBoot() {
        val t = mainActivity()
        val a = t.indexOf("hideAllLayers()\n")
        val a2 = if (a >= 0) a else t.indexOf("hideAllLayers()\r\n")
        assertTrue(a2 >= 0)
        val b = t.indexOf("blockOverlay.visibility = View.GONE", a2)
        assertTrue(b > a2)
        assertFalse("o boot nao pode mostrar o logo de standby", t.substring(a2, b).contains("standbyImage.visibility = View.VISIBLE"))
    }

    @Test fun onCreate_locksTheSyncScreenBeforeTheFirstFrame() {
        val t = mainActivity()
        val a = t.indexOf("syncGuard = com.antigravity.player.util.SyncGuard(this)")
        assertTrue(a >= 0)
        assertTrue("o SyncGuard deve ser travado ja no onCreate", t.substring(a, a + 900).contains("syncGuard.lockScreen("))
    }

    @Test fun mainActivityWindow_matchesTheSyncScreenColor() {
        val manifest = file("src/main/AndroidManifest.xml")
        val a = manifest.indexOf("android:name=\".MainActivity\"")
        assertTrue(a >= 0)
        assertTrue("MainActivity deve usar o tema sem quadro preto", manifest.substring(a, a + 400).contains("@style/Theme.Player.Main"))
        val themes = file("src/main/res/values/themes.xml")
        val s = themes.indexOf("name=\"Theme.Player.Main\"")
        assertTrue(s >= 0)
        assertTrue(themes.substring(s, s + 300).contains("#0F172A"))
    }
}

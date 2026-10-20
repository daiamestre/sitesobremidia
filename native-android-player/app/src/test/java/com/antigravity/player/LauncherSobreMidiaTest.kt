package com.antigravity.player

import com.antigravity.player.launcher.LauncherPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** F-200 — launcher Sobre Mídia dentro do Player. */
class LauncherSobreMidiaTest {
    private val cfg = LauncherPolicy.Config()
    private val proprio = "com.antigravity.player"

    @Test
    fun `YouTube Netflix e apps de TV ficam fora, os outros aparecem`() {
        for ((p, n) in listOf(
            "com.google.android.youtube" to "YouTube", "com.google.android.youtube.tv" to "YouTube",
            "com.netflix.mediaclient" to "Netflix", "com.netflix.ninja" to "Netflix", "com.amazon.avod.thirdpartyclient" to "Prime Video",
            "com.disney.disneyplus" to "Disney+", "com.globo.globotv" to "Globoplay", "org.xbmc.kodi" to "Kodi",
            "br.com.qualquer.iptvplayer" to "IPTV Player", "com.exemplo.canais" to "TV ao vivo", "tv.pluto.android" to "Pluto TV"
        )) assertTrue("$n deveria estar oculto", LauncherPolicy.appOculto(p, n, cfg, proprio))
        for ((p, n) in listOf(
            "com.android.chrome" to "Chrome", "com.android.vending" to "Play Store", "com.google.android.googlequicksearchbox" to "Google", "com.whatsapp" to "WhatsApp",
            "com.estrongs.android.pop" to "ES File Explorer", "com.spotify.music" to "Spotify", "com.teamviewer.host.market" to "TeamViewer Host"
        )) assertFalse("$n deveria aparecer", LauncherPolicy.appOculto(p, n, cfg, proprio))
        assertTrue("o próprio Player é o cartão principal, não um app da lista", LauncherPolicy.appOculto(proprio, "Sobre Mídia Player", cfg, proprio))
    }

    @Test
    fun `o painel muda a lista e liberados vencem os ocultos`() {
        val c = LauncherPolicy.Config(appsOcultos = listOf("chrome"), appsLiberados = listOf("netflix"))
        assertTrue(LauncherPolicy.appOculto("com.android.chrome", "Chrome", c, proprio))
        assertFalse(LauncherPolicy.appOculto("com.netflix.mediaclient", "Netflix", c, proprio))
        assertFalse("regra inválida não derruba a launcher", LauncherPolicy.appOculto("a.b", "x", LauncherPolicy.Config(appsOcultos = listOf("re:([")), proprio))
    }

    @Test
    fun `le a resposta do servidor e cai no padrao quando ela e invalida`() {
        val json = """{"status":"OK","segundos_para_abrir_player":45,"minutos_de_uso_livre":10,"mostrar_relogio":true,
            "mostrar_clima":false,"mostrar_wifi":true,"apps_ocultos":["YouTube","re:\\btv\\b"],"apps_liberados":[],
            "fundo":[{"id":"f1","media_id":"m1","url":"https://x/v.mp4","tipo":"video","duracao_s":12,"hash":"abc123"},
                     {"id":"f2","media_id":"m2","url":"http://inseguro/i.jpg","tipo":"image","duracao_s":5,"hash":"z"}]}"""
        val c = LauncherPolicy.lerConfig(json)
        assertNotNull(c); c!!
        assertEquals(45, c.segundosParaAbrirPlayer)
        assertEquals(10, c.minutosDeUsoLivre)
        assertFalse(c.mostrarClima)
        assertEquals(listOf("youtube", "re:\\btv\\b"), c.appsOcultos)
        assertEquals("só https entra no fundo", 1, c.fundo.size)
        assertTrue(c.fundo[0].video)
        assertEquals("m1_abc123.mp4", c.fundo[0].arquivo)
        assertNull(LauncherPolicy.lerConfig("""{"status":"SEM_EMPRESA"}"""))
        assertNull(LauncherPolicy.lerConfig("lixo"))
        assertEquals("limites", 3600, LauncherPolicy.lerConfig("""{"status":"OK","segundos_para_abrir_player":99999}""")!!.segundosParaAbrirPlayer)
    }

    @Test
    fun `contagem so existe com o aparelho numa tela e uso livre tem fim`() {
        assertEquals(30, LauncherPolicy.contagemParaAbrirPlayer(true, cfg))
        assertNull(LauncherPolicy.contagemParaAbrirPlayer(false, cfg))
        assertEquals("abre sozinho em 30 s", LauncherPolicy.textoDaContagem(30))
        assertEquals("Toque para fazer login", LauncherPolicy.textoDaContagem(null))
        val fim = LauncherPolicy.fimDoUsoLivre(1_000L, 30)
        assertTrue(LauncherPolicy.usoLivreAtivo(fim, 1_000L + 29 * 60_000L))
        assertFalse(LauncherPolicy.usoLivreAtivo(fim, 1_000L + 30 * 60_000L))
    }

    @Test
    fun `a launcher nao libera o Player - sem login nao ha contagem e o cartao passa pelo login`() {
        assertNull(LauncherPolicy.contagemParaAbrirPlayer(false, LauncherPolicy.Config(segundosParaAbrirPlayer = 5)))
        val tela = File("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt").readText()
        val abrir = tela.substring(tela.indexOf("private fun abrirPlayer()")).substringBefore("// ----")
        assertTrue("abre pelo caminho normal (login → tela)", abrir.contains("Intent(this, SplashActivity::class.java)"))
        assertFalse("nunca abre o Player direto", abrir.contains("Intent(this, MainActivity::class.java)"))
        assertTrue("só traz para a frente o Player que já está aberto", abrir.contains("tarefa.moveToFront()"))
        assertTrue(tela.contains("logadoNumaTela = !tela.isNullOrBlank()"))
    }

    @Test
    fun `a tela inicial e a launcher e o Player continua abrindo pelo icone`() {
        val manifesto = File("src/main/AndroidManifest.xml").readText()
        val launcher = manifesto.substring(manifesto.indexOf("android:name=\".launcher.LauncherActivity\""))
        assertTrue(launcher.substringBefore("</activity>").contains("android.intent.category.HOME"))
        // grupo de janelas próprio: o ícone do Player abre o Player, não traz a launcher para a frente
        assertTrue(launcher.substringBefore("</activity>").contains("android:taskAffinity=\"com.antigravity.player.telainicial\""))
        val main = manifesto.substring(manifesto.indexOf("android:name=\".MainActivity\"")).substringBefore("/>")
        assertFalse("o Player deixou de ser a tela inicial", main.contains("category.HOME"))
        val splash = manifesto.substring(manifesto.indexOf("android:name=\".ui.SplashActivity\"")).substringBefore("</activity>")
        assertTrue("ícone do Player na launcher original continua", splash.contains("android.intent.category.LAUNCHER"))
        assertTrue(manifesto.contains("<queries>"))
    }

    @Test
    fun `visual futurista - 4 cartoes, logo maior e sem o nome da tela`() {
        val layout = File("src/main/res/layout/activity_launcher.xml").readText()
        for (id in listOf("launcher_cartao_player", "launcher_card_apps", "launcher_card_loja", "launcher_btn_ajustes")) {
            assertTrue(id, layout.contains("@+id/$id"))
        }
        assertEquals("só 4 cartões", 4, Regex("style=\"@style/LauncherCartao\"").findAll(layout).count())
        assertTrue("logo maior", layout.contains("android:id=\"@+id/launcher_logo\"") && layout.contains("android:layout_height=\"84dp\""))
        assertFalse("sem nome da tela ao lado do Player", layout.contains("launcher_status_tela"))
        assertTrue("apps dentro do cartão Aplicativos", layout.contains("@+id/launcher_gaveta"))
        assertEquals("com.android.vending", LauncherPolicy.LOJAS.first())
    }

    @Test
    fun `boot, vigia, uso livre e comandos estao ligados`() {
        val boot = File("src/main/java/com/antigravity/player/receiver/BootReceiver.kt").readText()
        assertTrue(boot.contains("launcher.ehPadrao(context)"))
        assertTrue("atualização volta direto ao Player", boot.contains("if (action != Intent.ACTION_MY_PACKAGE_REPLACED)"))
        val vigia = File("src/main/java/com/antigravity/player/service/SelfHealingService.kt").readText()
        assertTrue(vigia.contains("LauncherDoAparelho.vigiar(this)"))
        assertTrue(vigia.contains("LauncherDoAparelho.UsoLivre.ativo(this)"))
        val principal = File("src/main/java/com/antigravity/player/MainActivity.kt").readText()
        assertTrue(principal.contains("\"launcher_sobremidia\" ->"))
        assertTrue(principal.contains("\"launcher_original\" ->"))
        assertTrue(principal.contains("if (isKioskEnforced && !com.antigravity.player.launcher.LauncherDoAparelho.UsoLivre.ativo(this))"))
        val rede = File("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt").readText()
        val lista = rede.substringAfter("COMMAND_POLL_SAFE = listOf(").substringBefore(")")
        assertTrue(lista.contains("\"launcher_sobremidia\"") && lista.contains("\"launcher_original\""))
        assertTrue(rede.contains("rpc(\"fn_player_launcher\")"))
        val splash = File("src/main/java/com/antigravity/player/ui/SplashActivity.kt").readText()
        assertTrue(splash.contains("launcher.devePerguntar(applicationContext)"))
        assertTrue("quem não quer a launcher segue para o login", splash.contains(".setNegativeButton(\"Agora não\")"))
    }
}

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
        // F-203: o uso livre dura no máximo 1 minuto, mesmo que o painel diga 30
        val fim = LauncherPolicy.fimDoUsoLivre(1_000L, 30)
        assertTrue(LauncherPolicy.usoLivreAtivo(fim, 1_000L + 59_000L))
        assertFalse(LauncherPolicy.usoLivreAtivo(fim, 1_000L + 60_000L))
        assertEquals(60, LauncherPolicy.contagemParaAbrirPlayer(true, LauncherPolicy.Config(segundosParaAbrirPlayer = 3600)))
    }

    @Test
    fun `a launcher nao libera o Player - sem login nao ha contagem e o cartao passa pelo login`() {
        assertNull(LauncherPolicy.contagemParaAbrirPlayer(false, LauncherPolicy.Config(segundosParaAbrirPlayer = 5)))
        val tela = File("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt").readText()
        val abrir = tela.substring(tela.indexOf("private fun abrirPlayer()")).substringBefore("// ----")
        assertTrue("abre pelo caminho normal (login → tela)", abrir.contains("Intent(this, SplashActivity::class.java)"))
        // F-202: só traz para a frente o Player que JÁ está aberto (login feito); nunca abre o Player sem login
        assertTrue("Player direto só se já está aberto", abrir.indexOf("Intent(this, MainActivity::class.java)") > abrir.indexOf("if (MainActivity.viva) {"))
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
    fun `F-209 - visual - Destaques no centro, Player e Menu embaixo, selo Oficial e Menu com loja, ajustes e apps`() {
        val layout = File("src/main/res/layout/activity_launcher.xml").readText()
        for (id in listOf("launcher_cartao_player", "launcher_card_apps", "launcher_card_loja", "launcher_btn_ajustes", "launcher_btn_original",
            "launcher_capa", "launcher_capa_veu", "launcher_vitrine", "launcher_gaveta", "launcher_apps")) {
            assertTrue(id, layout.contains("@+id/$id"))
        }
        assertEquals("só 2 botões embaixo (Player e Menu)", 2, Regex("style=\"@style/LauncherBotaoBase\"").findAll(layout).count())
        assertFalse("sem os 4 cartões antigos", layout.contains("style=\"@style/LauncherCartao\""))
        assertTrue("selo Oficial no lugar de Launcher original", layout.contains("android:text=\"✓ Oficial\"") && !layout.contains("Launcher original"))
        val base = layout.substring(layout.indexOf("@+id/launcher_destaque"), layout.indexOf("@+id/launcher_gaveta"))
        assertTrue("Player e Menu abaixo dos Destaques", base.indexOf("launcher_vitrine") < base.indexOf("launcher_cartao_player"))
        val menu = layout.substring(layout.indexOf("@+id/launcher_gaveta"))
        assertTrue("Menu tem loja, Ajustes e apps", menu.contains("launcher_card_loja") && menu.contains("launcher_btn_ajustes") && menu.contains("launcher_apps"))
        val estilos = File("src/main/res/values/themes.xml").readText()
        assertTrue("retângulo quase quadrado", estilos.contains("<item name=\"android:layout_width\">232dp</item>") && estilos.contains("<item name=\"android:layout_height\">104dp</item>"))
        assertTrue(File("src/main/res/drawable/launcher_botao_player.xml").readText().contains("android:radius=\"30dp\""))
        assertTrue("cartão do Player com o ícone do app", layout.contains("android:src=\"@mipmap/ic_launcher_round\""))
        assertEquals("com.android.vending", LauncherPolicy.LOJAS.first())
    }

    @Test
    fun `F-209 - cor de fundo e capa vindas do painel`() {
        val cfg = LauncherPolicy.lerConfig("""{"status":"OK","fundo":[],"fundo_cor":"#1E3A8A","capa":{"media_id":"m1","url":"https://x/capa.png","hash":"h1"}}""")!!
        assertEquals("#1E3A8A", cfg.fundoCor)
        assertEquals("m1", cfg.capa?.mediaId)
        assertTrue(cfg.capa!!.arquivo.startsWith("capa_m1_h1"))
        val semNada = LauncherPolicy.lerConfig("""{"status":"OK","fundo":[]}""")!!
        assertEquals(null, semNada.fundoCor); assertEquals(null, semNada.capa)
        assertEquals("cor inválida vira padrão", null, LauncherPolicy.lerConfig("""{"status":"OK","fundo_cor":"azul"}""")!!.fundoCor)
        assertEquals("capa sem https é ignorada", null, LauncherPolicy.lerConfig("""{"status":"OK","capa":{"media_id":"m","url":"http://x"}}""")!!.capa)
        val config = File("src/main/java/com/antigravity/player/launcher/ConfigDaLauncher.kt").readText()
        assertTrue("a capa é baixada e apagada quando trocam", config.contains("listOfNotNull(cfg.capa?.let { it.arquivo to it.url })"))
        val launcher = File("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt").readText()
        assertTrue(launcher.contains("private fun aplicarFundoDaTela()") && launcher.contains("ConfigDaLauncher.capaPronta(this, config)"))
    }

    @Test
    fun `destaques Sobre Midia - 2 TVs 16x9 e 2 totens 9x16 cabem no cartao e cada midia vai para a sua tela`() {
        val m = LauncherPolicy.medidasDaVitrine(808, 420, 12)
        assertEquals(4, m.size)
        for (tv in m.take(2)) assertEquals("TV 16:9", 16.0 / 9.0, tv.largura.toDouble() / tv.altura, 0.02)
        for (to in m.drop(2)) assertEquals("totem 9:16", 9.0 / 16.0, to.largura.toDouble() / to.altura, 0.02)
        assertTrue("cabe na largura", m[3].x + m[3].largura <= 808)
        assertTrue("cabe na altura", m[2].y + m[2].altura <= 420)
        assertTrue("TV 2 embaixo da TV 1", m[1].y > m[0].y)
        assertTrue("totens à direita das TVs", m[2].x > m[0].x + m[0].largura && m[3].x > m[2].x + m[2].largura)
        assertTrue(LauncherPolicy.medidasDaVitrine(0, 0, 12).all { it.largura == 0 })
        val c = LauncherPolicy.lerConfig("""{"status":"OK","fundo":[
            {"id":"a","media_id":"m1","url":"https://x/1.mp4","tipo":"video","duracao_s":8,"hash":"h1","vitrine":"totem2"},
            {"id":"b","media_id":"m2","url":"https://x/2.jpg","tipo":"image","duracao_s":8,"hash":"h2"},
            {"id":"c","media_id":"m3","url":"https://x/3.jpg","tipo":"image","duracao_s":8,"hash":"h3","vitrine":"invalida"}]}""")!!
        assertEquals(listOf("totem2", "tv1", "tv1"), c.fundo.map { it.vitrine })
        val layout = File("src/main/res/layout/activity_launcher.xml").readText()
        assertTrue(layout.contains("Destaques Sobre Mídia") && layout.contains("com.antigravity.player.launcher.VitrineLayout"))
        assertFalse("o título antigo saiu", layout.contains("Destaques dos pontos parceiros"))
        val vitrine = File("src/main/java/com/antigravity/player/launcher/VitrineDaLauncher.kt").readText()
        assertTrue("um vídeo de cada vez (TV Box fraca)", vitrine.contains("filaDeVideo") && vitrine.contains("if (!ativa || telaDoVideo != null) return"))
    }

    @Test
    fun `ROM Sobre Midia - app de sistema atualiza sem toque e sem root, launcher ja nasce escolhida`() {
        assertEquals(com.antigravity.player.util.OtaPolicy.ModoDeInstalacao.APP_DE_SISTEMA,
            com.antigravity.player.util.OtaPolicy.modoDeInstalacao(donoDoAparelho = false, temRoot = true, appDeSistema = true))
        assertEquals(com.antigravity.player.util.OtaPolicy.ModoDeInstalacao.ROOT,
            com.antigravity.player.util.OtaPolicy.modoDeInstalacao(donoDoAparelho = false, temRoot = true))
        assertEquals(com.antigravity.player.util.OtaPolicy.ModoDeInstalacao.DONO_DO_APARELHO,
            com.antigravity.player.util.OtaPolicy.modoDeInstalacao(donoDoAparelho = true, temRoot = true, appDeSistema = true))
        assertTrue(File("src/main/AndroidManifest.xml").readText().contains("android.permission.INSTALL_PACKAGES"))
        val l = File("src/main/java/com/antigravity/player/launcher/LauncherDoAparelho.kt").readText()
        assertTrue(l.contains("\"ro.sobremidia.rom\"") && l.contains("&& !ehRomSobreMidia()"))
        assertTrue("respeita quem voltou para a original", l.contains("if (!ehRomSobreMidia() || prefs(ctx).getBoolean(K_PERGUNTADO, false)) return"))
        assertTrue(File("src/main/java/com/antigravity/player/receiver/BootReceiver.kt").readText().contains("launcher.aplicarRom("))
    }

    @Test
    fun `a pergunta da launcher so aparece ao abrir o app pelo icone e ao sair do app, nunca sozinha`() {
        val l = File("src/main/java/com/antigravity/player/launcher/LauncherDoAparelho.kt").readText()
        assertTrue("só enquanto não é a tela inicial nem foi escolhida", l.contains("fun deveOferecer(ctx: Context): Boolean = !ehPadrao(ctx) && !escolhida(ctx) && !ehRomSobreMidia()"))
        assertTrue("abertura pelo ícone", l.contains("intent.action == Intent.ACTION_MAIN && intent.hasCategory(Intent.CATEGORY_LAUNCHER)"))
        val splash = File("src/main/java/com/antigravity/player/ui/SplashActivity.kt").readText()
        assertTrue(splash.contains("if (!launcher.devePerguntar(applicationContext) || !launcher.aberturaPeloUsuario(intent)) { rotear(); return }"))
        val semResposta = splash.substring(splash.lastIndexOf("if (exibindo) {"), splash.indexOf("private fun rotear()"))
        assertFalse("sem resposta não escolhe nada sozinho", semResposta.contains("tornarPadraoEmSilencio"))
        val pergunta = File("src/main/java/com/antigravity/player/launcher/PerguntaLauncherActivity.kt").readText()
        assertTrue("só se a pessoa saiu de verdade (nenhuma tela do app na frente)", pergunta.contains("if (TelasNaFrente.alguma() || !LauncherDoAparelho.deveOferecer(app)) return@postDelayed"))
        assertTrue("só a tecla Home/Recentes conta como sair (telas que o Player abre não)", pergunta.contains("motivo == \"homekey\" || motivo == \"recentapps\""))
        val principal = File("src/main/java/com/antigravity/player/MainActivity.kt").readText()
        assertTrue("Player com quiosque ligado não pergunta", principal.contains("VigiaDaSaida(applicationContext) { !isKioskEnforced }"))
        assertFalse(principal.contains("override fun onUserLeaveHint()"))
        for (tela in listOf("LoginActivity", "ScreenSelectionActivity")) {
            val src = File("src/main/java/com/antigravity/player/ui/$tela.kt").readText()
            assertTrue(tela, src.contains("VigiaDaSaida(applicationContext) { true }") && src.contains("vigiaDaSaida.ligar()") && src.contains("vigiaDaSaida.desligar()"))
        }
        assertTrue("fecha a pergunta sem deixar janela presa", pergunta.contains("try { dialogo?.dismiss() }"))
        assertTrue("o quiosque não conta como abrir pelo ícone", File("src/main/java/com/antigravity/player/service/SelfHealingService.kt").readText().contains("EXTRA_SEM_PERGUNTA, true"))
        assertFalse("Home não mostra a pergunta", File("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt").readText().contains("aoSairDoApp"))
    }

    @Test
    fun `Home no Player vai para a launcher Sobre Midia e trazer o Player para a frente nao refaz a sincronizacao`() {
        val principal = File("src/main/java/com/antigravity/player/MainActivity.kt").readText()
        val quiosque = principal.substring(principal.indexOf("// [KIOSK LOCK] Lost focus"), principal.indexOf("override fun onAttachedToWindow()"))
        // F-206: perder o foco nunca puxa o Player de volta (nada de moveTaskToFront/startActivity aqui)
        assertFalse(quiosque.contains("moveTaskToFront"))
        assertFalse(quiosque.contains("startActivity("))
        assertTrue("saiu da tela: livre por 1 minuto", quiosque.contains("liberarSaidaDoPlayer()"))
        assertTrue("a volta de 1 minuto só traz para a frente", principal.substring(principal.indexOf("private fun voltarDepoisDoLimite()")).substring(0, 600).contains("putExtra(EXTRA_SO_TRAZER_PARA_FRENTE, true)"))
        val novoIntent = principal.substring(principal.indexOf("override fun onNewIntent(intent: Intent?)"))
        assertTrue("sem 'Sincronizando mídias' ao só trazer para a frente",
            novoIntent.indexOf("EXTRA_SO_TRAZER_PARA_FRENTE, false) == true") in 1 until novoIntent.indexOf("checkLocalCacheAndPlay()"))
        val launcher = File("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt").readText()
        assertTrue(launcher.contains("naFrente = true") && launcher.contains("naFrente = false"))
        assertTrue("a contagem da launcher só traz o Player aberto", launcher.contains("if (MainActivity.viva) {"))
    }

    @Test
    fun `F-208 - 1o e 2o Home voltam logo (toque acidental), 3o seguido deixa livre 60 s`() {
        assertEquals(1, LauncherPolicy.contarHome(0, 0L, 10_000L))
        assertEquals(2, LauncherPolicy.contarHome(1, 10_000L, 20_000L))
        assertEquals(3, LauncherPolicy.contarHome(2, 20_000L, 30_000L))
        assertEquals("depois do 3º recomeça", 1, LauncherPolicy.contarHome(3, 30_000L, 35_000L))
        assertEquals("mais de 1 minuto entre eles recomeça", 1, LauncherPolicy.contarHome(2, 20_000L, 81_000L))
        assertEquals(LauncherPolicy.VOLTA_RAPIDA_S, LauncherPolicy.voltaDoPlayerEmSegundos(1))
        assertEquals(LauncherPolicy.VOLTA_RAPIDA_S, LauncherPolicy.voltaDoPlayerEmSegundos(2))
        assertEquals(60, LauncherPolicy.voltaDoPlayerEmSegundos(3))
        assertTrue(LauncherPolicy.VOLTA_RAPIDA_S in 1..5)
        // contagem da launcher: a volta pedida (1º/2º Home) ou, no máximo, 1 minuto depois da saída; sem Player fora, o painel
        assertEquals(3, LauncherPolicy.contagemDaLauncher(1_000L, 1_000L, 30, voltaPedidaAteMs = 4_000L))
        assertEquals(60, LauncherPolicy.contagemDaLauncher(1_000L, 1_000L, 30))
        assertEquals(31, LauncherPolicy.contagemDaLauncher(1_000L, 30_000L, 5))
        assertEquals(30, LauncherPolicy.contagemDaLauncher(null, 30_000L, 30))
        assertEquals(60, LauncherPolicy.segundosAteVoltaObrigatoria(0L, 0L))
        assertEquals(0, LauncherPolicy.segundosAteVoltaObrigatoria(0L, 61_000L))
        val principal = File("src/main/java/com/antigravity/player/MainActivity.kt").readText()
        assertTrue(principal.contains("if (motivo != \"homekey\" || !isKioskEnforced) return"))
        val home = principal.substring(principal.indexOf("private val contadorDeHome"), principal.indexOf("private val vigiaDaSaida"))
        assertTrue("3º Home: 1 minuto livre", home.indexOf("liberarSaidaDoPlayer()") > home.indexOf("HOMES_PARA_FICAR_LIVRE"))
        assertTrue("1º/2º Home: volta rápida", home.contains("voltaRapida.postDelayed({ voltarDepoisDoLimite() }, volta * 1000L)"))
        assertTrue("a saída do 1º/2º Home não vira 1 minuto", home.contains("System.currentTimeMillis() - voltaRapidaPedidaEm < 5_000L"))
        val launcher = File("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt").readText()
        assertTrue(launcher.contains("LauncherDoAparelho.voltaPedidaAteMs"))
        val vigia = File("src/main/java/com/antigravity/player/service/SelfHealingService.kt").readText()
        assertTrue("o vigia não puxa antes do minuto", vigia.contains("System.currentTimeMillis() - saiuEm < com.antigravity.player.launcher.LauncherPolicy.MAX_FORA_DO_PLAYER_MS"))
        assertTrue(principal.contains("voltaObrigatoria.postDelayed({ voltarDepoisDoLimite() }, com.antigravity.player.launcher.LauncherPolicy.MAX_FORA_DO_PLAYER_MS)"))
    }

    @Test
    fun `F-208 - fora da tela o Player pausa e na volta recria o motor de video (sem tela preta)`() {
        val principal = File("src/main/java/com/antigravity/player/MainActivity.kt").readText()
        val parar = principal.substringAfter("override fun onStop()").substringBefore("override fun onRestart()")
        assertTrue(parar.contains("pausarMotorForaDaTela()") && parar.contains("playbackLoopJob?.cancel()") && parar.contains("cancelPlaybackWatchdogAlarm()"))
        val voltar = principal.substringAfter("override fun onRestart()").substringBefore("override fun onNewIntent")
        assertTrue(voltar.contains("reiniciarMotorDeVideo()"))
        assertTrue("vigia não mexe com o Player fora da tela", principal.contains("if (!naFrente || motorPausadoForaDaTela) return"))
    }

    @Test
    fun `F-208 - navegacao da launcher sem animacao nem sombra (fluida na TV Box)`() {
        val launcher = File("src/main/java/com/antigravity/player/launcher/LauncherActivity.kt").readText()
        assertFalse(launcher.contains(".animate().scaleX("))
        assertTrue(launcher.contains("lista.itemAnimator = null"))
        assertTrue(File("src/main/res/values/themes.xml").readText().contains("<item name=\"android:elevation\">0dp</item>"))
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

    @Test
    fun `F-204 - painel e logo chegam sem APK, abertura pergunta uma vez e a saida pergunta por 40 s`() {
        val base = "src/main/java/com/antigravity/player/"
        val launcher = File(base + "launcher/LauncherActivity.kt").readText()
        // mídias do painel e logo: ao abrir e a cada 1 min com a launcher na tela; o Player prepara a cada 5 min
        assertTrue(launcher.contains("principal.postDelayed(this, ConfigDaLauncher.CONFERIR_VISIVEL_A_CADA_MS)"))
        assertEquals(60_000L, com.antigravity.player.launcher.ConfigDaLauncher.CONFERIR_VISIVEL_A_CADA_MS)
        assertEquals(5 * 60_000L, com.antigravity.player.launcher.ConfigDaLauncher.PREPARAR_A_CADA_MS)
        val principal = File(base + "MainActivity.kt").readText()
        assertTrue(principal.contains("iniciarPreparoDaLauncher()") && principal.contains("ConfigDaLauncher.atualizar(applicationContext)"))
        // todas as logos da launcher viram a da empresa (topo, telas vazias dos Destaques, cartão do Player)
        assertTrue(launcher.contains("MarcaDoGestor.aplicarLogo(this, findViewById(R.id.launcher_logo), bmp = logo)"))
        assertTrue(launcher.contains("MarcaDoGestor.aplicarLogo(this, findViewById(R.id.launcher_icone_app), R.mipmap.ic_launcher_round, logo)"))
        assertTrue(launcher.contains("vitrine.aplicarMarca(logo)"))
        assertTrue("sem logo da empresa fica a da Sobre Mídia", File(base + "util/MarcaDoGestor.kt").readText().contains("imageView.setImageResource(padrao)"))
        // abertura pelo ícone: pergunta só até decidir
        val l = File(base + "launcher/LauncherDoAparelho.kt").readText()
        assertTrue(l.contains("fun devePerguntar(ctx: Context): Boolean = deveOferecer(ctx) && !prefs(ctx).getBoolean(K_PERGUNTADO, false)"))
        // aceitar: launcher vira a tela inicial, aparece e abre o Player em seguida
        val splash = File(base + "ui/SplashActivity.kt").readText()
        val usar = splash.substringAfter("setPositiveButton(\"Usar a launcher Sobre Mídia\")").substringBefore("setNegativeButton")
        assertTrue(usar.contains("EXTRA_PEDIR_PADRAO, true") && usar.contains("EXTRA_ABRIR_PLAYER, true"))
        assertFalse("aceitar não pula a launcher", usar.contains("rotear()"))
        // recusar: só o Player (login), sem launcher
        val agoraNao = splash.substringAfter("setNegativeButton(\"Agora não\")").substringBefore(".setCancelable")
        assertTrue(agoraNao.contains("marcarPerguntado") && agoraNao.contains("rotear()") && !agoraNao.contains("LauncherActivity"))
        assertTrue(launcher.contains("private fun seguirParaOPlayer()"))
        // 3º Home: quem usa a launcher original recebe a pergunta (não a launcher Sobre Mídia); quem usa a Sobre Mídia não
        val home = principal.substringAfter("private val contadorDeHome").substringBefore("private val vigiaDaSaida")
        assertTrue(home.contains("if (launcher.deveOferecer(applicationContext)) {") && home.contains("PerguntaLauncherActivity.aoSairDoApp(applicationContext)"))
        // a pergunta da saída fica no máximo 40 s
        assertEquals(40_000L, com.antigravity.player.launcher.PerguntaLauncherActivity.TEMPO_NA_TELA_MS)
        val pergunta = File(base + "launcher/PerguntaLauncherActivity.kt").readText()
        assertTrue(pergunta.contains("}, TEMPO_NA_TELA_MS)") && !pergunta.contains("20_000)"))
    }
}

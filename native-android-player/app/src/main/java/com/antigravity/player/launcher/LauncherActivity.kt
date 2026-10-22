package com.antigravity.player.launcher

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.drawable.Drawable
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.Player
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.antigravity.core.util.Logger
import com.antigravity.player.MainActivity
import com.antigravity.player.R
import com.antigravity.player.di.ServiceLocator
import com.antigravity.player.ui.SplashActivity
import com.antigravity.player.util.DeviceTypeUtil
import com.antigravity.player.util.MarcaDoGestor
import com.antigravity.player.util.PlayerFlowPolicy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * F-200 — launcher Sobre Mídia: a tela inicial do aparelho quando o dono escolhe usá-la.
 *
 * Mostra a logo do gestor ("Minha Marca"), hora, clima e rede, as mídias de fundo escolhidas pelo dono/ADM, o Player
 * Sobre Mídia em destaque (abre sozinho depois de N segundos sem ninguém mexer, se o aparelho já está numa tela) e os
 * outros aplicativos — menos YouTube, Netflix e apps de TV. Abrir um app daqui libera o "uso livre": o Player não
 * puxa a tela de volta durante os minutos definidos no painel.
 */
class LauncherActivity : AppCompatActivity() {

    data class AppDaLauncher(val pacote: String, val nome: String, val icone: Drawable?)

    private val principal = Handler(Looper.getMainLooper())
    private lateinit var config: LauncherPolicy.Config
    private lateinit var quadro: View
    private lateinit var vitrine: VitrineDaLauncher
    private lateinit var cartaoPlayer: View
    private lateinit var contagemTexto: TextView
    private lateinit var gaveta: View
    private lateinit var appsTotal: TextView
    private lateinit var climaTexto: TextView
    private lateinit var redeTexto: TextView
    private lateinit var btnPadrao: View
    private lateinit var lista: RecyclerView
    private lateinit var semApps: View
    private val adaptador = Adaptador()

    private var logadoNumaTela = false
    private var restante: Int? = null
    private var aguardandoEscolhaDePadrao = false
    private var ofereceuModoForcado = false

    private var assinaturaDoFundo: List<String>? = null

    private val pedidoDePadrao = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        conferirEscolhaDePadrao()
    }

    private val mudancaDeApps = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) { carregarApps() }
    }

    // ------------------------------------------------------------------ ciclo de vida

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ServiceLocator.init(applicationContext)
        setContentView(R.layout.activity_launcher)
        quadro = findViewById(R.id.launcher_quadro)
        vitrine = VitrineDaLauncher(this, findViewById(R.id.launcher_vitrine))
        cartaoPlayer = findViewById(R.id.launcher_cartao_player)
        contagemTexto = findViewById(R.id.launcher_contagem)
        gaveta = findViewById(R.id.launcher_gaveta)
        appsTotal = findViewById(R.id.launcher_apps_total)
        // as mídias do destaque ficam dentro dos cantos arredondados do cartão
        findViewById<View>(R.id.launcher_destaque).clipToOutline = true
        climaTexto = findViewById(R.id.launcher_clima)
        redeTexto = findViewById(R.id.launcher_rede)
        btnPadrao = findViewById(R.id.launcher_btn_padrao)
        semApps = findViewById(R.id.launcher_sem_apps)
        lista = findViewById(R.id.launcher_apps)
        lista.layoutManager = GridLayoutManager(this, 6)
        lista.itemAnimator = null // F-208: sem animação ao (re)carregar a lista de apps
        lista.setHasFixedSize(true)
        lista.adapter = adaptador

        config = ConfigDaLauncher.atual(this)
        cartaoPlayer.setOnClickListener { abrirPlayer() }
        realce(cartaoPlayer, 1.06f)
        botao(R.id.launcher_btn_ajustes) { abrirAjustes(Settings.ACTION_SETTINGS) }
        botao(R.id.launcher_rede) { abrirAjustes(Settings.ACTION_WIFI_SETTINGS) }
        botao(R.id.launcher_card_apps) { abrirGaveta() }
        botao(R.id.launcher_card_loja) { abrirLoja() }
        botao(R.id.launcher_gaveta_voltar) { fecharGaveta() }
        botao(R.id.launcher_btn_original) { perguntarLauncherOriginal() }
        botao(R.id.launcher_btn_padrao) { pedirParaSerPadrao() }

        try {
            registerReceiver(mudancaDeApps, IntentFilter().apply {
                addAction(Intent.ACTION_PACKAGE_ADDED); addAction(Intent.ACTION_PACKAGE_REMOVED)
                addAction(Intent.ACTION_PACKAGE_CHANGED); addDataScheme("package")
            })
        } catch (e: Exception) { Logger.w("LAUNCHER", "apps: ${e.message}") }

        quadro.post { aplicarRotacao() }
        if (intent?.getBooleanExtra(EXTRA_ABRIR_PLAYER, false) == true) marcarAbrirPlayerDepois()
        if (intent?.getBooleanExtra(EXTRA_PEDIR_PADRAO, false) == true) principal.postDelayed({ pedirParaSerPadrao() }, 600)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        // Home de novo: volta ao começo (foco no Player, contagem do início)
        gaveta.visibility = View.GONE
        lista.scrollToPosition(0)
        cartaoPlayer.requestFocus()
        reiniciarContagem()
        if (intent?.getBooleanExtra(EXTRA_ABRIR_PLAYER, false) == true) marcarAbrirPlayerDepois()
        if (intent?.getBooleanExtra(EXTRA_PEDIR_PADRAO, false) == true) pedirParaSerPadrao()
    }

    /**
     * F-204: a pessoa aceitou a launcher ao abrir o app — depois de resolver a tela inicial, a launcher aparece um instante
     * e o Player abre sozinho (login → escolha da tela, ou a tela que já toca).
     */
    private fun marcarAbrirPlayerDepois() { abrirPlayerDepoisAte = System.currentTimeMillis() + 3 * 60_000L }
    private fun seguirParaOPlayer() {
        if (abrirPlayerDepoisAte < System.currentTimeMillis()) return
        abrirPlayerDepoisAte = 0L
        Handler(Looper.getMainLooper()).postDelayed({ abrirPlayer() }, 1_500)
    }

    override fun onResume() {
        super.onResume()
        naFrente = true
        telaCheia()
        config = ConfigDaLauncher.atual(this)
        aplicarMarca()
        lerEstadoDoPlayer()
        aplicarConfig()
        carregarApps()
        atualizarFundo(reiniciar = true)
        cartaoPlayer.requestFocus()
        reiniciarContagem()
        principal.post(relogio)
        btnPadrao.visibility = if (LauncherDoAparelho.ehPadrao(this)) View.GONE else View.VISIBLE
        if (aguardandoEscolhaDePadrao) conferirEscolhaDePadrao()
        else if (LauncherDoAparelho.ehPadrao(this)) seguirParaOPlayer()
        conferirPainel.run()
    }

    /**
     * F-204: o que o dono/ADM muda no painel (Destaques, apps ocultos, contagem) e a logo da empresa chegam sozinhos —
     * ao abrir e a cada 1 minuto com a launcher na tela. Sem APK novo.
     */
    private val conferirPainel = object : Runnable {
        override fun run() {
            principal.removeCallbacks(this)
            lifecycleScope.launch {
                try {
                    if (ConfigDaLauncher.atualizar(this@LauncherActivity)) {
                        config = ConfigDaLauncher.atual(this@LauncherActivity)
                        aplicarConfig()
                        carregarApps()
                        atualizarFundo(reiniciar = false)
                    }
                } catch (e: Throwable) { Logger.w("LAUNCHER", "painel: ${e.message}") }
                if (try { MarcaDoGestor.atualizar(this@LauncherActivity) } catch (e: Throwable) { false }) aplicarMarca()
                atualizarClima()
            }
            principal.postDelayed(this, ConfigDaLauncher.CONFERIR_VISIVEL_A_CADA_MS)
        }
    }

    /** F-204: todas as logos da launcher (topo, telas vazias dos Destaques e o cartão do Player) viram a da empresa. */
    private fun aplicarMarca() {
        val logo = MarcaDoGestor.logo(this)
        MarcaDoGestor.aplicarLogo(this, findViewById(R.id.launcher_logo), bmp = logo)
        MarcaDoGestor.aplicarLogo(this, findViewById(R.id.launcher_icone_app), R.mipmap.ic_launcher_round, logo)
        vitrine.aplicarMarca(logo)
    }

    override fun onPause() {
        super.onPause()
        naFrente = false
        principal.removeCallbacksAndMessages(null)
        vitrine.parar() // o decodificador fica livre para o Player
        assinaturaDoFundo = null
    }

    override fun onDestroy() {
        try { unregisterReceiver(mudancaDeApps) } catch (e: Exception) { }
        super.onDestroy()
    }

    @SuppressLint("MissingSuperCall")
    @Suppress("DEPRECATION")
    override fun onBackPressed() { // é a tela inicial: "voltar" só fecha o painel de aplicativos
        if (gaveta.visibility == View.VISIBLE) fecharGaveta() else reiniciarContagem()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) reiniciarContagem()
        return super.dispatchKeyEvent(event)
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.action == MotionEvent.ACTION_DOWN) reiniciarContagem()
        return super.dispatchTouchEvent(ev)
    }

    private fun telaCheia() {
        try {
            WindowCompat.getInsetsController(window, window.decorView).apply {
                hide(WindowInsetsCompat.Type.systemBars())
                systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } catch (e: Exception) { }
    }

    /** Totem / TV em pé: a launcher gira igual ao Player (mesma regra e mesma rotação escolhida no painel). */
    private fun aplicarRotacao() {
        val raiz = findViewById<View>(R.id.launcher_raiz)
        if (raiz.width <= 0 || raiz.height <= 0) { raiz.post { aplicarRotacao() }; return }
        val p = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
        val rotacao = p.getInt("rotacao_tela", -1).takeIf { it in setOf(0, 90, 180, 270) }
        val t = PlayerFlowPolicy.tvCanvasTransform(
            isTelevision = DeviceTypeUtil.isTelevision(applicationContext),
            canonicalOrientation = p.getString("current_orientation", null),
            displayWidth = raiz.width,
            displayHeight = raiz.height,
            giroGraus = if (p.getInt("giro_do_quadro", 90) == 270) 270 else 90,
            rotacaoTela = rotacao
        )
        val lp = quadro.layoutParams
        lp.width = t?.width ?: ViewGroup.LayoutParams.MATCH_PARENT
        lp.height = t?.height ?: ViewGroup.LayoutParams.MATCH_PARENT
        quadro.layoutParams = lp
        quadro.rotation = t?.rotation ?: 0f
        quadro.translationX = t?.translationX ?: 0f
        quadro.translationY = t?.translationY ?: 0f
    }

    // ------------------------------------------------------------------ Player e contagem

    private fun lerEstadoDoPlayer() {
        val p = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
        val tela = p.getString("saved_screen_id", null)
        logadoNumaTela = !tela.isNullOrBlank()
    }

    /** F-206: quando o Player (aberto, com tela) saiu da frente; null = Player não está fora (ex.: launcher ao ligar). */
    private fun saidaDoPlayer(): Long? =
        if (logadoNumaTela && MainActivity.viva && !MainActivity.naFrente && MainActivity.pausouEm > 0L) MainActivity.pausouEm else null

    private fun reiniciarContagem() {
        restante = LauncherPolicy.contagemDaLauncher(saidaDoPlayer(), System.currentTimeMillis(),
            LauncherPolicy.contagemParaAbrirPlayer(logadoNumaTela, config), LauncherDoAparelho.voltaPedidaAteMs)
        contagemTexto.text = LauncherPolicy.textoDaContagem(restante)
    }

    private val relogio = object : Runnable {
        override fun run() {
            // F-208: o Player saiu pelo Home — volta logo (1º e 2º Home, toque acidental) ou em 1 minuto (3º Home seguido);
            // mexer na launcher não adianta nem atrasa
            saidaDoPlayer()?.let { saiu ->
                val s = LauncherPolicy.contagemDaLauncher(saiu, System.currentTimeMillis(), null, LauncherDoAparelho.voltaPedidaAteMs) ?: 0
                restante = s
                contagemTexto.text = LauncherPolicy.textoDaContagem(s)
                if (s <= 0) { restante = null; abrirPlayer(); return }
                atualizarRede()
                principal.postDelayed(this, 1000)
                return
            }
            restante?.let { s ->
                val novo = s - 1
                restante = novo
                contagemTexto.text = LauncherPolicy.textoDaContagem(novo)
                if (novo <= 0) { restante = null; abrirPlayer(); return }
            }
            atualizarRede()
            principal.postDelayed(this, 1000)
        }
    }

    /**
     * Leva ao Player: se ele já está aberto (login feito e tela escolhida), traz para a frente; senão abre pelo caminho
     * normal do Player (SplashActivity → login → escolha da tela). A launcher NUNCA abre o Player sem login.
     */
    private fun abrirPlayer() {
        LauncherDoAparelho.UsoLivre.encerrar(this)
        try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val tarefa = am.appTasks.firstOrNull {
                (it.taskInfo.baseActivity ?: it.taskInfo.baseIntent?.component)?.className == MainActivity::class.java.name
            }
            if (tarefa != null) { tarefa.moveToFront(); return }
        } catch (e: Exception) { }
        // F-202: Player aberto — só traz para a frente (sem "Sincronizando mídias")
        if (MainActivity.viva) {
            startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_SO_TRAZER_PARA_FRENTE, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        }
        startActivity(Intent(this, SplashActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // ------------------------------------------------------------------ aparelho

    private fun botao(id: Int, acao: () -> Unit) {
        findViewById<View>(id).apply { setOnClickListener { acao() }; realce(this, 1.06f) }
    }

    /**
     * F-208: navegação fluida no controle remoto — o foco aparece NA HORA pela borda ciano do próprio fundo (estado
     * focado). Antes cada troca de cartão animava a escala por 120 ms com sombra: na TV Box (GPU fraca) a navegação ficava
     * lenta e com efeito de transição. [escala] fica só como compatibilidade (não anima mais).
     */
    @Suppress("UNUSED_PARAMETER")
    private fun realce(v: View, escala: Float) {
        v.onFocusChangeListener = null
    }

    private fun abrirAjustes(acao: String) {
        LauncherDoAparelho.UsoLivre.liberar(this, config.minutosDeUsoLivre)
        val i = Intent(acao).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { startActivity(i) } catch (e: Exception) {
            try { startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            catch (e2: Exception) { Toast.makeText(this, "Ajustes indisponíveis neste aparelho", Toast.LENGTH_LONG).show() }
        }
    }

    private fun perguntarLauncherOriginal() {
        val opcoes = arrayOf("Abrir a launcher original agora", "Usar a launcher original como padrão", "Cancelar")
        AlertDialog.Builder(this)
            .setTitle("Launcher original")
            .setItems(opcoes) { _, qual ->
                when (qual) {
                    0 -> if (!LauncherDoAparelho.abrirOriginal(this, config.minutosDeUsoLivre))
                        Toast.makeText(this, "Nenhuma outra launcher encontrada neste aparelho", Toast.LENGTH_LONG).show()
                    1 -> AlertDialog.Builder(this)
                        .setTitle("Voltar para a launcher original?")
                        .setMessage("A launcher Sobre Mídia deixa de ser a tela inicial. O Player continua igual (abre pelo ícone dele). " +
                            "Para usar a launcher Sobre Mídia de novo, responda \"Usar\" quando o Player perguntar (ao abrir ou sair dele) " +
                            "ou use o comando \"Launcher Sobre Mídia\" no painel.")
                        .setPositiveButton("Voltar para a original") { _, _ ->
                            LauncherDoAparelho.usarOriginalComoPadrao(this)
                            LauncherDoAparelho.abrirOriginal(this, config.minutosDeUsoLivre)
                            finish()
                        }
                        .setNegativeButton("Cancelar", null)
                        .show()
                }
            }
            .show()
    }

    private fun pedirParaSerPadrao() {
        lifecycleScope.launch {
            val pronto = withContext(Dispatchers.IO) { LauncherDoAparelho.tornarPadraoEmSilencio(applicationContext) }
            if (pronto) {
                btnPadrao.visibility = View.GONE
                Toast.makeText(this@LauncherActivity, "Pronto: a launcher Sobre Mídia é a tela inicial", Toast.LENGTH_LONG).show()
                seguirParaOPlayer()
                return@launch
            }
            val i = LauncherDoAparelho.intencaoParaPedir(this@LauncherActivity)
            aguardandoEscolhaDePadrao = true
            if (i == null) { conferirEscolhaDePadrao(); return@launch }
            try { pedidoDePadrao.launch(i) } catch (e: Exception) { conferirEscolhaDePadrao() }
        }
    }

    /** Depois do pedido: se o aparelho não aceitou, oferece o modo forçado (vigia com "Acesso ao uso"). */
    private fun conferirEscolhaDePadrao() {
        aguardandoEscolhaDePadrao = false
        if (LauncherDoAparelho.ehPadrao(this)) { btnPadrao.visibility = View.GONE; seguirParaOPlayer(); return }
        if (LauncherDoAparelho.acessoDeUsoLiberado(this)) {
            Toast.makeText(this, "Modo forçado ativo: a launcher Sobre Mídia volta sempre que a original aparecer", Toast.LENGTH_LONG).show()
            seguirParaOPlayer()
            return
        }
        if (ofereceuModoForcado) { seguirParaOPlayer(); return }
        ofereceuModoForcado = true
        AlertDialog.Builder(this)
            .setTitle("Este aparelho não deixou trocar a tela inicial")
            .setMessage("Para a launcher Sobre Mídia aparecer mesmo assim, permita \"Acesso ao uso\" para o Sobre Mídia Player na próxima tela.")
            .setPositiveButton("Permitir") { _, _ ->
                aguardandoEscolhaDePadrao = true
                try { startActivity(LauncherDoAparelho.intencaoDoAcessoDeUso()) } catch (e: Exception) {
                    Toast.makeText(this, "Este aparelho não tem a tela de Acesso ao uso", Toast.LENGTH_LONG).show()
                }
            }
            .setNegativeButton("Agora não") { _, _ -> seguirParaOPlayer() }
            .setCancelable(false)
            .show()
    }

    // ------------------------------------------------------------------ configuração do painel

    /**
     * F-209: fundo da launcher escolhido no painel — imagem de capa (com véu, para o texto continuar legível), ou a cor
     * escolhida (em degradê suave), ou o fundo padrão Sobre Mídia.
     */
    private var fundoAplicado: String? = null
    private fun aplicarFundoDaTela() {
        val capa = ConfigDaLauncher.capaPronta(this, config)
        val assinatura = capa?.path ?: config.fundoCor ?: "padrao"
        if (assinatura == fundoAplicado) return
        fundoAplicado = assinatura
        val imagem = findViewById<ImageView>(R.id.launcher_capa)
        val veu = findViewById<View>(R.id.launcher_capa_veu)
        if (capa != null) {
            try { com.bumptech.glide.Glide.with(this).load(capa).into(imagem) } catch (e: Exception) { }
            imagem.visibility = View.VISIBLE; veu.visibility = View.VISIBLE
            return
        }
        imagem.setImageDrawable(null); imagem.visibility = View.GONE; veu.visibility = View.GONE
        val cor = config.fundoCor
        if (cor != null) {
            val base = android.graphics.Color.parseColor(cor)
            val escura = android.graphics.Color.rgb((android.graphics.Color.red(base) * 0.45).toInt(),
                (android.graphics.Color.green(base) * 0.45).toInt(), (android.graphics.Color.blue(base) * 0.45).toInt())
            quadro.background = android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.TL_BR, intArrayOf(base, escura))
        } else {
            quadro.setBackgroundResource(R.drawable.launcher_tela_fundo)
        }
    }

    private fun aplicarConfig() {
        aplicarFundoDaTela()
        findViewById<View>(R.id.launcher_hora).visibility = if (config.mostrarRelogio) View.VISIBLE else View.GONE
        redeTexto.visibility = if (config.mostrarWifi) View.VISIBLE else View.GONE
        if (!config.mostrarClima) climaTexto.visibility = View.GONE
        atualizarRede()
    }

    private fun atualizarRede() {
        if (!config.mostrarWifi) return
        val (texto, online) = try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            val online = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
            when {
                caps == null -> "Sem rede" to false
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Cabo" to online
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi" to online
                else -> "Rede" to online
            }
        } catch (e: Exception) { "Rede" to false }
        redeTexto.text = "$texto  ●"
        val cor = getColor(if (online) R.color.sm_online else R.color.sm_offline)
        val s = android.text.SpannableString(redeTexto.text)
        s.setSpan(android.text.style.ForegroundColorSpan(cor), s.length - 1, s.length, 0)
        redeTexto.text = s
    }

    private fun atualizarClima() {
        if (!config.mostrarClima) return
        lifecycleScope.launch {
            val temp = withContext(Dispatchers.IO) { Clima.temperatura(applicationContext) }
            if (temp != null) { climaTexto.text = temp; climaTexto.visibility = View.VISIBLE }
        }
    }

    // ------------------------------------------------------------------ aplicativos

    private fun carregarApps() {
        lifecycleScope.launch {
            val (visiveis, todos) = withContext(Dispatchers.IO) {
                val pm = packageManager
                val vistos = LinkedHashMap<String, AppDaLauncher>()
                for (categoria in listOf(Intent.CATEGORY_LAUNCHER, Intent.CATEGORY_LEANBACK_LAUNCHER)) {
                    val ris = try { pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(categoria), 0) } catch (e: Exception) { emptyList() }
                    for (ri in ris) {
                        val pacote = ri.activityInfo.packageName
                        if (pacote in vistos) continue
                        val nome = try { ri.loadLabel(pm).toString() } catch (e: Exception) { pacote }
                        vistos[pacote] = AppDaLauncher(pacote, nome, try { ri.loadIcon(pm) } catch (e: Exception) { null })
                    }
                }
                val todos = vistos.values.filter { it.pacote != packageName }
                val visiveis = todos.filter {
                    !LauncherPolicy.appOculto(it.pacote, it.nome, config, packageName) && !LauncherPolicy.ehAjustesDoSistema(it.pacote)
                }.sortedBy { it.nome.lowercase() }
                visiveis to todos
            }
            adaptador.itens = visiveis
            adaptador.notifyDataSetChanged()
            semApps.visibility = if (visiveis.isEmpty()) View.VISIBLE else View.GONE
            appsTotal.text = if (visiveis.size == 1) "Aplicativos (1)" else "Aplicativos (${visiveis.size})"
            try { ConfigDaLauncher.reportarApps(applicationContext, todos.map { it.pacote to it.nome }) } catch (e: Throwable) { Logger.w("LAUNCHER", "apps: ${e.message}") }
        }
    }

    private fun abrirGaveta() {
        gaveta.visibility = View.VISIBLE
        // F-209: o Menu abre com o foco na Loja de apps (Ajustes ao lado, aplicativos logo abaixo)
        findViewById<View>(R.id.launcher_card_loja).post { findViewById<View>(R.id.launcher_card_loja).requestFocus() }
    }

    private fun fecharGaveta() {
        gaveta.visibility = View.GONE
        findViewById<View>(R.id.launcher_card_apps).requestFocus()
    }

    /** Loja de aplicativos do aparelho: Play Store; se não houver, a loja que o aparelho tiver (Aptoide TV, Amazon). */
    private fun abrirLoja() {
        val i = LauncherPolicy.LOJAS.firstNotNullOfOrNull { packageManager.getLaunchIntentForPackage(it) ?: packageManager.getLeanbackLaunchIntentForPackage(it) }
        if (i == null) { Toast.makeText(this, "Nenhuma loja de aplicativos instalada neste aparelho", Toast.LENGTH_LONG).show(); return }
        LauncherDoAparelho.UsoLivre.liberar(this, config.minutosDeUsoLivre)
        try { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e: Exception) {
            Toast.makeText(this, "A loja de aplicativos não abriu", Toast.LENGTH_SHORT).show()
        }
    }

    private fun abrirApp(app: AppDaLauncher) {
        val i = packageManager.getLaunchIntentForPackage(app.pacote) ?: packageManager.getLeanbackLaunchIntentForPackage(app.pacote)
        if (i == null) { Toast.makeText(this, "Não foi possível abrir ${app.nome}", Toast.LENGTH_SHORT).show(); return }
        LauncherDoAparelho.UsoLivre.liberar(this, config.minutosDeUsoLivre)
        try { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e: Exception) {
            Toast.makeText(this, "Não foi possível abrir ${app.nome}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun detalhesDoApp(app: AppDaLauncher) {
        AlertDialog.Builder(this)
            .setTitle(app.nome)
            .setItems(arrayOf("Abrir", "Informações do aplicativo", "Cancelar")) { _, qual ->
                when (qual) {
                    0 -> abrirApp(app)
                    1 -> {
                        LauncherDoAparelho.UsoLivre.liberar(this, config.minutosDeUsoLivre)
                        try {
                            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${app.pacote}"))
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        } catch (e: Exception) { }
                    }
                }
            }
            .show()
    }

    private inner class Adaptador : RecyclerView.Adapter<Adaptador.Item>() {
        var itens: List<AppDaLauncher> = emptyList()
        inner class Item(v: View) : RecyclerView.ViewHolder(v) {
            val icone: ImageView = v.findViewById(R.id.app_icone)
            val nome: TextView = v.findViewById(R.id.app_nome)
        }
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Item {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_launcher_app, parent, false)
            realce(v, 1.10f)
            return Item(v)
        }
        override fun getItemCount() = itens.size
        override fun onBindViewHolder(h: Item, pos: Int) {
            val app = itens[pos]
            h.nome.text = app.nome
            h.icone.setImageDrawable(app.icone)
            h.itemView.setOnClickListener { abrirApp(app) }
            h.itemView.setOnLongClickListener { detalhesDoApp(app); true }
        }
    }

    // ------------------------------------------------------------------ Destaques Sobre Mídia (2 TVs 16:9 + 2 totens 9:16)

    /** Mídias de destaque escolhidas pelo dono/ADM, cada uma na sua tela; só recomeça se algo mudou. */
    private fun atualizarFundo(reiniciar: Boolean) {
        val pronto = ConfigDaLauncher.fundoPronto(this, config)
        val assinatura = pronto.map { it.first.vitrine + ":" + it.second.name }
        if (!reiniciar && assinatura == assinaturaDoFundo) return
        assinaturaDoFundo = assinatura
        vitrine.mostrar(pronto)
    }

    // ------------------------------------------------------------------ clima (cidade pelo IP, guardado 30 min)

    private object Clima {
        private val http by lazy { OkHttpClient.Builder().connectTimeout(8, TimeUnit.SECONDS).readTimeout(10, TimeUnit.SECONDS).build() }
        private fun get(url: String): String? = http.newCall(Request.Builder().url(url).build()).execute().use { r ->
            if (r.isSuccessful) r.body?.string() else null
        }
        fun temperatura(ctx: Context): String? {
            val p = ctx.getSharedPreferences("launcher_prefs", Context.MODE_PRIVATE)
            val guardada = p.getString("clima_texto", null)
            if (guardada != null && System.currentTimeMillis() - p.getLong("clima_em", 0L) in 0 until 30 * 60_000L) return guardada
            return try {
                val local = Json.parseToJsonElement(get("https://ipwho.is/") ?: return guardada).jsonObject
                val lat = local["latitude"]?.jsonPrimitive?.doubleOrNull ?: return guardada
                val lon = local["longitude"]?.jsonPrimitive?.doubleOrNull ?: return guardada
                val tempo = Json.parseToJsonElement(
                    get("https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon&current=temperature_2m") ?: return guardada
                ).jsonObject
                val graus = (tempo["current"] as? JsonObject)?.get("temperature_2m")?.jsonPrimitive?.doubleOrNull ?: return guardada
                val cidade = local["city"]?.jsonPrimitive?.contentOrNull
                val texto = "${Math.round(graus)}°C" + (cidade?.let { " · $it" } ?: "")
                p.edit().putString("clima_texto", texto).putLong("clima_em", System.currentTimeMillis()).apply()
                texto
            } catch (e: Exception) { guardada }
        }
    }

    companion object {
        /** F-202: a launcher está na frente (o quiosque do Player não a cobre: o Home foi para ela). */
        @Volatile var naFrente = false

        /** Abrir a launcher já pedindo para ser a tela inicial (vem da pergunta na abertura do Player). */
        const val EXTRA_PEDIR_PADRAO = "pedir_padrao"

        /** F-204: depois de virar a tela inicial, abrir o Player logo em seguida (a pessoa aceitou ao abrir o app). */
        const val EXTRA_ABRIR_PLAYER = "abrir_player"
        @Volatile private var abrirPlayerDepoisAte = 0L
    }
}

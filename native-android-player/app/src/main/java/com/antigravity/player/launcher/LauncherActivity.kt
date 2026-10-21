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
        if (intent?.getBooleanExtra(EXTRA_PEDIR_PADRAO, false) == true) principal.postDelayed({ pedirParaSerPadrao() }, 600)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        // Home de novo: volta ao começo (foco no Player, contagem do início)
        gaveta.visibility = View.GONE
        lista.scrollToPosition(0)
        cartaoPlayer.requestFocus()
        reiniciarContagem()
        if (intent?.getBooleanExtra(EXTRA_PEDIR_PADRAO, false) == true) pedirParaSerPadrao()
    }

    override fun onResume() {
        super.onResume()
        naFrente = true
        telaCheia()
        config = ConfigDaLauncher.atual(this)
        MarcaDoGestor.aplicarLogo(this, findViewById(R.id.launcher_logo))
        lerEstadoDoPlayer()
        aplicarConfig()
        carregarApps()
        atualizarFundo(reiniciar = true)
        cartaoPlayer.requestFocus()
        reiniciarContagem()
        principal.post(relogio)
        btnPadrao.visibility = if (LauncherDoAparelho.ehPadrao(this)) View.GONE else View.VISIBLE
        if (aguardandoEscolhaDePadrao) conferirEscolhaDePadrao()
        lifecycleScope.launch {
            if (ConfigDaLauncher.atualizar(this@LauncherActivity)) {
                config = ConfigDaLauncher.atual(this@LauncherActivity)
                aplicarConfig()
                carregarApps()
                atualizarFundo(reiniciar = false)
            }
            try { MarcaDoGestor.atualizar(this@LauncherActivity) } catch (e: Exception) { }
            MarcaDoGestor.aplicarLogo(this@LauncherActivity, findViewById(R.id.launcher_logo))
            atualizarClima()
        }
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

    private fun reiniciarContagem() {
        restante = LauncherPolicy.contagemParaAbrirPlayer(logadoNumaTela, config)
        contagemTexto.text = LauncherPolicy.textoDaContagem(restante)
    }

    private val relogio = object : Runnable {
        override fun run() {
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

    private fun realce(v: View, escala: Float) {
        v.setOnFocusChangeListener { view, foco ->
            view.animate().scaleX(if (foco) escala else 1f).scaleY(if (foco) escala else 1f).setDuration(120).start()
        }
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
        if (LauncherDoAparelho.ehPadrao(this)) { btnPadrao.visibility = View.GONE; return }
        if (LauncherDoAparelho.acessoDeUsoLiberado(this)) {
            Toast.makeText(this, "Modo forçado ativo: a launcher Sobre Mídia volta sempre que a original aparecer", Toast.LENGTH_LONG).show()
            return
        }
        if (ofereceuModoForcado) return
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
            .setNegativeButton("Agora não", null)
            .show()
    }

    // ------------------------------------------------------------------ configuração do painel

    private fun aplicarConfig() {
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
            appsTotal.text = if (visiveis.size == 1) "1 app" else "${visiveis.size} apps"
            ConfigDaLauncher.reportarApps(applicationContext, todos.map { it.pacote to it.nome })
        }
    }

    private fun abrirGaveta() {
        gaveta.visibility = View.VISIBLE
        lista.post { (lista.getChildAt(0) ?: findViewById(R.id.launcher_gaveta_voltar))?.requestFocus() }
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
    }
}

@file:Suppress("DEPRECATION")
package com.antigravity.player.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.antigravity.player.MainActivity
import com.antigravity.player.R
import com.antigravity.player.di.ServiceLocator
import com.antigravity.sync.dto.AuthorizedScreenDto
import com.antigravity.sync.service.PairingPolicy
import com.antigravity.sync.service.PairingPolicy.Disponibilidade
import com.antigravity.sync.service.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Escolha da tela deste aparelho (depois do login).
 *
 * F-182 — a regra: o MESMO login vale em quantos aparelhos o cliente quiser; o que não pode é ligar a MESMA tela a dois
 * aparelhos. Tela conectada a outro aparelho não é tomada daqui (antes, o "Transferir" desligava o outro aparelho): a
 * pessoa é avisada e libera pelo painel. Já o próprio aparelho pode trocar de tela: a tela antiga dele é liberada na hora.
 */
class ScreenSelectionActivity : AppCompatActivity() {

    /** F-200: Home/Recentes saindo do app por aqui: oferece a launcher Sobre Mídia, uma vez por saída. */
    private val vigiaDaSaida by lazy {
        com.antigravity.player.launcher.PerguntaLauncherActivity.Companion.VigiaDaSaida(applicationContext) { true }
    }

    override fun onDestroy() {
        vigiaDaSaida.desligar()
        super.onDestroy()
    }

    private lateinit var loading: ProgressBar
    private lateinit var recyclerView: RecyclerView
    private lateinit var adapter: ScreensAdapter
    private var telas: List<AuthorizedScreenDto> = emptyList()

    /** Identidade deste aparelho (sempre disponível: se o login recém-feito a apagou, é recalculada). */
    private fun minhaIdentidade(): String {
        SessionManager.deviceIdentityHash?.takeIf { it.isNotBlank() }?.let { return it }
        val h = com.antigravity.player.util.DeviceControl.getHardwareIdentity(applicationContext)
        SessionManager.setIdentity(h)
        return h
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        vigiaDaSaida.ligar()

        // [P0-FIX RC2] Orientation is controlled by Manifest (fullSensor) for ScreenSelection.
        // Forcing PORTRAIT here was the source of orientation whiplash when transitioning to
        // MainActivity (which starts in LANDSCAPE for TV or playlist-defined orientation).
        // The Manifest's android:screenOrientation="fullSensor" + configChanges already handles
        // both mobile and TV correctly without any requestedOrientation override.

        setContentView(R.layout.activity_screen_selection)

        loading = findViewById(R.id.selection_loading)

        // F-103: marca do gestor que fez login (logo dele no lugar do SOBRE MÍDIA)
        val logoMarca = findViewById<ImageView>(R.id.selection_logo)
        com.antigravity.player.util.MarcaDoGestor.aplicarLogo(this, logoMarca)
        lifecycleScope.launch {
            if (com.antigravity.player.util.MarcaDoGestor.atualizar(applicationContext)) {
                com.antigravity.player.util.MarcaDoGestor.aplicarLogo(this@ScreenSelectionActivity, logoMarca)
            }
        }
        recyclerView = findViewById(R.id.screens_recycler_view)

        recyclerView.layoutManager = LinearLayoutManager(this)
        adapter = ScreensAdapter(emptyList(), { minhaIdentidade() }) { aoEscolher(it) }
        recyclerView.adapter = adapter

        mostrarAviso(intent)
        fetchScreens()
    }

    /** Explicação vinda de outra tela (ex.: a tela escolhida estava conectada a outro aparelho). */
    private fun mostrarAviso(origem: Intent?) {
        val aviso = origem?.getStringExtra("extra_aviso")?.takeIf { it.isNotBlank() } ?: return
        origem.removeExtra("extra_aviso")
        AlertDialog.Builder(this)
            .setTitle("Tela já conectada")
            .setMessage(aviso)
            .setPositiveButton("Entendi", null)
            .show()
    }

    // F-194: o nome oficial é o NOME da tela (o mesmo do painel); o ID fica embaixo
    private fun nomeDe(tela: AuthorizedScreenDto) = tela.name.ifBlank { tela.customId ?: tela.id }

    private fun aoEscolher(escolhida: AuthorizedScreenDto) {
        val eu = minhaIdentidade()
        when (PairingPolicy.disponibilidade(escolhida.boundDeviceId, eu)) {
            Disponibilidade.EM_USO -> {
                AlertDialog.Builder(this)
                    .setTitle("Tela já conectada")
                    .setMessage(
                        "A tela ${nomeDe(escolhida)} já está conectada a outro aparelho, e uma tela só pode ficar em um aparelho por vez.\n\n" +
                            "O seu login pode ser usado em quantos aparelhos você quiser: escolha outra tela, ou libere esta no painel " +
                            "(Telas > ${nomeDe(escolhida)} > Desvincular aparelho) e tente de novo."
                    )
                    .setPositiveButton("Entendi", null)
                    .show()
            }
            Disponibilidade.DESTE_APARELHO -> saveScreenAndProceed(escolhida.id)
            Disponibilidade.LIVRE -> {
                // Este aparelho só mostra uma tela por vez: se ele ainda está ligado a outra, ela é liberada na troca.
                val atualId = PairingPolicy.telaAtualDoAparelho(telas.map { it.id to it.boundDeviceId }, eu, escolhida.id)
                val atual = telas.firstOrNull { it.id == atualId }
                if (atual == null) {
                    saveScreenAndProceed(escolhida.id)
                } else {
                    AlertDialog.Builder(this)
                        .setTitle("Trocar a tela deste aparelho")
                        .setMessage("Este aparelho está conectado à tela ${nomeDe(atual)}.\n\nPara conectar à tela ${nomeDe(escolhida)}, a tela ${nomeDe(atual)} será liberada para outro aparelho. Continuar?")
                        .setPositiveButton("Trocar") { _, _ -> liberarEConectar(atual, escolhida, eu) }
                        .setNegativeButton("Cancelar", null)
                        .show()
                }
            }
        }
    }

    private fun liberarEConectar(atual: AuthorizedScreenDto, escolhida: AuthorizedScreenDto, eu: String) {
        loading.visibility = View.VISIBLE
        lifecycleScope.launch(Dispatchers.IO) {
            // Libera só o vínculo DESTE aparelho (o servidor confere que a tela está mesmo ligada a ele).
            val liberou = try {
                com.antigravity.sync.service.RemoteDataSource().unpairScreen(atual.id, eu)
                true
            } catch (e: Exception) { false }
            withContext(Dispatchers.Main) {
                loading.visibility = View.GONE
                if (liberou) saveScreenAndProceed(escolhida.id)
                else Toast.makeText(this@ScreenSelectionActivity, "Não foi possível liberar a tela anterior. Verifique a internet e tente de novo.", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun fetchScreens() {
        loading.visibility = View.VISIBLE
        recyclerView.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val screens = com.antigravity.sync.service.RemoteDataSource().getAuthorizedScreens()

                // Filter out inactive screens (deleted/deactivated in dashboard)
                val activeScreens = screens.filter { it.isActive }

                withContext(Dispatchers.Main) {
                    loading.visibility = View.GONE
                    recyclerView.visibility = View.VISIBLE
                    telas = activeScreens
                    if (activeScreens.isEmpty()) {
                        Toast.makeText(this@ScreenSelectionActivity, "Nenhuma tela disponível.", Toast.LENGTH_LONG).show()
                    } else {
                        adapter.updateData(activeScreens)
                        val autoSelect = intent.getStringExtra("extra_select_screen_id")
                        if (!autoSelect.isNullOrBlank()) {
                            val target = activeScreens.find {
                                it.id.equals(autoSelect, ignoreCase = true) ||
                                (it.customId ?: "").equals(autoSelect, ignoreCase = true)
                            }
                            if (target != null) {
                                aoEscolher(target)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    loading.visibility = View.GONE

                    val msg = e.message ?: ""
                    if (msg.contains("JWT expired", ignoreCase = true) || msg.contains("UNAUTHORIZED", ignoreCase = true) ||
                        com.antigravity.player.util.PlayerFlowPolicy.classifySyncError(msg) ==
                        com.antigravity.player.util.PlayerFlowPolicy.SyncErrorAction.REAUTH) {
                        // Clear session thoroughly (a própria volta ao Login indica a sessão expirada)
                        lifecycleScope.launch(Dispatchers.IO) {
                            ServiceLocator.authRepository.signOut(applicationContext)
                            withContext(Dispatchers.Main) {
                                // Go to Login
                                val intent = Intent(this@ScreenSelectionActivity, com.antigravity.player.ui.LoginActivity::class.java)
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                                startActivity(intent)
                                finish()
                            }
                        }
                    } else {
                        // Falha passageira (rede/servidor): sem mensagem técnica. Mantém o indicador de
                        // carregamento e tenta de novo sozinho.
                        e.printStackTrace()
                        loading.visibility = View.VISIBLE
                        recyclerView.visibility = View.GONE
                        recyclerView.postDelayed({
                            if (!isFinishing && !isDestroyed) fetchScreens()
                        }, 5000)
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        mostrarAviso(intent)
        val autoSelect = intent?.getStringExtra("extra_select_screen_id")
        if (!autoSelect.isNullOrBlank()) {
            saveScreenAndProceed(autoSelect)
        } else {
            fetchScreens()
        }
    }

    private fun saveScreenAndProceed(screenId: String) {
        AparelhoDesvinculadoActivity.marcar(this, false) // F-205: escolheu tela, não está mais desvinculado
        val prefs = getSharedPreferences("player_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("saved_screen_id", screenId).apply()

        // [SECURITY HARDENING] Explicitamente atualiza identidade volátil da tela
        SessionManager.currentUUID = screenId
        SessionManager.currentUserId = screenId

        // [SECURITY HARDENING] Token lido da memória volátil (sessão ativa)
        val token = SessionManager.currentAccessToken ?: ""

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                ServiceLocator.getRepository(applicationContext).salvarCredenciais(token, screenId)
            } catch (e: Exception) {
                e.printStackTrace()
            }

            withContext(Dispatchers.Main) {
                // [CRITICAL] Reset Repository to use NEW Screen ID immediately
                ServiceLocator.resetRepository()

                Toast.makeText(this@ScreenSelectionActivity, "Conectado com Sucesso!", Toast.LENGTH_SHORT).show()

                // [P0-FIX RC1 & RC2] Navigation to MainActivity.
                // MainActivity is singleInstance in its own task. We launch it with
                // FLAG_ACTIVITY_NEW_TASK or FLAG_ACTIVITY_CLEAR_TOP or FLAG_ACTIVITY_SINGLE_TOP
                // so that MainActivity is foregrounded reliably across task boundaries before
                // ScreenSelectionActivity is finished.
                val intent = Intent(this@ScreenSelectionActivity, MainActivity::class.java).apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                    )
                }
                startActivity(intent)
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
                finish()
            }
        }
    }
}

class ScreensAdapter(
    private var screens: List<AuthorizedScreenDto>,
    private val minhaIdentidade: () -> String,
    private val onClick: (AuthorizedScreenDto) -> Unit
) : RecyclerView.Adapter<ScreensAdapter.ScreenViewHolder>() {

    fun updateData(newScreens: List<AuthorizedScreenDto>) {
        screens = newScreens
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ScreenViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_screen_selection, parent, false)
        return ScreenViewHolder(view)
    }

    override fun onBindViewHolder(holder: ScreenViewHolder, position: Int) {
        holder.bind(screens[position])
    }

    override fun getItemCount(): Int = screens.size

    inner class ScreenViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val nameTextView: TextView = itemView.findViewById(R.id.screen_name)
        private val idTextView: TextView = itemView.findViewById(R.id.screen_id)
        private val statusTextView: TextView = itemView.findViewById(R.id.screen_status)
        private val iconView: ImageView = itemView.findViewById(R.id.screen_icon)

        fun bind(screen: AuthorizedScreenDto) {
            nameTextView.text = ScreenLabel.nome(screen.name, screen.customId, screen.id)
            val id = ScreenLabel.id(screen.codigoOperacional, screen.customId, screen.name)
            idTextView.text = id ?: ""
            idTextView.visibility = if (id == null) View.GONE else View.VISIBLE

            when (PairingPolicy.disponibilidade(screen.boundDeviceId, minhaIdentidade())) {
                Disponibilidade.LIVRE -> {
                    statusTextView.text = "Disponível para Parear"
                    statusTextView.setTextColor(android.graphics.Color.parseColor("#10B981")) // Green
                    itemView.alpha = 1.0f
                }
                Disponibilidade.DESTE_APARELHO -> {
                    statusTextView.text = "Já vinculado a este aparelho"
                    statusTextView.setTextColor(android.graphics.Color.parseColor("#3B82F6")) // Blue
                    itemView.alpha = 1.0f
                }
                Disponibilidade.EM_USO -> {
                    statusTextView.text = "Em uso em outro aparelho"
                    statusTextView.setTextColor(android.graphics.Color.parseColor("#EF4444")) // Red
                    itemView.alpha = 0.5f
                }
            }
            // a tela em uso também responde ao toque: explica por que não dá para conectar
            itemView.setOnClickListener { onClick(screen) }
        }
    }
}

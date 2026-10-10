package com.antigravity.player.ui

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.antigravity.core.domain.model.RegionalConfig
import com.antigravity.core.domain.repository.PlayerRepository
import com.antigravity.core.domain.usecase.SyncPlaylistUseCase
import com.antigravity.player.util.NetworkMonitor
import com.antigravity.player.util.RegionalContextManager
import com.antigravity.core.util.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import kotlinx.coroutines.async
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import android.content.Context

enum class PlayerUIState {
    AUTH, SYNCING, PREPARING, PLAYING
}

class PlayerViewModel(
    private val repository: PlayerRepository,
    private val networkMonitor: NetworkMonitor
) : ViewModel() {

    // LiveData que a MainActivity vai observar para injetar no WebView
    private val _localizacao = MutableLiveData<RegionalConfig?>()
    val localizacao: LiveData<RegionalConfig?> = _localizacao

    // ==================
    // GATEKEEPER STATE
    // ==================
    private val _playerState = MutableStateFlow(PlayerUIState.AUTH)
    val playerState: StateFlow<PlayerUIState> = _playerState.asStateFlow()

    private val _isPlaylistReady = MutableStateFlow(false)
    val isPlaylistReady: StateFlow<Boolean> = _isPlaylistReady.asStateFlow()

    init {
        // Ao iniciar, carrega imediatamente o que está no "Cofre" (Room)
        carregarLocalizacaoCache()
        // [REALTIME] Reage no milissegundo em que a conexão volta
        observarConexao()
    }

    private fun observarConexao() {
        viewModelScope.launch {
            networkMonitor.isConnected.collect { conectado ->
                if (conectado) {
                    buscarNovaLocalizacaoEAtualizar()
                }
            }
        }
    }

    private fun buscarNovaLocalizacaoEAtualizar() {
        viewModelScope.launch(Dispatchers.IO) {
            RegionalContextManager.fetchRegionalContext { cidadeNova, estadoNovo, tzNova ->
                atualizarLocalizacao(cidadeNova, estadoNovo, tzNova)
            }
        }
    }

    private fun carregarLocalizacaoCache() {
        viewModelScope.launch(Dispatchers.IO) {
            val cache = repository.getLocalizacao()
            _localizacao.postValue(cache)
        }
    }

    // Função para atualizar a localização (chamada quando a internet volta)
    fun atualizarLocalizacao(cidade: String, estado: String, timezone: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val novaConfig = RegionalConfig(
                cidade = cidade,
                estado = estado,
                timezone = timezone
            )
            repository.salvarLocalizacao(novaConfig)
            _localizacao.postValue(novaConfig)
        }
    }

    // [AUDIT LOG] Registra a exibição de uma mídia no banco local
    fun registrarExibicao(nome: String, tipo: String, duracao: Int) {
        viewModelScope.launch(Dispatchers.IO) {
            val local = _localizacao.value?.cidade ?: "Desconhecido"
            repository.salvarLogAuditoria(
                nome = nome,
                tipo = tipo,
                duracao = duracao,
                cidade = local
            )
        }
    }

    fun gerarRelatorioCSV(callback: (String) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val logs = repository.buscarLogsAuditoria()
            val csvHeader = "ID;Data;Hora;Midia;Tipo;Duracao(s);Localidade\n"
            val csvBody = StringBuilder()

            val sdfData = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
            val sdfHora = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

            logs.forEach { log ->
                val data = sdfData.format(Date(log.dataHora))
                val hora = sdfHora.format(Date(log.dataHora))
                csvBody.append("${log.id};$data;$hora;${log.midiaNome};${log.midiaTipo};${log.duracaoExibida};${log.cidadeNoMomento}\n")
            }

            val relatorioCompleto = csvHeader + csvBody.toString()
            
            withContext(Dispatchers.Main) {
                callback(relatorioCompleto)
            }
        }
    }

    // ==================
    // GATEKEEPER LOGIC
    // ==================
    fun iniciarFluxoDeMidia(
        syncUseCase: SyncPlaylistUseCase, 
        onSyncSuccess: (() -> Unit)? = null,
        onSyncError: ((String) -> Unit)? = null
    ) {
        viewModelScope.launch {
            _playerState.value = PlayerUIState.SYNCING // TRAVA o usuário na tela de sync
            _isPlaylistReady.value = false
            
            // F-181: antes havia um limite fixo de 30 s para a sincronização inteira (com os downloads dentro).
            // Playlist com vídeos passava disso, a sincronização era cancelada sem guardar a playlist e a tela ficava
            // presa em "Sincronizando Mídias". Agora o limite curto só vale se já houver playlist guardada para tocar.
            val temPlaylistGuardada = try { repository.loadLocalCache().isSuccess } catch (e: Exception) { false }
            val inicio = android.os.SystemClock.elapsedRealtime()
            var ultimoAvanco = inicio
            val olheiro = launch { repository.getSyncProgress().collect { ultimoAvanco = android.os.SystemClock.elapsedRealtime() } }
            val tarefa = async { try { syncUseCase() } catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e; Result.failure(e) } }
            var result: Result<Unit>? = null
            while (true) {
                val pronto = kotlinx.coroutines.withTimeoutOrNull(1000) { tarefa.await() }
                if (pronto != null) { result = pronto; break }
                val agora = android.os.SystemClock.elapsedRealtime()
                if (com.antigravity.player.util.SyncPatience.desistirDaAbertura(temPlaylistGuardada, agora - inicio, agora - ultimoAvanco)) {
                    Logger.w("SYNC_GATEKEEPER", "Sincronização da abertura abandonada após ${(agora - inicio) / 1000}s (playlist guardada: $temPlaylistGuardada).")
                    tarefa.cancel()
                    break
                }
            }
            olheiro.cancel()

            val isSuccess = result?.isSuccess ?: false
            
            if (isSuccess) {
                Logger.i("SYNC_GATEKEEPER", "Sincronia concluída com sucesso.")
                _playerState.value = PlayerUIState.PREPARING 
                onSyncSuccess?.invoke()
            } else {
                // [MODO DE CONTINGÊNCIA] Se o Supabase bloqueou (403/429) ou deu timeout
                // F-181: "ter arquivo no disco" não basta (download pela metade também é arquivo): só há o que tocar
                // se existe uma playlist guardada.
                val hasCache = temPlaylistGuardada || (try { repository.loadLocalCache().isSuccess } catch (e: Exception) { false })
                Logger.w("SYNC_GATEKEEPER", "Falha ou Timeout no Sync. Cache Local Detectado: $hasCache")
                
                if (hasCache) {
                    Logger.i("SYNC_GATEKEEPER", "Acionando MODO DE CONTINGÊNCIA: Reproduzindo mídias locais.")
                    _playerState.value = PlayerUIState.PREPARING
                    onSyncSuccess?.invoke()
                } else {
                    _isPlaylistReady.value = false
                    val msg = if (result == null) "Timeout na Sincronização" 
                             else (result.exceptionOrNull()?.message ?: "Erro desconhecido")
                    Logger.e("SYNC_GATEKEEPER", "Falha crítica: Sem cache e sem download. $msg")
                    onSyncError?.invoke(msg)
                }
            }
        }
    }

    private var preparingTimeoutJob: kotlinx.coroutines.Job? = null

    fun prepararPrimeiraMidia() {
        // Assegura que estamos no estado intermediário, mantendo o bloqueio de tela
        _playerState.value = PlayerUIState.PREPARING
        preparingTimeoutJob?.cancel()
        preparingTimeoutJob = viewModelScope.launch {
            kotlinx.coroutines.delay(5000)
            if (_playerState.value == PlayerUIState.PREPARING) {
                Logger.w("GATEKEEPER", "Failsafe Gatekeeper Timeout atingido (5s). Liberando tela.")
                confirmarMidiaPronta()
            }
        }
    }

    fun confirmarMidiaPronta() {
        // [ZERO-GAP] Agora sim, o motor avisou que o frame está na memória! Liberamos a tela.
        preparingTimeoutJob?.cancel()
        _isPlaylistReady.value = true
        _playerState.value = PlayerUIState.PLAYING
    }
}

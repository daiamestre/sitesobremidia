package com.antigravity.player.util

import com.antigravity.core.domain.model.Playlist

/**
 * Decisões de fluxo do Player extraídas do MainActivity para serem testáveis na JVM.
 * Sem dependência de Android: nenhuma decisão aqui altera UI, playback ou sessão por conta própria.
 */
object PlayerFlowPolicy {

    /** Nome da tela de sincronização. */
    const val SYNC_SCREEN_TITLE = "Sincronizando Mídias"

    /** Texto exibido quando a sincronização termina. */
    const val SYNC_DONE_TEXT = "Mídias sincronizadas"

    /** Tempo mínimo em que "Mídias sincronizadas" fica visível antes de a mídia assumir a tela. */
    const val SYNC_DONE_MIN_VISIBLE_MS = 1500L

    enum class SyncErrorAction { REAUTH, SELECT_SCREEN, SCREEN_IN_USE, RETRY }

    /** Aviso mostrado na escolha de tela quando a tela escolhida já está conectada em outro aparelho. */
    const val AVISO_TELA_EM_USO =
        "Não foi possível conectar esta tela: ela já está conectada em outro aparelho (ou este aparelho ainda está ligado a outra tela).\n\n" +
        "O seu login pode ser usado em quantos aparelhos quiser, mas cada tela fica em um aparelho por vez. " +
        "Escolha outra tela, ou libere esta no painel (Telas > Desvincular aparelho) e tente de novo."

    private val HTTP_401 = Regex("""(?<!\d)401(?!\d)""")
    private val DOWNLOAD_COUNTER = Regex("""Sincronizando: (\d+) de (\d+)""")

    /**
     * Decide o que fazer com uma falha de sync SEM cache local.
     * Só o que é comprovadamente permanente tira o usuário da tela: sessão expirada de verdade
     * ou tela removida do painel. Um "404" qualquer (ex.: arquivo de mídia) ou um número que
     * contenha "401" NÃO expulsa ninguém: o player tenta de novo.
     */
    fun classifySyncError(message: String?): SyncErrorAction {
        val m = message.orEmpty()
        return when {
            m.contains("JWT expired", ignoreCase = true) || HTTP_401.containsMatchIn(m) ->
                SyncErrorAction.REAUTH
            m.contains("[PERMANENT]", ignoreCase = true) ||
                m.contains("Tela não encontrada", ignoreCase = true) -> SyncErrorAction.SELECT_SCREEN
            // F-182: o servidor recusou o vínculo (tela de outro aparelho / aparelho preso a outra tela): voltar à escolha de
            // tela explicando, em vez de ficar tentando para sempre atrás de uma tela de "Sincronizando".
            m.contains("DEVICE_ALREADY_BOUND") || m.contains("DEVICE_BINDING_MISMATCH") -> SyncErrorAction.SCREEN_IN_USE
            else -> SyncErrorAction.RETRY
        }
    }

    /** Texto que o usuário pode ver abaixo do nome da tela de sincronização. */
    fun sanitizeSyncProgress(raw: String?): String {
        if (raw == null) return ""
        DOWNLOAD_COUNTER.matchEntire(raw)?.let { return "${it.groupValues[1]} de ${it.groupValues[2]}" }
        if (raw.startsWith("Mídias prontas")) return SYNC_DONE_TEXT
        return "" // qualquer outro texto interno (aguarde, erro, bloqueio, etapas) não é exibido
    }

    /** Quanto ainda falta para "Mídias sincronizadas" cumprir o tempo mínimo de exibição. */
    fun remainingDoneVisibilityMs(doneShownAtMs: Long, nowMs: Long): Long =
        if (doneShownAtMs <= 0L) 0L else maxOf(0L, SYNC_DONE_MIN_VISIBLE_MS - (nowMs - doneShownAtMs))

    /**
     * Assinatura de CONFIGURAÇÃO usada pelo sync para decidir "nada mudou". Precisa enxergar TUDO que o painel edita:
     * antes só olhava id:hash:ordem, então mudar duração, horário ou dias de um item respondia "Config Unchanged and
     * Cache Valid" e o Player nunca aplicava a edição (provado no emulador: Room seguia com 30 s após o painel gravar 12 s).
     */
    fun configSignature(playlist: Playlist): String {
        val raw = buildString {
            append(playlist.id).append(':').append(playlist.orientation).append(':').append(playlist.resolution)
                .append(':').append(playlist.audioEnabled).append(':').append(playlist.heartbeatIntervalSeconds)
            playlist.items.forEach {
                append('|').append(it.id).append(':').append(it.hash).append(':').append(it.orderIndex)
                    .append(':').append(it.durationSeconds).append(':').append(it.type)
                    .append(':').append(it.startTime.orEmpty()).append(':').append(it.endTime.orEmpty())
                    .append(':').append(it.daysOfWeek.orEmpty())
                    .append(':').append(it.grupo.orEmpty())
            }
        }
        val digest = java.security.MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }.take(24)
    }

    /** Assinatura do que efetivamente define a reprodução (ordem, duração, agenda, config). */
    fun playlistSignature(playlist: Playlist?): String? {
        if (playlist == null) return null
        return buildString {
            append(playlist.id).append('|').append(playlist.orientation).append('|')
                .append(playlist.audioEnabled).append('|').append(playlist.seamlessTransition).append('|')
                .append(playlist.cacheNextMedia).append('|').append(playlist.heartbeatIntervalSeconds)
            playlist.items.forEach {
                append('#').append(it.id).append(':').append(it.hash).append(':').append(it.orderIndex)
                    .append(':').append(it.durationSeconds).append(':').append(it.type)
                    .append(':').append(it.startTime).append(':').append(it.endTime)
                    .append(':').append(it.daysOfWeek).append(':').append(it.remoteUrl)
            }
        }
    }

    /**
     * Um sync bem-sucedido deve reiniciar o laço de reprodução?
     * Só quando não há laço ativo ou quando ESTE sync mudou a playlist. Reiniciar sem mudança
     * cortava a mídia em exibição a cada ciclo de 60 s.
     */
    fun shouldRestartPlaybackLoop(before: String?, after: String?, loopActive: Boolean): Boolean =
        after != null && (!loopActive || before != after)
    /** Entradas de sessão como o runtime deve enxergá-las ao projetar a superfície. */
    data class SessionInputs(val stateName: String?, val accessToken: String?, val userId: String?)

    /**
     * O estado de sessão do SessionManager só sai de UNKNOWN no 1o sync bem-sucedido, e o token em memória
     * some quando o processo renasce (watchdog/OS). Se a tela já foi escolhida neste aparelho
     * (saved_screen_id só existe após login + seleção e é apagado quando a sessão realmente expira), a sessão
     * local é válida: projetar "não autenticado" fecharia o player e mandaria o usuário ao Login.
     */
    fun effectiveSessionInputs(stateName: String?, accessToken: String?, userId: String?, savedScreenId: String?): SessionInputs {
        val screen = userId?.takeIf { it.isNotBlank() } ?: savedScreenId?.takeIf { it.isNotBlank() }
            ?: return SessionInputs(stateName, accessToken, userId) // sem tela escolhida: Login / Seleção continuam valendo

        val name = stateName?.trim()?.uppercase()
        val notConfirmedYet = name == null || name == "UNKNOWN" || name == "INITIALIZING" || name == "AUTHENTICATING"
        return SessionInputs(
            stateName = if (notConfirmedYet) "AUTHORIZED" else stateName, // SUSPENDED/REVOKED/etc. seguem intactos
            accessToken = if (accessToken.isNullOrBlank()) LOCAL_SESSION else accessToken,
            userId = userId?.takeIf { it.isNotBlank() } ?: screen
        )
    }

    /** Marcador de "sessão local válida" só para classificar a superfície; nunca é usado em rede. */
    private const val LOCAL_SESSION = "LOCAL_SESSION"
    /**
     * O timer de segurança do SyncGuard (25 s) pode soltar a tela de sincronização? Só quando já existe mídia
     * pronta. Antes soltava sempre: numa 1ª sincronização com vídeos grandes a tela de "Sincronizando" sumia
     * no meio do download e aparecia o logo sobre fundo preto.
     */
    fun keepSyncScreenLocked(uiState: com.antigravity.player.ui.PlayerUIState): Boolean =
        uiState != com.antigravity.player.ui.PlayerUIState.PLAYING

    /**
     * Orientação física do player (ActivityInfo.SCREEN_ORIENTATION_*) ou null para não travar.
     * Signage: a playlist manda. Em celular/tablet a tela fica TRAVADA na orientação da playlist e não gira
     * com o sensor. Em TV (sem sensor) nada é forçado, salvo comando explícito do painel (rotate_*).
     */
    fun physicalOrientationLock(canonicalOrientation: String?, isTelevision: Boolean, forcedByPanel: Boolean, rotacaoTela: Int? = null): Int? {
        if (isTelevision && !forcedByPanel) return null
        // F-194: rotação escolhida no painel (celular/tablet que obedecem): cada posição tem a sua trava
        if (!forcedByPanel && rotacaoTela != null) return travaDaRotacao(rotacaoTela)
        return when (canonicalOrientation) {
            "portrait" -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            "landscape" -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            else -> null
        }
    }

    /**
     * "Reiniciar Player": o mesmo comando pode chegar por Realtime e por polling, e o processo é recriado no meio.
     * O id do último reinício atendido fica em SharedPreferences (sobrevive ao reinício); repetido = ignorado.
     */
    fun shouldRunRestart(commandId: String?, lastHandledId: String?): Boolean =
        !commandId.isNullOrBlank() && commandId != lastHandledId

    /** "Atualizar Player": o painel só recebe "executed" se a sincronização realmente aconteceu. */
    fun updateAck(syncSucceeded: Boolean, error: String?): Pair<String, String?> =
        if (syncSucceeded) "executed" to null
        else "failed" to ("Falha ao atualizar o player: " + (error?.takeIf { it.isNotBlank() } ?: "sem conexão ou sem resposta do servidor"))

    // ------------------------------------------------------------------ F-194: rotação da tela em 4 posições

    /** 270 (em pé) = PORTRAIT e 0 = LANDSCAPE: as mesmas travas de antes, então o padrão não muda nada em celular/tablet. */
    fun travaDaRotacao(rotacao: Int): Int = when (rotacao) {
        90 -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_REVERSE_PORTRAIT
        180 -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE
        270 -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        else -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
    }

    /** Orientação que a tela deve ter: a da rotação escolhida (90/270 = em pé) ou, sem escolha, a da playlist. */
    fun orientacaoDesejada(rotacaoTela: Int?, orientacaoDaPlaylist: String?): String? = when (rotacaoTela) {
        90, 270 -> "portrait"
        0, 180 -> "landscape"
        else -> orientacaoDaPlaylist
    }

    /** Chave da decisão "girar por software" guardada: sem rotação escolhida continua a de antes (só a orientação). */
    fun chaveDoGiro(orientacao: String?, rotacaoTela: Int?): String? = if (rotacaoTela == null) orientacao else "$orientacao@$rotacaoTela"

    /** O painel (tela física) está com a orientação trocada em relação à playlist? Então o quadro precisa girar por software. */
    fun precisaGirarQuadroPorSoftware(
        larguraDoPainel: Int,
        alturaDoPainel: Int,
        orientacaoDaPlaylist: String?,
        /** F-194: 180 escolhido e o aparelho continuou em ROTATION_0 => ignorou o pedido: gira por software. */
        rotacaoTela: Int? = null,
        rotacaoDoDisplay: Int? = null
    ): Boolean {
        if (larguraDoPainel <= 0 || alturaDoPainel <= 0) return false
        val painelDeitado = larguraDoPainel >= alturaDoPainel
        if (rotacaoTela == 180) return painelDeitado && rotacaoDoDisplay == 0
        val playlistDeitada = orientacaoDaPlaylist != "portrait"
        return painelDeitado != playlistDeitada
    }

    /**
     * F-186 — a decisão de girar por software, guardada na última vez, vale para a abertura seguinte? Só quando foi
     * tomada para a MESMA orientação de playlist (trocou a playlist de pé para deitada: decide de novo).
     */
    fun giroPorSoftwareGuardado(guardado: Boolean, guardadoPara: String?, orientacaoAoAbrir: String?): Boolean =
        guardado && !guardadoPara.isNullOrBlank() && guardadoPara == orientacaoAoAbrir

    /** F-186 — o giro mudou: o motor de vídeo precisa recomeçar? Só se já havia vídeo no ar (fora da sincronização). */
    fun reiniciarMotorAoMudarGiro(motorDeVideoCriado: Boolean, sincronizando: Boolean): Boolean =
        motorDeVideoCriado && !sincronizando

    // ------------------------------------------------------------------ F-187: vigia da imagem

    enum class AcaoDoVigia { NADA, MOSTRAR_MIDIA, REINICIAR_MOTOR }

    /** De quanto em quanto tempo o vigia olha a tela. */
    const val VIGIA_INTERVALO_MS = 2_000L
    /** Tela de sincronização por cima de mídia no ar: tolerância (cobre "Mídias sincronizadas" e a troca de playlist). */
    const val VIGIA_SYNC_POR_CIMA_MS = 8_000L
    /** Camada do item escondida/transparente: tolerância (cobre o cruzamento entre mídias). */
    const val VIGIA_CAMADA_ESCONDIDA_MS = 4_000L
    /** Vídeo no ar sem andar: tolerância (cobre carregamento lento em TV Box). */
    const val VIGIA_VIDEO_PARADO_MS = 12_000L

    /**
     * Garantia: se há mídia no ar, ela APARECE. O palco pode estar "exibindo" (registro de exibição e sinal normais) com
     * a tela de sincronização por cima, com a camada escondida ou com o vídeo parado — o dono vê "Sincronizando" preso ou
     * tela preta. O vigia olha a tela a cada 2 s e corrige: mostra a mídia, ou reinicia o motor de vídeo.
     * Tela bloqueada/suspensa ou sem item no ar (1ª sincronização, sem playlist): não mexe.
     */
    fun acaoDoVigia(
        itemNoAr: Boolean,
        telaLiberada: Boolean,
        syncPorCimaHaMs: Long,
        camadaEscondidaHaMs: Long,
        videoNoAr: Boolean,
        videoParadoHaMs: Long
    ): AcaoDoVigia = when {
        !itemNoAr || !telaLiberada -> AcaoDoVigia.NADA
        videoNoAr && videoParadoHaMs >= VIGIA_VIDEO_PARADO_MS -> AcaoDoVigia.REINICIAR_MOTOR
        syncPorCimaHaMs >= VIGIA_SYNC_POR_CIMA_MS || camadaEscondidaHaMs >= VIGIA_CAMADA_ESCONDIDA_MS -> AcaoDoVigia.MOSTRAR_MIDIA
        else -> AcaoDoVigia.NADA
    }

    /** O vídeo está andando? (tocando, ou a posição avançou desde a última olhada) */
    fun videoAndando(playerExiste: Boolean, tocando: Boolean, posicaoMs: Long, posicaoAnteriorMs: Long): Boolean =
        playerExiste && (tocando || posicaoMs != posicaoAnteriorMs)

    /** Como o canvas (toda a tela do player) deve ser desenhado: tamanho, rotação e deslocamento. */
    data class CanvasTransform(val width: Int, val height: Int, val rotation: Float, val translationX: Float, val translationY: Float)

    /** Rotação (graus, horário) aplicada ao canvas da TV quando a playlist não casa com a tela física. */
    const val TV_CANVAS_ROTATION = 90f

    /**
     * TV Box / Smart TV: 16x9 = TV deitada; 9x16 = TV virada em pé (totem). A TV ignora pedido de orientação
     * do app, então quando a orientação da playlist não bate com a tela física o player gira o canvas 90°
     * e ele ocupa a tela inteira (sem faixas) para quem olha a TV virada. null = desenhar normal.
     */
    fun tvCanvasTransform(
        isTelevision: Boolean,
        canonicalOrientation: String?,
        displayWidth: Int,
        displayHeight: Int,
        /** F-192: 90 (padrão) ou 270 — o painel escolhe por tela, conforme o lado em que a TV do totem foi montada. */
        giroGraus: Int = 90,
        /** F-194: rotação escolhida no painel (0/90/180/270). Quando vem, ela manda (o painel é a referência deitada). */
        rotacaoTela: Int? = null
    ): CanvasTransform? {
        if (!isTelevision || displayWidth <= 0 || displayHeight <= 0) return null
        if (rotacaoTela != null) {
            // painel já em pé (aparelho obedeceu ao pedido): a referência anda 90°
            val efetiva = if (displayWidth >= displayHeight) rotacaoTela else (rotacaoTela + 90) % 360
            return when (efetiva) {
                0 -> null
                180 -> CanvasTransform(displayWidth, displayHeight, 180f, 0f, 0f)
                else -> CanvasTransform(
                    width = displayHeight, height = displayWidth, rotation = efetiva.toFloat(),
                    translationX = (displayWidth - displayHeight) / 2f, translationY = (displayHeight - displayWidth) / 2f
                )
            }
        }
        val panelIsLandscape = displayWidth >= displayHeight
        val playlistIsLandscape = canonicalOrientation != "portrait"
        // Tela física já casa com a playlist (inclusive TV Box que obedeceu ao pedido de orientação): nada a girar.
        if (panelIsLandscape == playlistIsLandscape) return null
        // Canvas lógico com os lados trocados, girado 90° em torno do próprio centro e centralizado no painel.
        val w = displayHeight
        val h = displayWidth
        return CanvasTransform(
            width = w,
            height = h,
            rotation = if (giroGraus == 270) 270f else TV_CANVAS_ROTATION,
            translationX = (displayWidth - w) / 2f,
            translationY = (displayHeight - h) / 2f
        )
    }
}

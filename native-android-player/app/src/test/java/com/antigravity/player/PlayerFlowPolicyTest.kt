package com.antigravity.player

import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.domain.model.Playlist
import com.antigravity.player.util.PlayerFlowPolicy
import com.antigravity.player.util.PlayerFlowPolicy.SyncErrorAction
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regras de fluxo do Player que o cliente vê:
 * - o usuário não é expulso para Login/Seleção por erro passageiro;
 * - a tela de sincronização mostra só "Sincronizando mídias..." (sem "aguarde"/erro);
 * - o sync periódico NÃO reinicia a reprodução quando a playlist não mudou (evita piscar/cortar a mídia).
 */
class PlayerFlowPolicyTest {

    private fun item(id: String, order: Int, hash: String = "h$id", duration: Long = 10) = MediaItem(
        id = id, name = id, type = MediaType.VIDEO, durationSeconds = duration,
        remoteUrl = "https://cdn.invalid/$id.mp4", localPath = null, hash = hash, orderIndex = order
    )

    private fun playlist(vararg items: MediaItem, orientation: String = "landscape") = Playlist(
        id = "pl1", name = "p", version = 1L, items = items.toList(), orientation = orientation
    )

    // ---- classifySyncError -------------------------------------------------

    @Test
    fun httpErrorMentioning404_ofAMediaFile_doesNotSendUserToScreenSelection() {
        assertEquals(SyncErrorAction.RETRY, PlayerFlowPolicy.classifySyncError("HTTP 404 ao baixar media_01.mp4"))
    }

    @Test
    fun numberContaining401_isNotAnAuthError() {
        assertEquals(SyncErrorAction.RETRY, PlayerFlowPolicy.classifySyncError("timeout apos 14012 ms"))
    }

    @Test
    fun explicitScreenRemovedByPanel_sendsToSelection() {
        assertEquals(SyncErrorAction.SELECT_SCREEN,
            PlayerFlowPolicy.classifySyncError("[PERMANENT] Tela não encontrada no painel. Verifique o ID: x"))
    }

    @Test
    fun realAuthErrors_requestReauth() {
        assertEquals(SyncErrorAction.REAUTH, PlayerFlowPolicy.classifySyncError("JWT expired"))
        assertEquals(SyncErrorAction.REAUTH, PlayerFlowPolicy.classifySyncError("HTTP 401 Unauthorized"))
    }

    @Test
    fun networkOrUnknown_retries() {
        assertEquals(SyncErrorAction.RETRY, PlayerFlowPolicy.classifySyncError("Unable to resolve host"))
        assertEquals(SyncErrorAction.RETRY, PlayerFlowPolicy.classifySyncError(null))
    }

    // ---- sanitizeSyncProgress ----------------------------------------------

    @Test
    fun syncScreen_hasTheRequiredNames() {
        assertEquals("Sincronizando Mídias", PlayerFlowPolicy.SYNC_SCREEN_TITLE)
        assertEquals("Mídias sincronizadas", PlayerFlowPolicy.SYNC_DONE_TEXT)
    }

    @Test
    fun syncScreen_showsOnlyCounterOrDone_neverWaitOrErrorTexts() {
        listOf(
            "Aguardando Identidade do Dispositivo...",
            "Aguardando seleção de tela...",
            "Aguardando programação de mídias no painel...",
            "Bloqueio: SCREEN_SUSPENDED",
            "Aparelho não vinculado a esta tela (Re-pareamento no Painel)",
            "Corrigindo mídias ausentes...",
            "Novas configurações detectadas...",
            "Sincronizando novas mídias...",
            "Salvando configurações...",
            "Sistema Temporariamente Suspenso.",
            "Erro: HTTP 500",
            "",
            null
        ).forEach {
            assertEquals("texto vazou para o usuário: $it", "", PlayerFlowPolicy.sanitizeSyncProgress(it))
        }
    }

    @Test
    fun syncScreen_showsTheMediaCounter() {
        assertEquals("2 de 5", PlayerFlowPolicy.sanitizeSyncProgress("Sincronizando: 2 de 5"))
        assertEquals("10 de 12", PlayerFlowPolicy.sanitizeSyncProgress("Sincronizando: 10 de 12"))
    }

    @Test
    fun syncScreen_showsDoneWhenSyncFinishes() {
        assertEquals("Mídias sincronizadas", PlayerFlowPolicy.sanitizeSyncProgress("Mídias prontas. Iniciando reprodução..."))
    }

    @Test
    fun doneText_staysVisibleForTheMinimumTime() {
        assertEquals(1000L, PlayerFlowPolicy.remainingDoneVisibilityMs(doneShownAtMs = 10_000L, nowMs = 10_500L))
        assertEquals(0L, PlayerFlowPolicy.remainingDoneVisibilityMs(doneShownAtMs = 10_000L, nowMs = 12_000L))
        assertEquals(0L, PlayerFlowPolicy.remainingDoneVisibilityMs(doneShownAtMs = 0L, nowMs = 12_000L)) // nunca mostrou
    }

    // ---- playlistSignature / shouldRestartPlaybackLoop ---------------------

    @Test
    fun sameContent_sameSignature() {
        assertEquals(
            PlayerFlowPolicy.playlistSignature(playlist(item("a", 0), item("b", 1))),
            PlayerFlowPolicy.playlistSignature(playlist(item("a", 0), item("b", 1)))
        )
    }

    @Test
    fun anyRealChange_changesSignature() {
        val base = PlayerFlowPolicy.playlistSignature(playlist(item("a", 0)))
        assertNotEquals(base, PlayerFlowPolicy.playlistSignature(playlist(item("a", 0), item("b", 1))))      // mídia nova
        assertNotEquals(base, PlayerFlowPolicy.playlistSignature(playlist(item("a", 0, duration = 30))))     // duração
        assertNotEquals(base, PlayerFlowPolicy.playlistSignature(playlist(item("a", 0, hash = "novo"))))     // arquivo trocado
        assertNotEquals(base, PlayerFlowPolicy.playlistSignature(playlist(item("a", 0), orientation = "portrait")))
        assertNull(PlayerFlowPolicy.playlistSignature(null))
    }

    @Test
    fun periodicSync_withUnchangedPlaylist_doesNotRestartPlayback() {
        val s = PlayerFlowPolicy.playlistSignature(playlist(item("a", 0)))
        assertFalse("sync sem mudança reiniciava a mídia a cada 60s",
            PlayerFlowPolicy.shouldRestartPlaybackLoop(before = s, after = s, loopActive = true))
    }

    @Test
    fun newMedia_restartsPlaybackToApplyImmediately() {
        val before = PlayerFlowPolicy.playlistSignature(playlist(item("a", 0)))
        val after = PlayerFlowPolicy.playlistSignature(playlist(item("a", 0), item("b", 1)))
        assertTrue(PlayerFlowPolicy.shouldRestartPlaybackLoop(before, after, loopActive = true))
    }

    @Test
    fun loopNotRunning_startsIt() {
        val s = PlayerFlowPolicy.playlistSignature(playlist(item("a", 0)))
        assertTrue(PlayerFlowPolicy.shouldRestartPlaybackLoop(s, s, loopActive = false))
    }

    @Test
    fun noPlaylist_doesNotRestart() {
        assertFalse(PlayerFlowPolicy.shouldRestartPlaybackLoop(before = null, after = null, loopActive = true))
    }

    // ---- keepSyncScreenLocked ------------------------------------------------

    @Test
    fun syncScreen_staysLocked_untilMediaIsReady() {
        assertTrue(PlayerFlowPolicy.keepSyncScreenLocked(com.antigravity.player.ui.PlayerUIState.AUTH))
        assertTrue(PlayerFlowPolicy.keepSyncScreenLocked(com.antigravity.player.ui.PlayerUIState.SYNCING))
        assertTrue(PlayerFlowPolicy.keepSyncScreenLocked(com.antigravity.player.ui.PlayerUIState.PREPARING))
    }

    @Test
    fun syncScreen_canBeReleased_whenMediaIsPlaying() {
        assertFalse(PlayerFlowPolicy.keepSyncScreenLocked(com.antigravity.player.ui.PlayerUIState.PLAYING))
    }
}

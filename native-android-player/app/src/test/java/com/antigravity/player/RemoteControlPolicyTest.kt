package com.antigravity.player

import com.antigravity.player.util.PlayerFlowPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Controle Remoto do Dashboard (Atualizar Player / Reiniciar Player / Tela Ativa).
 *
 * F-36  "Reiniciar Player" so tentava reiniciar o APARELHO (Device Owner) e, em celular/TV Box comum, respondia
 *       "unsupported": o botao nao fazia nada. Agora fecha e abre o Player (reinicio do app + nova sincronizacao).
 * F-37  "Atualizar Player" confirmava "executed" ANTES de sincronizar; agora confirma pelo resultado real.
 * F-38  "Tela Ativa" desligada so parava os renderers: o laco de reproducao seguia rodando por baixo do aviso.
 */
class RemoteControlPolicyTest {

    // ---- Reiniciar Player: idempotencia entre processos (o polling pode reentregar o mesmo comando) ----
    @Test fun restart_firstTime_runs() = assertTrue(PlayerFlowPolicy.shouldRunRestart("cmd-1", null))
    @Test fun restart_sameCommandAgain_isIgnored() = assertFalse(PlayerFlowPolicy.shouldRunRestart("cmd-1", "cmd-1"))
    @Test fun restart_newCommand_runs() = assertTrue(PlayerFlowPolicy.shouldRunRestart("cmd-2", "cmd-1"))
    @Test fun restart_blankId_isIgnored() {
        assertFalse(PlayerFlowPolicy.shouldRunRestart(null, null))
        assertFalse(PlayerFlowPolicy.shouldRunRestart("  ", null))
    }

    // ---- Atualizar Player: ack pelo resultado real ----
    @Test fun update_success_isExecuted() {
        val (status, note) = PlayerFlowPolicy.updateAck(true, null)
        assertEquals("executed", status)
        assertNull(note)
    }

    @Test fun update_failure_isFailedWithReason() {
        val (status, note) = PlayerFlowPolicy.updateAck(false, "timeout")
        assertEquals("failed", status)
        assertTrue(note!!.contains("timeout"))
    }

    @Test fun update_failureWithoutMessage_stillExplains() {
        val (status, note) = PlayerFlowPolicy.updateAck(false, null)
        assertEquals("failed", status)
        assertTrue(!note.isNullOrBlank())
    }

    // ---- Fiacao (fontes) ----
    private fun src(path: String): String {
        val f = listOf("src/main/java/$path", path).map { File(it) }.firstOrNull { it.isFile }
        assertTrue("fonte nao encontrada: $path", f != null)
        return f!!.readText()
    }

    private fun mainActivity() = src("com/antigravity/player/MainActivity.kt")

    private fun branch(text: String, label: String, next: String): String {
        val start = text.indexOf("\"$label\" ->")
        assertTrue("ramo $label nao encontrado", start >= 0)
        val end = text.indexOf("\"$next\"", start + 1).let { if (it < 0) text.length else it }
        return text.substring(start, end)
    }

    @Test fun rebootCommand_restartsThePlayerApp_notThePhysicalDevice() {
        val text = mainActivity()
        val start = text.indexOf("\"reboot\", \"restart_player\" ->")
        assertTrue("ramo do Reiniciar Player nao encontrado", start >= 0)
        val end = text.indexOf("\"reboot_device\"", start)
        val b = text.substring(start, end)
        assertTrue("reboot deve chamar restartPlayerApp", b.contains("restartPlayerApp"))
        assertFalse("reboot NAO pode depender de Device Owner", b.contains("dpm.reboot"))
    }

    @Test fun reloadCommand_acksByRealSyncResult() {
        val b = branch(mainActivity(), "reload", "rotate_portrait")
        assertTrue("reload deve usar a atualizacao real", b.contains("updatePlayerNow"))
        assertFalse("reload nao pode confirmar antes de sincronizar", b.contains("ackRemoteCommand(commandId, \"executed\")"))
    }

    @Test fun blocking_cancelsThePlaybackLoop() {
        val text = mainActivity()
        val start = text.indexOf("SessionManager.screenActiveEvents.collect")
        assertTrue(start >= 0)
        val block = text.substring(start, start + 1800)
        assertTrue("ao bloquear, o laco de reproducao deve ser cancelado", block.contains("playbackLoopJob?.cancel()"))
    }

    @Test fun rebootIsPolledAsFallbackToo() {
        val s = src("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt")
        assertTrue(s.contains("COMMAND_POLL_SAFE = listOf(\"screenshot\", \"reload\", \"reboot\")"))
    }
}

/**
 * F-39 (RAIZ de "todo comando fica pending para sempre"): acknowledgeCommand montava o corpo com Map<String, Any>,
 * que o supabase-kt nao serializa ("Serializer for class 'Any' is not found"). O ack SEMPRE falhava, o painel
 * nunca recebia "executed" e o botao ficava carregando. Provado em emulador (logcat) antes da correcao.
 */
class CommandAckSerializationTest {
    @Test fun acknowledgeCommand_neverSerializesMapOfAny() {
        val f = listOf(
            "../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt",
            "sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt"
        ).map { File(it) }.first { it.isFile }
        val text = f.readText()
        val start = text.indexOf("suspend fun acknowledgeCommand(")
        assertTrue(start >= 0)
        val end = text.indexOf("// Fetch authorized screens", start)
        val body = text.substring(start, end)
        assertFalse("o corpo do update nao pode ser Map<String, Any>", body.contains("val updateData = mutableMapOf"))
        assertTrue("o corpo do update deve ser um JsonObject", body.contains("val updateData = buildJsonObject"))
    }
}

/**
 * F-40: o canal Realtime unico do player pedia `playlists` e `devices`, fora da publicacao supabase_realtime.
 * O servidor recusa o canal INTEIRO ("Unable to subscribe ... table: playlists"): a assinatura de `screens`
 * (Tela Ativa) morria junto e o bloqueio so chegava no polling de 60 s. Provado em emulador.
 */
class RealtimeChannelIsolationTest {
    private fun source(): String = listOf(
        "../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt",
        "sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt"
    ).map { File(it) }.first { it.isFile }.readText()

    private fun subscribeFn(): String {
        val t = source()
        val a = t.indexOf("suspend fun subscribeToRealtimeSync")
        val b = t.indexOf("suspend fun subscribeToRemoteCommands")
        assertTrue(a >= 0 && b > a)
        return t.substring(a, b)
    }

    @Test fun screensHaveTheirOwnChannel() {
        val f = subscribeFn()
        assertTrue(f.contains("\"yeloo_screens_channel\""))
        assertTrue("screens deve usar o canal proprio", f.contains("screensChannel.postgresChangeFlow"))
        assertTrue(f.contains("screensChannel.subscribe()"))
    }

    @Test fun devicesTableIsNotSubscribed() {
        assertFalse("devices nao esta publicada e cada heartbeat dispararia sync", subscribeFn().contains("table = \"devices\""))
    }

    @Test fun heartbeatUpdatesDoNotTriggerSyncNudge() {
        assertTrue("so uma MUDANCA de playlist pode gerar nudge", subscribeFn().contains("remotePlaylistId != knownPlaylistId"))
    }
}

/** F-41: o Realtime entrava como anon (sem o JWT do Player): filtro falhava e RLS descartava todo evento. */
class RealtimeAuthTest {
    private fun source(): String = listOf(
        "../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt",
        "sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt"
    ).map { File(it) }.first { it.isFile }.readText()

    @Test fun jwtIsImportedBeforeEverySubscription() {
        val t = source()
        assertTrue(t.contains("client.auth.importAuthToken("))
        val sync = t.substring(t.indexOf("suspend fun subscribeToRealtimeSync"), t.indexOf("suspend fun subscribeToRemoteCommands"))
        assertTrue("sync channels devem autenticar antes de assinar", sync.contains("ensureRealtimeAuth()"))
        val cmds = t.substring(t.indexOf("suspend fun subscribeToRemoteCommands"), t.indexOf("private data class PendingCommandRow"))
        assertTrue("canal de comandos deve autenticar antes de assinar", cmds.contains("ensureRealtimeAuth()"))
    }
}

/**
 * F-42: reportDownloadProgress e upsertDeviceHealth enviavam mapas heterogeneos (Map<String, Any> / Map<String, Any?>)
 * ao supabase-kt, que nao serializa `Any` — a mesma causa do ack (F-39). O erro era engolido em silencio:
 * `download_status` ficou com 0 linhas mesmo com dezenas de downloads (provado em emulador: mídia baixada,
 * progresso reportado, tabela vazia).
 */
class HeterogeneousMapSerializationTest {
    private fun source(): String = listOf(
        "../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt",
        "sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt"
    ).map { File(it) }.first { it.isFile }.readText()

    private fun body(startMarker: String, endMarker: String): String {
        val t = source()
        val a = t.indexOf(startMarker)
        assertTrue("$startMarker nao encontrado", a >= 0)
        val b = t.indexOf(endMarker, a)
        assertTrue("$endMarker nao encontrado", b > a)
        return t.substring(a, b)
    }

    @Test fun reportDownloadProgress_sendsAJsonObject() {
        val b = body("suspend fun reportDownloadProgress(", "// [INDUSTRIAL] Command Acknowledgement")
        assertTrue("o corpo do upsert deve ser JsonObject", b.contains("buildJsonObject"))
        assertFalse("mapOf heterogeneo nao e serializavel", b.contains("mapOf("))
    }

    @Test fun reportDownloadProgress_noLongerFailsSilently() {
        val b = body("suspend fun reportDownloadProgress(", "// [INDUSTRIAL] Command Acknowledgement")
        assertTrue("a falha precisa ficar registrada no log", b.contains("Logger.w("))
    }

    @Test fun upsertDeviceHealth_sendsAJsonObject() {
        val b = body("suspend fun upsertDeviceHealth(", "// [NEW] Update Screen Status")
        assertTrue("o corpo do upsert deve ser JsonObject", b.contains("buildJsonObject"))
        assertFalse("buildMap<String, Any?> nao e serializavel", b.contains("buildMap<String, Any?>"))
    }
}

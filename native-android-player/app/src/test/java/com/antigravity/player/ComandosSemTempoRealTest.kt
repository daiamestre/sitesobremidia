package com.antigravity.player

import com.antigravity.player.util.PlayerFlowPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * F-199: nas TV Box do hotel (Rockchip, Android 7) o tempo real nunca conectava e a assinatura ficava esperando para
 * sempre; a consulta periódica, que vinha DEPOIS dela, nunca ligava. Resultado: tela online, mas nenhum comando do
 * painel (captura de tela, reiniciar, atualizar) chegava.
 */
class ComandosSemTempoRealTest {
    private val repo = File("src/main/java/com/antigravity/player/data/PlayerRepositoryImpl.kt").readText()
    private val rede = File("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt").readText()

    @Test
    fun `a consulta dos comandos liga antes do tempo real e o tempo real tem tempo limite`() {
        val corpo = repo.substring(repo.indexOf("private fun initRemoteCommands"), repo.indexOf("private fun assinarComandosComLimite"))
        val consulta = corpo.indexOf("remoteDataSource.startCommandPolling(uuid, repositoryScope)")
        assertTrue(consulta > 0)
        assertTrue(consulta < corpo.indexOf("assinarComandosComLimite(uuid)"))
        assertTrue(!corpo.contains("remoteDataSource.subscribeToRemoteCommands"))
        val assina = repo.substring(repo.indexOf("private fun assinarComandosComLimite"), repo.indexOf("private fun initRealtimeSync"))
        assertTrue(assina.contains("withTimeout(com.antigravity.player.util.PlayerFlowPolicy.LIMITE_ASSINATURA_MS)"))
        assertTrue(assina.contains("if (e is kotlinx.coroutines.CancellationException) throw e"))
    }

    @Test
    fun `avisos de sincronizacao sao ouvidos antes de assinar e a assinatura tem tempo limite`() {
        val sync = repo.substring(repo.indexOf("private fun initRealtimeSync"))
        assertTrue(sync.indexOf("SessionManager.syncEvents.collect") < sync.indexOf("remoteDataSource.subscribeToRealtimeSync"))
        assertTrue(sync.indexOf("withTimeout(") < sync.indexOf("remoteDataSource.subscribeToRealtimeSync"))
    }

    @Test
    fun `todos os comandos do painel chegam pela consulta e a nova tentativa nao duplica canal`() {
        val lista = rede.substringAfter("COMMAND_POLL_SAFE = listOf(").substringBefore(")")
        for (c in listOf("screenshot", "reload", "reboot", "sync", "update_app", "install_update", "maintenance_open",
                "maintenance_close", "rotate_portrait", "rotate_landscape", "reboot_device", "unpair")) {
            assertTrue(c, lista.contains("\"$c\""))
        }
        assertTrue(rede.contains("client.realtime.removeChannel(antigo)"))
        assertTrue(rede.contains("ouvinteDeComandos?.cancel()"))
        val laco = rede.substring(rede.indexOf("fun startCommandPolling"), rede.indexOf("private suspend fun pollPendingCommands"))
        assertTrue("consulta presa não trava o laço", laco.indexOf("withTimeout(15_000L)") in 1 until laco.indexOf("pollPendingCommands(screenUuid)"))
    }

    @Test
    fun `nova tentativa do tempo real espera cada vez mais ate 10 minutos`() {
        assertEquals(30_000L, PlayerFlowPolicy.esperaNovaAssinaturaMs(1))
        assertEquals(60_000L, PlayerFlowPolicy.esperaNovaAssinaturaMs(2))
        assertEquals(120_000L, PlayerFlowPolicy.esperaNovaAssinaturaMs(3))
        assertEquals(600_000L, PlayerFlowPolicy.esperaNovaAssinaturaMs(10))
        assertEquals(20_000L, PlayerFlowPolicy.LIMITE_ASSINATURA_MS)
    }
}

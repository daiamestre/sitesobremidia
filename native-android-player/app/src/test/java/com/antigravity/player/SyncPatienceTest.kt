package com.antigravity.player

import com.antigravity.player.util.SyncPatience
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * F-181 — a primeira sincronização não pode ser cancelada enquanto as mídias ainda estão baixando.
 * Antes: 30 s para tudo (e 60 s para os downloads). A playlist da TELA-D (5 vídeos, 70 MB) levou 50 s numa internet
 * boa: a sincronização era cancelada antes de guardar a playlist e a tela ficava presa em "Sincronizando Mídias".
 */
class SyncPatienceTest {
    private val seg = 1000L
    private val min = 60 * seg

    @Test
    fun `sem playlist guardada o Player espera os downloads muito alem dos 30 segundos`() {
        assertFalse(SyncPatience.desistirDaAbertura(temPlaylistGuardada = false, decorridoMs = 31 * seg, semAvancoMs = 5 * seg))
        assertFalse(SyncPatience.desistirDaAbertura(false, 50 * seg, 20 * seg)) // o caso real da TELA-D
        assertFalse(SyncPatience.desistirDaAbertura(false, 20 * min, 3 * min))  // internet lenta, mas andando
    }

    @Test
    fun `sem playlist guardada so desiste parado por muito tempo ou no teto`() {
        assertTrue(SyncPatience.desistirDaAbertura(false, 12 * min, SyncPatience.SEM_AVANCO_MS))
        assertTrue(SyncPatience.desistirDaAbertura(false, SyncPatience.TETO_MS, 1 * seg))
        assertFalse(SyncPatience.desistirDaAbertura(false, SyncPatience.TETO_MS - 1, SyncPatience.SEM_AVANCO_MS - 1))
    }

    @Test
    fun `com playlist guardada a tela comeca pelo que tem em 30 segundos`() {
        assertFalse(SyncPatience.desistirDaAbertura(true, 29 * seg, 29 * seg))
        assertTrue(SyncPatience.desistirDaAbertura(true, 30 * seg, 0))
    }

    @Test
    fun `a espera pelos downloads segue enquanto ha avanco`() {
        assertFalse(SyncPatience.desistirDosDownloads(decorridoMs = 61 * seg, semAvancoMs = 10 * seg))
        assertFalse(SyncPatience.desistirDosDownloads(30 * min, 9 * min))
        assertTrue(SyncPatience.desistirDosDownloads(30 * min, 10 * min))
        assertTrue(SyncPatience.desistirDosDownloads(60 * min, 0))
    }

    @Test
    fun `orientacao da tela so conta como mudanca quando a propria coluna muda`() {
        // primeiro valor visto: apenas registra (nao pede sincronizacao)
        assertFalse(SyncPatience.orientacaoDaTelaMudou(ultimaVista = null, recebida = "portrait"))
        // sinal de vida do aparelho reenvia a mesma linha: nada mudou
        assertFalse(SyncPatience.orientacaoDaTelaMudou("portrait", "portrait"))
        assertFalse(SyncPatience.orientacaoDaTelaMudou("portrait", null))
        assertFalse(SyncPatience.orientacaoDaTelaMudou("portrait", ""))
        // o painel girou a tela de verdade
        assertTrue(SyncPatience.orientacaoDaTelaMudou("portrait", "landscape"))
    }

    @Test
    fun `o codigo usa estas regras e os limites fixos antigos sairam`() {
        val vm = File("src/main/java/com/antigravity/player/ui/PlayerViewModel.kt").readText()
        assertTrue(vm.contains("SyncPatience.desistirDaAbertura"))
        assertFalse(vm.contains("withTimeoutOrNull(30000)"))
        // "tem arquivo no disco" nao decide mais o modo de contingencia
        assertFalse(vm.contains("val hasCache = repository.hasLocalMedia()"))

        val repo = File("src/main/java/com/antigravity/player/data/PlayerRepositoryImpl.kt").readText()
        assertTrue(repo.contains("SyncPatience.desistirDosDownloads"))
        assertFalse(repo.contains("val timeoutMs = 60 * 1000L"))

        val rede = File("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt").readText()
        assertTrue(rede.contains("knownScreenOrientation"))
        assertFalse(rede.contains("remoteOrientation != SessionManager.currentOrientation"))

        val principal = File("src/main/java/com/antigravity/player/MainActivity.kt").readText()
        assertTrue(Regex("onSyncSuccess = \\{\\s*(//[^\\n]*\\n\\s*)*scheduleNextBackgroundSync\\(\\)").containsMatchIn(principal))
    }
}

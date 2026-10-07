package com.antigravity.player

import com.antigravity.player.util.SyncReport
import com.antigravity.player.util.SyncReport.withSyncReport
import com.antigravity.player.util.TelemetryCollector.TelemetryData
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Test

/**
 * F-156 — O Player traduz o texto de progresso da sincronização nos campos que o painel mostra
 * (baixando / atualizado, quantas mídias faltam) e NÃO inventa nada quando o texto não fala de mídias.
 */
class SyncReportTest {
    @Before fun limpa() { SyncReport.reset() }
    @After fun limpaDepois() { SyncReport.reset() }

    // 2026-10-07T12:00:00Z
    private val agora = 1791374400000L

    @Test fun contador_viraBaixando_comQuantoFalta() {
        SyncReport.onProgress("Sincronizando: 3 de 10", agora)
        val s = SyncReport.snapshot()!!
        assertEquals(SyncReport.DOWNLOADING, s.status)
        assertEquals(10, s.mediaCount)
        assertEquals(7, s.pendingMediaCount)
    }

    @Test fun contadorCompleto_continuaBaixandoSemPendencia_ateAvisarQueEstaPronto() {
        SyncReport.onProgress("Sincronizando: 10 de 10", agora)
        val s = SyncReport.snapshot()!!
        assertEquals(SyncReport.DOWNLOADING, s.status)
        assertEquals(0, s.pendingMediaCount)
    }

    @Test fun midiasProntas_viraAtualizado_comHoraEmUtc_eTotalDoUltimoContador() {
        SyncReport.onProgress("Sincronizando: 4 de 12", agora)
        SyncReport.onProgress("Mídias prontas. Iniciando reprodução...", agora)
        val s = SyncReport.snapshot()!!
        assertEquals(SyncReport.UPDATED, s.status)
        assertEquals(0, s.pendingMediaCount)
        assertEquals(12, s.mediaCount)
        assertEquals("2026-10-07T12:00:00Z", s.lastSyncAtIso)
    }

    @Test fun baixandoNovasMidias_semContador_mantemOQueSeSabia() {
        SyncReport.onProgress("Mídias prontas. Iniciando reprodução...", agora)
        SyncReport.onProgress("Sincronizando novas mídias...", agora + 1000)
        val s = SyncReport.snapshot()!!
        assertEquals(SyncReport.DOWNLOADING, s.status)
        assertEquals("2026-10-07T12:00:00Z", s.lastSyncAtIso) // a última sincronização completa continua valendo
        SyncReport.onProgress("Corrigindo mídias ausentes...", agora + 2000)
        assertEquals(SyncReport.DOWNLOADING, SyncReport.snapshot()!!.status)
    }

    @Test fun textosQueNaoFalamDeMidias_naoMudamNada() {
        assertNull(SyncReport.snapshot())
        for (t in listOf("Iniciando sincronização...", "Aguardando Identidade do Dispositivo...", "Aguardando seleção de tela...",
            "Bloqueio: pagamento", "Sistema Temporariamente Suspenso.", "Salvando configurações...", "", "   ", "Sincronizando: 0 de 0")) {
            SyncReport.onProgress(t, agora)
            assertNull("texto: '$t'", SyncReport.snapshot())
        }
        SyncReport.onProgress("Mídias prontas. Iniciando reprodução...", agora)
        val antes = SyncReport.snapshot()
        SyncReport.onProgress("Bloqueio: pagamento", agora + 5000)
        assertSame(antes, SyncReport.snapshot())
        SyncReport.onProgress(null, agora + 6000)
        assertSame(antes, SyncReport.snapshot())
    }

    @Test fun contadorAbsurdo_nuncaPassaDoTotal() {
        SyncReport.onProgress("Sincronizando: 15 de 10", agora)
        assertEquals(0, SyncReport.snapshot()!!.pendingMediaCount)
    }

    private fun telemetria() = TelemetryData(
        cpuUsagePercent = null, cpuTemperatureCelsius = null, cpuFrequencyMhz = null,
        memoryUsagePercent = null, memoryUsedMb = null, memoryFreeMb = null, memoryTotalMb = null,
        storageUsedMb = 100, storageFreeMb = 900, storageTotalMb = 1000,
        temperatureCelsius = null, temperatureSource = null, thermalStatus = null,
        batteryLevel = null, batteryTemperatureCelsius = null, batteryStatus = null, batteryHealth = null,
        networkType = null, wifiSignalDbm = null, ipAddress = null, connectionStatus = null, uptimeSeconds = null,
    )

    @Test fun telemetria_semRelatorio_ficaIgual() {
        val t = telemetria()
        assertSame(t, t.withSyncReport())
    }

    @Test fun telemetria_comRelatorio_levaSoOsCamposDeSincronizacao() {
        SyncReport.onProgress("Sincronizando: 3 de 10", agora)
        val t = telemetria().withSyncReport()
        assertEquals("DOWNLOADING", t.syncStatus)
        assertEquals(10, t.mediaCount)
        assertEquals(7, t.pendingMediaCount)
        assertEquals(900L, t.storageFreeMb) // o resto da telemetria não muda
    }
}

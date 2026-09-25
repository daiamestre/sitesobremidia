package com.antigravity.player

import com.antigravity.core.domain.model.MediaType
import com.antigravity.player.playback.PlaybackTimeline
import com.antigravity.player.playback.TransitionPolicy
import com.antigravity.player.playback.VideoFillPlan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Motor de reprodução profissional (F-56). Medido no emulador com o motor ANTERIOR: vídeo de 6 s ocupava 7,06-7,32 s
 * (+18-22%, o tempo de preparo do decoder entrava na conta), 3 buracos pretos de 713-864 ms em 72 s e todas as trocas
 * eram corte seco. Regras: cada mídia fica NO TEMPO configurado (sem deriva), a transição acontece DENTRO do tempo
 * do item (cruzamento; diferente do Xibo, que soma a saída ao tempo) e nunca há quadro vazio entre itens.
 */
class PlaybackEngineRulesTest {

    // ---------------- linha do tempo sem deriva ----------------
    private class FakeClock(var now: Long = 1_000L) {
        fun read() = now
    }

    @Test fun timeline_firstSlotStartsNow() {
        val c = FakeClock(5_000); val t = PlaybackTimeline(c::read)
        val s = t.claim(6_000)
        assertEquals(5_000L, s.startAt); assertEquals(11_000L, s.endAt)
    }

    @Test fun timeline_smallLateness_keepsTheSchedule_noDrift() {
        val c = FakeClock(0); val t = PlaybackTimeline(c::read)
        t.claim(6_000)                    // 0..6000
        c.now = 6_040                      // overhead normal do laço: 40 ms depois do prazo
        val b = t.claim(6_000)
        assertEquals("mantém a agenda: começa no prazo planejado", 6_000L, b.startAt)
        assertEquals(12_000L, b.endAt)
    }

    @Test fun timeline_bigLateness_startsNowWithTheFullConfiguredTime() {
        val c = FakeClock(0); val t = PlaybackTimeline(c::read)
        t.claim(6_000)                    // 0..6000
        c.now = 7_200                      // preparo lento: 1,2 s depois do prazo
        val b = t.claim(6_000)
        assertEquals(7_200L, b.startAt)
        assertEquals("nenhuma mídia é encurtada de forma visível", 6_000L, b.endAt - b.startAt)
    }

    @Test fun timeline_cycleWithLoopOverhead_closesExactlyOnTheSumOfDurations() {
        val c = FakeClock(0); val t = PlaybackTimeline(c::read)
        val durations = listOf(6_000L, 4_000L, 6_000L, 4_000L)   // ciclo de 20 s
        var end = 0L
        repeat(50) { cycle -> durations.forEach { d ->
            val s = t.claim(d); end = s.endAt
            c.now = s.endAt + 30      // 30 ms de overhead do laço a cada item
        } }
        assertEquals("50 ciclos x 20 s, sem deriva", 50 * 20_000L, end)
    }

    @Test fun timeline_earlyClaimWaitsForPlannedBoundary() {
        val c = FakeClock(0); val t = PlaybackTimeline(c::read)
        t.claim(6_000)                     // 0..6000
        c.now = 4_000                      // próximo item ficou pronto cedo (pré-carregado)
        val b = t.claim(4_000)
        assertEquals("não começa antes de o anterior terminar", 6_000L, b.startAt)
        assertEquals(10_000L, b.endAt)
    }

    @Test fun timeline_manyItems_noDrift() {
        val c = FakeClock(0); val t = PlaybackTimeline(c::read)
        var expectedStart = 0L
        repeat(100) { i ->
            val d = 3_000L + (i % 4) * 1_000L
            c.now = if (i == 0) 0L else expectedStart - 1   // sempre pronto um instante antes do prazo (pré-carregado)
            val s = t.claim(d)
            assertEquals(expectedStart, s.startAt)
            assertEquals(d, s.endAt - s.startAt)
            expectedStart = s.endAt
        }
    }

    @Test fun timeline_reset_reanchorsToNow() {
        val c = FakeClock(0); val t = PlaybackTimeline(c::read)
        t.claim(6_000); t.reset(); c.now = 50_000
        assertEquals(50_000L, t.claim(1_000).startAt)
    }

    // ---------------- política de transição ----------------
    @Test fun fade_defaultIs500ms_forNormalItems() =
        assertEquals(500L, TransitionPolicy.fadeMs("crossfade", 6_000, hasOutgoing = true, videoToVideoOnSingleDecoder = false))

    @Test fun fade_isInsideTheSlot_neverMoreThanAQuarterOfIt() {
        assertEquals(500L, TransitionPolicy.fadeMs("crossfade", 2_000, true, false))
        assertEquals(250L, TransitionPolicy.fadeMs("crossfade", 1_000, true, false))
    }

    @Test fun fade_tooShortItem_becomesCut() =
        assertEquals(0L, TransitionPolicy.fadeMs("crossfade", 300, true, false))

    @Test fun fade_cutEffect_isInstant() {
        assertEquals(0L, TransitionPolicy.fadeMs("cut", 6_000, true, false))
        assertEquals(0L, TransitionPolicy.fadeMs("none", 6_000, true, false))
    }

    @Test fun fade_firstItemHasNothingToFadeFrom() =
        assertEquals(0L, TransitionPolicy.fadeMs("crossfade", 6_000, hasOutgoing = false, videoToVideoOnSingleDecoder = false))

    @Test fun fade_weakBoxWithOneDecoder_cutsVideoToVideo() =
        assertEquals(0L, TransitionPolicy.fadeMs("crossfade", 6_000, true, videoToVideoOnSingleDecoder = true))

    @Test fun fade_unknownEffectDefaultsToFade() =
        assertEquals(500L, TransitionPolicy.fadeMs(null, 6_000, true, false))

    // ---------------- vídeo x tempo configurado ----------------
    @Test fun video_longerThanConfigured_isCutAtTheConfiguredTime() =
        assertEquals(6_000L, VideoFillPlan.plan(configuredMs = 6_000, realMs = 15_000).playMs)

    @Test fun video_shorterThanConfigured_playsOnceFully_neverRepeats() {
        // ACADEMIA 3: 17,7 s real configurado em 23 s. A 5.4.0 voltava ao início e cortava aos 23 s (repetição distorcida
        // no tablet Unisoc). Agora toca uma vez inteiro e a playlist segue.
        assertEquals(17_700L, VideoFillPlan.plan(configuredMs = 23_000, realMs = 17_700).playMs)
    }

    @Test fun video_sameAsConfigured_playsOnce() =
        assertEquals(12_000L, VideoFillPlan.plan(configuredMs = 12_000, realMs = 12_100).playMs)

    @Test fun video_configuredZero_meansFullVideo() =
        assertEquals(9_400L, VideoFillPlan.plan(configuredMs = 0, realMs = 9_400).playMs)

    @Test fun video_unknownRealLength_usesConfigured() =
        assertEquals(8_000L, VideoFillPlan.plan(configuredMs = 8_000, realMs = -1).playMs)

    // ---------------- pré-carga ----------------
    @Test fun preload_startsLeadBeforeTheEnd_butAfterTheFade() {
        // item de 10 s (0..10000), fade 500: pré-carga do vídeo seguinte 5 s antes do fim
        assertEquals(5_000L, PlaybackTimeline.preloadAt(startAt = 0, endAt = 10_000, fadeMs = 500, leadMs = 5_000))
        // item curto de 3 s: não pode começar antes do fim do fade (500) + folga
        assertEquals(650L, PlaybackTimeline.preloadAt(startAt = 0, endAt = 3_000, fadeMs = 500, leadMs = 5_000))
    }

    @Test fun preload_tooLateToBeUseful_isSkipped() =
        assertEquals(-1L, PlaybackTimeline.preloadAt(startAt = 0, endAt = 700, fadeMs = 500, leadMs = 5_000))

    @Test fun videoToVideo_isDetectedFromTheTypes() {
        assertTrue(TransitionPolicy.isVideoToVideo(MediaType.VIDEO, MediaType.VIDEO))
        assertFalse(TransitionPolicy.isVideoToVideo(MediaType.IMAGE, MediaType.VIDEO))
        assertFalse(TransitionPolicy.isVideoToVideo(null, MediaType.VIDEO))
    }
}

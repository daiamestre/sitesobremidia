package com.antigravity.core.util

import com.antigravity.core.domain.model.MediaType
import org.junit.Assert.assertEquals
import org.junit.Test

/** F-46: duracao 0/negativa (o painel permitia `min=0`) gerava imagem/widget de 0 s (pisca e pula). */
class PlaybackDurationTest {
    @Test fun image_zeroBecomesDefault() = assertEquals(10L, PlaybackDuration.effectiveSeconds(MediaType.IMAGE, 0L))
    @Test fun image_negativeBecomesDefault() = assertEquals(10L, PlaybackDuration.effectiveSeconds(MediaType.IMAGE, -5L))
    @Test fun widget_zeroBecomesDefault() = assertEquals(10L, PlaybackDuration.effectiveSeconds(MediaType.WEB_WIDGET, 0L))
    @Test fun image_positiveIsKept() = assertEquals(25L, PlaybackDuration.effectiveSeconds(MediaType.IMAGE, 25L))
    @Test fun video_zeroMeansFullVideo() = assertEquals(0L, PlaybackDuration.effectiveSeconds(MediaType.VIDEO, 0L))
    @Test fun video_positiveIsKept() = assertEquals(58L, PlaybackDuration.effectiveSeconds(MediaType.VIDEO, 58L))
}

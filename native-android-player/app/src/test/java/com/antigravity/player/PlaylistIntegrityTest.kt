package com.antigravity.player

import com.antigravity.cache.entity.CachedMediaItem
import com.antigravity.cache.entity.toCacheRows
import com.antigravity.cache.entity.toDomain
import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.domain.model.Playlist
import com.antigravity.player.util.PlayerFlowPolicy
import com.antigravity.player.util.QueueManager
import com.antigravity.sync.dto.RemotePlaylistItemDTO
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Auditoria da playlist (painel -> banco -> RPC -> Player). Cada teste falhava antes das correcoes; ver F-45..F-49.
 */
class PlaylistIntegrityTest {

    private fun item(id: String, order: Int, dur: Long = 10, start: String? = null, end: String? = null, days: String? = null, hash: String = "h-$id") =
        MediaItem(id = id, name = id, type = MediaType.IMAGE, durationSeconds = dur, remoteUrl = "u/$id", localPath = null,
            hash = hash, orderIndex = order, startTime = start, endTime = end, daysOfWeek = days)

    private fun playlist(vararg items: MediaItem, audio: Boolean = false, orientation: String = "landscape") =
        Playlist(id = "p1", name = "p", version = 1L, items = items.toList(), orientation = orientation, audioEnabled = audio)

    // ---------- F-47: a assinatura de configuracao precisa enxergar duracao e agendamento ----------
    @Test fun signature_sameConfig_isStable() {
        val a = playlist(item("A", 0), item("B", 1)); val b = playlist(item("A", 0), item("B", 1))
        assertEquals(PlayerFlowPolicy.configSignature(a), PlayerFlowPolicy.configSignature(b))
    }
    @Test fun signature_changesWhenDurationChanges() =
        assertNotEquals(PlayerFlowPolicy.configSignature(playlist(item("A", 0, dur = 30))), PlayerFlowPolicy.configSignature(playlist(item("A", 0, dur = 12))))
    @Test fun signature_changesWhenStartTimeChanges() =
        assertNotEquals(PlayerFlowPolicy.configSignature(playlist(item("A", 0))), PlayerFlowPolicy.configSignature(playlist(item("A", 0, start = "08:00"))))
    @Test fun signature_changesWhenEndTimeChanges() =
        assertNotEquals(PlayerFlowPolicy.configSignature(playlist(item("A", 0, end = "18:00"))), PlayerFlowPolicy.configSignature(playlist(item("A", 0, end = "19:00"))))
    @Test fun signature_changesWhenDaysChange() =
        assertNotEquals(PlayerFlowPolicy.configSignature(playlist(item("A", 0, days = "1,2"))), PlayerFlowPolicy.configSignature(playlist(item("A", 0, days = "1,2,3"))))
    @Test fun signature_changesWhenAudioPolicyChanges() =
        assertNotEquals(PlayerFlowPolicy.configSignature(playlist(item("A", 0), audio = false)), PlayerFlowPolicy.configSignature(playlist(item("A", 0), audio = true)))
    @Test fun signature_changesWhenOrderChanges() =
        assertNotEquals(PlayerFlowPolicy.configSignature(playlist(item("A", 0), item("B", 1))), PlayerFlowPolicy.configSignature(playlist(item("B", 0), item("A", 1))))

    // ---------- F-48: mesma midia repetida na playlist ----------
    @Test fun repeatedMedia_keepsEveryRowInRoom() {
        val rows = listOf(item("A", 0, 30), item("B", 1, 15), item("A", 2, 5)).toCacheRows("p1")
        assertEquals("3 itens no servidor => 3 linhas no Room", 3, rows.size)
        assertEquals("ids de linha unicos (PK)", 3, rows.map { it.id }.toSet().size)
        assertEquals(listOf(30L, 15L, 5L), rows.map { it.durationSeconds })
    }

    @Test fun repeatedMedia_roundTripsToTheOriginalMediaId() {
        val rows: List<CachedMediaItem> = listOf(item("A", 0), item("B", 1), item("A", 2)).toCacheRows("p1")
        assertEquals(listOf("A", "B", "A"), rows.map { it.toDomain().id })
    }

    @Test fun firstOccurrence_keepsThePlainMediaId() {
        val rows = listOf(item("A", 0), item("A", 1)).toCacheRows("p1")
        assertEquals("A", rows[0].id) // compatibilidade com caches/arquivos ja existentes
    }

    @Test fun queue_playsRepeatedMediaInDeclaredOrder() {
        val list = listOf(item("A", 0), item("B", 1), item("A", 2), item("C", 3))
        val q = QueueManager()
        val played = mutableListOf<String>()
        repeat(8) {
            val next = q.getNextPlayableItem(list).first!!
            played += "${next.id}${next.orderIndex}"
            q.markAsProcessed(next)
        }
        assertEquals(listOf("A0", "B1", "A2", "C3", "A0", "B1", "A2", "C3"), played)
    }

    @Test fun queue_survivesScheduleFilteringBetweenTurns() {
        val q = QueueManager()
        val full = listOf(item("A", 0), item("B", 1), item("C", 2))
        val first = q.getNextPlayableItem(full).first!!; q.markAsProcessed(first)      // A
        val withoutB = listOf(item("A", 0), item("C", 2))                              // B saiu da janela
        val second = q.getNextPlayableItem(withoutB).first!!
        assertEquals("C", second.id)
    }

    // ---------- F-49: o RPC entrega `days` como array; o DTO so lia string (sync inteiro quebrava) ----------
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun dto_daysAsArray_isAccepted() {
        val dto = json.decodeFromString<RemotePlaylistItemDTO>("""{"id":"i","position":0,"duration":10,"days_of_week":[1,2,3]}""")
        assertEquals("1,2,3", dto.daysOfWeek)
    }
    @Test fun dto_daysAsString_isAccepted() {
        val dto = json.decodeFromString<RemotePlaylistItemDTO>("""{"id":"i","position":0,"duration":10,"days_of_week":"1,2"}""")
        assertEquals("1,2", dto.daysOfWeek)
    }
    @Test fun dto_daysNull_isAccepted() {
        val dto = json.decodeFromString<RemotePlaylistItemDTO>("""{"id":"i","position":0,"duration":10,"days_of_week":null}""")
        assertNull(dto.daysOfWeek)
    }
    @Test fun dto_daysMissing_isAccepted() {
        val dto = json.decodeFromString<RemotePlaylistItemDTO>("""{"id":"i","position":0,"duration":10}""")
        assertNull(dto.daysOfWeek)
    }
    @Test fun dto_emptyArray_meansNoRestriction() {
        val dto = json.decodeFromString<RemotePlaylistItemDTO>("""{"id":"i","position":0,"duration":10,"days_of_week":[]}""")
        assertTrue(dto.daysOfWeek.isNullOrEmpty())
    }
}

package com.antigravity.cache.dao

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.antigravity.cache.db.PlayerDatabase
import com.antigravity.cache.entity.CachedMediaItem
import com.antigravity.cache.entity.CachedPlaylist
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * [F-18] PlayerDao.insertPlaylistWithItems — adoção atômica da playlist no Room real.
 *
 * A troca faz deleteAllPlaylists → deleteAllMediaItems → insertPlaylist → insertItems.
 * Uma falha no meio (simulada por trigger SQLite) deve fazer rollback: a playlist anterior
 * continua íntegra para o playback offline.
 */
@RunWith(AndroidJUnit4::class)
class PlaylistAdoptionAtomicityTest {

    private lateinit var db: PlayerDatabase
    private lateinit var dao: PlayerDao

    private fun playlist(id: String) = CachedPlaylist(
        id = id,
        name = "Playlist $id",
        version = 1L,
        isEmergency = false
    )

    private fun item(id: String, playlistId: String, order: Int) = CachedMediaItem(
        id = id,
        playlistId = playlistId,
        name = "Media $id",
        type = "VIDEO",
        durationSeconds = 10L,
        remoteUrl = "https://example.invalid/$id.mp4",
        localPath = null,
        hash = "hash_$id",
        orderIndex = order
    )

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            PlayerDatabase::class.java
        ).build()
        dao = db.playerDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun f18_failureDuringAdoption_keepsPreviousPlaylistIntact() = runBlocking {
        // Playlist atual em reprodução.
        dao.insertPlaylistWithItems(playlist("A"), listOf(item("a1", "A", 0), item("a2", "A", 1)))
        assertEquals("A", dao.getActivePlaylist()?.id)

        // Falha injetada no insert de um item da nova playlist (após os DELETEs).
        db.openHelper.writableDatabase.execSQL(
            "CREATE TRIGGER f18_fail BEFORE INSERT ON media_item WHEN NEW.id = 'BOOM' " +
                "BEGIN SELECT RAISE(ABORT, 'f18 injected failure'); END"
        )

        var failed = false
        try {
            dao.insertPlaylistWithItems(playlist("B"), listOf(item("b1", "B", 0), item("BOOM", "B", 1)))
        } catch (e: Exception) {
            failed = true
        }
        assertTrue("A falha injetada deve ocorrer", failed)

        val active = dao.getActivePlaylist()
        assertNotNull("Após falha na adoção, o Room não pode ficar sem playlist", active)
        assertEquals("A playlist anterior deve permanecer ativa", "A", active?.id)
        assertEquals("Os itens da playlist anterior devem permanecer", 2, dao.getItemsForPlaylist("A").size)
        assertEquals("Nenhum item parcial da nova playlist pode persistir", 0, dao.getItemsForPlaylist("B").size)
    }

    @Test
    fun f18_successfulAdoption_replacesPlaylist() = runBlocking {
        dao.insertPlaylistWithItems(playlist("A"), listOf(item("a1", "A", 0)))
        dao.insertPlaylistWithItems(playlist("B"), listOf(item("b1", "B", 0), item("b2", "B", 1)))

        assertEquals("B", dao.getActivePlaylist()?.id)
        assertEquals(2, dao.getItemsForPlaylist("B").size)
        assertEquals(0, dao.getItemsForPlaylist("A").size)
    }
}

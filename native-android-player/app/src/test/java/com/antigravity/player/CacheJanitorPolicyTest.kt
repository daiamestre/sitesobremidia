package com.antigravity.player

import com.antigravity.cache.worker.CacheJanitorPolicy
import com.antigravity.cache.worker.CacheJanitorPolicy.Decisao
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * F-181 — a limpeza diária (03:00) não pode apagar as mídias da playlist.
 * Antes: o arquivo "<id>_<hash>.dat" não era reconhecido (a limpeza só conhecia "<id>.dat") e TODAS as mídias
 * eram apagadas como órfãs toda madrugada; e mídia sem MD5 no painel era apagada como corrompida.
 */
class CacheJanitorPolicyTest {
    private val md5 = "5e8eb68349e1143092c687197b0feab7"
    private val agora = 1_000_000_000_000L
    private val antigo = agora - 3 * 24 * 60 * 60 * 1000L

    @Test
    fun `o nome do arquivo e o mesmo que o Player grava`() {
        assertEquals("m1_$md5.dat", CacheJanitorPolicy.nomeDoArquivo("m1", md5))
        assertEquals("m1.dat", CacheJanitorPolicy.nomeDoArquivo("m1", ""))
        // caracteres fora de letras, numeros, _ e - saem do nome (igual ao FileStorageManager)
        assertEquals("m1_abc123.dat", CacheJanitorPolicy.nomeDoArquivo("m1", "a/b:c 1.2?3"))
    }

    @Test
    fun `midia da playlist com hash no nome nunca e apagada como orfa`() {
        val validos = CacheJanitorPolicy.arquivosValidos(listOf("m1" to md5, "m2" to "outrohash"))
        assertEquals(Decisao.CONFERIR_MD5, CacheJanitorPolicy.decidir("m1_$md5.dat", antigo, agora, validos))
        assertEquals(Decisao.MANTER, CacheJanitorPolicy.decidir("m2_outrohash.dat", antigo, agora, validos))
        // o nome antigo (so o id) tambem continua valendo
        assertTrue(validos.containsKey("m1.dat"))
        assertTrue(validos.containsKey("m2.dat"))
    }

    @Test
    fun `midia sem MD5 no painel usa o id como identificador e nao e conferida nem apagada`() {
        val id = "a0a631c4-9e01-4ceb-b3f7-fb275240e8a4"
        val validos = CacheJanitorPolicy.arquivosValidos(listOf(id to id))
        assertNull(CacheJanitorPolicy.md5Esperado(id))
        assertEquals(Decisao.MANTER, CacheJanitorPolicy.decidir("${id}_$id.dat", antigo, agora, validos))
    }

    @Test
    fun `a mesma midia repetida na playlist aponta para um arquivo so`() {
        val validos = CacheJanitorPolicy.arquivosValidos(listOf("m1" to md5, "m1~1" to md5, "m1~2" to md5))
        assertEquals(setOf("m1_$md5.dat", "m1.dat"), validos.keys)
    }

    @Test
    fun `arquivo que nao esta em nenhuma playlist e lixo, a nao ser que seja download recente`() {
        val validos = CacheJanitorPolicy.arquivosValidos(listOf("m1" to md5))
        assertEquals(Decisao.APAGAR_ORFAO, CacheJanitorPolicy.decidir("velho_abc.dat", antigo, agora, validos))
        // playlist nova ainda baixando (nao adotada): nao apaga o que acabou de chegar
        assertEquals(Decisao.MANTER, CacheJanitorPolicy.decidir("novo_abc.dat", agora - 60_000L, agora, validos))
        assertEquals(Decisao.MANTER, CacheJanitorPolicy.decidir("novo_abc.dat.tmp", antigo, agora, validos))
        assertEquals(Decisao.APAGAR_ORFAO, CacheJanitorPolicy.decidir("novo_abc.dat", agora - CacheJanitorPolicy.CARENCIA_MS - 1, agora, validos))
    }

    @Test
    fun `so e corrompido quando o MD5 calculado existe e difere`() {
        assertFalse(CacheJanitorPolicy.corrompido(md5, md5))
        assertFalse(CacheJanitorPolicy.corrompido(md5.uppercase(), md5))
        assertTrue(CacheJanitorPolicy.corrompido("00000000000000000000000000000000", md5))
        // falha ao ler o arquivo nao condena a midia
        assertFalse(CacheJanitorPolicy.corrompido(null, md5))
        assertFalse(CacheJanitorPolicy.corrompido("", md5))
    }

    @Test
    fun `sem nenhuma playlist guardada nada recente e apagado`() {
        val validos = CacheJanitorPolicy.arquivosValidos(emptyList())
        assertTrue(validos.isEmpty())
        assertEquals(Decisao.MANTER, CacheJanitorPolicy.decidir("m1_$md5.dat", agora - 1000L, agora, validos))
    }

    @Test
    fun `a limpeza usa estas regras e nao volta a comparar so pelo id`() {
        val fonte = java.io.File("../cache-manager/src/main/java/com/antigravity/cache/worker/MaintenanceWorker.kt").readText()
        assertTrue(fonte.contains("CacheJanitorPolicy.arquivosValidos"))
        assertTrue(fonte.contains("CacheJanitorPolicy.decidir"))
        assertFalse(fonte.contains("validMediaItems.map { \"\${it.id}.dat\" }"))
    }
}

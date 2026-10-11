package com.antigravity.player

import com.antigravity.player.util.HardwareIdentity
import com.antigravity.player.util.PlayerFlowPolicy
import com.antigravity.player.util.PlayerFlowPolicy.SyncErrorAction
import com.antigravity.sync.service.IdentityState
import com.antigravity.sync.service.PairingPolicy
import com.antigravity.sync.service.PairingPolicy.Disponibilidade
import com.antigravity.sync.service.SessionManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * F-182 — o MESMO login em vários aparelhos; só a MESMA tela não pode ficar em dois aparelhos.
 */
class LoginEmVariosAparelhosTest {
    private val aparelhoA = "a".repeat(64)
    private val aparelhoB = "b".repeat(64)

    // ---------------------------------------------------------------- regra: login livre, tela exclusiva
    @Test
    fun `tela sem aparelho e livre para qualquer aparelho do mesmo login`() {
        assertEquals(Disponibilidade.LIVRE, PairingPolicy.disponibilidade(null, aparelhoA))
        assertEquals(Disponibilidade.LIVRE, PairingPolicy.disponibilidade("", aparelhoB))
        assertEquals(Disponibilidade.LIVRE, PairingPolicy.disponibilidade("   ", aparelhoB))
    }

    @Test
    fun `tela conectada a outro aparelho nao pode ser tomada, a do proprio aparelho pode`() {
        assertEquals(Disponibilidade.EM_USO, PairingPolicy.disponibilidade(aparelhoA, aparelhoB))
        assertEquals(Disponibilidade.DESTE_APARELHO, PairingPolicy.disponibilidade(aparelhoA, aparelhoA))
        assertEquals(Disponibilidade.DESTE_APARELHO, PairingPolicy.disponibilidade(aparelhoA.uppercase(), aparelhoA))
    }

    @Test
    fun `sem identidade conhecida a tela de outro nunca parece ser deste aparelho`() {
        // o defeito antigo: identidade zerada => nenhuma tela era "deste aparelho"; mas jamais pode virar "livre"
        assertEquals(Disponibilidade.EM_USO, PairingPolicy.disponibilidade(aparelhoA, null))
        assertEquals(Disponibilidade.EM_USO, PairingPolicy.disponibilidade(aparelhoA, ""))
    }

    @Test
    fun `o aparelho que ja esta numa tela e achado para ser liberado na troca`() {
        val telas = listOf("t1" to aparelhoB, "t2" to aparelhoA, "t3" to null)
        assertEquals("t2", PairingPolicy.telaAtualDoAparelho(telas, aparelhoA, exceto = "t3"))
        assertNull(PairingPolicy.telaAtualDoAparelho(telas, aparelhoA, exceto = "t2")) // escolheu a que já é dele
        assertNull(PairingPolicy.telaAtualDoAparelho(listOf("t1" to aparelhoB, "t3" to null), aparelhoA, exceto = "t3"))
    }

    // ---------------------------------------------------------------- comando "desvincular" para o aparelho certo
    @Test
    fun `o comando de desvincular alcanca o aparelho alvo e so ele (defeito antigo - comparava hash com UUID)`() {
        val uuidDoCadastroA = "11111111-2222-3333-4444-555555555555"
        // o servidor grava no comando a IDENTIDADE (hash) do aparelho que estava conectado
        assertTrue("o aparelho alvo tem que obedecer", PairingPolicy.comandoEhDesteAparelho(aparelhoA, aparelhoA, uuidDoCadastroA))
        assertFalse("outro aparelho tem que ignorar", PairingPolicy.comandoEhDesteAparelho(aparelhoA, aparelhoB, "99999999-0000-0000-0000-000000000000"))
        // o UUID do cadastro também vale
        assertTrue(PairingPolicy.comandoEhDesteAparelho(uuidDoCadastroA, aparelhoA, uuidDoCadastroA))
        // aparelho que ainda não recebeu o UUID (antes do vínculo) obedecia QUALQUER comando: agora confere a identidade
        assertFalse(PairingPolicy.comandoEhDesteAparelho(aparelhoA, aparelhoB, null))
        assertTrue(PairingPolicy.comandoEhDesteAparelho(aparelhoA, aparelhoA, null))
    }

    @Test
    fun `comando sem alvo vale para a tela inteira`() {
        assertTrue(PairingPolicy.comandoEhDesteAparelho(null, aparelhoA, null))
        assertTrue(PairingPolicy.comandoEhDesteAparelho("", aparelhoB, "x"))
        assertTrue(PairingPolicy.comandoEhDesteAparelho("alvo", null, null)) // sem como comparar: comportamento antigo
    }

    // ---------------------------------------------------------------- sair da conta não apaga a identidade do aparelho
    @Test
    fun `sair da conta nao apaga a identidade do aparelho`() {
        SessionManager.setIdentity(aparelhoA)
        SessionManager.currentAccessToken = "token-de-teste"
        SessionManager.clear()
        assertNull("o login sai", SessionManager.currentAccessToken)
        assertEquals("a identidade do aparelho fica", aparelhoA, SessionManager.deviceIdentityHash)
        assertEquals(IdentityState.IDENTITY_READY, SessionManager.identityState.value)
    }

    // ---------------------------------------------------------------- identidade de aparelhos com ANDROID_ID quebrado
    @Test
    fun `android id bom gera o mesmo texto de sempre (as telas ja conectadas nao mudam)`() {
        val texto = HardwareIdentity.textoBase("0123456789abcdef", "marca/modelo/build", sorteioDoAparelho = { error("não deve sortear") })
        assertEquals("sobremidia::device::0123456789abcdef::marca/modelo/build", texto)
    }

    @Test
    fun `unidades com android id quebrado deixam de ter a mesma identidade`() {
        for (quebrado in listOf(null, "", "unknown", "null", "9774d56d682e549c", "9774D56D682E549C", "abc")) {
            assertFalse("'$quebrado' não é válido", HardwareIdentity.androidIdValido(quebrado))
            val a = HardwareIdentity.textoBase(quebrado, "mesmo/firmware", { "sorteio-da-unidade-A" })
            val b = HardwareIdentity.textoBase(quebrado, "mesmo/firmware", { "sorteio-da-unidade-B" })
            assertNotEquals("duas unidades iguais não podem colidir ($quebrado)", a, b)
            // e a mesma unidade continua com a mesma identidade
            assertEquals(a, HardwareIdentity.textoBase(quebrado, "mesmo/firmware", { "sorteio-da-unidade-A" }))
        }
        assertTrue(HardwareIdentity.androidIdValido("a1b2c3d4e5f60718"))
    }

    // ---------------------------------------------------------------- o que o Player faz quando a tela está em uso
    @Test
    fun `tela em uso por outro aparelho volta para a escolha de tela, sem ficar tentando para sempre`() {
        assertEquals(SyncErrorAction.SCREEN_IN_USE, PlayerFlowPolicy.classifySyncError("DEVICE_ALREADY_BOUND"))
        assertEquals(SyncErrorAction.SCREEN_IN_USE, PlayerFlowPolicy.classifySyncError("Falha: DEVICE_BINDING_MISMATCH (x)"))
        // o resto continua como antes
        assertEquals(SyncErrorAction.REAUTH, PlayerFlowPolicy.classifySyncError("JWT expired"))
        assertEquals(SyncErrorAction.REAUTH, PlayerFlowPolicy.classifySyncError("HTTP 401"))
        assertEquals(SyncErrorAction.SELECT_SCREEN, PlayerFlowPolicy.classifySyncError("[PERMANENT] Tela não encontrada"))
        assertEquals(SyncErrorAction.RETRY, PlayerFlowPolicy.classifySyncError("Timed out waiting for 30000 ms"))
        assertEquals(SyncErrorAction.RETRY, PlayerFlowPolicy.classifySyncError("NO_PLAYLIST_ASSIGNED"))
        assertTrue(PlayerFlowPolicy.AVISO_TELA_EM_USO.contains("em quantos aparelhos quiser"))
        assertTrue(PlayerFlowPolicy.AVISO_TELA_EM_USO.contains("Desvincular aparelho"))
    }

    // ---------------------------------------------------------------- o código usa as regras
    @Test
    fun `a escolha de tela segue a regra e o Transferir que tomava a tela de outro aparelho saiu`() {
        val tela = File("src/main/java/com/antigravity/player/ui/ScreenSelectionActivity.kt").readText()
        assertTrue(tela.contains("PairingPolicy.disponibilidade"))
        assertFalse("não pode mais desligar o outro aparelho", tela.contains("adminUnpairScreen"))
        assertFalse("sem o botão Transferir", tela.contains("setPositiveButton(\"Transferir\")"))
        assertFalse(tela.contains("Transferir Tela"))
        assertTrue("o aparelho troca a própria tela", tela.contains("liberarEConectar"))
        assertTrue(tela.contains("extra_aviso"))
        assertTrue("identidade recalculada se faltar", tela.contains("getHardwareIdentity"))
    }

    @Test
    fun `o recebimento de comandos usa a identidade do aparelho nos dois caminhos (tempo real e consulta)`() {
        val rede = File("../sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt").readText()
        assertEquals(2, Regex("PairingPolicy\\.comandoEhDesteAparelho\\(targetDeviceId, SessionManager\\.deviceIdentityHash, SessionManager\\.boundDeviceId\\)").findAll(rede).count())
        assertFalse(rede.contains("targetDeviceId != SessionManager.boundDeviceId"))
    }

    @Test
    fun `a abertura trata tela em uso e o login garante a identidade`() {
        val principal = File("src/main/java/com/antigravity/player/MainActivity.kt").readText()
        assertTrue(principal.contains("SyncErrorAction.SCREEN_IN_USE"))
        assertTrue(principal.contains("PlayerFlowPolicy.AVISO_TELA_EM_USO"))
        val login = File("src/main/java/com/antigravity/player/ui/LoginActivity.kt").readText()
        assertTrue(login.contains("deviceIdentityHash.isNullOrBlank()"))
        val vm = File("src/main/java/com/antigravity/player/ui/PlayerViewModel.kt").readText()
        assertTrue(vm.contains("val hasCache = !telaOcupada"))
        val sessao = File("../sync-network/src/main/java/com/antigravity/sync/service/SessionManager.kt").readText()
        val clear = sessao.substring(sessao.indexOf("fun clear()"))
        assertFalse("clear() não pode apagar a identidade do aparelho", clear.contains("deviceIdentityHash = null"))
    }
}

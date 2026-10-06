package com.antigravity.player

import com.antigravity.player.zone.RectPx
import com.antigravity.player.zone.ZoneFit
import com.antigravity.player.zone.ZoneGeometry
import com.antigravity.player.zone.ZoneItem
import com.antigravity.player.zone.ZoneItemKind
import com.antigravity.player.zone.ZoneLayoutParser
import com.antigravity.player.zone.ZoneLayoutResult
import com.antigravity.player.zone.ZoneRotation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** F-149 — divisão da tela em zonas: leitura do contrato, geometria e a regra de não repetir mídia. */
class ZoneLayoutTest {

    private val resposta = """
    {"status":"SUCCESS","layout":{"id":"L1","tela_id":"T1","versao":3,"largura":1920,"altura":1080,"cor_fundo":"#101010","campo_novo":true,
      "zonas":[
        {"id":"z1","numero":1,"x":0,"y":0,"largura":1440,"altura":1080,"ordem_z":0,"rotacao":0,"modo_encaixe":"CONTER","principal":true,"audio":true,
         "excluir_itens":["a9"],"excluir_midias":["m9"],"playlist":null},
        {"id":"z2","numero":2,"x":1440,"y":0,"largura":480,"altura":1080,"ordem_z":1,"modo_encaixe":"COBRIR","principal":false,"audio":false,"excluir_midias":[],
         "playlist":{"id":"p2","name":"Lateral","audio_enabled":false,"playlist_items":[
            {"id":"i1","position":0,"duration":8,"media":{"id":"m1","name":"oferta","file_url":"https://cdn/x/oferta.jpg","file_type":"image","file_hash":null},"widget":null},
            {"id":"i2","position":1,"duration":0,"media":{"id":"m2","name":"filme","file_url":"https://cdn/x/filme.mp4?v=1","file_type":"video"},"widget":null},
            {"id":"i3","position":2,"duration":15,"media":null,"widget":{"id":"w1","name":"Relógio","widget_type":"Clock","config":{"showDate":true}}},
            {"id":"i4","position":3,"duration":10,"media":{"id":"m4","file_url":"https://cdn/x/som.mp3","file_type":"audio"},"widget":null},
            {"id":"i5","position":4,"duration":10,"media":null,"widget":null}
         ]}},
        {"id":"z3","numero":3,"x":0,"y":0,"largura":0,"altura":10,"principal":false,"playlist":null}
      ]}}
    """.trimIndent()

    private fun layout() = (ZoneLayoutParser.parse(resposta) as ZoneLayoutResult.Ok).layout

    @Test fun `le o contrato - principal sem itens proprios, zona com imagem, video e widget`() {
        val l = layout()
        assertEquals(listOf("L1", "T1", 3, 1920, 1080, "#101010"), listOf(l.id, l.telaId, l.versao, l.largura, l.altura, l.corFundo))
        assertEquals("zona de tamanho inválido fica de fora", 2, l.zonas.size)
        val p = l.principal!!
        assertTrue(p.items.isEmpty())
        assertEquals(setOf("m9"), p.excluirMidias)
        assertTrue(p.audio)
        val z = l.secundarias.single()
        assertEquals(ZoneFit.COVER, z.fit)
        assertEquals(listOf(ZoneItemKind.IMAGE, ZoneItemKind.VIDEO, ZoneItemKind.WIDGET), z.items.map { it.kind })
        assertEquals("duração zero ou ausente vira o padrão", listOf(8L, 10L, 15L), z.items.map { it.durationSeconds })
        assertEquals("widget:w1", z.items[2].mediaId)
        assertTrue("mesmo formato de widget do Player", z.items[2].url.startsWith("native_widget://clock/w1?config="))
        assertTrue(java.net.URLDecoder.decode(z.items[2].url, "UTF-8").contains("\"showDate\":true"))
    }

    @Test fun `tela sem divisao, sem acesso e resposta invalida`() {
        assertTrue(ZoneLayoutParser.parse("""{"status":"SEM_LAYOUT"}""") is ZoneLayoutResult.None)
        assertTrue(ZoneLayoutParser.parse("""{"status":"SEM_ACESSO"}""") is ZoneLayoutResult.NoAccess)
        assertTrue(ZoneLayoutParser.parse(null) is ZoneLayoutResult.Invalid)
        assertTrue(ZoneLayoutParser.parse("") is ZoneLayoutResult.Invalid)
        assertTrue(ZoneLayoutParser.parse("isto não é json") is ZoneLayoutResult.Invalid)
        assertTrue(ZoneLayoutParser.parse("""{"status":"SUCCESS","layout":{"id":"L","largura":0,"altura":0,"zonas":[]}}""") is ZoneLayoutResult.Invalid)
        assertTrue(ZoneLayoutParser.parse("""{"status":"QUALQUER"}""") is ZoneLayoutResult.Invalid)
    }

    @Test fun `resposta que chega como texto entre aspas tambem e lida`() {
        val comoTexto = "\"" + """{"status":"SEM_LAYOUT"}""".replace("\"", "\\\"") + "\""
        assertTrue(ZoneLayoutParser.parse(comoTexto) is ZoneLayoutResult.None)
    }

    @Test fun `assinatura muda quando a zona muda de lugar ou de conteudo`() {
        val a = layout().signature()
        assertEquals(a, layout().signature())
        val movida = (ZoneLayoutParser.parse(resposta.replace("\"x\":1440", "\"x\":1400")) as ZoneLayoutResult.Ok).layout.signature()
        assertNotEquals(a, movida)
        val outroConteudo = (ZoneLayoutParser.parse(resposta.replace("oferta.jpg", "outra.jpg")) as ZoneLayoutResult.Ok).layout.signature()
        assertNotEquals(a, outroConteudo)
    }

    @Test fun `a tela logica cabe inteira no visor, sem cortar nem esticar`() {
        assertEquals(RectPx(0, 0, 1920, 1080), ZoneGeometry.canvas(1920, 1080, 1920, 1080))
        // visor mais largo: barras laterais
        assertEquals(RectPx(160, 0, 1920, 1080), ZoneGeometry.canvas(1920, 1080, 2240, 1080))
        // visor em pé com layout deitado: barras em cima e embaixo
        assertEquals(RectPx(0, 656, 1080, 608), ZoneGeometry.canvas(1920, 1080, 1080, 1920))
        // painel LED 1920x960 num visor 1280x720
        assertEquals(RectPx(0, 40, 1280, 640), ZoneGeometry.canvas(1920, 960, 1280, 720))
    }

    @Test fun `75 por cento mais 25 por cento - zonas vizinhas dividem a mesma borda`() {
        val canvas = ZoneGeometry.canvas(1920, 1080, 1280, 720)
        val grande = ZoneGeometry.zoneRect(0, 0, 1440, 1080, 1920, 1080, canvas)
        val lateral = ZoneGeometry.zoneRect(1440, 0, 480, 1080, 1920, 1080, canvas)
        assertEquals(RectPx(0, 0, 960, 720), grande)
        assertEquals(RectPx(960, 0, 320, 720), lateral)
        assertEquals(grande.left + grande.width, lateral.left)
        assertEquals(1280, lateral.left + lateral.width)
    }

    @Test fun `num visor de tamanho quebrado as zonas continuam encostadas, sem buraco nem sobra`() {
        val canvas = ZoneGeometry.canvas(1920, 1080, 1366, 768)
        val colunas = (0 until 3).map { ZoneGeometry.zoneRect(it * 640, 0, 640, 1080, 1920, 1080, canvas) }
        for (i in 0 until 2) assertEquals(colunas[i].left + colunas[i].width, colunas[i + 1].left)
        assertEquals(canvas.left + canvas.width, colunas[2].left + colunas[2].width)
    }

    private fun item(m: String) = ZoneItem("i-$m", m, ZoneItemKind.IMAGE, "https://x/$m.jpg", 10)

    @Test fun `a mesma midia nunca em duas zonas ao mesmo tempo`() {
        val itens = listOf(item("a"), item("b"), item("c"))
        assertEquals(0, ZoneRotation.nextFree(itens, -1, emptySet()))
        assertEquals("pula a mídia que outra zona está mostrando", 2, ZoneRotation.nextFree(itens, 0, setOf("b")))
        assertEquals(1, ZoneRotation.nextFree(itens, 2, setOf("a")))
        assertEquals("tudo em uso: a zona espera", -1, ZoneRotation.nextFree(listOf(item("a")), 0, setOf("a")))
        assertEquals("zona vazia", -1, ZoneRotation.nextFree(emptyList(), 0, emptySet()))
        assertEquals("zona com um item só repete o próprio item", 0, ZoneRotation.nextFree(listOf(item("a")), 0, emptySet()))
    }

    @Test fun `principal sem zona marcada devolve nulo`() {
        val semPrincipal = (ZoneLayoutParser.parse(resposta.replace("\"principal\":true", "\"principal\":false")) as ZoneLayoutResult.Ok).layout
        assertNull(semPrincipal.principal)
        assertFalse(semPrincipal.secundarias.isEmpty())
    }
}

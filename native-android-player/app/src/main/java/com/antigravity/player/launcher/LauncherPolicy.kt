package com.antigravity.player.launcher

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * F-200 — regras puras da launcher Sobre Mídia (testadas na JVM, sem Android).
 *
 * A launcher é a tela inicial do aparelho quando o dono escolhe usá-la: logo do gestor, hora, clima, Wi-Fi, mídias de
 * fundo escolhidas pelo dono/ADM, o Player Sobre Mídia em destaque e os outros aplicativos — menos YouTube, Netflix e
 * apps de TV/streaming (esses continuam funcionando na launcher original).
 */
object LauncherPolicy {

    /** Ocultos por padrão (o painel do dono/ADM pode mudar). "re:" = expressão regular sobre pacote e nome. */
    val OCULTOS_PADRAO = listOf(
        "youtube", "netflix", "com.amazon.avod", "primevideo", "prime video", "disney", "globoplay", "com.globo", "re:\\bhbo\\b",
        "com.wbd", "paramount", "pluto", "twitch", "starplus", "crunchyroll", "iptv", "kodi", "xbmc", "livechannels",
        "re:\\btv\\b"
    )

    /** Cartão "Loja de apps": a primeira que o aparelho tiver (Play Store primeiro). */
    val LOJAS = listOf("com.android.vending", "cm.aptoidetv.pt", "cm.aptoide.pt", "com.amazon.venezia")

    const val SEGUNDOS_PADRAO = 30
    const val MINUTOS_USO_LIVRE_PADRAO = 30

    /** As 4 telas do cartão "Destaques Sobre Mídia": 2 TVs 16:9 e 2 totens 9:16. */
    val VITRINES = listOf("tv1", "tv2", "totem1", "totem2")

    data class ItemDeFundo(
        val id: String, val mediaId: String, val url: String, val video: Boolean, val duracaoS: Int, val hash: String,
        /** Em qual das 4 telas a mídia passa (sem a informação — servidor antigo — vai para a TV 1). */
        val vitrine: String = "tv1"
    ) {
        /** Nome do arquivo no aparelho: muda quando a mídia muda (o antigo é apagado). */
        val arquivo: String get() = "${seguro(mediaId)}_${seguro(hash).take(40)}.${if (video) "mp4" else "img"}"
    }

    data class Config(
        val segundosParaAbrirPlayer: Int = SEGUNDOS_PADRAO,
        val minutosDeUsoLivre: Int = MINUTOS_USO_LIVRE_PADRAO,
        val mostrarRelogio: Boolean = true,
        val mostrarClima: Boolean = true,
        val mostrarWifi: Boolean = true,
        val appsOcultos: List<String> = OCULTOS_PADRAO,
        val appsLiberados: List<String> = emptyList(),
        val fundo: List<ItemDeFundo> = emptyList()
    )

    private fun seguro(s: String) = s.replace(Regex("[^A-Za-z0-9_-]"), "")

    /** Lê a resposta de fn_player_launcher(). Qualquer coisa inválida → null (a launcher fica com a guardada/padrão). */
    fun lerConfig(json: String?): Config? = try {
        val o = Json.parseToJsonElement(json ?: "") as JsonObject
        if (o["status"]?.jsonPrimitive?.contentOrNull != "OK") null else {
            fun int(k: String, padrao: Int, min: Int, max: Int) =
                (o[k]?.jsonPrimitive?.intOrNull ?: padrao).coerceIn(min, max)
            fun bool(k: String) = o[k]?.jsonPrimitive?.booleanOrNull ?: true
            fun lista(k: String) = (o[k] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull?.trim()?.lowercase() }
                ?.filter { it.isNotEmpty() }
            val fundo = (o["fundo"] as? JsonArray)?.mapNotNull { e ->
                val f = e as? JsonObject ?: return@mapNotNull null
                val url = f["url"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                if (!url.startsWith("https://")) return@mapNotNull null
                ItemDeFundo(
                    id = f["id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null,
                    mediaId = f["media_id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null,
                    url = url,
                    video = f["tipo"]?.jsonPrimitive?.contentOrNull == "video",
                    duracaoS = (f["duracao_s"]?.jsonPrimitive?.intOrNull ?: 10).coerceIn(3, 600),
                    hash = f["hash"]?.jsonPrimitive?.contentOrNull ?: "",
                    vitrine = f["vitrine"]?.jsonPrimitive?.contentOrNull?.takeIf { it in VITRINES } ?: "tv1"
                )
            }.orEmpty()
            Config(
                segundosParaAbrirPlayer = int("segundos_para_abrir_player", SEGUNDOS_PADRAO, 5, 3600),
                minutosDeUsoLivre = int("minutos_de_uso_livre", MINUTOS_USO_LIVRE_PADRAO, 1, 1440),
                mostrarRelogio = bool("mostrar_relogio"),
                mostrarClima = bool("mostrar_clima"),
                mostrarWifi = bool("mostrar_wifi"),
                appsOcultos = lista("apps_ocultos") ?: OCULTOS_PADRAO,
                appsLiberados = lista("apps_liberados").orEmpty(),
                fundo = fundo
            )
        }
    } catch (e: Exception) {
        null
    }

    private fun casa(regra: String, pacote: String, nome: String): Boolean {
        if (regra.startsWith("re:")) {
            val r = try { Regex(regra.removePrefix("re:"), RegexOption.IGNORE_CASE) } catch (e: Exception) { return false }
            return r.containsMatchIn(pacote) || r.containsMatchIn(nome)
        }
        return pacote.lowercase().contains(regra) || nome.lowercase().contains(regra)
    }

    /**
     * O app fica fora da launcher Sobre Mídia? O próprio Player nunca entra na lista (ele é o cartão principal).
     * "Liberados" vencem os ocultos (o dono pode mostrar um app que caiu numa regra).
     */
    fun appOculto(pacote: String, nome: String, config: Config, proprioPacote: String): Boolean {
        if (pacote == proprioPacote) return true
        if (config.appsLiberados.any { casa(it, pacote, nome) }) return false
        return config.appsOcultos.any { casa(it, pacote, nome) }
    }

    /** Ajustes do aparelho têm botão próprio na launcher: não se repetem na lista de apps. */
    fun ehAjustesDoSistema(pacote: String): Boolean =
        pacote == "com.android.settings" || pacote == "com.android.tv.settings" || pacote.endsWith(".tvsettings")

    /**
     * Segundos até abrir o Player sozinho (nunca mais de 1 minuto — regra do dono). Sem login numa tela não há contagem
     * (null): a launcher é só a tela inicial e NÃO libera o Player — quem não fez login entra pelo caminho normal.
     */
    fun contagemParaAbrirPlayer(logadoNumaTela: Boolean, config: Config): Int? =
        if (logadoNumaTela) config.segundosParaAbrirPlayer.coerceAtMost((MAX_FORA_DO_PLAYER_MS / 1000).toInt()) else null

    /** F-203: o Player fica fora da tela no máximo 1 minuto; depois volta, mexa a pessoa ou não. */
    const val MAX_FORA_DO_PLAYER_MS = 60_000L

    /** Quantos segundos ainda faltam para o Player ter de voltar (saiu da frente em [saiuEmMs]). */
    fun segundosAteVoltaObrigatoria(saiuEmMs: Long, agoraMs: Long): Int =
        (((saiuEmMs + MAX_FORA_DO_PLAYER_MS - agoraMs) + 999) / 1000).toInt().coerceAtLeast(0)

    /** Janela de uso livre (o Player não puxa a tela de volta): termina em [ateMs]. */
    fun usoLivreAtivo(ateMs: Long, agoraMs: Long): Boolean = ateMs > agoraMs

    /** F-203: o uso livre dura no máximo 1 minuto (o valor do painel acima disso não vale mais). */
    fun fimDoUsoLivre(agoraMs: Long, minutos: Int): Long = agoraMs + (minutos.coerceAtLeast(1) * 60_000L).coerceAtMost(MAX_FORA_DO_PLAYER_MS)

    /** Retângulos (x, y, largura, altura) das 4 telas, na ordem tv1, tv2, totem1, totem2. */
    data class Retangulo(val x: Int, val y: Int, val largura: Int, val altura: Int)

    /**
     * Encaixa as 4 telas no espaço [largura] x [altura] (com [vao] entre elas), o maior possível e centralizado:
     * à esquerda 2 TVs 16:9 uma sobre a outra; à direita 2 totens 9:16 lado a lado, da altura da coluna das TVs.
     */
    fun medidasDaVitrine(largura: Int, altura: Int, vao: Int): List<Retangulo> {
        if (largura <= 0 || altura <= 0) return List(4) { Retangulo(0, 0, 0, 0) }
        val g = vao.toDouble()
        // largura da TV (tw): altura total = 2·tw·9/16 + g ≤ altura; largura total = tw·145/64 + g·25/8 ≤ largura
        val pelaAltura = (altura - g) * 8.0 / 9.0
        val pelaLargura = (largura - g * 25.0 / 8.0) * 64.0 / 145.0
        val tw = minOf(pelaAltura, pelaLargura).coerceAtLeast(0.0)
        val th = tw * 9.0 / 16.0
        val alturaTotem = 2 * th + g
        val larguraTotem = alturaTotem * 9.0 / 16.0
        val larguraTotal = tw + g + larguraTotem + g + larguraTotem
        val x0 = (largura - larguraTotal) / 2.0
        val y0 = (altura - alturaTotem) / 2.0
        fun r(x: Double, y: Double, w: Double, h: Double) = Retangulo(Math.round(x).toInt(), Math.round(y).toInt(), Math.round(w).toInt(), Math.round(h).toInt())
        return listOf(
            r(x0, y0, tw, th),
            r(x0, y0 + th + g, tw, th),
            r(x0 + tw + g, y0, larguraTotem, alturaTotem),
            r(x0 + tw + g + larguraTotem + g, y0, larguraTotem, alturaTotem)
        )
    }

    // ------------------------------------------------------------------ F-203: Home no Player (regra do dono)

    /** Home seguidos contam juntos se vierem com até 1 minuto entre um e outro. */
    const val JANELA_DO_HOME_MS = 60_000L
    /** No 3º Home seguido a pessoa fica livre na launcher/aparelho por 1 minuto. */
    const val HOMES_PARA_FICAR_LIVRE = 3
    const val VOLTA_RAPIDA_S = 3
    const val VOLTA_LIVRE_S = 60

    /** Quantos Home seguidos (1, 2, 3…) contando este. */
    fun contarHome(contagemAnterior: Int, ultimoHomeMs: Long, agoraMs: Long): Int =
        if (ultimoHomeMs <= 0L || agoraMs - ultimoHomeMs > JANELA_DO_HOME_MS || contagemAnterior >= HOMES_PARA_FICAR_LIVRE) 1
        else contagemAnterior + 1

    /** Em quantos segundos o Player volta depois deste Home: logo (1º e 2º) ou em 1 minuto (3º). */
    fun voltaDoPlayerEmSegundos(contagem: Int): Int = if (contagem >= HOMES_PARA_FICAR_LIVRE) VOLTA_LIVRE_S else VOLTA_RAPIDA_S

    /** Texto do cartão do Player. */
    fun textoDaContagem(segundos: Int?): String = when {
        segundos == null -> "Toque para fazer login"
        segundos <= 0 -> "Abrindo…"
        else -> "abre sozinho em $segundos s"
    }
}

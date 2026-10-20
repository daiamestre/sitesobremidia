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

    const val SEGUNDOS_PADRAO = 30
    const val MINUTOS_USO_LIVRE_PADRAO = 30

    data class ItemDeFundo(val id: String, val mediaId: String, val url: String, val video: Boolean, val duracaoS: Int, val hash: String) {
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
                    hash = f["hash"]?.jsonPrimitive?.contentOrNull ?: ""
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
     * Segundos até abrir o Player sozinho. Sem login numa tela não há contagem (null): a launcher é só a tela inicial e
     * NÃO libera o Player — quem não fez login entra pelo caminho normal (login → escolha da tela).
     */
    fun contagemParaAbrirPlayer(logadoNumaTela: Boolean, config: Config): Int? =
        if (logadoNumaTela) config.segundosParaAbrirPlayer else null

    /** Janela de uso livre (o Player não puxa a tela de volta): termina em [ateMs]. */
    fun usoLivreAtivo(ateMs: Long, agoraMs: Long): Boolean = ateMs > agoraMs

    fun fimDoUsoLivre(agoraMs: Long, minutos: Int): Long = agoraMs + minutos.coerceIn(1, 1440) * 60_000L

    /** Texto do cartão do Player. */
    fun textoDaContagem(segundos: Int?): String = when {
        segundos == null -> "Toque para fazer login"
        segundos <= 0 -> "Abrindo…"
        else -> "abre sozinho em $segundos s"
    }
}

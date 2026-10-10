package com.antigravity.cache.worker

/**
 * F-181 — regras da limpeza diária do cache de mídias (03:00), separadas do Worker para poderem ser testadas.
 *
 * O defeito que isto corrige: a limpeza só reconhecia o nome antigo do arquivo ("<id>.dat"), mas o Player grava
 * "<id>_<hash>.dat". Resultado: toda madrugada TODAS as mídias baixadas eram apagadas como "órfãs" e a tela
 * amanhecia sem mídia (sincronizando de novo ou preta). E mídia sem MD5 no painel (o Player usa o id como
 * identificador) era apagada como "corrompida", porque o id nunca é igual ao MD5 do arquivo.
 */
object CacheJanitorPolicy {
    private val NAO_SEGURO = Regex("[^a-zA-Z0-9_-]")
    private val MD5 = Regex("^[a-fA-F0-9]{32}$")
    private const val SEPARADOR_DE_REPETIDA = '~'

    /** Arquivo baixado há menos que isto não é tocado: pode ser de uma playlist nova que ainda não foi adotada. */
    const val CARENCIA_MS: Long = 30 * 60 * 1000L

    /** Mesmo nome que o FileStorageManager.getFileForMedia dá ao arquivo. */
    fun nomeDoArquivo(mediaId: String, hash: String): String {
        val seguro = hash.replace(NAO_SEGURO, "")
        return if (seguro.isNotBlank()) "${mediaId}_$seguro.dat" else "$mediaId.dat"
    }

    /** O MD5 a conferir, ou null quando o identificador não é um MD5 (mídia sem hash no painel: não há o que comparar). */
    fun md5Esperado(hash: String?): String? = hash?.trim()?.takeIf { MD5.matches(it) }?.lowercase()

    /**
     * Arquivos que DEVEM ficar no aparelho: nome -> MD5 esperado (ou null se não há MD5 para conferir).
     * Cada item é (id da linha, hash). O id pode vir como "<mídia>~N" (mesma mídia repetida na playlist).
     * Valem os dois nomes: o atual (com hash) e o antigo (só o id).
     */
    fun arquivosValidos(itens: List<Pair<String, String?>>): Map<String, String?> {
        val mapa = LinkedHashMap<String, String?>()
        for ((idDaLinha, hashBruto) in itens) {
            val mediaId = idDaLinha.substringBefore(SEPARADOR_DE_REPETIDA)
            if (mediaId.isBlank()) continue
            val hash = hashBruto.orEmpty()
            val md5 = md5Esperado(hash)
            mapa[nomeDoArquivo(mediaId, hash)] = md5
            mapa.putIfAbsent(nomeDoArquivo(mediaId, ""), md5)
        }
        return mapa
    }

    enum class Decisao { MANTER, APAGAR_ORFAO, CONFERIR_MD5 }

    /** O que fazer com um arquivo do cache. */
    fun decidir(nome: String, modificadoEm: Long, agora: Long, validos: Map<String, String?>): Decisao {
        if (!validos.containsKey(nome)) {
            // download em andamento (.tmp) ou recém-terminado: não é lixo ainda
            if (nome.endsWith(".tmp") || agora - modificadoEm < CARENCIA_MS) return Decisao.MANTER
            return Decisao.APAGAR_ORFAO
        }
        return if (validos[nome] != null) Decisao.CONFERIR_MD5 else Decisao.MANTER
    }

    /** O arquivo conferido está corrompido? (MD5 que não pôde ser calculado não condena o arquivo.) */
    fun corrompido(md5Calculado: String?, md5Esperado: String): Boolean =
        !md5Calculado.isNullOrBlank() && !md5Calculado.equals(md5Esperado, ignoreCase = true)
}

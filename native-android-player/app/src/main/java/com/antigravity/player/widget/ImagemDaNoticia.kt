package com.antigravity.player.widget

/**
 * Imagem da notícia (F-91) — mesma regra do servidor (supabase/functions/_shared/noticias/rss.ts e fotos.ts):
 *  - no item do feed: media:content / media:thumbnail / enclosure de imagem / 1º <img> da descrição
 *    (sem logo, SVG ou pixel de rastreio);
 *  - sem imagem no feed: a página da matéria — foto principal da Agência Brasil (1170x700) ou og:image/twitter:image,
 *    nunca a imagem genérica do site.
 * Só https. A imagem nunca é alterada; o crédito/fonte vai na tela. Código puro, testável na JVM.
 */
object ImagemDaNoticia {
    private val IC = RegexOption.IGNORE_CASE
    private val mediaContent = Regex("<media:content\\b([^>]*)>", IC)
    private val thumbOuEnclosure = Regex("<(media:thumbnail|enclosure)\\b([^>]*)>", IC)
    private val descricao = Regex("<description[^>]*>([\\s\\S]*?)</description>", IC)
    private val img = Regex("<img\\b[^>]*\\bsrc=[\"']([^\"']+)[\"'][^>]*>", IC)
    private val pixelOuLogo = Regex("width=\"1\"|height=\"1\"|width:\\s*1px|height:\\s*1px|pixel|logo|tracking|feedburner|\\.svg(\\?|\"|$)", IC)
    private val fotoAgenciaBrasil = Regex("<img\\b[^>]*?(?:data-echo|src)=\"(https://imagens\\.ebc\\.com\\.br/[^\"]*1170x700[^\"]*)\"[^>]*>", IC)
    private val metas = listOf(
        Regex("<meta[^>]+property=[\"']og:image(?::secure_url)?[\"'][^>]+content=[\"']([^\"']+)[\"']", IC),
        Regex("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']og:image(?::secure_url)?[\"']", IC),
        Regex("<meta[^>]+name=[\"']twitter:image(?::src)?[\"'][^>]+content=[\"']([^\"']+)[\"']", IC),
        Regex("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+name=[\"']twitter:image(?::src)?[\"']", IC),
    )
    private val generica = Regex("logo|thumb_\\d+x\\d+_|placeholder|default[-_]?(share|image|og)|avatar|favicon|sprite|\\.svg(\\?|$)", IC)

    fun soHttps(u: String?): String? {
        val v = u?.trim()?.replace("&amp;", "&") ?: return null
        return v.takeIf { it.startsWith("https://", true) && it.none { c -> c.isWhitespace() || c == '"' || c == '\'' || c == '<' || c == '>' } }
    }

    private fun atributo(a: String, nome: String): String? = Regex("\\b$nome=\"([^\"]+)\"", IC).find(a)?.groupValues?.get(1)

    /** Imagem que veio no próprio item do feed (bloco <item>...</item> ou <entry>...</entry>). */
    fun doItem(bloco: String): String? {
        for (m in mediaContent.findAll(bloco)) {
            val a = m.groupValues[1]
            val url = atributo(a, "url")
            val tipo = atributo(a, "type").orEmpty()
            val meio = atributo(a, "medium").orEmpty()
            if (meio == "image" || tipo.startsWith("image/") || Regex("\\.(jpe?g|png|webp)(\\?|$)", IC).containsMatchIn(url.orEmpty())) {
                soHttps(url)?.let { return it }
            }
        }
        for (m in thumbOuEnclosure.findAll(bloco)) {
            val a = m.groupValues[2]
            val tipo = atributo(a, "type").orEmpty()
            if (m.groupValues[1].equals("enclosure", true) && tipo.isNotEmpty() && !tipo.startsWith("image/")) continue
            soHttps(atributo(a, "url"))?.let { return it }
        }
        val desc = descricao.find(bloco)?.groupValues?.get(1)?.let { decodificar(it) }.orEmpty()
        for (m in img.findAll(desc)) {
            if (pixelOuLogo.containsMatchIn(m.value)) continue
            soHttps(m.groupValues[1])?.let { return it }
        }
        return null
    }

    /** Imagem a partir do HTML da página da matéria. */
    fun daPagina(html: String): String? {
        fotoAgenciaBrasil.find(html)?.groupValues?.get(1)?.let { u -> soHttps(u)?.let { return it } }
        for (re in metas) {
            val u = soHttps(re.find(html)?.groupValues?.get(1)?.let { decodificar(it) }) ?: continue
            if (!generica.containsMatchIn(u)) return u
        }
        return null
    }

    private fun decodificar(s: String): String = s
        .replace(Regex("<!\\[CDATA\\[([\\s\\S]*?)]]>")) { it.groupValues[1] }
        .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#039;", "'").replace("&amp;", "&")
}

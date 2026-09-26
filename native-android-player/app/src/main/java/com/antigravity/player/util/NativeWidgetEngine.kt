package com.antigravity.player.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.widget.TextViewCompat
import com.antigravity.core.util.Logger
import com.antigravity.media.exoplayer.ChipsetDetector
import com.antigravity.player.R
import com.antigravity.player.widget.RssFeedParser
import com.antigravity.player.widget.RssItem
import com.antigravity.player.widget.WeatherIcon
import com.antigravity.player.widget.WeatherNow
import com.antigravity.player.widget.WeatherForecast
import com.antigravity.player.widget.WeatherText
import com.antigravity.player.widget.WidgetKind
import com.antigravity.player.widget.WidgetSpec
import com.antigravity.player.widget.WidgetSpecParser
import com.antigravity.player.widget.BrasiliaTime
import com.antigravity.player.widget.QrCode
import com.antigravity.player.widget.CoresWidget
import com.antigravity.player.widget.OfertaItem
import com.antigravity.player.widget.OfertaText
import com.antigravity.player.widget.CampanhaText
import com.antigravity.player.widget.PostSocial
import com.antigravity.player.widget.YoutubeLink
import com.antigravity.player.widget.DadosEsportes
import com.antigravity.player.widget.EsportesText
import com.antigravity.player.widget.JogoEsporte
import com.antigravity.core.util.TimeManager
import com.bumptech.glide.Glide
import com.bumptech.glide.load.DecodeFormat
import com.bumptech.glide.request.RequestOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.min

/**
 * Widgets nativos do Player: Relógio, Clima e Notícias (RSS), cada um com a imagem de fundo escolhida no painel
 * (Horizontal ou Vertical conforme a orientação da tela). Antes só existiam Relógio e Clima, ambos sem fundo e sem ler as
 * opções do painel, e o RSS aparecia como "Widget não suportado".
 *
 * Offline-first: fundo (cache de disco do Glide), clima e notícias ficam em cache local e são usados sem rede.
 */
object NativeWidgetEngine {

    private const val BG_TIMEOUT_S = 4L
    /** Origem https da página do player do YouTube (o YouTube recusa embed sem origem). */
    private const val YOUTUBE_ORIGEM = "https://sitesobremidia.vercel.app/"
    private const val WEATHER_FRESH_MS = 15 * 60_000L
    private const val RSS_FRESH_MS = 5 * 60_000L
    private const val MAX_BODY_BYTES = 2_000_000L
    private const val DEFAULT_LAT = -23.5505
    private const val DEFAULT_LON = -46.6333

    private val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(3, TimeUnit.SECONDS)
            .readTimeout(4, TimeUnit.SECONDS)
            .callTimeout(5, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .build()
    }

    private val uiHandler = Handler(Looper.getMainLooper())

    private data class WeatherPayload(val now: WeatherNow?, val place: String?, val forecast: WeatherForecast? = null)
    private data class RssPayload(val items: List<RssItem>, val source: String, val rotulo: String = "NOTÍCIAS")

    /**
     * Tamanho em que o widget vai aparecer. O contêiner costuma ainda não ter sido medido (0x0) quando o widget é
     * montado; antes caía no tamanho do display, que não é o do canvas do Player quando ele está girado (totem na
     * TV Box, celular) -> modelo montado na orientação errada. Agora usa o ancestral já medido mais próximo (medidas
     * no próprio canvas); o display só em último caso.
     */
    private fun sizeOf(context: Context, container: FrameLayout): Pair<Int, Int> {
        var v: View? = container
        while (v != null) {
            if (v.width > 0 && v.height > 0) return v.width to v.height
            v = v.parent as? View
        }
        val dm = context.resources.displayMetrics
        return dm.widthPixels to dm.heightPixels
    }

    /** Fundo e dados em paralelo, fora da thread principal. */
    private suspend fun prefetch(appContext: Context, spec: WidgetSpec, w: Int, h: Int): Pair<Bitmap?, Any?> = coroutineScope {
        val bg = async(Dispatchers.IO) { loadBackground(appContext, spec.backgroundFor(w >= h), w, h) }
        val data = async(Dispatchers.IO) {
            when (spec.kind) {
                WidgetKind.WEATHER -> loadWeather(appContext, spec)
                WidgetKind.RSS -> loadRss(appContext, spec)
                WidgetKind.OFFER -> loadOfertaFotos(appContext, spec)
                WidgetKind.ADVERTISING -> loadCriativos(appContext, spec, w, h)
                WidgetKind.SOCIAL -> loadPostImagem(appContext, spec)
                else -> null
            }
        }
        bg.await() to data.await()
    }

    /** Aquecimento: baixa o fundo (cache do Glide) e os dados (cache local) enquanto o item anterior ainda está na tela. */
    suspend fun warm(context: Context, container: FrameLayout, remoteUrl: String) {
        val spec = WidgetSpecParser.parse(remoteUrl)
        val (w, h) = sizeOf(context, container)
        prefetch(context.applicationContext, spec, w, h)
    }

    suspend fun renderWidget(context: Context, container: FrameLayout, remoteUrl: String) {
        val appContext = context.applicationContext
        val spec = WidgetSpecParser.parse(remoteUrl)
        val (w, h) = sizeOf(context, container)
        val base = min(w, h).toFloat()
        Logger.i("WIDGET", "render ${spec.kind} ${w}x$h (container ${container.width}x${container.height})")

        // A tela só troca quando tudo está pronto (normalmente já aquecido pelo palco: leitura de cache).
        val (background, payload) = prefetch(appContext, spec, w, h)

        withContext(Dispatchers.Main) {
            container.removeAllViews()
            val view: View = when (spec.kind) {
                // Relógio e Clima: modelo único (Futurista) — widgets antigos "clássicos" também
                WidgetKind.CLOCK -> buildClockFuturista(context, spec, background, base)
                WidgetKind.WEATHER -> buildWeatherFuturista(context, spec, background, base, payload as? WeatherPayload)
                WidgetKind.RSS -> buildRss(context, spec, background, w, h, base, payload as? RssPayload)
                WidgetKind.INSTITUTIONAL -> buildInstitutional(context, spec, background, w, h, base)
                WidgetKind.OFFER -> buildOffer(context, spec, background, w, h, base, payload as? OfertaPayload)
                WidgetKind.ADVERTISING -> buildAdvertising(context, spec, background, w, h, base, payload as? CampanhaPayload)
                WidgetKind.SOCIAL -> buildSocial(context, spec, background, w, h, base, payload as? PostPayload)
                WidgetKind.YOUTUBE -> buildYoutube(context, spec, background, w, h, base)
                WidgetKind.SPORTS -> buildSports(context, spec, background, w, h, base)
                WidgetKind.UNKNOWN -> buildMessage(context, background, w, h, base, "Widget não suportado (${spec.rawType})")
            }
            container.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
    }

    // ------------------------------------------------------------------ dados

    private fun loadBackground(context: Context, url: String?, w: Int, h: Int): Bitmap? {
        if (url == null) return null
        return try {
            val legacy = ChipsetDetector.getRecommendedProfile() == ChipsetDetector.HardwareProfile.LEGACY_STABILITY
            val options = RequestOptions().centerCrop()
                .format(if (legacy) DecodeFormat.PREFER_RGB_565 else DecodeFormat.PREFER_ARGB_8888)
            Glide.with(context).asBitmap().load(url).apply(options)
                .submit(min(w, 1920).coerceAtLeast(320), min(h, 1920).coerceAtLeast(320))
                .get(BG_TIMEOUT_S, TimeUnit.SECONDS)
        } catch (e: Exception) {
            Logger.w("WIDGET", "Fundo indisponível ($url): ${e.message}")
            null
        }
    }

    private fun httpGet(url: String): String? {
        val request = Request.Builder().url(url)
            .header("User-Agent", "Mozilla/5.0 (compatible; SobreMidiaPlayer)")
            .header("Accept", "application/rss+xml, application/xml, text/xml, application/json, */*")
            .build()
        http.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) return null
            val body = resp.body ?: return null
            if (body.contentLength() > MAX_BODY_BYTES) return null
            return body.source().let { src -> src.request(MAX_BODY_BYTES); src.buffer.clone().readUtf8() }
        }
    }

    private fun loadWeather(context: Context, spec: WidgetSpec): WeatherPayload {
        val cache = WidgetDataCache(context)
        val lat = spec.latitude ?: DEFAULT_LAT
        val lon = spec.longitude ?: DEFAULT_LON
        // v2: a resposta agora inclui a previsão diária; respostas antigas (sem "daily") não podem ser reaproveitadas
        val key = "weather2:$lat,$lon"
        val cached = cache.get(key)
        var body: String? = cached?.takeIf { System.currentTimeMillis() - it.second < WEATHER_FRESH_MS }?.first
        if (body == null) {
            body = try {
                httpGet("https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon" +
                    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m" +
                    "&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=6&timezone=America%2FSao_Paulo")
                    ?.also { if (WeatherText.parseOpenMeteo(it) != null) cache.put(key, it) }
            } catch (e: Exception) {
                Logger.w("WIDGET", "Clima sem rede, usando cache: ${e.message}")
                null
            } ?: cached?.first
        }
        val now = body?.let { WeatherText.parseOpenMeteo(it) }
        val forecast = body?.let { WeatherText.parseForecast(it) }
        return WeatherPayload(now, resolvePlace(cache, spec, lat, lon), forecast)
    }

    private fun resolvePlace(cache: WidgetDataCache, spec: WidgetSpec, lat: Double, lon: Double): String? {
        spec.locationName?.let { return it }
        val key = "place2:$lat,$lon"
        cache.get(key)?.let { return it.first }
        try {
            val body = httpGet("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=$lat&longitude=$lon&localityLanguage=pt")
            if (body != null) {
                val obj = org.json.JSONObject(body)
                // "Região Metropolitana de ..." não é nome de cidade: cai para o próximo campo.
                val name = listOf("city", "locality", "principalSubdivision").map { obj.optString(it) }
                    .firstOrNull { it.isNotBlank() && !it.startsWith("Região", ignoreCase = true) }
                // UF a partir de "BR-PE" -> "Recife — PE"
                val uf = obj.optString("principalSubdivisionCode").substringAfter("-", "").takeIf { it.length == 2 }
                if (name != null) { val nome = if (uf != null) "$name — $uf" else name; cache.put(key, nome); return nome }
            }
        } catch (e: Exception) {
            Logger.w("WIDGET", "Nome do local indisponível: ${e.message}")
        }
        return RegionalContextManager.city.takeIf { RegionalContextManager.isContextLoaded && it != "Unknown" && spec.latitude == null }
    }

    private fun loadRss(context: Context, spec: WidgetSpec): RssPayload {
        // Notícias automáticas: o servidor já entregou as manchetes (Agência Brasil); o Player não lê o feed.
        spec.noticiasProntas?.let { return RssPayload(it.take(spec.maxItems), "Agência Brasil", "ESPORTES") }
        val source = spec.feedUrl.substringAfter("://").substringBefore("/").removePrefix("www.")
        if (spec.feedUrl.isBlank()) return RssPayload(emptyList(), source)
        val cache = WidgetDataCache(context)
        val key = "rss:${spec.feedUrl}"
        val cached = cache.get(key)
        val cachedItems = cached?.first?.let(::decodeItems).orEmpty()
        if (cached != null && cachedItems.isNotEmpty() && System.currentTimeMillis() - cached.second < RSS_FRESH_MS) {
            return RssPayload(cachedItems.take(spec.maxItems), source)
        }
        val fresh = try {
            httpGet(spec.feedUrl)?.let { RssFeedParser.parse(it, 20) }.orEmpty()
        } catch (e: Exception) {
            Logger.w("WIDGET", "RSS sem rede, usando cache: ${e.message}")
            emptyList()
        }
        if (fresh.isNotEmpty()) {
            cache.put(key, encodeItems(fresh))
            return RssPayload(fresh.take(spec.maxItems), source)
        }
        return RssPayload(cachedItems.take(spec.maxItems), source)
    }

    private fun encodeItems(items: List<RssItem>): String = items.joinToString("\u0002") { "${it.title}\u0001${it.summary}" }
    private fun decodeItems(s: String): List<RssItem> = s.split("\u0002").mapNotNull {
        val p = it.split("\u0001")
        if (p.isNotEmpty() && p[0].isNotBlank()) RssItem(p[0], p.getOrElse(1) { "" }) else null
    }

    // ------------------------------------------------------------------ visual

    private fun px(v: Float) = v.toInt()

    private fun rootWith(context: Context, bg: Bitmap?, scrimAlpha: Int, colors: IntArray): FrameLayout {
        val root = FrameLayout(context)
        root.background = GradientDrawable(GradientDrawable.Orientation.TL_BR, colors)
        if (bg != null) {
            root.addView(ImageView(context).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                setImageBitmap(bg)
            }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        root.addView(View(context).apply { setBackgroundColor(Color.argb(scrimAlpha, 0, 0, 0)) },
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        return root
    }

    private fun content(context: Context, position: String, base: Float): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        gravity = when (position) {
            "top" -> Gravity.TOP or Gravity.CENTER_HORIZONTAL
            "bottom" -> Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            else -> Gravity.CENTER
        }
        val pad = px(base * 0.06f)
        setPadding(pad, pad, pad, pad)
    }

    private fun text(context: Context, size: Float, bold: Boolean = false, color: Int = Color.WHITE, lines: Int = 1): TextView =
        TextView(context).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_PX, size)
            setTextColor(color)
            typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            gravity = Gravity.CENTER
            maxLines = lines
            setShadowLayer(size * 0.06f, 0f, size * 0.03f, Color.argb(160, 0, 0, 0))
            includeFontPadding = false
        }

    private fun fitOneLine(tv: TextView, minSize: Float, maxSize: Float) {
        TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(tv, px(minSize), px(maxSize), 1, TypedValue.COMPLEX_UNIT_PX)
    }

    private fun lp(w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.WRAP_CONTENT, top: Int = 0) =
        LinearLayout.LayoutParams(w, h).apply { topMargin = top }

    private fun buildMessage(context: Context, bg: Bitmap?, w: Int, h: Int, base: Float, message: String): View {
        val root = rootWith(context, bg, 110, intArrayOf(Color.parseColor("#1a1a2e"), Color.parseColor("#0f0f1a")))
        val box = content(context, "center", base)
        box.addView(text(context, base * 0.05f, lines = 3).apply { text = message }, lp())
        root.addView(box)
        return root
    }

    // ------------------------------------------------------------------ Relógio Futurista (identidade SOBRE MÍDIA)

    private fun buildClockFuturista(context: Context, spec: WidgetSpec, bg: Bitmap?, base: Float): View {
        val cores = spec.cores ?: CoresWidget.PADRAO
        val root = fundoMarca(context, bg, base, cores)
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val pad = px(base * 0.05f); setPadding(pad, pad, pad, pad)
        }
        col.addView(cabecalhoMarca(context, "HORÁRIO DE BRASÍLIA", base, cores), lp())
        val corpo = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        col.addView(corpo, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val saudacao = text(context, base * 0.05f, color = Color.argb(225, 255, 255, 255)).apply { letterSpacing = 0.06f }
        corpo.addView(saudacao, lp())
        val r = base * 0.03f
        val hora = text(context, base * 0.30f, bold = true).apply {
            setShadowLayer(r, 0f, 0f, cores.brilho); setPadding(px(r), px(r), px(r), px(r))
        }
        fitOneLine(hora, base * 0.08f, base * 0.34f)
        corpo.addView(hora, lp(h = px(base * 0.40f)))
        val data = pill(context, "", base * 0.04f, Color.argb(46, 255, 255, 255), Color.WHITE, base)
        if (spec.showDate) corpo.addView(data, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.CENTER_HORIZONTAL; topMargin = px(base * 0.02f)
        })

        fun paint(now: Long) {
            hora.text = BrasiliaTime.time(now, spec.showSeconds, spec.format24h)
            data.text = BrasiliaTime.dateLong(now)
            saudacao.text = WeatherText.greeting(BrasiliaTime.hourOfDay(now))
        }
        val tick = object : Runnable {
            override fun run() {
                if (!root.isAttachedToWindow && root.parent == null) return
                paint(TimeManager.utcMillis())
                uiHandler.postDelayed(this, BrasiliaTime.msUntilNextTick(TimeManager.utcMillis(), spec.showSeconds))
            }
        }
        paint(TimeManager.utcMillis())
        bindToLifecycle(root, tick)
        return root
    }

    // ------------------------------------------------------------------ Clima Futurista (identidade SOBRE MÍDIA)

    private object Marca {
        val PROFUNDO = Color.parseColor("#22004A")
        val ROXO = Color.parseColor("#5D1BFF")
        val VIOLETA = Color.parseColor("#8A2EFF")
        val LILAS = Color.parseColor("#B04DFF")
        val AMARELO = Color.parseColor("#FFD400")
    }

    private fun pill(context: Context, texto: String, size: Float, fundo: Int, tinta: Int, base: Float): TextView =
        text(context, size, bold = true, color = tinta).apply {
            this.text = texto
            letterSpacing = 0.12f
            setShadowLayer(0f, 0f, 0f, 0)
            background = GradientDrawable().apply { setColor(fundo); cornerRadius = base * 0.04f }
            val ph = px(base * 0.03f); val pv = px(base * 0.012f); setPadding(ph, pv, ph, pv)
        }

    private fun vidro(base: Float) = GradientDrawable().apply {
        setColor(Color.argb(38, 255, 255, 255)); cornerRadius = base * 0.035f
        setStroke(px(base * 0.003f).coerceAtLeast(1), Color.argb(70, 255, 255, 255))
    }

    /** Fundo da identidade: gradiente + brilho; com foto, véu roxo por cima para garantir a leitura. */
    private fun fundoMarca(context: Context, bg: Bitmap?, base: Float, cores: CoresWidget = CoresWidget.PADRAO): FrameLayout {
        val root = FrameLayout(context)
        root.background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(cores.c1, cores.c2, cores.c3))
        val cheio = { FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT) }
        if (bg != null) {
            root.addView(ImageView(context).apply { scaleType = ImageView.ScaleType.CENTER_CROP; setImageBitmap(bg) }, cheio())
        }
        root.addView(View(context).apply {
            background = GradientDrawable().apply {
                gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = base * 0.9f
                setGradientCenter(0.85f, 0.1f); colors = intArrayOf(CoresWidget.comAlfa(cores.brilho, 150), CoresWidget.comAlfa(cores.brilho, 0))
            }
        }, cheio())
        root.addView(View(context).apply {
            background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                if (bg != null) intArrayOf(CoresWidget.comAlfa(cores.c1, 150), CoresWidget.comAlfa(cores.c1, 95), CoresWidget.comAlfa(cores.c1, 235))
                else intArrayOf(CoresWidget.comAlfa(cores.c1, 0), CoresWidget.comAlfa(cores.c1, 120)))
        }, cheio())
        return root
    }

    private fun cabecalhoMarca(context: Context, selo: String, base: Float, cores: CoresWidget = CoresWidget.PADRAO): LinearLayout {
        val topo = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        topo.addView(text(context, base * 0.032f, bold = true, color = Color.argb(215, 255, 255, 255)).apply {
            text = "SOBRE MÍDIA"; letterSpacing = 0.28f; gravity = Gravity.START
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        topo.addView(pill(context, selo, base * 0.028f, cores.selo, cores.seloTexto, base))
        return topo
    }

    /** QR Code (branco, cantos arredondados) gerado na hora a partir do conteúdo configurado; null se inválido. */
    private fun qrView(context: Context, conteudo: String?, tamanho: Int): View? {
        val m = QrCode.matriz(conteudo, tamanho) ?: return null
        val bmp = Bitmap.createBitmap(m.width, m.height, Bitmap.Config.RGB_565)
        val linha = IntArray(m.width)
        for (y in 0 until m.height) {
            for (x in 0 until m.width) linha[x] = if (m.get(x, y)) Marca.PROFUNDO else Color.WHITE
            bmp.setPixels(linha, 0, m.width, 0, y, m.width, 1)
        }
        return ImageView(context).apply {
            setImageBitmap(bmp)
            scaleType = ImageView.ScaleType.FIT_CENTER
            background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = tamanho * 0.06f }
            val p = (tamanho * 0.04f).toInt(); setPadding(p, p, p, p)
        }
    }

    // ------------------------------------------------------------------ Social / Instagram (post enviado pelo usuário)

    private class PostPayload(val imagem: Bitmap?)

    private fun loadPostImagem(context: Context, spec: WidgetSpec): PostPayload {
        val url = spec.post?.imagemUrl ?: return PostPayload(null)
        return PostPayload(try {
            Glide.with(context).asBitmap().load(url).apply(RequestOptions().centerCrop())
                .submit(720, 720).get(BG_TIMEOUT_S, TimeUnit.SECONDS)
        } catch (e: Exception) {
            Logger.w("WIDGET", "Imagem do post indisponível ($url): ${e.message}"); null
        })
    }

    private fun corDaRede(rede: String): IntArray = when (rede) {
        "instagram" -> intArrayOf(Color.parseColor("#F58529"), Color.parseColor("#DD2A7B"), Color.parseColor("#8134AF"))
        "facebook" -> intArrayOf(Color.parseColor("#1877F2"), Color.parseColor("#1877F2"))
        "linkedin" -> intArrayOf(Color.parseColor("#0A66C2"), Color.parseColor("#0A66C2"))
        "tiktok", "x" -> intArrayOf(Color.parseColor("#111111"), Color.parseColor("#111111"))
        else -> intArrayOf(Marca.ROXO, Marca.VIOLETA)
    }

    private fun buildSocial(context: Context, spec: WidgetSpec, bg: Bitmap?, w: Int, h: Int, base: Float, data: PostPayload?): View {
        val post = spec.post ?: return buildMessage(context, bg, w, h, base, "Post sem conteúdo")
        val root = fundoMarca(context, bg, base)
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val pad = px(base * 0.045f); setPadding(pad, pad, pad, pad)
        }
        root.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        col.addView(cabecalhoMarca(context, post.seloRede, base), lp())

        val paisagem = w >= h
        val miolo = LinearLayout(context).apply {
            orientation = if (paisagem) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        col.addView(miolo, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f).apply { topMargin = px(base * 0.025f) })

        data?.imagem?.let { bmp ->
            val lado = px(base * (if (paisagem) 0.62f else 0.5f))
            miolo.addView(ImageView(context).apply {
                setImageBitmap(bmp); scaleType = ImageView.ScaleType.CENTER_CROP
                clipToOutline = true
                outlineProvider = object : android.view.ViewOutlineProvider() {
                    override fun getOutline(view: View, outline: android.graphics.Outline) {
                        outline.setRoundRect(0, 0, view.width, view.height, base * 0.025f)
                    }
                }
            }, LinearLayout.LayoutParams(lado, lado))
        }

        val textos = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL }
        val perfil = PostSocial.perfilComArroba(post.perfil)
        if (perfil != null || post.autor != null) {
            val linha = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val bola = px(base * 0.09f)
            linha.addView(text(context, base * 0.04f, bold = true).apply {
                text = post.seloRede.take(1)
                background = GradientDrawable(GradientDrawable.Orientation.BL_TR, corDaRede(post.rede)).apply { shape = GradientDrawable.OVAL }
            }, LinearLayout.LayoutParams(bola, bola))
            val nomes = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
            post.autor?.let { nomes.addView(text(context, base * 0.04f, bold = true).apply { text = it; gravity = Gravity.START }, lp()) }
            perfil?.let { nomes.addView(text(context, base * 0.032f, color = Color.argb(205, 255, 255, 255)).apply { text = it; gravity = Gravity.START }, lp()) }
            linha.addView(nomes, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = px(base * 0.02f) })
            textos.addView(linha, lp())
        }
        val r = base * 0.02f
        post.titulo?.let {
            textos.addView(text(context, base * 0.064f, bold = true, lines = 3).apply {
                text = it; gravity = Gravity.START
                setShadowLayer(r, 0f, 0f, Marca.LILAS); setPadding(px(r), px(r), px(r), px(r))
            }, lp(top = px(base * 0.015f)))
        }
        post.texto?.let {
            textos.addView(text(context, base * 0.04f, color = Color.argb(235, 255, 255, 255), lines = 5).apply { text = it; gravity = Gravity.START },
                lp(top = px(base * 0.01f)))
        }
        miolo.addView(textos, if (paisagem) LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = px(base * 0.04f) }
            else LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = px(base * 0.03f) })

        val ladoQr = px(base * 0.24f)
        qrView(context, spec.qrConteudo, ladoQr)?.let { qr ->
            val bloco = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
            bloco.addView(qr, LinearLayout.LayoutParams(ladoQr, ladoQr))
            bloco.addView(text(context, base * 0.026f, bold = true, color = Color.argb(230, 255, 255, 255)).apply {
                text = spec.qrLegenda ?: "Siga a gente"
            }, lp(top = px(base * 0.01f)))
            miolo.addView(bloco, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                if (paisagem) marginStart = px(base * 0.03f) else topMargin = px(base * 0.03f)
            })
        }
        return root
    }

    // ------------------------------------------------------------------ YouTube (player oficial em WebView do próprio widget)

    private fun temInternet(context: Context): Boolean = try {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        caps?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    } catch (e: Exception) { true }

    /**
     * Player OFICIAL do YouTube (iframe). O WebView é criado só para este item e destruído quando sai da tela.
     * Página com origem https (loadDataWithBaseURL) porque o YouTube recusa embed sem origem/referrer.
     * Sem internet ou com erro de carga: cartão "indisponível" (nunca tela preta).
     */
    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    private fun buildYoutube(context: Context, spec: WidgetSpec, bg: Bitmap?, w: Int, h: Int, base: Float): View {
        val ref = spec.youtube ?: return buildMessage(context, null, w, h, base, "Link do YouTube inválido")
        if (!temInternet(context)) return buildMessage(context, bg, w, h, base, "Vídeo indisponível sem internet")
        // Com imagem de fundo: o vídeo (16:9) fica centralizado sobre o fundo da marca; sem fundo, tela cheia como antes.
        val root = if (bg != null) fundoMarca(context, bg, base, spec.cores ?: CoresWidget.PADRAO) else FrameLayout(context).apply { setBackgroundColor(Color.BLACK) }
        val web = android.webkit.WebView(context)
        web.setBackgroundColor(Color.BLACK)
        web.settings.apply {
            javaScriptEnabled = true
            mediaPlaybackRequiresUserGesture = false
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
        }
        web.isFocusable = false
        web.isFocusableInTouchMode = false
        val aviso = text(context, base * 0.05f, bold = true, color = Color.argb(210, 255, 255, 255)).apply { text = "Carregando vídeo…" }
        web.webViewClient = object : android.webkit.WebViewClient() {
            override fun shouldOverrideUrlLoading(view: android.webkit.WebView, request: android.webkit.WebResourceRequest): Boolean =
                request.isForMainFrame // nunca sair do player (links do YouTube não abrem nada na tela)
            override fun onPageFinished(view: android.webkit.WebView, url: String?) { aviso.visibility = View.GONE }
            override fun onReceivedError(view: android.webkit.WebView, request: android.webkit.WebResourceRequest, error: android.webkit.WebResourceError) {
                if (!request.isForMainFrame) return
                Logger.w("WIDGET", "YouTube indisponível: ${error.description}")
                root.removeAllViews()
                root.addView(buildMessage(context, bg, w, h, base, "Vídeo indisponível no momento"),
                    FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            }
        }
        val html = """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style></head>
            <body><iframe src="${YoutubeLink.embedUrl(ref)}" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>"""
        web.loadDataWithBaseURL(YOUTUBE_ORIGEM, html, "text/html", "UTF-8", null)
        val (vw, vh) = if (bg != null) YoutubeLink.caixaSobreFundo(w, h) else ViewGroup.LayoutParams.MATCH_PARENT to ViewGroup.LayoutParams.MATCH_PARENT
        root.addView(web, FrameLayout.LayoutParams(vw, vh, Gravity.CENTER))
        root.addView(aviso, FrameLayout.LayoutParams(vw, vh, Gravity.CENTER))
        root.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {}
            override fun onViewDetachedFromWindow(v: View) {
                // Libera vídeo/memória na hora (TV Box fraca): o próximo item nunca herda o WebView.
                web.stopLoading(); web.loadUrl("about:blank"); web.destroy()
            }
        })
        return root
    }

    // ------------------------------------------------------------------ Publicidade (campanha, identidade SOBRE MÍDIA)

    /** Criativos da campanha já decodificados, na ordem (cache de disco do Glide: funcionam offline). */
    private class CampanhaPayload(val criativos: List<Bitmap>)

    private suspend fun loadCriativos(context: Context, spec: WidgetSpec, w: Int, h: Int): CampanhaPayload = coroutineScope {
        val urls = spec.campanha?.criativos.orEmpty()
        val lw = min(w, 1280).coerceAtLeast(320); val lh = min(h, 1280).coerceAtLeast(320)
        val bitmaps = urls.map { u ->
            async(Dispatchers.IO) {
                try {
                    Glide.with(context).asBitmap().load(u).apply(RequestOptions().fitCenter())
                        .submit(lw, lh).get(BG_TIMEOUT_S, TimeUnit.SECONDS)
                } catch (e: Exception) {
                    Logger.w("WIDGET", "Criativo indisponível ($u): ${e.message}"); null
                }
            }
        }.mapNotNull { it.await() }
        CampanhaPayload(bitmaps)
    }

    private fun buildAdvertising(context: Context, spec: WidgetSpec, bg: Bitmap?, w: Int, h: Int, base: Float, data: CampanhaPayload?): View {
        val hoje = BrasiliaTime.isoDate(TimeManager.utcMillis())
        val campanha = spec.campanha
        val criativos = data?.criativos.orEmpty()
        val root = fundoMarca(context, bg, base)
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val pad = px(base * 0.045f); setPadding(pad, pad, pad, pad)
        }
        root.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        col.addView(cabecalhoMarca(context, "PUBLICIDADE", base), lp())

        // Campanha fora do ar (ou sem criativo carregado) nunca aparece: cartão neutro, sem o criativo.
        if (campanha == null || !CampanhaText.vigente(campanha, hoje) || criativos.isEmpty()) {
            col.addView(text(context, base * 0.07f, bold = true).apply { text = "Anuncie aqui" },
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
            return root
        }

        val paisagem = w >= h
        val miolo = LinearLayout(context).apply { orientation = if (paisagem) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL }
        col.addView(miolo, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f).apply { topMargin = px(base * 0.025f) })

        // Criativos empilhados; só um visível por vez (troca com fade a cada SEGUNDOS_POR_CRIATIVO).
        val palco = FrameLayout(context)
        val imagens = criativos.mapIndexed { i, bmp ->
            ImageView(context).apply {
                setImageBitmap(bmp); scaleType = ImageView.ScaleType.FIT_CENTER; alpha = if (i == 0) 1f else 0f
            }.also { palco.addView(it, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)) }
        }
        miolo.addView(palco, if (paisagem) LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f)
            else LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val lado = LinearLayout(context).apply {
            orientation = if (paisagem) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        val textos = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = if (paisagem) Gravity.CENTER_HORIZONTAL else Gravity.START
        }
        val r = base * 0.02f
        if (campanha.titulo.isNotBlank()) {
            textos.addView(text(context, base * 0.054f, bold = true, lines = 3).apply {
                text = campanha.titulo; gravity = if (paisagem) Gravity.CENTER else Gravity.START
                setShadowLayer(r, 0f, 0f, Marca.LILAS); setPadding(px(r), px(r), px(r), px(r))
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        spec.cta?.let { cta ->
            textos.addView(pill(context, cta, base * 0.034f, Color.parseColor("#25D366"), Color.parseColor("#0B2E17"), base),
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = px(base * 0.02f) })
        }
        lado.addView(textos, if (paisagem) LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            else LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val ladoQr = px(base * 0.24f)
        qrView(context, spec.qrConteudo, ladoQr)?.let { qr ->
            val bloco = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
            bloco.addView(qr, LinearLayout.LayoutParams(ladoQr, ladoQr))
            bloco.addView(text(context, base * 0.026f, bold = true, color = Color.argb(230, 255, 255, 255)).apply {
                text = spec.qrLegenda ?: "Saiba mais"
            }, lp(top = px(base * 0.01f)))
            lado.addView(bloco, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                if (paisagem) topMargin = px(base * 0.03f) else marginStart = px(base * 0.03f)
            })
        }
        miolo.addView(lado, if (paisagem) LinearLayout.LayoutParams((w * 0.3f).toInt(), ViewGroup.LayoutParams.MATCH_PARENT).apply { marginStart = px(base * 0.03f) }
            else LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = px(base * 0.03f) })

        if (imagens.size > 1) {
            var atual = 0
            val passo = CampanhaText.SEGUNDOS_POR_CRIATIVO * 1000L
            val troca = object : Runnable {
                override fun run() {
                    val proximo = (atual + 1) % imagens.size
                    imagens[atual].animate().alpha(0f).setDuration(700).start()
                    imagens[proximo].animate().alpha(1f).setDuration(700).start()
                    atual = proximo
                    uiHandler.postDelayed(this, passo)
                }
            }
            bindToLifecycle(root, troca, passo)
        }
        return root
    }

    // ------------------------------------------------------------------ Oferta (cadastro de ofertas, identidade SOBRE MÍDIA)

    /** Fotos dos produtos (cache de disco do Glide: funcionam offline depois da primeira vez). */
    private class OfertaPayload(val fotos: Map<String, Bitmap>)

    private suspend fun loadOfertaFotos(context: Context, spec: WidgetSpec): OfertaPayload = coroutineScope {
        val urls = spec.oferta?.itens.orEmpty().mapNotNull { it.imagemUrl }.distinct()
        val lado = if (urls.size == 1) 720 else 360
        val fotos = urls.map { u ->
            async(Dispatchers.IO) {
                u to try {
                    Glide.with(context).asBitmap().load(u).apply(RequestOptions().fitCenter())
                        .submit(lado, lado).get(BG_TIMEOUT_S, TimeUnit.SECONDS)
                } catch (e: Exception) {
                    Logger.w("WIDGET", "Foto do produto indisponível ($u): ${e.message}"); null
                }
            }
        }.mapNotNull { it.await().let { (u, b) -> b?.let { u to it } } }.toMap()
        OfertaPayload(fotos)
    }

    /** Preço de varejo: "R$" pequeno, reais grandes, centavos em cima (mesma composição do painel). */
    private fun precoView(context: Context, valor: Double, size: Float): View {
        val (inteiro, centavos) = OfertaText.partes(valor)
        // Sem alinhar pela linha de base (padrão do LinearLayout): os centavos ficam no alto, como no painel.
        val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.TOP; isBaselineAligned = false }
        val brilho = size * 0.05f
        fun parte(t: String, s: Float) = text(context, s, bold = true, color = Marca.AMARELO).apply {
            text = t; includeFontPadding = false; setShadowLayer(brilho, 0f, 0f, Color.argb(90, 255, 212, 0))
            setPadding(px(brilho), px(brilho), px(brilho), px(brilho))
        }
        row.addView(parte("R$", size * 0.34f), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = px(size * 0.16f) })
        row.addView(parte(inteiro, size))
        row.addView(parte(",$centavos", size * 0.42f), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = px(size * 0.08f) })
        return row
    }

    private fun dePorView(context: Context, item: OfertaItem, size: Float, base: Float, centro: Boolean): View {
        val col = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = if (centro) Gravity.CENTER_HORIZONTAL else Gravity.START }
        if (item.precoOriginal > item.precoOferta) {
            col.addView(text(context, base * 0.03f, bold = true, color = Color.argb(190, 255, 255, 255)).apply {
                val de = OfertaText.precoBR(item.precoOriginal)
                text = android.text.SpannableString("DE $de POR").apply {
                    setSpan(android.text.style.StrikethroughSpan(), 3, 3 + de.length, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        col.addView(precoView(context, item.precoOferta, size), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        return col
    }

    private fun fotoView(context: Context, bmp: Bitmap?, base: Float): View =
        if (bmp != null) ImageView(context).apply {
            setImageBitmap(bmp); scaleType = ImageView.ScaleType.FIT_CENTER
            background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = base * 0.02f }
            val p = px(base * 0.01f); setPadding(p, p, p, p)
        } else text(context, base * 0.05f, bold = true, color = Color.argb(180, 255, 255, 255)).apply {
            text = "%"; background = GradientDrawable().apply { setColor(Color.argb(38, 255, 255, 255)); cornerRadius = base * 0.02f }
        }

    private fun seloDesconto(context: Context, pct: Int, base: Float): View? =
        if (pct <= 0) null else pill(context, "-$pct%", base * 0.03f, Color.parseColor("#25D366"), Color.parseColor("#0B2E17"), base)

    private fun buildOffer(context: Context, spec: WidgetSpec, bg: Bitmap?, w: Int, h: Int, base: Float, data: OfertaPayload?): View {
        val hoje = BrasiliaTime.isoDate(TimeManager.utcMillis())
        val oferta = spec.oferta
        val root = fundoMarca(context, bg, base)
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val pad = px(base * 0.045f); setPadding(pad, pad, pad, pad)
        }
        root.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        // Nunca exibir preço fora da validade (servidor já não envia; esta é a trava do Player offline).
        if (oferta == null || !OfertaText.vigente(oferta, hoje)) {
            col.addView(cabecalhoMarca(context, "OFERTAS", base), lp())
            col.addView(text(context, base * 0.07f, bold = true).apply { text = "Novas ofertas em breve" },
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
            return root
        }

        col.addView(cabecalhoMarca(context, "OFERTA", base), lp())
        val r = base * 0.02f
        col.addView(text(context, base * 0.07f, bold = true).apply {
            text = oferta.titulo; gravity = Gravity.START
            setShadowLayer(r, 0f, 0f, Marca.LILAS); setPadding(px(r), px(r), px(r), px(r))
        }, lp(top = px(base * 0.01f)))

        val paisagem = w >= h
        val miolo = LinearLayout(context).apply {
            orientation = if (paisagem) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        col.addView(miolo, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        val fotos = data?.fotos.orEmpty()
        val itens = oferta.itens

        val conteudo: View = if (itens.size == 1) {
            val item = itens[0]
            val bloco = LinearLayout(context).apply {
                orientation = if (paisagem) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
                gravity = Gravity.CENTER
            }
            val lado = px(base * 0.52f)
            bloco.addView(fotoView(context, fotos[item.imagemUrl], base), LinearLayout.LayoutParams(lado, lado))
            val info = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = if (paisagem) Gravity.START else Gravity.CENTER_HORIZONTAL
            }
            seloDesconto(context, OfertaText.desconto(item), base)?.let {
                info.addView(it, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            }
            info.addView(text(context, base * 0.054f, bold = true, lines = 2).apply {
                text = item.nome; gravity = if (paisagem) Gravity.START else Gravity.CENTER
            }, lp(top = px(base * 0.012f)))
            listOfNotNull(item.marca, item.unidade).takeIf { it.isNotEmpty() }?.let { extra ->
                info.addView(text(context, base * 0.03f, color = Color.argb(190, 255, 255, 255)).apply {
                    text = extra.joinToString(" · "); gravity = if (paisagem) Gravity.START else Gravity.CENTER
                }, lp())
            }
            info.addView(dePorView(context, item, base * 0.17f, base, !paisagem), lp(top = px(base * 0.012f)))
            bloco.addView(info, LinearLayout.LayoutParams(if (paisagem) 0 else ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, if (paisagem) 1f else 0f).apply {
                if (paisagem) marginStart = px(base * 0.04f) else topMargin = px(base * 0.03f)
            })
            bloco
        } else {
            // Grade: 3 colunas na horizontal, 2 na vertical.
            val colunas = if (paisagem) 3 else 2
            val grade = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
            val gap = px(base * 0.02f)
            itens.chunked(colunas).forEachIndexed { li, linhaItens ->
                val linha = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
                for (c in 0 until colunas) {
                    val item = linhaItens.getOrNull(c)
                    val cel = FrameLayout(context)
                    if (item != null) {
                        cel.background = vidro(base)
                        val card = LinearLayout(context).apply {
                            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
                            val p = px(base * 0.018f); setPadding(p, p, p, p)
                        }
                        card.addView(fotoView(context, fotos[item.imagemUrl], base), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
                        card.addView(text(context, base * 0.032f, bold = true, lines = 2).apply { text = item.nome }, lp(top = px(base * 0.008f)))
                        card.addView(dePorView(context, item, base * 0.08f, base, true), lp())
                        cel.addView(card, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                        seloDesconto(context, OfertaText.desconto(item), base)?.let {
                            cel.addView(it, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END).apply {
                                val m = px(base * 0.012f); setMargins(m, m, m, m)
                            })
                        }
                    }
                    linha.addView(cel, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply { if (c > 0) marginStart = gap })
                }
                grade.addView(linha, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f).apply { if (li > 0) topMargin = gap })
            }
            grade
        }
        miolo.addView(conteudo, if (paisagem) LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f)
            else LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val ladoQr = px(base * 0.24f)
        qrView(context, spec.qrConteudo, ladoQr)?.let { qr ->
            val bloco = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
            bloco.addView(qr, LinearLayout.LayoutParams(ladoQr, ladoQr))
            bloco.addView(text(context, base * 0.026f, bold = true, color = Color.argb(230, 255, 255, 255)).apply {
                text = spec.qrLegenda ?: "Aproveite"
            }, lp(top = px(base * 0.01f)))
            miolo.addView(bloco, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                if (paisagem) marginStart = px(base * 0.03f) else topMargin = px(base * 0.03f)
            })
        }

        val rodape = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        rodape.addView(text(context, base * 0.028f, bold = true, color = Color.argb(215, 255, 255, 255)).apply {
            text = OfertaText.validade(oferta.dataFim, hoje); gravity = Gravity.START
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        oferta.descricao?.let { d ->
            rodape.addView(text(context, base * 0.026f, color = Color.argb(190, 255, 255, 255)).apply { text = d; gravity = Gravity.END },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = px(base * 0.03f) })
        }
        col.addView(rodape, lp(top = px(base * 0.015f)))
        return root
    }

    // ------------------------------------------------------------------ Institucional / Aviso (identidade SOBRE MÍDIA)

    private fun buildInstitutional(context: Context, spec: WidgetSpec, bg: Bitmap?, w: Int, h: Int, base: Float): View {
        val info = spec.institucional ?: return buildMessage(context, bg, w, h, base, "Comunicado sem conteúdo")
        val root = fundoMarca(context, bg, base)
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val pad = px(base * 0.05f); setPadding(pad, pad, pad, pad)
        }
        col.addView(cabecalhoMarca(context, info.selo, base), lp())
        root.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val paisagem = w >= h
        val miolo = LinearLayout(context).apply {
            orientation = if (paisagem) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        col.addView(miolo, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val texto = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL }
        val r = base * 0.02f
        texto.addView(text(context, base * 0.08f, bold = true, lines = 3).apply {
            text = info.titulo.ifBlank { "Comunicado" }; gravity = Gravity.START
            setShadowLayer(r, 0f, 0f, Marca.LILAS); setPadding(px(r), px(r), px(r), px(r))
        }, lp())
        if (info.texto.isNotBlank()) {
            texto.addView(text(context, base * 0.042f, color = Color.argb(235, 255, 255, 255), lines = 5).apply {
                text = info.texto; gravity = Gravity.START
            }, lp(top = px(base * 0.01f)))
        }
        info.linhas.forEach { l ->
            val linha = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; background = vidro(base)
                val ph = px(base * 0.025f); val pv = px(base * 0.014f); setPadding(ph, pv, ph, pv)
            }
            linha.addView(text(context, base * 0.036f, bold = true).apply { text = l.rotulo; gravity = Gravity.START },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            linha.addView(text(context, base * 0.038f, bold = true, color = Marca.AMARELO).apply { text = l.valor; gravity = Gravity.END })
            texto.addView(linha, lp(top = px(base * 0.012f)))
        }
        val contatos = listOfNotNull(info.contato, info.endereco, info.site)
        if (contatos.isNotEmpty()) {
            texto.addView(text(context, base * 0.03f, color = Color.argb(205, 255, 255, 255), lines = 2).apply {
                text = contatos.joinToString("  •  "); gravity = Gravity.START
            }, lp(top = px(base * 0.02f)))
        }
        info.cta?.let { cta ->
            texto.addView(pill(context, cta, base * 0.034f, Color.parseColor("#25D366"), Color.parseColor("#0B2E17"), base),
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = px(base * 0.02f) })
        }
        miolo.addView(texto, if (paisagem) LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            else LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        val lado = px(base * 0.26f)
        qrView(context, spec.qrConteudo, lado)?.let { qr ->
            val bloco = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
            bloco.addView(qr, LinearLayout.LayoutParams(lado, lado))
            bloco.addView(text(context, base * 0.026f, bold = true, color = Color.argb(230, 255, 255, 255)).apply {
                text = spec.qrLegenda ?: "Aponte a câmera"
            }, lp(top = px(base * 0.01f)))
            miolo.addView(bloco, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                if (paisagem) marginStart = px(base * 0.04f) else topMargin = px(base * 0.04f)
            })
        }
        return root
    }

    private fun buildWeatherFuturista(context: Context, spec: WidgetSpec, bg: Bitmap?, base: Float, data: WeatherPayload?): View {
        val cores = spec.cores ?: CoresWidget.PADRAO
        val root = fundoMarca(context, bg, base, cores)
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val pad = px(base * 0.05f); setPadding(pad, pad, pad, pad)
        }
        col.addView(cabecalhoMarca(context, "CLIMA AGORA", base, cores), lp())
        val corpo = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        col.addView(corpo, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val now = data?.now
        if (now == null) {
            // estado INDISPONÍVEL: nunca tela vazia
            corpo.addView(ImageView(context).apply { setImageResource(R.drawable.ic_futuristic_cloud); alpha = 0.8f },
                LinearLayout.LayoutParams(px(base * 0.24f), px(base * 0.24f)).apply { gravity = Gravity.CENTER_HORIZONTAL })
            corpo.addView(text(context, base * 0.05f, bold = true).apply { text = "Clima indisponível no momento" }, lp(top = px(base * 0.03f)))
            corpo.addView(text(context, base * 0.032f, color = Color.argb(200, 255, 255, 255)).apply {
                text = "os dados voltam assim que a conexão responder"
            }, lp())
            return root
        }

        corpo.addView(text(context, base * 0.05f, bold = true).apply {
            text = (data.place ?: "Sua região").uppercase(Locale("pt", "BR")); letterSpacing = 0.14f
        }, lp())
        val linha = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        linha.addView(ImageView(context).apply { setImageResource(weatherDrawable(now.icon)); scaleType = ImageView.ScaleType.FIT_CENTER },
            LinearLayout.LayoutParams(px(base * 0.24f), px(base * 0.24f)))
        val tempCol = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.START }
        tempCol.addView(text(context, base * 0.24f, bold = true).apply {
            text = "${now.temp}°C"; gravity = Gravity.START
            // brilho dentro da área do texto (padding = raio): sem o retângulo recortado em volta
            val r = base * 0.03f
            setShadowLayer(r, 0f, 0f, cores.brilho); setPadding(px(r), px(r), px(r), px(r))
        })
        tempCol.addView(text(context, base * 0.05f, color = Color.argb(235, 255, 255, 255)).apply { text = now.description; gravity = Gravity.START })
        linha.addView(tempCol, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            marginStart = px(base * 0.035f)
        })
        corpo.addView(linha, lp(top = px(base * 0.015f)))

        val f = data.forecast
        val chips = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        fun chip(t: String) = pill(context, t, base * 0.034f, Color.argb(46, 255, 255, 255), Color.WHITE, base)
        f?.max?.let { chips.addView(chip("MÁX. $it°")) }
        chips.addView(chip("SENSAÇÃO ${now.feelsLike}°"), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            marginStart = px(base * 0.02f); marginEnd = px(base * 0.02f)
        })
        f?.min?.let { chips.addView(chip("MÍN. $it°")) }
        corpo.addView(chips, lp(top = px(base * 0.025f)))

        // próximos dias em painéis de vidro
        val dias = f?.days?.take(5).orEmpty()
        if (dias.isNotEmpty()) {
            val faixa = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
            dias.forEachIndexed { i, d ->
                val cartao = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; background = vidro(base)
                    val p = px(base * 0.018f); setPadding(p, p, p, p)
                }
                cartao.addView(text(context, base * 0.03f, bold = true, color = if (i == 0) cores.selo else Color.WHITE).apply {
                    text = WeatherText.rotuloDia(d.dia, i); letterSpacing = 0.1f
                })
                cartao.addView(ImageView(context).apply { setImageResource(weatherDrawable(d.icon)) },
                    LinearLayout.LayoutParams(px(base * 0.075f), px(base * 0.075f)).apply { topMargin = px(base * 0.008f); bottomMargin = px(base * 0.008f) })
                cartao.addView(text(context, base * 0.034f, bold = true).apply { text = "${d.max}°" })
                cartao.addView(text(context, base * 0.026f, color = Color.argb(190, 255, 255, 255)).apply { text = "${d.min}°" })
                faixa.addView(cartao, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginStart = px(base * 0.008f); marginEnd = px(base * 0.008f)
                })
            }
            col.addView(faixa, lp())
        }
        return root
    }

    private fun weatherDrawable(icon: WeatherIcon): Int = when (icon) {
        WeatherIcon.SUN, WeatherIcon.MOON, WeatherIcon.PARTLY -> R.drawable.ic_ensolarado
        WeatherIcon.RAIN, WeatherIcon.STORM -> R.drawable.ic_chuva
        WeatherIcon.CLOUD, WeatherIcon.FOG, WeatherIcon.SNOW -> R.drawable.ic_futuristic_cloud
    }

    private fun buildRss(context: Context, spec: WidgetSpec, bg: Bitmap?, w: Int, h: Int, base: Float, data: RssPayload?): View {
        val root = rootWith(context, bg, if (spec.compact) 60 else 120, intArrayOf(Color.parseColor("#1a1a2e"), Color.parseColor("#16213e")))
        val items = data?.items.orEmpty()
        val source = data?.source.orEmpty()

        val box = content(context, if (spec.compact) "bottom" else spec.position, base)
        val header = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        header.addView(text(context, base * 0.03f, bold = true).apply {
            text = data?.rotulo ?: "NOTÍCIAS"
            letterSpacing = 0.1f
            background = GradientDrawable().apply { setColor(Color.parseColor("#E53935")); cornerRadius = base * 0.012f }
            val ph = px(base * 0.025f); val pv = px(base * 0.008f); setPadding(ph, pv, ph, pv)
        })
        if (source.isNotBlank() && !spec.compact) {
            header.addView(text(context, base * 0.03f, color = Color.argb(200, 255, 255, 255)).apply { text = source; gravity = Gravity.START },
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = px(base * 0.02f) })
        }
        box.addView(header, lp())

        val title = text(context, base * (if (spec.compact) 0.055f else 0.075f), bold = true, lines = if (spec.compact) 2 else 5)
        val summary = text(context, base * 0.04f, color = Color.argb(225, 255, 255, 255), lines = 4)
        val counter = text(context, base * 0.028f, color = Color.argb(190, 255, 255, 255))
        val progress = View(context).apply { setBackgroundColor(Color.parseColor("#E53935")); pivotX = 0f }

        if (items.isEmpty()) {
            title.text = if (spec.feedUrl.isBlank()) "Feed RSS não configurado" else "Sem notícias no momento"
            box.addView(title, lp(top = px(base * 0.04f)))
            root.addView(box)
            return root
        }

        box.addView(title, lp(top = px(base * 0.035f)))
        if (!spec.compact) box.addView(summary, lp(top = px(base * 0.03f)))
        if (items.size > 1) box.addView(counter, lp(top = px(base * 0.03f)))
        root.addView(box)
        // barra de tempo da notícia atual, colada na base
        root.addView(progress, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(base * 0.008f).coerceAtLeast(3), Gravity.BOTTOM))

        var index = 0
        val periodMs = spec.secondsPerItem * 1000L
        fun show(i: Int) {
            val item = items[i % items.size]
            title.text = item.title
            summary.text = item.summary
            summary.visibility = if (item.summary.isBlank()) View.GONE else View.VISIBLE
            counter.text = "${(i % items.size) + 1} / ${items.size}"
            progress.scaleX = 0f
            progress.animate().cancel()
            progress.animate().scaleX(1f).setDuration(periodMs).setInterpolator(android.view.animation.LinearInterpolator()).start()
        }
        show(0)
        val rotate = object : Runnable {
            override fun run() {
                if (!root.isAttachedToWindow && root.parent == null) return
                if (items.size > 1) {
                    index++
                    box.animate().alpha(0f).setDuration(250).withEndAction {
                        show(index)
                        box.animate().alpha(1f).setDuration(250).start()
                    }.start()
                }
                uiHandler.postDelayed(this, periodMs)
            }
        }
        if (items.size > 1) bindToLifecycle(root, rotate, periodMs)
        return root
    }

    // ------------------------------------------------------------------ Esportes (Sports Engine; identidade SOBRE MÍDIA)

    /**
     * Jogos confirmados pelo servidor (config.esportes), horário de Brasília, sem placar ao vivo. Mesma composição do
     * painel (src/components/player/SportsWidget.tsx): 4 jogos por página na horizontal, 6 na vertical, girando a cada 8 s.
     */
    private fun buildSports(context: Context, spec: WidgetSpec, bg: Bitmap?, w: Int, h: Int, base: Float): View {
        val cores = spec.cores ?: CoresWidget.PADRAO
        val dados = spec.esportes ?: DadosEsportes("resultados", emptyList(), "Dados: openfootball (CC0) · Wikipédia (CC BY-SA)")
        val root = fundoMarca(context, bg, base, cores)
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val pad = px(base * 0.045f); setPadding(pad, pad, pad, pad)
        }
        root.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        col.addView(cabecalhoMarca(context, "⚽ " + EsportesText.rotuloModo(dados.modo), base, cores), lp())

        val jogos = EsportesText.visiveis(dados, TimeManager.utcMillis())
        val umaCompeticao = jogos.isNotEmpty() && jogos.map { it.slug }.distinct().size == 1
        if (umaCompeticao) {
            col.addView(text(context, base * 0.036f, bold = true, color = Color.argb(235, 255, 255, 255)).apply {
                text = jogos[0].competicao.uppercase(Locale("pt", "BR")); gravity = Gravity.START; letterSpacing = 0.06f
            }, lp(top = px(base * 0.015f)))
        }
        val lista = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL }
        col.addView(lista, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        val rodape = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        rodape.addView(text(context, base * 0.022f, color = Color.argb(165, 255, 255, 255)).apply {
            text = "Horário de Brasília · ${dados.creditos}"; gravity = Gravity.START; setShadowLayer(0f, 0f, 0f, 0)
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val contador = text(context, base * 0.022f, color = Color.argb(165, 255, 255, 255))
        rodape.addView(contador)
        col.addView(rodape, lp(top = px(base * 0.012f)))

        if (jogos.isEmpty()) {
            lista.addView(text(context, base * 0.04f, color = Color.argb(215, 255, 255, 255), lines = 2).apply { text = "Sem jogos confirmados para exibir agora." }, lp())
            return root
        }
        val porPagina = if (h > w * 1.2f) 6 else 4
        val paginas = (jogos.size + porPagina - 1) / porPagina
        fun mostrar(p: Int) {
            lista.removeAllViews()
            jogos.drop(p * porPagina).take(porPagina).forEachIndexed { i, j ->
                lista.addView(linhaJogo(context, j, base, cores, !umaCompeticao), lp(top = if (i == 0) 0 else px(base * 0.014f)))
            }
            contador.text = if (paginas > 1) "${p + 1}/$paginas" else ""
        }
        mostrar(0)
        if (paginas > 1) {
            var pagina = 0
            val periodoMs = 8_000L
            val girar = object : Runnable {
                override fun run() {
                    if (!root.isAttachedToWindow && root.parent == null) return
                    pagina = (pagina + 1) % paginas
                    lista.animate().alpha(0f).setDuration(250).withEndAction {
                        mostrar(pagina)
                        lista.animate().alpha(1f).setDuration(250).start()
                    }.start()
                    uiHandler.postDelayed(this, periodoMs)
                }
            }
            bindToLifecycle(root, girar, periodoMs)
        }
        return root
    }

    private fun linhaJogo(context: Context, j: JogoEsporte, base: Float, cores: CoresWidget, comCodigo: Boolean): View {
        val linha = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            background = GradientDrawable().apply {
                setColor(Color.argb(23, 255, 255, 255)); cornerRadius = base * 0.016f
                setStroke(px(base * 0.002f).coerceAtLeast(1), CoresWidget.comAlfa(cores.brilho, 90))
            }
            val ph = px(base * 0.022f); val pv = px(base * 0.012f); setPadding(ph, pv, ph, pv)
        }
        if (comCodigo) {
            linha.addView(text(context, base * 0.024f, bold = true, color = cores.selo).apply {
                text = j.codigo; gravity = Gravity.START; setShadowLayer(0f, 0f, 0f, 0)
            }, LinearLayout.LayoutParams(px(base * 0.09f), ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        fun nome(t: String, g: Int) = text(context, base * 0.038f, bold = true).apply {
            text = t; gravity = g; ellipsize = android.text.TextUtils.TruncateAt.END
        }
        linha.addView(nome(j.mandante, Gravity.END or Gravity.CENTER_VERTICAL), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val (principal, encerrado) = EsportesText.centro(j)
        val centro = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        centro.addView(pill(context, principal, base * 0.042f,
            if (encerrado) cores.selo else Color.argb(41, 255, 255, 255),
            if (encerrado) cores.seloTexto else Color.WHITE, base).apply { minWidth = px(base * 0.14f) },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { gravity = Gravity.CENTER_HORIZONTAL })
        centro.addView(text(context, base * 0.021f, bold = true, color = Color.argb(195, 255, 255, 255)).apply {
            text = if (encerrado) "FINAL" else EsportesText.dataCurta(j.data).uppercase(Locale("pt", "BR"))
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.CENTER_HORIZONTAL; topMargin = px(base * 0.004f)
        })
        linha.addView(centro, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            marginStart = px(base * 0.018f); marginEnd = px(base * 0.018f)
        })
        linha.addView(nome(j.visitante, Gravity.START or Gravity.CENTER_VERTICAL), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        return linha
    }

    /** Liga o Runnable enquanto a view está na tela e o cancela ao sair (sem vazamento entre widgets). */
    private fun bindToLifecycle(view: View, task: Runnable, firstDelayMs: Long = 0L) {
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                uiHandler.removeCallbacks(task)
                uiHandler.postDelayed(task, firstDelayMs)
            }
            override fun onViewDetachedFromWindow(v: View) {
                uiHandler.removeCallbacks(task)
                v.animate().cancel()
            }
        })
    }
}

/** Cache local (SharedPreferences) do que veio da rede: usado sem internet e para não repetir chamadas. */
class WidgetDataCache(context: Context) {
    private val prefs = context.getSharedPreferences("widget_data_cache", Context.MODE_PRIVATE)

    fun put(key: String, value: String) {
        prefs.edit().putString(key, value).putLong("$key#t", System.currentTimeMillis()).apply()
    }

    /** (valor, instante da gravação) ou null. */
    fun get(key: String): Pair<String, Long>? {
        val v = prefs.getString(key, null) ?: return null
        return v to prefs.getLong("$key#t", 0L)
    }
}

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
import com.antigravity.player.widget.WeatherText
import com.antigravity.player.widget.WidgetKind
import com.antigravity.player.widget.WidgetSpec
import com.antigravity.player.widget.WidgetSpecParser
import com.antigravity.player.widget.BrasiliaTime
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

    private data class WeatherPayload(val now: WeatherNow?, val place: String?)
    private data class RssPayload(val items: List<RssItem>, val source: String)

    private fun sizeOf(context: Context, container: FrameLayout): Pair<Int, Int> {
        val dm = context.resources.displayMetrics
        return (container.width.takeIf { it > 0 } ?: dm.widthPixels) to (container.height.takeIf { it > 0 } ?: dm.heightPixels)
    }

    /** Fundo e dados em paralelo, fora da thread principal. */
    private suspend fun prefetch(appContext: Context, spec: WidgetSpec, w: Int, h: Int): Pair<Bitmap?, Any?> = coroutineScope {
        val bg = async(Dispatchers.IO) { loadBackground(appContext, spec.backgroundFor(w >= h), w, h) }
        val data = async(Dispatchers.IO) {
            when (spec.kind) {
                WidgetKind.WEATHER -> loadWeather(appContext, spec)
                WidgetKind.RSS -> loadRss(appContext, spec)
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

        // A tela só troca quando tudo está pronto (normalmente já aquecido pelo palco: leitura de cache).
        val (background, payload) = prefetch(appContext, spec, w, h)

        withContext(Dispatchers.Main) {
            container.removeAllViews()
            val view: View = when (spec.kind) {
                WidgetKind.CLOCK -> buildClock(context, spec, background, w, h, base)
                WidgetKind.WEATHER -> buildWeather(context, spec, background, w, h, base, payload as? WeatherPayload)
                WidgetKind.RSS -> buildRss(context, spec, background, w, h, base, payload as? RssPayload)
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
        val key = "weather:$lat,$lon"
        val cached = cache.get(key)
        var body: String? = cached?.takeIf { System.currentTimeMillis() - it.second < WEATHER_FRESH_MS }?.first
        if (body == null) {
            body = try {
                httpGet("https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon" +
                    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&timezone=auto")
                    ?.also { if (WeatherText.parseOpenMeteo(it) != null) cache.put(key, it) }
            } catch (e: Exception) {
                Logger.w("WIDGET", "Clima sem rede, usando cache: ${e.message}")
                null
            } ?: cached?.first
        }
        val now = body?.let { WeatherText.parseOpenMeteo(it) }
        return WeatherPayload(now, resolvePlace(cache, spec, lat, lon))
    }

    private fun resolvePlace(cache: WidgetDataCache, spec: WidgetSpec, lat: Double, lon: Double): String? {
        spec.locationName?.let { return it }
        val key = "place:$lat,$lon"
        cache.get(key)?.let { return it.first }
        try {
            val body = httpGet("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=$lat&longitude=$lon&localityLanguage=pt")
            if (body != null) {
                val obj = org.json.JSONObject(body)
                // "Região Metropolitana de ..." não é nome de cidade: cai para o próximo campo.
                val name = listOf("city", "locality", "principalSubdivision").map { obj.optString(it) }
                    .firstOrNull { it.isNotBlank() && !it.startsWith("Região", ignoreCase = true) }
                if (name != null) { cache.put(key, name); return name }
            }
        } catch (e: Exception) {
            Logger.w("WIDGET", "Nome do local indisponível: ${e.message}")
        }
        return RegionalContextManager.city.takeIf { RegionalContextManager.isContextLoaded && it != "Unknown" && spec.latitude == null }
    }

    private fun loadRss(context: Context, spec: WidgetSpec): RssPayload {
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

    private fun buildClock(context: Context, spec: WidgetSpec, bg: Bitmap?, w: Int, h: Int, base: Float): View {
        val root = rootWith(context, bg, 90, intArrayOf(Color.parseColor("#1e3c72"), Color.parseColor("#0b1330")))
        val box = content(context, spec.position, base)
        val color = runCatching { Color.parseColor(spec.textColor ?: "#FFFFFF") }.getOrDefault(Color.WHITE)
        val soft = { a: Int -> Color.argb(a, Color.red(color), Color.green(color), Color.blue(color)) }

        val greeting = text(context, base * 0.05f, color = soft(230))
        box.addView(greeting, lp())

        // Horário de Brasília a partir do relógio SINCRONIZADO (NTP), nunca do fuso/relógio do aparelho.
        val clock = text(context, base * 0.30f, bold = true, color = color).apply {
            setShadowLayer(base * 0.02f, 0f, base * 0.01f, Color.argb(170, 0, 0, 0))
        }
        fitOneLine(clock, base * 0.06f, base * 0.30f)
        box.addView(clock, lp(h = px(base * 0.32f), top = px(base * 0.02f)))

        val date = text(context, base * 0.045f, color = soft(220)).apply { letterSpacing = 0.12f }
        if (spec.showDate) box.addView(date, lp(top = px(base * 0.02f)))

        val label = text(context, base * 0.026f, color = soft(170)).apply { letterSpacing = 0.2f; text = "HORÁRIO DE BRASÍLIA" }
        box.addView(label, lp(top = px(base * 0.03f)))
        root.addView(box)

        fun paint(now: Long) {
            clock.text = BrasiliaTime.time(now, spec.showSeconds, spec.format24h)
            date.text = BrasiliaTime.dateLong(now)
            greeting.text = WeatherText.greeting(BrasiliaTime.hourOfDay(now))
        }
        val tick = object : Runnable {
            override fun run() {
                if (!root.isAttachedToWindow && root.parent == null) return
                val now = TimeManager.utcMillis()
                paint(now)
                // agenda na virada exata do próximo segundo/minuto: sem deriva e sem "pular" números
                uiHandler.postDelayed(this, BrasiliaTime.msUntilNextTick(TimeManager.utcMillis(), spec.showSeconds))
            }
        }
        paint(TimeManager.utcMillis())
        bindToLifecycle(root, tick)
        return root
    }

    private fun weatherDrawable(icon: WeatherIcon): Int = when (icon) {
        WeatherIcon.SUN, WeatherIcon.MOON, WeatherIcon.PARTLY -> R.drawable.ic_ensolarado
        WeatherIcon.RAIN, WeatherIcon.STORM -> R.drawable.ic_chuva
        WeatherIcon.CLOUD, WeatherIcon.FOG, WeatherIcon.SNOW -> R.drawable.ic_futuristic_cloud
    }

    private fun buildWeather(context: Context, spec: WidgetSpec, bg: Bitmap?, w: Int, h: Int, base: Float, data: WeatherPayload?): View {
        val now = data?.now
        val colors = if (now?.isDay == false) intArrayOf(Color.parseColor("#141e30"), Color.parseColor("#243b55"))
        else intArrayOf(Color.parseColor("#2b6cb0"), Color.parseColor("#63b3ed"))
        val root = rootWith(context, bg, 105, colors)
        val box = content(context, spec.position, base)

        val place = data?.place
        box.addView(text(context, base * 0.045f, color = Color.argb(230, 255, 255, 255)).apply {
            text = if (place.isNullOrBlank()) "PREVISÃO DO TEMPO" else "PREVISÃO PARA ${place.uppercase(Locale("pt", "BR"))}"
            letterSpacing = 0.08f
        }, lp())

        if (now == null) {
            box.addView(ImageView(context).apply { setImageResource(R.drawable.ic_futuristic_cloud); alpha = 0.7f },
                lp(w = px(base * 0.26f), h = px(base * 0.26f), top = px(base * 0.04f)).apply { gravity = Gravity.CENTER_HORIZONTAL })
            box.addView(text(context, base * 0.05f).apply { text = "Clima indisponível no momento" }, lp(top = px(base * 0.03f)))
            root.addView(box)
            return root
        }

        val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        row.addView(ImageView(context).apply { setImageResource(weatherDrawable(now.icon)); scaleType = ImageView.ScaleType.FIT_CENTER },
            LinearLayout.LayoutParams(px(base * 0.28f), px(base * 0.28f)))
        val col = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL }
        col.addView(text(context, base * 0.26f, bold = true).apply { text = "${now.temp}°"; gravity = Gravity.START })
        col.addView(text(context, base * 0.055f).apply { text = now.description; gravity = Gravity.START })
        row.addView(col, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = px(base * 0.04f) })
        box.addView(row, lp(top = px(base * 0.03f)))

        val panel = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            background = GradientDrawable().apply { setColor(Color.argb(70, 0, 0, 0)); cornerRadius = base * 0.03f; setStroke(px(base * 0.002f).coerceAtLeast(1), Color.argb(60, 255, 255, 255)) }
            val p = px(base * 0.03f); setPadding(p, p, p, p)
        }
        fun info(label: String, value: String) = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            addView(text(context, base * 0.028f, color = Color.argb(190, 255, 255, 255)).apply { text = label.uppercase(); letterSpacing = 0.08f })
            addView(text(context, base * 0.05f, bold = true).apply { text = value })
        }
        val itemLp = { LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f) }
        panel.addView(info("Sensação", "${now.feelsLike}°C"), itemLp())
        panel.addView(info("Umidade", "${now.humidity}%"), itemLp())
        panel.addView(info("Vento", "${now.windKmh} km/h"), itemLp())
        box.addView(panel, lp(top = px(base * 0.05f)))
        root.addView(box)
        return root
    }

    private fun buildRss(context: Context, spec: WidgetSpec, bg: Bitmap?, w: Int, h: Int, base: Float, data: RssPayload?): View {
        val root = rootWith(context, bg, if (spec.compact) 60 else 120, intArrayOf(Color.parseColor("#1a1a2e"), Color.parseColor("#16213e")))
        val items = data?.items.orEmpty()
        val source = data?.source.orEmpty()

        val box = content(context, if (spec.compact) "bottom" else spec.position, base)
        val header = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        header.addView(text(context, base * 0.03f, bold = true).apply {
            text = "NOTÍCIAS"
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

package com.antigravity.player

import com.antigravity.player.widget.RssFeedParser
import com.antigravity.player.widget.WeatherIcon
import com.antigravity.player.widget.WeatherText
import com.antigravity.player.widget.WidgetKind
import com.antigravity.player.widget.WidgetSpecParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.URLEncoder

class WidgetLogicTest {

    private fun url(type: String, cfg: String) =
        "native_widget://$type/abc?config=" + URLEncoder.encode(cfg, "UTF-8")

    @Test
    fun spec_readsWhatThePanelSaves_clock() {
        val s = WidgetSpecParser.parse(url("clock",
            """{"showDate":true,"showSeconds":true,"position":"center","backgroundImageLandscape":"https://cdn/x/land.png","backgroundImagePortrait":"https://cdn/x/port.png"}"""))
        assertEquals(WidgetKind.CLOCK, s.kind)
        assertTrue(s.showSeconds)
        assertEquals("https://cdn/x/land.png", s.backgroundFor(landscape = true))
        assertEquals("https://cdn/x/port.png", s.backgroundFor(landscape = false))
    }

    @Test
    fun spec_backgroundFallsBackToTheOtherOrientation_neverEmptyWhenOneExists() {
        val s = WidgetSpecParser.parse(url("weather", """{"backgroundImageLandscape":"https://cdn/l.png","backgroundImagePortrait":null}"""))
        assertEquals("https://cdn/l.png", s.backgroundFor(landscape = false))
        val none = WidgetSpecParser.parse(url("weather", """{"backgroundImageLandscape":null,"backgroundImagePortrait":null}"""))
        assertNull(none.backgroundFor(true))
    }

    @Test
    fun spec_rejectsNonHttpBackgroundsAndFeeds() {
        val s = WidgetSpecParser.parse(url("rss", """{"backgroundImageLandscape":"file:///sdcard/x.png","feedUrl":"javascript:alert(1)"}"""))
        assertNull(s.backgroundFor(true))
        assertEquals("", s.feedUrl)
    }

    @Test
    fun spec_rss_defaultsAndClamps() {
        val s = WidgetSpecParser.parse(url("rss", """{"feedUrl":"https://g1.globo.com/rss/g1/","maxItems":500,"scrollSpeed":1,"variant":"compact"}"""))
        assertEquals(WidgetKind.RSS, s.kind)
        assertEquals(20, s.maxItems)
        assertEquals(3, s.secondsPerItem)
        assertTrue(s.compact)
        val d = WidgetSpecParser.parse(url("rss", """{"feedUrl":"https://a.b/rss"}"""))
        assertEquals(5, d.maxItems); assertEquals(8, d.secondsPerItem)
    }

    @Test
    fun spec_weather_coordinatesAsNumberOrString_andRangeChecked() {
        val a = WidgetSpecParser.parse(url("weather", """{"latitude":-23.5505,"longitude":-46.6333}"""))
        assertEquals(-23.5505, a.latitude!!, 0.0001)
        val b = WidgetSpecParser.parse(url("weather", """{"latitude":"-3.1","longitude":"-60.0"}"""))
        assertEquals(-3.1, b.latitude!!, 0.0001)
        val bad = WidgetSpecParser.parse(url("weather", """{"latitude":123.0,"longitude":-46.0}"""))
        assertNull(bad.latitude)
    }

    @Test
    fun spec_brokenConfigNeverCrashes() {
        assertEquals(WidgetKind.CLOCK, WidgetSpecParser.parse("native_widget://clock/abc").kind)
        assertEquals(WidgetKind.CLOCK, WidgetSpecParser.parse("native_widget://clock/abc?config=%7Bbroken").kind)
        assertEquals(WidgetKind.UNKNOWN, WidgetSpecParser.parse("native_widget://xyz/abc").kind)
    }

    @Test
    fun rss_parsesRss2_withCdataEntitiesAndHtml() {
        val xml = """<rss><channel><title>Feed</title>
            <item><title><![CDATA[Governo anuncia &amp; muda regra]]></title><description><![CDATA[<p>Texto <b>longo</b> da notícia&nbsp;aqui.</p><img src="x.jpg">]]></description></item>
            <item><title>Segunda &quot;notícia&quot;</title><description>&lt;p&gt;Resumo escapado&lt;/p&gt;</description></item>
            <item><title>Terceira</title></item>
        </channel></rss>"""
        val items = RssFeedParser.parse(xml, 2)
        assertEquals(2, items.size)
        assertEquals("Governo anuncia & muda regra", items[0].title)
        assertEquals("Texto longo da notícia aqui.", items[0].summary)
        assertEquals("Segunda \"notícia\"", items[1].title)
        assertEquals("Resumo escapado", items[1].summary)
    }

    @Test
    fun rss_parsesAtom_andIgnoresChannelTitle() {
        val xml = """<feed><title>Canal</title><entry><title>Item Atom</title><summary>Resumo atom</summary></entry></feed>"""
        val items = RssFeedParser.parse(xml, 5)
        assertEquals(1, items.size)
        assertEquals("Item Atom", items[0].title)
        assertEquals("Resumo atom", items[0].summary)
    }

    @Test
    fun rss_garbageGivesEmptyList_notCrash() {
        assertTrue(RssFeedParser.parse("<html>404</html>", 5).isEmpty())
        assertTrue(RssFeedParser.parse("", 5).isEmpty())
    }

    @Test
    fun rss_summaryIsCapped() {
        val big = "a".repeat(1000)
        val items = RssFeedParser.parse("<rss><item><title>T</title><description>$big</description></item></rss>", 1)
        assertEquals(RssFeedParser.MAX_SUMMARY_CHARS, items[0].summary.length)
    }

    @Test
    fun weather_parsesOpenMeteoCurrent() {
        val body = """{"current":{"temperature_2m":27.4,"relative_humidity_2m":63,"apparent_temperature":29.6,"is_day":1,"weather_code":61,"wind_speed_10m":12.2}}"""
        val w = WeatherText.parseOpenMeteo(body)!!
        assertEquals(27, w.temp); assertEquals(30, w.feelsLike); assertEquals(63, w.humidity); assertEquals(12, w.windKmh)
        assertEquals("Chuva", w.description); assertEquals(WeatherIcon.RAIN, w.icon)
    }

    @Test
    fun weather_badBodyIsNull_andNightClearUsesMoon() {
        assertNull(WeatherText.parseOpenMeteo("{}"))
        assertNull(WeatherText.parseOpenMeteo("not json"))
        assertEquals(WeatherIcon.MOON, WeatherText.describe(0, false).second)
        assertEquals("Tempestade", WeatherText.describe(95, true).first)
    }

    @Test
    fun greeting_byHour() {
        assertEquals("Bom dia", WeatherText.greeting(8))
        assertEquals("Boa tarde", WeatherText.greeting(15))
        assertEquals("Boa noite", WeatherText.greeting(23))
        assertEquals("Boa noite", WeatherText.greeting(3))
    }

    @Test
    fun forecast_parsesDailyBlock_maxMinAndNextDays() {
        val body = """{"current":{"temperature_2m":29.2,"weather_code":0,"is_day":1},
            "daily":{"time":["2026-09-25","2026-09-26","2026-09-27"],"weather_code":[0,2,61],
            "temperature_2m_max":[32.4,31.0,28.6],"temperature_2m_min":[24.1,23.6,22.0]}}"""
        val f = WeatherText.parseForecast(body)!!
        assertEquals(32, f.max); assertEquals(24, f.min)
        assertEquals(3, f.days.size)
        assertEquals(WeatherIcon.RAIN, f.days[2].icon)
        assertEquals(29, WeatherText.parseOpenMeteo(body)!!.temp)
    }

    @Test
    fun forecast_missingDailyIsNull_notCrash() {
        assertNull(WeatherText.parseForecast("""{"current":{"temperature_2m":20}}"""))
        assertNull(WeatherText.parseForecast("lixo"))
    }

    @Test
    fun rotuloDia_hojeEDiaDaSemanaPelaData() {
        assertEquals("HOJE", WeatherText.rotuloDia("2026-09-25", 0))
        assertEquals("SÁB", WeatherText.rotuloDia("2026-09-26", 1))
        assertEquals("DOM", WeatherText.rotuloDia("2026-09-27", 2))
        assertEquals("SEG", WeatherText.rotuloDia("2026-09-28", 3))
    }

    @Test
    fun spec_template_lidoDaConfig() {
        assertEquals("weather-futurista", WidgetSpecParser.parse(url("weather", """{"template":"weather-futurista"}""")).template)
        assertNull(WidgetSpecParser.parse(url("weather", "{}")).template)
    }

    @Test
    fun spec_institucional_lidoDaConfig() {
        val s = WidgetSpecParser.parse(url("institutional", """{"selo":"aviso","titulo":"Horário de funcionamento","texto":"Venha!","linhas":[{"rotulo":"Segunda a sexta","valor":"06:00 — 22:00"},{"rotulo":"","valor":""}],"contato":"(81) 9999-0000","qrConteudo":"loja.com.br","qrLegenda":"Veja"}"""))
        assertEquals(WidgetKind.INSTITUTIONAL, s.kind)
        val i = s.institucional!!
        assertEquals("AVISO", i.selo)
        assertEquals("Horário de funcionamento", i.titulo)
        assertEquals(1, i.linhas.size)
        assertEquals("06:00 — 22:00", i.linhas[0].valor)
        assertEquals("(81) 9999-0000", i.contato)
        assertEquals("loja.com.br", s.qrConteudo)
        assertNull(WidgetSpecParser.parse(url("clock", "{}")).institucional)
    }
}

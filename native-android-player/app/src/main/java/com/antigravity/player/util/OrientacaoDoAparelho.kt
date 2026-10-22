package com.antigravity.player.util

import android.app.Activity
import android.content.Context
import android.view.View
import android.view.ViewGroup

/**
 * F-212 — orientação FÍSICA do aparelho: como a TV está instalada (deitada ou em pé, como totem). É a ÚNICA autoridade
 * lida pela launcher, pelas telas de entrada (abertura, login, escolha da tela, suporte, perguntas) e, antes da 1ª
 * sincronização, pelo Player. Não é a orientação das mídias (essa é da playlist) nem a escala (LETTERBOX/PILLARBOX/
 * EXACT_FIT, do palco do Player): uma mídia deitada numa TV em pé continua deitada, encaixada pelo modo de escala.
 *
 * TV Box e TV não têm sensor de posição e informam ao Android só a saída de vídeo (quase sempre 1280x720 deitada, mesmo
 * com a TV em pé): a proporção da resolução NÃO prova a posição. Por isso a posição vem de configuração, nesta ordem:
 *  1. PAINEL   — "Rotação da tela" da tela vinculada (screens.rotacao_tela, guardada a cada sincronização);
 *  2. APARELHO — "Posição da tela" escolhida no Menu da launcher (aparelho ainda sem tela vinculada);
 *  3. ROM      — ROM Sobre Mídia gravada para totem (propriedade ro.sobremidia.orientacao);
 *  4. SISTEMA  — nenhuma configuração: vale a orientação lógica do Android (celular/tablet giram sozinhos) — não é
 *     posição confirmada, e numa TV significa "deitada até alguém dizer o contrário".
 * Rotação = quanto o quadro gira (sentido horário) para ficar em pé para quem olha: 0 deitada, 270 em pé com a base
 * à esquerda (padrão 9x16), 90 em pé com a base à direita, 180 de cabeça para baixo (mesma régua do painel).
 */
object OrientacaoDoAparelho {

    enum class Fonte { PAINEL, APARELHO, ROM, SISTEMA }

    data class Estado(val rotacao: Int?, val fonte: Fonte) {
        /** Em pé (retrato, referência 9:16)? null = sem posição configurada (só a orientação lógica do Android). */
        val emPe: Boolean? get() = when (rotacao) { 90, 270 -> true; 0, 180 -> false; else -> null }
    }

    /** Gravada pelo Player com o valor do painel (F-194) — o nome antigo continua para o 5.8.x ler igual. */
    const val PREF_PAINEL = "rotacao_tela"
    const val PREF_APARELHO = "rotacao_no_aparelho"
    const val PROP_ROM = "ro.sobremidia.orientacao"
    private const val PREFS = "player_prefs"

    val ROTACOES = listOf(0, 270, 90, 180)

    fun valida(r: Int?): Int? = r?.takeIf { it in ROTACOES }

    /** Nome igual ao do painel (src/lib/rotacaoTela.ts). */
    fun titulo(r: Int?): String = when (r) {
        0 -> "Deitada (normal)"
        270 -> "Em pé — base à esquerda"
        90 -> "Em pé — base à direita"
        180 -> "De cabeça para baixo"
        else -> "Automática (sem posição definida)"
    }

    /** Regra pura: painel > aparelho > ROM > sistema. */
    fun resolver(painel: Int?, aparelho: Int?, rom: Int?): Estado = when {
        valida(painel) != null -> Estado(painel, Fonte.PAINEL)
        valida(aparelho) != null -> Estado(aparelho, Fonte.APARELHO)
        valida(rom) != null -> Estado(rom, Fonte.ROM)
        else -> Estado(null, Fonte.SISTEMA)
    }

    /** Valor da ROM: "0/90/180/270", "retrato"/"totem" (= 270) ou "paisagem" (= 0). Outro valor = sem posição. */
    fun lerValorDaRom(v: String?): Int? = when (v?.trim()?.lowercase()) {
        null, "" -> null
        "retrato", "totem", "vertical" -> 270
        "paisagem", "horizontal" -> 0
        else -> valida(v.trim().toIntOrNull())
    }

    fun rotacaoDaRom(): Int? = try {
        val sp = Class.forName("android.os.SystemProperties")
        lerValorDaRom(sp.getMethod("get", String::class.java).invoke(null, PROP_ROM) as? String)
    } catch (e: Exception) { null }

    fun atual(ctx: Context): Estado {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return resolver(p.getInt(PREF_PAINEL, -1), p.getInt(PREF_APARELHO, -1), rotacaoDaRom())
    }

    /** Rotação do aparelho/ROM — o que vale antes do painel responder (nunca grava como se fosse do painel). */
    fun rotacaoSemPainel(ctx: Context): Int? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return resolver(null, p.getInt(PREF_APARELHO, -1), rotacaoDaRom()).rotacao
    }

    /** "Posição da tela" escolhida no próprio aparelho (null = automática). Grava na hora: vale depois de faltar energia. */
    fun definirNoAparelho(ctx: Context, rotacao: Int?) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
            if (valida(rotacao) == null) remove(PREF_APARELHO) else putInt(PREF_APARELHO, rotacao!!)
        }.commit()
    }

    // ------------------------------------------------------------------ política de apresentação

    /**
     * Como desenhar uma tela inteira (launcher, login, perguntas) num aparelho de largura x altura: TV/TV Box ignoram o
     * pedido de girar do app, então o quadro gira por software (o mesmo cálculo do Player); celular/tablet giram sozinhos.
     * [orientacaoDaPlaylist] só entra quando não há posição nenhuma configurada (comportamento antigo da launcher).
     */
    fun transformacao(ctx: Context, largura: Int, altura: Int, orientacaoDaPlaylist: String? = null): PlayerFlowPolicy.CanvasTransform? {
        if (!DeviceTypeUtil.isTelevision(ctx)) return null
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return PlayerFlowPolicy.tvCanvasTransform(
            isTelevision = true,
            canonicalOrientation = orientacaoDaPlaylist,
            displayWidth = largura,
            displayHeight = altura,
            giroGraus = if (p.getInt("giro_do_quadro", 90) == 270) 270 else 90,
            rotacaoTela = atual(ctx).rotacao
        )
    }

    /** Aplica a transformação numa view que ocupa a tela toda. Devolve true se o quadro ficou em pé (retrato). */
    fun aplicar(v: View, t: PlayerFlowPolicy.CanvasTransform?, largura: Int, altura: Int): Boolean {
        val lp = v.layoutParams
        val w = t?.width ?: ViewGroup.LayoutParams.MATCH_PARENT
        val h = t?.height ?: ViewGroup.LayoutParams.MATCH_PARENT
        if (lp.width != w || lp.height != h) { lp.width = w; lp.height = h; v.layoutParams = lp }
        v.rotation = t?.rotation ?: 0f
        v.translationX = t?.translationX ?: 0f
        v.translationY = t?.translationY ?: 0f
        return (t?.width ?: largura) < (t?.height ?: altura)
    }

    /**
     * Gira a tela inteira de uma Activity (o 1º filho de android.R.id.content) conforme a posição física. Para as telas
     * de entrada: abertura, login, escolha da tela e "aparelho desvinculado". Seguro de chamar várias vezes.
     */
    fun girarActivity(activity: Activity) {
        val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        val raiz = content.getChildAt(0) ?: return
        if (content.width <= 0 || content.height <= 0) { content.post { girarActivity(activity) }; return }
        val t = transformacao(activity, content.width, content.height)
        aplicar(raiz, t, content.width, content.height)
        if (t != null) {
            // o teclado é do Android e não gira junto: com a tela girada ele só abre quando a pessoa entra no campo
            activity.window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN)
            try {
                (activity.getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                    .hideSoftInputFromWindow(content.windowToken, 0)
            } catch (e: Exception) { }
        }
    }
}

package com.antigravity.player.util

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * F-212 — perguntas e avisos (launcher, login, escolha da tela, pergunta da launcher). Com a TV deitada é o AlertDialog
 * de sempre. Com o quadro girado por software (TV em pé / totem, ou de cabeça para baixo) a janela de diálogo do Android
 * sairia deitada — então a caixa é desenhada DENTRO da tela, girada junto com ela, no formato retrato.
 */
object CaixaNaTela {

    class Opcao(val texto: String, val acao: (() -> Unit)? = null)

    /**
     * [mensagem] null = lista de opções (como setItems); com mensagem = botões (1ª = positivo, 2ª = negativo, 3ª = neutro).
     * Devolve "fechar" (sem chamar nenhuma ação).
     */
    fun mostrar(
        activity: Activity,
        titulo: String,
        mensagem: String?,
        opcoes: List<Opcao>,
        cancelavel: Boolean = true,
        aoCancelar: (() -> Unit)? = null
    ): () -> Unit = mostrar(activity, titulo, mensagem, opcoes, cancelavel, aoCancelar, esperou = false)

    private fun mostrar(
        activity: Activity, titulo: String, mensagem: String?, opcoes: List<Opcao>, cancelavel: Boolean,
        aoCancelar: (() -> Unit)?, esperou: Boolean
    ): () -> Unit {
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        // tela ainda sem tamanho (Activity recém-aberta): espera o 1º desenho para saber se está em pé
        if (content != null && (content.width <= 0 || content.height <= 0) && !esperou) {
            var fechar: (() -> Unit)? = null
            var cancelada = false
            content.post {
                if (!cancelada && !activity.isFinishing) fechar = mostrar(activity, titulo, mensagem, opcoes, cancelavel, aoCancelar, esperou = true)
            }
            return { cancelada = true; fechar?.invoke() }
        }
        val t = if (content != null && content.width > 0 && content.height > 0)
            OrientacaoDoAparelho.transformacao(activity, content.width, content.height) else null
        if (content == null || t == null) return dialogoComum(activity, titulo, mensagem, opcoes, cancelavel, aoCancelar)
        return caixaGirada(activity, content, t, titulo, mensagem, opcoes, cancelavel, aoCancelar)
    }

    private fun dialogoComum(
        activity: Activity, titulo: String, mensagem: String?, opcoes: List<Opcao>, cancelavel: Boolean, aoCancelar: (() -> Unit)?
    ): () -> Unit {
        val b = AlertDialog.Builder(activity).setTitle(titulo).setCancelable(cancelavel)
        if (mensagem == null) {
            b.setItems(opcoes.map { it.texto }.toTypedArray()) { _, qual -> opcoes.getOrNull(qual)?.acao?.invoke() }
        } else {
            b.setMessage(mensagem)
            opcoes.getOrNull(0)?.let { o -> b.setPositiveButton(o.texto) { _, _ -> o.acao?.invoke() } }
            opcoes.getOrNull(1)?.let { o -> b.setNegativeButton(o.texto) { _, _ -> o.acao?.invoke() } }
            opcoes.getOrNull(2)?.let { o -> b.setNeutralButton(o.texto) { _, _ -> o.acao?.invoke() } }
        }
        if (aoCancelar != null) b.setOnCancelListener { aoCancelar() }
        val d = b.show()
        return { try { d.dismiss() } catch (e: Exception) { } }
    }

    private fun caixaGirada(
        activity: Activity, content: ViewGroup, t: PlayerFlowPolicy.CanvasTransform,
        titulo: String, mensagem: String?, opcoes: List<Opcao>, cancelavel: Boolean, aoCancelar: (() -> Unit)?
    ): () -> Unit {
        fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), activity.resources.displayMetrics).toInt()
        val antesComFoco = activity.currentFocus
        // o que está atrás não recebe o foco do controle enquanto a caixa está aberta
        val atras = (0 until content.childCount).map { content.getChildAt(it) }.filterIsInstance<ViewGroup>()
        val focoAntes = atras.map { it.descendantFocusability }
        atras.forEach { it.descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS }

        val camada = FrameLayout(activity).apply {
            setBackgroundColor(0xB3000000.toInt())
            isClickable = true
            layoutParams = FrameLayout.LayoutParams(t.width, t.height)
        }
        content.addView(camada)
        OrientacaoDoAparelho.aplicar(camada, t, content.width, content.height)

        var fechada = false
        val fechar: () -> Unit = {
            if (!fechada) {
                fechada = true
                try { content.removeView(camada) } catch (e: Exception) { }
                atras.forEachIndexed { i, v -> v.descendantFocusability = focoAntes[i] }
                antesComFoco?.requestFocus()
            }
        }

        val cartao = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(26), dp(24), dp(26), dp(22))
            background = GradientDrawable().apply {
                cornerRadius = dp(22).toFloat()
                setColor(0xFF0B1430.toInt())
                setStroke(dp(1), 0x6600D4FF)
            }
        }
        val largura = minOf(t.width - dp(48), dp(560))
        camada.addView(cartao, FrameLayout.LayoutParams(largura, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))

        cartao.addView(TextView(activity).apply {
            text = titulo
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        })
        if (mensagem != null) {
            val rolagem = ScrollView(activity)
            rolagem.addView(TextView(activity).apply {
                text = mensagem
                setTextColor(0xFFC9D2E6.toInt())
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                setLineSpacing(0f, 1.15f)
            })
            cartao.addView(rolagem, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(12) })
            // texto longo não empurra os botões para fora da tela em pé
            rolagem.post {
                val maximo = (t.height * 0.45f).toInt()
                if (rolagem.height > maximo) rolagem.layoutParams = rolagem.layoutParams.apply { height = maximo }
            }
        }

        val cancelar = {
            if (cancelavel) { fechar(); aoCancelar?.invoke() }
        }
        var primeiro: View? = null
        opcoes.forEachIndexed { i, o ->
            val botao = TextView(activity).apply {
                text = o.texto
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
                gravity = Gravity.CENTER_VERTICAL
                minHeight = dp(52)
                setPadding(dp(18), dp(10), dp(18), dp(10))
                isFocusable = true
                isClickable = true
                background = StateListDrawable().apply {
                    addState(intArrayOf(android.R.attr.state_focused), GradientDrawable().apply {
                        cornerRadius = dp(14).toFloat(); setColor(0xFF4F46E5.toInt()); setStroke(dp(2), 0xFF7FEBFF.toInt())
                    })
                    addState(intArrayOf(), GradientDrawable().apply {
                        cornerRadius = dp(14).toFloat(); setColor(0xFF1B2547.toInt()); setStroke(dp(1), 0x33FFFFFF)
                    })
                }
                setOnClickListener { fechar(); o.acao?.invoke() }
                setOnKeyListener { _, codigo, ev ->
                    if (codigo == KeyEvent.KEYCODE_BACK && ev.action == KeyEvent.ACTION_UP) { cancelar(); true }
                    else codigo == KeyEvent.KEYCODE_BACK
                }
            }
            cartao.addView(botao, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = if (i == 0) dp(20) else dp(10) })
            if (primeiro == null) primeiro = botao
        }
        camada.setOnClickListener { cancelar() } // toque fora da caixa (celular/mouse)
        cartao.isClickable = true
        primeiro?.post { primeiro?.requestFocusFromTouch() }
        return fechar
    }
}

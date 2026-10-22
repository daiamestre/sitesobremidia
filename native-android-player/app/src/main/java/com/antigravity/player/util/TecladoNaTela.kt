package com.antigravity.player.util

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * F-212 — teclado na proporção da tela. O teclado do Android é uma janela do sistema e não gira com o quadro: numa TV em
 * pé (9:16) ele sairia deitado, de lado. Com a tela girada por software, os campos usam ESTE teclado, desenhado dentro
 * da tela girada (em pé com a TV em pé), navegável pelo controle remoto e pelo mouse. Deitada, fica o teclado do Android.
 */
object TecladoNaTela {

    private val LETRAS = listOf("qwertyuiop", "asdfghjklç", "zxcvbnm")
    private val SIMBOLOS = listOf("!#$%&*()+=", "/?:;'\",<>-", "~^[]{}|\\")

    /** Liga o teclado próprio nos [campos] (na ordem do "Próximo"). [aoConcluir] = "OK" no último campo. */
    fun ligar(activity: Activity, campos: List<EditText>, aoConcluir: (() -> Unit)? = null) {
        val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        if (content.width <= 0 || content.height <= 0) { content.post { ligar(activity, campos, aoConcluir) }; return }
        val t = OrientacaoDoAparelho.transformacao(activity, content.width, content.height) ?: return // deitada: teclado do Android
        Teclado(activity, content, t, campos, aoConcluir).instalar()
    }

    private class Teclado(
        val activity: Activity, val content: ViewGroup, val t: PlayerFlowPolicy.CanvasTransform,
        val campos: List<EditText>, val aoConcluir: (() -> Unit)?
    ) {
        fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), activity.resources.displayMetrics).toInt()
        val camada = FrameLayout(activity) // não pega toque: o que está fora do teclado continua respondendo
        val painel = LinearLayout(activity)
        var alvo: EditText? = null
        var maiuscula = false
        var simbolos = false
        val teclasDeLetra = ArrayList<TextView>()
        lateinit var acao: TextView
        lateinit var primeira: View

        fun instalar() {
            campos.forEach { campo ->
                campo.showSoftInputOnFocus = false // o do Android sairia deitado
                campo.setOnClickListener { mostrar(campo) }
                campo.setOnKeyListener { _, codigo, ev ->
                    if (ev.action == KeyEvent.ACTION_UP && (codigo == KeyEvent.KEYCODE_DPAD_CENTER || codigo == KeyEvent.KEYCODE_ENTER)) {
                        mostrar(campo); true
                    } else false
                }
            }
            content.addView(camada, FrameLayout.LayoutParams(t.width, t.height))
            OrientacaoDoAparelho.aplicar(camada, t, content.width, content.height)
            painel.orientation = LinearLayout.VERTICAL
            painel.setPadding(dp(6), dp(8), dp(6), dp(10))
            painel.setBackgroundColor(0xF20B1430.toInt())
            painel.isClickable = true
            painel.visibility = View.GONE
            camada.addView(painel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (t.height * 0.4f).toInt(), Gravity.BOTTOM))
            montar()
        }

        fun montar() {
            painel.removeAllViews()
            teclasDeLetra.clear()
            linha("1234567890".map { it.toString() })
            val corpo = if (simbolos) SIMBOLOS else LETRAS
            linha(corpo[0].map { it.toString() })
            linha(corpo[1].map { it.toString() })
            linha(listOf(if (simbolos) "" else "⇧") + corpo[2].map { it.toString() } + listOf("⌫"))
            linha(listOf(if (simbolos) "abc" else "#+=", "@", ".", "_", "espaço", ".com", "OK"))
            atualizarLetras()
        }

        fun linha(teclas: List<String>) {
            val l = LinearLayout(activity)
            l.orientation = LinearLayout.HORIZONTAL
            painel.addView(l, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
            teclas.filter { it.isNotEmpty() }.forEach { rotulo ->
                val peso = when (rotulo) { "espaço" -> 3f; "OK", ".com", "⌫", "⇧", "#+=", "abc" -> 1.5f; else -> 1f }
                val tecla = TextView(activity).apply {
                    text = rotulo
                    gravity = Gravity.CENTER
                    setTextColor(Color.WHITE)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, if (rotulo.length > 1) 15f else 20f)
                    isFocusable = true
                    isClickable = true
                    background = fundo(rotulo == "OK")
                    setOnClickListener { tocar(rotulo) }
                    setOnKeyListener { _, codigo, ev ->
                        if (codigo == KeyEvent.KEYCODE_BACK) { if (ev.action == KeyEvent.ACTION_UP) esconder(); true } else false
                    }
                }
                l.addView(tecla, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, peso).apply {
                    setMargins(dp(3), dp(3), dp(3), dp(3))
                })
                if (rotulo.length == 1 && rotulo[0].isLetter()) teclasDeLetra.add(tecla)
                if (rotulo == "OK") acao = tecla
                if (rotulo == "q" || (simbolos && rotulo == "!")) primeira = tecla
            }
        }

        fun fundo(destaque: Boolean) = StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), GradientDrawable().apply {
                cornerRadius = dp(10).toFloat(); setColor(0xFF4F46E5.toInt()); setStroke(dp(2), 0xFF7FEBFF.toInt())
            })
            addState(intArrayOf(android.R.attr.state_pressed), GradientDrawable().apply {
                cornerRadius = dp(10).toFloat(); setColor(0xFF4F46E5.toInt())
            })
            addState(intArrayOf(), GradientDrawable().apply {
                cornerRadius = dp(10).toFloat(); setColor(if (destaque) 0xFF3730A3.toInt() else 0xFF1B2547.toInt()); setStroke(dp(1), 0x33FFFFFF)
            })
        }

        fun atualizarLetras() {
            teclasDeLetra.forEach { it.text = if (maiuscula) it.text.toString().uppercase() else it.text.toString().lowercase() }
            if (::acao.isInitialized) acao.text = if (proximoCampo() != null) "Próximo" else "OK"
        }

        fun proximoCampo(): EditText? = alvo?.let { a -> campos.getOrNull(campos.indexOf(a) + 1) }

        fun tocar(rotulo: String) {
            val campo = alvo ?: return
            when (rotulo) {
                "⌫" -> {
                    val s = minOf(campo.selectionStart, campo.selectionEnd).coerceAtLeast(0)
                    val e = maxOf(campo.selectionStart, campo.selectionEnd).coerceAtLeast(0)
                    if (e > s) campo.text.delete(s, e) else if (s > 0) campo.text.delete(s - 1, s)
                }
                "⇧" -> { maiuscula = !maiuscula; atualizarLetras() }
                "#+=", "abc" -> { simbolos = !simbolos; montar(); primeira.requestFocus() }
                "OK", "Próximo" -> {
                    val prox = proximoCampo()
                    if (prox != null) { alvo = prox; prox.requestFocus(); prox.setSelection(prox.text.length); atualizarLetras(); primeira.requestFocus() }
                    else { esconder(); aoConcluir?.invoke() }
                }
                "espaço" -> inserir(campo, " ")
                else -> {
                    inserir(campo, rotulo)
                    if (maiuscula && rotulo.length == 1 && rotulo[0].isLetter()) { maiuscula = false; atualizarLetras() }
                }
            }
        }

        fun inserir(campo: EditText, texto: String) {
            val s = minOf(campo.selectionStart, campo.selectionEnd).let { if (it < 0) campo.text.length else it }
            val e = maxOf(campo.selectionStart, campo.selectionEnd).let { if (it < 0) campo.text.length else it }
            campo.text.replace(s, e, texto)
        }

        fun mostrar(campo: EditText) {
            alvo = campo
            campo.setSelection(campo.text.length)
            if (painel.visibility != View.VISIBLE) {
                painel.visibility = View.VISIBLE
                // o formulário sobe para o espaço acima do teclado
                content.getChildAt(0)?.let { it.setPadding(it.paddingLeft, it.paddingTop, it.paddingRight, painel.layoutParams.height) }
            }
            atualizarLetras()
            primeira.post { primeira.requestFocus() }
        }

        fun esconder() {
            if (painel.visibility != View.VISIBLE) return
            painel.visibility = View.GONE
            content.getChildAt(0)?.let { it.setPadding(it.paddingLeft, it.paddingTop, it.paddingRight, 0) }
            alvo?.requestFocus()
        }
    }
}

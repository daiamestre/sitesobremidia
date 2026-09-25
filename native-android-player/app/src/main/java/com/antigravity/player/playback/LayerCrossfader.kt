package com.antigravity.player.playback

import android.view.View
import android.view.animation.LinearInterpolator

/**
 * Cruzamento (dissolve) entre duas camadas de exibição.
 *
 * Regra de ouro: a camada que SAI só é escondida DEPOIS que a que ENTRA está 100% opaca. Nunca existe um quadro em que
 * as duas estão escondidas (era o buraco preto de ~0,7-0,9 s medido no motor anterior, e o "pisca" de 100-200 ms típico
 * do Screenly/Anthias).
 * - Entrando por CIMA (irmãos reordenados com bringToFront, ou widget, que fica acima): a entrada sobe de 0 a 1.
 * - Entrando por BAIXO (saída é o widget, que fica acima de tudo): a saída desce de 1 a 0 revelando a entrada.
 */
class LayerCrossfader {
    private var pendingComplete: (() -> Unit)? = null

    fun crossfade(outgoing: View?, incoming: View, fadeMs: Long, incomingOnTop: Boolean, onDone: () -> Unit) {
        finishNow()
        val out = outgoing?.takeIf { it !== incoming }
        if (out == null || fadeMs <= 0L) {
            incoming.animate().cancel()
            incoming.alpha = 1f
            incoming.visibility = View.VISIBLE
            if (out != null) hide(out)
            onDone()
            return
        }

        var completed = false
        val complete: () -> Unit = {
            if (!completed) {
                completed = true
                pendingComplete = null
                out.animate().cancel()
                incoming.animate().cancel()
                incoming.alpha = 1f
                incoming.visibility = View.VISIBLE
                hide(out)
                onDone()
            }
        }
        pendingComplete = complete

        if (incomingOnTop) {
            incoming.alpha = 0f
            incoming.visibility = View.VISIBLE
            incoming.animate().alpha(1f).setDuration(fadeMs).setInterpolator(LinearInterpolator())
                .withEndAction { complete() }.start()
        } else {
            incoming.alpha = 1f
            incoming.visibility = View.VISIBLE
            out.animate().alpha(0f).setDuration(fadeMs).setInterpolator(LinearInterpolator())
                .withEndAction { complete() }.start()
        }
    }

    /** Conclui na hora o cruzamento em andamento (próximo item chegou, loop reiniciou, tela bloqueada...). */
    fun finishNow() {
        pendingComplete?.invoke()
    }

    private fun hide(view: View) {
        view.animate().cancel()
        view.visibility = View.INVISIBLE
        view.alpha = 1f
    }
}

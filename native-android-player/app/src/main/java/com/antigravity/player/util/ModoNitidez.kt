package com.antigravity.player.util

/**
 * F-198 — "Modo nitidez" (versão de TESTE 5.7.11). Nas TV Box (Rockchip/MXQ 4K) a tela do Android trabalha em 1280x720
 * mesmo com a saída HDMI em 1080p/4K. O vídeo numa TextureView é desenhado nessa tela de 720p e depois esticado pela
 * TV: em TV de 50" fica borrado. Numa SurfaceView o vídeo vai para o plano de vídeo do hardware, na resolução da SAÍDA.
 *
 * Só liga quando há ganho (saída física maior que a tela do Android) e quando o quadro NÃO é girado por software
 * (a SurfaceView não acompanha a rotação de uma View; tela girada continua na TextureView, como no 5.7.10).
 * Efeito colateral aceito: troca entre dois vídeos vira corte (sem dissolver); imagens continuam dissolvendo por cima.
 */
object ModoNitidez {

    /** Saída física (HDMI) maior que a tela lógica do Android, com folga para arredondamentos. */
    fun saidaMaiorQueATela(larguraLogica: Int, alturaLogica: Int, larguraFisica: Int, alturaFisica: Int): Boolean {
        if (larguraLogica <= 0 || alturaLogica <= 0 || larguraFisica <= 0 || alturaFisica <= 0) return false
        return maxOf(larguraFisica, alturaFisica) > maxOf(larguraLogica, alturaLogica) + 8
    }

    /**
     * Usa a SurfaceView? [quadroGiradoPorSoftware] = a tela gira o quadro por software (TV/TV Box de painel que ignora o
     * pedido de girar e rotação diferente de 0).
     */
    fun usar(
        larguraLogica: Int, alturaLogica: Int, larguraFisica: Int, alturaFisica: Int,
        quadroGiradoPorSoftware: Boolean
    ): Boolean = !quadroGiradoPorSoftware && saidaMaiorQueATela(larguraLogica, alturaLogica, larguraFisica, alturaFisica)

    /** Texto para o registro / painel: "saída 1920x1080 · tela 1280x720". */
    fun descrever(larguraLogica: Int, alturaLogica: Int, larguraFisica: Int, alturaFisica: Int, ligado: Boolean): String =
        "saída ${larguraFisica}x$alturaFisica · tela ${larguraLogica}x$alturaLogica · modo nitidez ${if (ligado) "LIGADO" else "desligado"}"
}

package com.antigravity.player.launcher

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity

/**
 * F-200/F-204 — pergunta "Usar a launcher Sobre Mídia?" quando a pessoa SAI do app Sobre Mídia (3º Home no Player, ou
 * Home saindo do login/escolha da tela) e usa a launcher original. Aparece uma vez por saída e some sozinha em 40 s sem
 * escolher nada (a pessoa fica na launcher original). Quem já usa a launcher Sobre Mídia nunca vê a pergunta.
 */
class PerguntaLauncherActivity : AppCompatActivity() {
    private val principal = Handler(Looper.getMainLooper())
    private var fecharCaixa: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!LauncherDoAparelho.deveOferecer(this)) { finish(); return }
        // F-212: deitada é o diálogo de sempre; com a TV em pé a caixa gira junto (CaixaNaTela)
        val fechar = com.antigravity.player.util.CaixaNaTela.mostrar(this, "Launcher Sobre Mídia", TEXTO, listOf(
            com.antigravity.player.util.CaixaNaTela.Opcao("Usar a launcher Sobre Mídia") {
                LauncherDoAparelho.ativar(this) // pode ter sido desligada por "usar a launcher original como padrão"
                startActivity(Intent(this, LauncherActivity::class.java)
                    .putExtra(LauncherActivity.EXTRA_PEDIR_PADRAO, true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                finish()
            },
            com.antigravity.player.util.CaixaNaTela.Opcao("Agora não") { LauncherDoAparelho.marcarPerguntado(this); finish() }
        ), aoCancelar = { finish() })
        this.fecharCaixa = fechar
        principal.postDelayed({ if (!isFinishing) { fechar(); finish() } }, TEMPO_NA_TELA_MS)
    }

    override fun onDestroy() {
        principal.removeCallbacksAndMessages(null)
        try { fecharCaixa?.invoke() } catch (e: Exception) { } // Home com a pergunta aberta: fecha sem deixar janela presa
        fecharCaixa = null
        com.antigravity.player.MainActivity.perguntaTerminou() // F-210: agora começa o minuto fora do Player
        super.onDestroy()
    }

    companion object {
        /** F-210: a pergunta fica no máximo 30 s na tela; sem resposta some, a pessoa segue na launcher original e o minuto fora do Player começa. */
        const val TEMPO_NA_TELA_MS = 30_000L

        const val TEXTO = "Usar a launcher Sobre Mídia como tela inicial deste aparelho?\n\n" +
            "Ao ligar o aparelho ou sair do Player aparece a launcher Sobre Mídia, com o Player em destaque e os seus " +
            "aplicativos. Dá para voltar para a launcher original quando quiser (botão \"Launcher original\"). " +
            "O Player continua pedindo login para escolher a tela."

        /**
         * F-200: ouve a tecla Home/Recentes (o Android avisa com ACTION_CLOSE_SYSTEM_DIALOGS, motivo "homekey"/"recentapps").
         * É o único jeito de saber que a PESSOA saiu do app: telas do Android que o próprio Player abre (instalador,
         * "Não perturbe", Ajustes) não disparam a pergunta. [pode] diz se esta tela permite sair (o Player com o quiosque
         * ligado volta sozinho: não pergunta). Ligar no onCreate e desligar no onDestroy.
         */
        class VigiaDaSaida(private val ctx: Context, private val pode: () -> Boolean) {
            private val receptor = object : android.content.BroadcastReceiver() {
                override fun onReceive(c: Context?, i: Intent?) {
                    val motivo = i?.getStringExtra("reason")
                    if ((motivo == "homekey" || motivo == "recentapps") && TelasNaFrente.estavaNaFrente() && pode()) aoSairDoApp(ctx)
                }
            }
            fun ligar() {
                try {
                    androidx.core.content.ContextCompat.registerReceiver(ctx, receptor,
                        android.content.IntentFilter(Intent.ACTION_CLOSE_SYSTEM_DIALOGS), androidx.core.content.ContextCompat.RECEIVER_EXPORTED)
                } catch (e: Exception) { }
            }
            fun desligar() { try { ctx.unregisterReceiver(receptor) } catch (e: Exception) { } }
        }

        /**
         * Chamada quando a pessoa sai do app (tecla Home/Recentes ou "voltar" na primeira tela). Espera 1,5 s e só pergunta se NENHUMA tela do app ficou na frente (a pessoa saiu de
         * verdade). Uma vez por saída.
         */
        fun aoSairDoApp(ctx: Context) {
            // F-210: sem pergunta, o minuto fora do Player começa já
            if (!LauncherDoAparelho.deveOferecer(ctx)) { com.antigravity.player.MainActivity.perguntaTerminou(); return }
            val app = ctx.applicationContext
            Handler(Looper.getMainLooper()).postDelayed({
                if (TelasNaFrente.alguma() || !LauncherDoAparelho.deveOferecer(app)) {
                    com.antigravity.player.MainActivity.perguntaTerminou(); return@postDelayed
                }
                try {
                    app.startActivity(Intent(app, PerguntaLauncherActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (e: Exception) { com.antigravity.player.MainActivity.perguntaTerminou() }
            }, 1_500)
        }

        /** Quantas telas do app estão na frente (resumidas) e quando a última saiu da frente. */
        object TelasNaFrente : android.app.Application.ActivityLifecycleCallbacks {
            @Volatile private var resumidas = 0
            @Volatile private var ultimaPausaMs = 0L
            fun alguma() = resumidas > 0
            /** Uma tela do app estava na frente agora há pouco (o Home chega junto com a pausa). */
            fun estavaNaFrente(agora: Long = System.currentTimeMillis()) = alguma() || agora - ultimaPausaMs < 1_500L
            override fun onActivityResumed(a: android.app.Activity) { if (a !is PerguntaLauncherActivity) resumidas++ }
            override fun onActivityPaused(a: android.app.Activity) {
                if (a !is PerguntaLauncherActivity) { resumidas = (resumidas - 1).coerceAtLeast(0); ultimaPausaMs = System.currentTimeMillis() }
            }
            override fun onActivityCreated(a: android.app.Activity, b: Bundle?) {}
            override fun onActivityStarted(a: android.app.Activity) {}
            override fun onActivityStopped(a: android.app.Activity) {}
            override fun onActivitySaveInstanceState(a: android.app.Activity, b: Bundle) {}
            override fun onActivityDestroyed(a: android.app.Activity) {}
        }
    }
}

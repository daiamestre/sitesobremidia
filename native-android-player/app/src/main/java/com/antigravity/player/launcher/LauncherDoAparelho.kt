package com.antigravity.player.launcher

import android.app.AppOpsManager
import android.app.admin.DevicePolicyManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.antigravity.core.util.Logger
import com.antigravity.player.receiver.AdminReceiver
import com.antigravity.player.util.DeviceControl
import com.antigravity.player.util.RootInstaller

/**
 * F-200 — a launcher Sobre Mídia como tela inicial do aparelho.
 *
 * - Tornar padrão: Device Owner (permanente) → root (`pm set-home-activity`) → pedido do Android (Android 10+) →
 *   escolha "Sempre" / Ajustes do aparelho. Quando o aparelho insiste na launcher dele (Google TV e afins), a vigia
 *   (a cada 2 s, pelo SelfHealingService) volta para a launcher Sobre Mídia sempre que a original aparece.
 * - Voltar para a original: "uma vez" (abre a original e libera o uso livre) ou "de vez" (a launcher Sobre Mídia
 *   deixa de ser candidata a tela inicial; o painel religa com o comando launcher_sobremidia).
 */
object LauncherDoAparelho {
    private const val PREFS = "launcher_prefs"
    private const val K_ESCOLHIDA = "escolhida"
    private const val K_PERGUNTADO = "perguntado"
    private const val K_ORIGINAL = "launcher_original"
    private const val K_ORIGINAL_LIBERADA_ATE = "original_liberada_ate"
    private const val K_USO_LIVRE_ATE = "uso_livre_ate"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    fun componente(ctx: Context) = ComponentName(ctx, LauncherActivity::class.java)
    private fun intencaoDeTelaInicial() = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)

    // ------------------------------------------------------------------ estado

    /** O componente da launcher está ligado (é candidato a tela inicial)? */
    fun ativa(ctx: Context): Boolean =
        ctx.packageManager.getComponentEnabledSetting(componente(ctx)) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED

    /** O dono do aparelho escolheu usar a launcher Sobre Mídia. */
    fun escolhida(ctx: Context): Boolean = prefs(ctx).getBoolean(K_ESCOLHIDA, false)

    /** A tela inicial do aparelho É a launcher Sobre Mídia. */
    fun ehPadrao(ctx: Context): Boolean = try {
        val r = ctx.packageManager.resolveActivity(intencaoDeTelaInicial(), PackageManager.MATCH_DEFAULT_ONLY)
        r?.activityInfo?.packageName == ctx.packageName && r?.activityInfo?.name == LauncherActivity::class.java.name
    } catch (e: Exception) { false }

    /** Perguntar na abertura do Player? (uma vez por instalação, só se ainda não for a tela inicial) */
    fun devePerguntar(ctx: Context): Boolean = !prefs(ctx).getBoolean(K_PERGUNTADO, false) && ativa(ctx) && !ehPadrao(ctx)

    fun marcarPerguntado(ctx: Context) { prefs(ctx).edit().putBoolean(K_PERGUNTADO, true).apply() }

    /** Outras launchers instaladas (a original do aparelho primeiro, se conhecida). */
    fun outrasLaunchers(ctx: Context): List<ResolveInfo> = try {
        ctx.packageManager.queryIntentActivities(intencaoDeTelaInicial(), 0).filter {
            val p = it.activityInfo.packageName
            p != ctx.packageName && p != "android" && !it.activityInfo.name.endsWith("FallbackHome")
        }
    } catch (e: Exception) { emptyList() }

    /** Guarda qual era a launcher do aparelho antes da Sobre Mídia (para o botão "Launcher original"). */
    fun lembrarOriginal(ctx: Context) {
        val r = try { ctx.packageManager.resolveActivity(intencaoDeTelaInicial(), PackageManager.MATCH_DEFAULT_ONLY) } catch (e: Exception) { null }
        val atual = r?.activityInfo
        if (atual != null && atual.packageName != ctx.packageName && atual.packageName != "android" && !atual.name.endsWith("ResolverActivity")) {
            prefs(ctx).edit().putString(K_ORIGINAL, ComponentName(atual.packageName, atual.name).flattenToString()).apply()
        }
    }

    fun original(ctx: Context): ComponentName? {
        val guardada = prefs(ctx).getString(K_ORIGINAL, null)?.let { ComponentName.unflattenFromString(it) }
        val outras = outrasLaunchers(ctx)
        if (guardada != null && outras.any { it.activityInfo.packageName == guardada.packageName }) return guardada
        return outras.firstOrNull()?.activityInfo?.let { ComponentName(it.packageName, it.name) }
    }

    // ------------------------------------------------------------------ tornar padrão

    /**
     * Tenta tornar a launcher Sobre Mídia a tela inicial SEM perguntar nada (Device Owner ou root). Liga a escolha
     * (e com ela a vigia). Devolve true se ela já é a tela inicial. Rodar fora da thread principal (root demora).
     */
    fun tornarPadraoEmSilencio(ctx: Context): Boolean {
        lembrarOriginal(ctx)
        ativar(ctx)
        prefs(ctx).edit().putBoolean(K_ESCOLHIDA, true).putBoolean(K_PERGUNTADO, true).remove(K_ORIGINAL_LIBERADA_ATE).apply()
        if (ehPadrao(ctx)) return true
        if (DeviceControl.isDeviceOwner(ctx)) {
            try {
                val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                val filtro = IntentFilter(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_HOME); addCategory(Intent.CATEGORY_DEFAULT) }
                dpm.addPersistentPreferredActivity(ComponentName(ctx, AdminReceiver::class.java), filtro, componente(ctx))
                Logger.i("LAUNCHER", "Tela inicial definida pelo Device Owner.")
            } catch (e: Exception) { Logger.w("LAUNCHER", "Device Owner não definiu a tela inicial: ${e.message}") }
            if (ehPadrao(ctx)) return true
        }
        if (RootInstaller.disponivel(ctx)) {
            val c = componente(ctx).flattenToString()
            val r = RootInstaller.executar(
                "pm set-home-activity $c || cmd package set-home-activity $c; " +
                    "appops set ${ctx.packageName} GET_USAGE_STATS allow", 15_000L
            )
            Logger.i("LAUNCHER", "Tela inicial por root: ${r.saida.trim().take(120)}")
            if (ehPadrao(ctx)) return true
        }
        return false
    }

    /**
     * Pedido ao usuário (quando não deu em silêncio). Android 10+: a janela do próprio Android. Antes disso: se não há
     * tela inicial definida, o Android pergunta ("Sempre"); se há, abre os Ajustes de tela inicial.
     * Devolve a intenção a abrir (para a Activity tratar o resultado) ou null se já resolveu.
     */
    fun intencaoParaPedir(ctx: Context): Intent? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val rm = ctx.getSystemService(android.app.role.RoleManager::class.java)
                if (rm != null && rm.isRoleAvailable(android.app.role.RoleManager.ROLE_HOME) &&
                    !rm.isRoleHeld(android.app.role.RoleManager.ROLE_HOME)) {
                    return rm.createRequestRoleIntent(android.app.role.RoleManager.ROLE_HOME)
                }
            } catch (e: Exception) { Logger.w("LAUNCHER", "Pedido de tela inicial do Android falhou: ${e.message}") }
        }
        val semPadrao = try {
            ctx.packageManager.resolveActivity(intencaoDeTelaInicial(), PackageManager.MATCH_DEFAULT_ONLY)
                ?.activityInfo?.let { it.packageName == "android" || it.name.endsWith("ResolverActivity") } ?: true
        } catch (e: Exception) { true }
        if (semPadrao) return intencaoDeTelaInicial().addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        for (acao in listOf(Settings.ACTION_HOME_SETTINGS, "android.settings.MANAGE_DEFAULT_APPS_SETTINGS")) {
            val i = Intent(acao).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (i.resolveActivity(ctx.packageManager) != null) return i
        }
        return null
    }

    // ------------------------------------------------------------------ voltar para a original

    /** Abre a launcher original UMA vez (a Sobre Mídia continua sendo a tela inicial). */
    fun abrirOriginal(activity: Context, minutosLivres: Int): Boolean {
        val c = original(activity) ?: return false
        UsoLivre.liberar(activity, minutosLivres)
        prefs(activity).edit().putLong(K_ORIGINAL_LIBERADA_ATE, LauncherPolicy.fimDoUsoLivre(System.currentTimeMillis(), minutosLivres)).apply()
        return try {
            activity.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setComponent(c)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED))
            true
        } catch (e: Exception) {
            Logger.w("LAUNCHER", "Launcher original não abriu: ${e.message}"); false
        }
    }

    /** Volta DE VEZ para a launcher original: a Sobre Mídia deixa de ser tela inicial (o Player continua igual). */
    fun usarOriginalComoPadrao(ctx: Context) {
        val original = original(ctx)
        prefs(ctx).edit().putBoolean(K_ESCOLHIDA, false).putBoolean(K_PERGUNTADO, true).apply()
        if (DeviceControl.isDeviceOwner(ctx)) {
            try {
                val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                dpm.clearPackagePersistentPreferredActivities(ComponentName(ctx, AdminReceiver::class.java), ctx.packageName)
            } catch (e: Exception) { Logger.w("LAUNCHER", "Device Owner: ${e.message}") }
        }
        try { ctx.packageManager.clearPackagePreferredActivities(ctx.packageName) } catch (e: Exception) { }
        if (original != null && RootInstaller.disponivel(ctx)) {
            val c = original.flattenToString()
            Thread { RootInstaller.executar("pm set-home-activity $c || cmd package set-home-activity $c", 15_000L) }.start()
        }
        desativar(ctx)
        Logger.i("LAUNCHER", "Launcher Sobre Mídia desligada; tela inicial volta a ser ${original?.packageName}.")
    }

    fun ativar(ctx: Context) = mudarComponente(ctx, PackageManager.COMPONENT_ENABLED_STATE_ENABLED)
    private fun desativar(ctx: Context) = mudarComponente(ctx, PackageManager.COMPONENT_ENABLED_STATE_DISABLED)
    private fun mudarComponente(ctx: Context, estado: Int) {
        try { ctx.packageManager.setComponentEnabledSetting(componente(ctx), estado, PackageManager.DONT_KILL_APP) }
        catch (e: Exception) { Logger.w("LAUNCHER", "Componente da launcher: ${e.message}") }
    }

    // ------------------------------------------------------------------ vigia (aparelhos que insistem na launcher deles)

    fun acessoDeUsoLiberado(ctx: Context): Boolean = try {
        val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        @Suppress("DEPRECATION")
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName) == AppOpsManager.MODE_ALLOWED
    } catch (e: Exception) { false }

    fun intencaoDoAcessoDeUso(): Intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** A vigia precisa agir neste aparelho? (escolhida, ligada, mas o Android não a usa como tela inicial) */
    fun precisaDeVigia(ctx: Context): Boolean = escolhida(ctx) && ativa(ctx) && !ehPadrao(ctx)

    private fun appEmPrimeiroPlano(ctx: Context): String? = try {
        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val agora = System.currentTimeMillis()
        val eventos = usm.queryEvents(agora - 15_000L, agora)
        var ultimo: String? = null
        val e = UsageEvents.Event()
        while (eventos.hasNextEvent()) {
            eventos.getNextEvent(e)
            @Suppress("DEPRECATION")
            if (e.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) ultimo = e.packageName
        }
        ultimo
    } catch (e: Exception) { null }

    /**
     * Chamada a cada 2 s pelo SelfHealingService. Se a launcher do aparelho apareceu (Home, ao ligar, ao sair de um app)
     * e a Sobre Mídia foi escolhida, abre a Sobre Mídia por cima. Respeita o "Launcher original" (janela liberada).
     */
    fun vigiar(ctx: Context) {
        if (!precisaDeVigia(ctx)) return
        if (prefs(ctx).getLong(K_ORIGINAL_LIBERADA_ATE, 0L) > System.currentTimeMillis()) return
        if (!acessoDeUsoLiberado(ctx)) return
        val frente = appEmPrimeiroPlano(ctx) ?: return
        if (frente == ctx.packageName) return
        if (outrasLaunchers(ctx).none { it.activityInfo.packageName == frente }) return
        Logger.i("LAUNCHER", "Launcher do aparelho ($frente) na frente: abrindo a launcher Sobre Mídia (modo forçado).")
        try {
            ctx.startActivity(Intent(ctx, LauncherActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
        } catch (e: Exception) { Logger.w("LAUNCHER", "Vigia não abriu a launcher: ${e.message}") }
    }

    // ------------------------------------------------------------------ uso livre (o Player não puxa a tela de volta)

    object UsoLivre {
        fun liberar(ctx: Context, minutos: Int) {
            prefs(ctx).edit().putLong(K_USO_LIVRE_ATE, LauncherPolicy.fimDoUsoLivre(System.currentTimeMillis(), minutos)).apply()
            Logger.i("LAUNCHER", "Uso livre por $minutos min (o Player não puxa a tela).")
        }
        fun ativo(ctx: Context): Boolean = LauncherPolicy.usoLivreAtivo(prefs(ctx).getLong(K_USO_LIVRE_ATE, 0L), System.currentTimeMillis())
        fun encerrar(ctx: Context) {
            if (prefs(ctx).contains(K_USO_LIVRE_ATE)) prefs(ctx).edit().remove(K_USO_LIVRE_ATE).remove(K_ORIGINAL_LIBERADA_ATE).apply()
        }
    }

}

package com.antigravity.player.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.antigravity.player.MainActivity;

/**
 * BootReceiver (Java) - O "dedo no interruptor" do sistema.
 * Migrado para Java para garantir máxima estabilidade em kernels antigos de TV Boxes.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action) ||
            "com.htc.intent.action.QUICKBOOT_POWERON".equals(action) ||
            "android.intent.action.REBOOT".equals(action)) {
            
            Log.i("SobreMidiaBoot", "Energia restabelecida. Gatilho detectado: " + action);

            // Atraso de Segurança para hardware lento (Opcional, mas recomendado para TV Boxes)
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }

            // Inicia a MainActivity do Sobre Mídia Player
            Intent i = new Intent(context, MainActivity.class);
            
            // Flags cruciais para abrir o app a partir de background
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);

            context.startActivity(i);
        }
    }
}

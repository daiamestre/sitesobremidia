import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { versaoDoNome } from '@/components/screens/AtualizacaoDoAplicativo';

/** Versão do Player que tem a launcher Sobre Mídia (F-200). */
export const VERSAO_DA_LAUNCHER = '5.8.0';

/** O aparelho entende os comandos da launcher? */
export const temLauncher = (versao?: string | null) => versaoDoNome(versao) >= versaoDoNome(VERSAO_DA_LAUNCHER);

/**
 * F-200 — comandos da launcher para UMA tela (só dono/ADM). "Launcher Sobre Mídia" liga a launcher e mostra no
 * aparelho; "Launcher original" abre a launcher do próprio aparelho. Nos dois, o Player não puxa a tela de volta
 * durante o tempo de uso livre (página Launcher).
 */
export function LauncherDaTela({ tela }: { tela: { id: string; app_version?: string | null; version?: string | null } }) {
  const { isOwner, perfilNome } = useAuth();
  const [enviando, setEnviando] = useState<string | null>(null);
  if (!(isOwner || perfilNome === 'OWNER' || perfilNome === 'ADMIN')) return null;
  const versao = tela.version || tela.app_version || null;
  const pode = temLauncher(versao);

  const enviar = async (command: 'launcher_sobremidia' | 'launcher_original', texto: string) => {
    setEnviando(command);
    const { error } = await supabase.from('remote_commands').insert({ screen_id: tela.id, command, status: 'pending' } as never);
    setEnviando(null);
    if (error) { toast.error(`Não foi possível enviar: ${error.message}`); return; }
    toast.success(texto);
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3" data-testid="launcher-da-tela">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Launcher do aparelho</p>
        <Link to="/workspace/launcher" className="text-xs text-primary hover:underline">Configurar launcher</Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!pode || !!enviando} data-testid="cmd-launcher-sobremidia"
          onClick={() => enviar('launcher_sobremidia', 'Pedido enviado: a launcher Sobre Mídia aparece no aparelho e passa a ser a tela inicial.')}>
          {enviando === 'launcher_sobremidia' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
          Launcher Sobre Mídia
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!pode || !!enviando} data-testid="cmd-launcher-original"
          onClick={() => enviar('launcher_original', 'Pedido enviado: o aparelho abre a launcher original (o Player volta sozinho depois do uso livre).')}>
          {enviando === 'launcher_original' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Home className="h-3.5 w-3.5" />}
          Launcher original
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {pode
          ? 'Abre a launcher no aparelho sem tirar o Player do ar: depois do tempo de uso livre o Player volta sozinho.'
          : `Disponível a partir do Player ${VERSAO_DA_LAUNCHER} (versão de teste). Este aparelho está no ${versao ?? 'Player antigo'}.`}
      </p>
    </div>
  );
}

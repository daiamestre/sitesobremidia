import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

/**
 * F-194 — Atualização do aplicativo da tela. O Player 5.7.9+ atualiza SEM interromper as mídias: em silêncio quando o
 * aparelho tem root ou é "Device Owner"; nos outros, a versão nova fica baixada e o instalador do Android só abre
 * quando alguém pede aqui ("Instalar atualização agora"), com uma pessoa ao lado da TV para tocar em Instalar.
 */
export const versaoDoNome = (v?: string | null) => {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(v ?? '');
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
};

export function AtualizacaoDoAplicativo({ tela }: {
  tela: { id: string; app_version?: string | null; version?: string | null; last_action?: string | null; last_action_value?: string | null; last_action_at?: string | null };
}) {
  const [enviando, setEnviando] = useState(false);
  const { data: ultima } = useQuery({
    queryKey: ['ultima-versao-player'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc('get_latest_app_release' as never);
      return (data as unknown as { version_name?: string } | null)?.version_name ?? null;
    },
  });
  const atual = tela.app_version || tela.version || null;
  const desatualizada = !!ultima && !!atual && versaoDoNome(atual) < versaoDoNome(ultima);
  const nota = tela.last_action === 'AppUpdate' ? tela.last_action_value : null;
  // F-194: antes da 5.7.4 o relógio errado do aparelho fazia o Player descartar os comandos do painel (F-186)
  const antigaDemais = !!atual && versaoDoNome(atual) > 0 && versaoDoNome(atual) < versaoDoNome('5.7.4');

  const instalarAgora = async () => {
    setEnviando(true);
    const { error } = await supabase.from('remote_commands').insert({ screen_id: tela.id, command: 'install_update', status: 'pending' } as never);
    setEnviando(false);
    if (error) { toast.error(`Não foi possível enviar: ${error.message}`); return; }
    toast.success('Pedido enviado. Se o aparelho não instalar sozinho, o instalador abre na TV por 10 minutos: toque em "Instalar".');
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3" data-testid="atualizacao-do-aplicativo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Aplicativo da tela</p>
          <p className="text-xs text-muted-foreground">
            {atual ? `Versão ${atual}` : 'Versão desconhecida'}{ultima ? ` · mais nova: ${ultima}` : ''}
            {desatualizada ? ' · desatualizada' : atual && ultima ? ' · em dia' : ''}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={instalarAgora} disabled={enviando} className="gap-1.5" data-testid="instalar-atualizacao">
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Instalar atualização agora
        </Button>
      </div>
      {antigaDemais && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300" data-testid="player-antigo">
          Este aparelho está no Player {atual}, que tem o defeito do relógio (corrigido na 5.7.4): captura de tela, reiniciar,
          atualizar e ativar/desativar demoram ou não chegam. Instale a versão nova à mão uma vez — depois ela se atualiza sozinha
          e os comandos respondem em cerca de 1 segundo.
        </p>
      )}
      {nota && (
        <p className="text-xs text-muted-foreground">
          Último aviso do aparelho: <span className="text-foreground">{nota}</span>
          {tela.last_action_at ? ` (${formatDistanceToNow(new Date(tela.last_action_at), { addSuffix: true, locale: ptBR })})` : ''}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        A atualização não interrompe as mídias. Com root ou "Device Owner" ela instala sozinha; nos outros aparelhos o Android exige um toque —
        use o botão com alguém ao lado da TV. Vale a partir do Player 5.7.9.
      </p>
    </div>
  );
}

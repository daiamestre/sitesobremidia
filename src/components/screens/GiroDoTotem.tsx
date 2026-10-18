import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

/**
 * F-192 — Totem / TV em pé: sentido do giro da imagem. Quando a TV fica em pé e a playlist é 9x16, o Player gira o quadro
 * 90°. Dependendo do lado em que a TV foi montada, a imagem aparece de cabeça para baixo: aqui inverte o sentido (270°).
 * Vale no Player 5.7.8 em diante; ele aplica na próxima sincronização (cerca de 1 minuto) e guarda a escolha.
 */
export function GiroDoTotem({ tela, aoMudar }: {
  tela: { id: string; resolution?: string | null; orientation?: string | null; giro_quadro?: number | null };
  aoMudar?: () => void;
}) {
  const [invertido, setInvertido] = useState((tela.giro_quadro ?? 90) === 270);
  const [salvando, setSalvando] = useState(false);
  const emPe = tela.resolution === '9x16' || tela.orientation === 'portrait';

  const alternar = async (valor: boolean) => {
    setSalvando(true);
    const anterior = invertido;
    setInvertido(valor);
    const { error } = await supabase.from('screens').update({ giro_quadro: valor ? 270 : 90 } as never).eq('id', tela.id);
    setSalvando(false);
    if (error) {
      setInvertido(anterior);
      toast.error(`Não foi possível salvar: ${error.message}`);
      return;
    }
    toast.success(valor
      ? 'Imagem invertida. A tela aplica em cerca de 1 minuto.'
      : 'Sentido padrão da imagem. A tela aplica em cerca de 1 minuto.');
    aoMudar?.();
  };

  return (
    <Card className="glass" data-testid="giro-do-totem">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><RotateCw className="h-4 w-4 text-primary" /> Totem: sentido da imagem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`giro-${tela.id}`} className="text-sm leading-snug">
            Imagem de cabeça para baixo? Inverter o sentido do giro
          </Label>
          <Switch id={`giro-${tela.id}`} checked={invertido} disabled={salvando} onCheckedChange={alternar} />
        </div>
        <p className="text-xs text-muted-foreground">
          {emPe
            ? 'Para TV montada em pé (totem) com playlist 9x16. Ligue se as mídias aparecerem de cabeça para baixo; desligue para voltar ao padrão.'
            : 'Só tem efeito quando a tela usa playlist 9x16 numa TV montada em pé (totem).'}
          {' '}Precisa do Player 5.7.8 ou mais novo.
        </p>
      </CardContent>
    </Card>
  );
}

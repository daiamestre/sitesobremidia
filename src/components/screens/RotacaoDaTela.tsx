import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SeletorDeRotacao } from './SeletorDeRotacao';
import { ehRotacao, rotacaoPadrao, tituloDaRotacao, type Rotacao } from '@/lib/rotacaoTela';

/**
 * F-194 — manda o aparelho buscar a configuração AGORA (o mesmo comando "Atualizar Player", que chega na hora pelo
 * canal em tempo real): a TV gira em segundos, sem esperar a próxima sincronização.
 */
export async function pedirParaAplicarAgora(telaId: string): Promise<void> {
  await supabase.from('remote_commands').insert({ screen_id: telaId, command: 'reload', status: 'pending' } as never);
}

/** Espera entre o último toque no botão e a gravação (vários toques seguidos = uma gravação e um aviso à TV). */
export const ESPERA_DO_GIRO_MS = 600;

/**
 * F-194 (substitui o F-192 "Totem: sentido da imagem") — rotação da tela em 4 posições num único botão.
 * Grava screens.rotacao_tela e avisa a TV na hora; o Player 5.7.9+ gira em segundos e guarda (vale depois de faltar
 * energia). O Player 5.7.8 entende as posições em pé (90/270) pelo giro_quadro, que o banco acompanha sozinho.
 */
export function RotacaoDaTela({ tela, aoMudar }: {
  tela: { id: string; resolution?: string | null; orientation?: string | null; rotacao_tela?: number | null };
  aoMudar?: () => void;
}) {
  const inicial = ehRotacao(tela.rotacao_tela) ? tela.rotacao_tela : rotacaoPadrao(tela.resolution, tela.orientation);
  const [valor, setValor] = useState<Rotacao>(inicial);
  const gravado = useRef<Rotacao>(inicial);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setValor(inicial); gravado.current = inicial; }, [inicial]);
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current); }, []);

  const gravar = async (r: Rotacao) => {
    if (r === gravado.current) return;
    const { error } = await supabase.from('screens').update({ rotacao_tela: r } as never).eq('id', tela.id);
    if (error) { setValor(gravado.current); toast.error(`Não foi possível salvar: ${error.message}`); return; }
    gravado.current = r;
    try { await pedirParaAplicarAgora(tela.id); } catch { /* a TV aplica na próxima sincronização */ }
    toast.success(`Rotação: ${tituloDaRotacao(r)} (${r}°). A TV gira em instantes.`, { id: 'rotacao-da-tela' });
    aoMudar?.();
  };

  const mudar = (r: Rotacao) => {
    setValor(r); // o ícone gira na hora
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => { void gravar(r); }, ESPERA_DO_GIRO_MS);
  };

  return (
    <Card className="glass" data-testid="rotacao-da-tela">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><RotateCw className="h-4 w-4 text-primary" /> Rotação da tela</CardTitle>
      </CardHeader>
      <CardContent>
        <SeletorDeRotacao valor={valor} onMudar={mudar} />
        <p className="mt-2 text-[11px] text-muted-foreground">Telas 9x16 nascem em 270°. As 4 posições valem no Player 5.7.9 ou mais novo.</p>
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * F-150 — No gráfico de exibições da tela: escolher a tela inteira, a tela principal ou uma zona.
 * Só aparece quando a tela está dividida em zonas. `valor`: null = tela inteira; 0 = tela principal; N = zona N.
 */
export interface OpcaoDeZona { numero: number; nome: string }

export function SeletorDeZonaDoGrafico({ telaId, valor, onChange }: { telaId: string; valor: number | null; onChange: (v: number | null) => void }) {
  const [zonas, setZonas] = useState<OpcaoDeZona[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: l } = await supabase.from('screen_layouts' as never).select('id').eq('screen_id', telaId).maybeSingle();
      const id = (l as { id: string } | null)?.id;
      if (!id) { if (vivo) setZonas([]); return; }
      const { data } = await supabase.from('layout_zones' as never).select('numero, nome, principal').eq('layout_id', id).order('numero');
      if (!vivo) return;
      setZonas(((data as unknown as Array<{ numero: number; nome: string | null; principal: boolean }>) ?? [])
        .filter((z) => !z.principal).map((z) => ({ numero: z.numero, nome: z.nome?.trim() || `Zona ${z.numero}` })));
    })();
    return () => { vivo = false; };
  }, [telaId]);

  // a zona escolhida deixou de existir: volta para a tela inteira
  useEffect(() => { if (valor != null && valor > 0 && zonas.length > 0 && !zonas.some((z) => z.numero === valor)) onChange(null); }, [zonas, valor, onChange]);

  if (zonas.length === 0) return null;
  return (
    <select aria-label="O que mostrar no gráfico" data-testid="grafico-zona" className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs"
      value={valor === null ? 'tudo' : String(valor)} onChange={(e) => onChange(e.target.value === 'tudo' ? null : Number(e.target.value))}>
      <option value="tudo">Tela inteira (tudo)</option>
      <option value="0">Tela principal</option>
      {zonas.map((z) => <option key={z.numero} value={z.numero}>{z.nome === `Zona ${z.numero}` ? z.nome : `Zona ${z.numero} — ${z.nome}`}</option>)}
    </select>
  );
}

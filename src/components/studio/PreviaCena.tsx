import { useEffect, useMemo, useRef, useState } from 'react';
import { htmlDaCena, type DadosCena } from '../../../supabase/functions/_shared/studio/layout.ts';
import { RESOLUCAO } from '../../../supabase/functions/_shared/studio/contrato.ts';
import { cn } from '@/lib/utils';

/**
 * Prévia de uma cena: o MESMO HTML que a montagem fotografa no Actions, em tamanho real (1920×1080, 1080×1920, 1080×1080)
 * dentro de um iframe isolado (sem scripts do site) e reduzido por escala. O que se vê aqui é o que vai para a tela.
 */
export function PreviaCena({ dados, className }: { dados: DadosCena; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.2);
  const { w, h } = RESOLUCAO[dados.formato];
  const html = useMemo(() => htmlDaCena(dados, 'completa'), [dados]);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / w);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  return (
    <div ref={caixa} className={cn('relative w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10', className)} style={{ aspectRatio: `${w} / ${h}` }}>
      <iframe
        title="Prévia da cena"
        srcDoc={html}
        sandbox="allow-scripts"
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: w, height: h, transform: `scale(${escala})` }}
      />
    </div>
  );
}

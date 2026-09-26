import { useRef } from 'react';
import { Check, Pipette } from 'lucide-react';
import type { WidgetConfig } from '@/types/models';
import { cn } from '@/lib/utils';
import { escolhaDePaleta, gradienteDe, hexValido, paletaPersonalizada, PALETA_PADRAO, PALETA_PERSONALIZADA, PALETAS } from '@/lib/widgetPaletas';

/**
 * Cores do Relógio/Clima Futurista, na lateral da prévia: paletas prontas + "Personalizada" (qualquer cor).
 * Muda só as cores; informações, layout e a imagem de fundo (opcional) continuam iguais.
 */
export function PaletaPicker({ config, onChange, className }: {
  config: WidgetConfig;
  onChange: (patch: Partial<WidgetConfig>) => void;
  className?: string;
}) {
  const inputCor = useRef<HTMLInputElement>(null);
  const atual = config.paleta ?? PALETA_PADRAO;
  const corBase = hexValido(config.corBase) ? config.corBase : '#FF6A00';
  const personalizada = paletaPersonalizada(corBase);

  return (
    <div className={cn('grid grid-cols-2 justify-items-center gap-2', className)} role="radiogroup" aria-label="Cores do widget" data-testid="paleta-picker">
      <span className="col-span-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Cores</span>
      {PALETAS.map((p) => {
        const ativo = atual === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={p.nome}
            title={p.nome}
            onClick={() => onChange(escolhaDePaleta(p.id))}
            data-testid={`paleta-${p.id}`}
            className={cn('relative h-9 w-9 rounded-full border-2 shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
              ativo ? 'border-white scale-110' : 'border-white/20')}
            style={{ background: gradienteDe(p) }}
          >
            {ativo && <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />}
          </button>
        );
      })}
      {/* Personalizada: a cor que o usuário quiser (o sistema ajusta os tons para o texto continuar legível) */}
      <button
        type="button"
        role="radio"
        aria-checked={atual === PALETA_PERSONALIZADA}
        aria-label="Escolher outra cor"
        title="Escolher outra cor"
        onClick={() => inputCor.current?.click()}
        data-testid="paleta-personalizada"
        className={cn('relative h-9 w-9 rounded-full border-2 shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
          atual === PALETA_PERSONALIZADA ? 'border-white scale-110' : 'border-white/20')}
        style={{ background: atual === PALETA_PERSONALIZADA ? gradienteDe(personalizada) : 'conic-gradient(#ff3b3b,#ffb800,#3bdc5c,#1fb6ff,#7a5cff,#ff3bd0,#ff3b3b)' }}
      >
        {atual === PALETA_PERSONALIZADA ? <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" /> : <Pipette className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />}
      </button>
      <input
        ref={inputCor}
        type="color"
        value={corBase}
        onChange={(e) => onChange(escolhaDePaleta(PALETA_PERSONALIZADA, e.target.value.toUpperCase()))}
        className="sr-only"
        aria-label="Cor personalizada"
        data-testid="paleta-cor-input"
        tabIndex={-1}
      />
    </div>
  );
}

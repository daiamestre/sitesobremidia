import { RotateCw } from 'lucide-react';
import { ROTACOES, proximaRotacao, type Rotacao } from '@/lib/rotacaoTela';

/**
 * F-194 — Rotação da tela num ÚNICO botão: cada toque gira para a próxima posição (0° → 90° → 180° → 270°).
 * O ícone mostra a TV montada (a barra luminosa é a base/pé da TV) e a imagem como o público vai ver — sempre de pé.
 */
export function IconeDaRotacao({ rotacao, tamanho = 44 }: { rotacao: Rotacao; tamanho?: number }) {
  const tvL = Math.round(tamanho * 0.78);
  const tvA = Math.round(tamanho * 0.48);
  return (
    <div className="relative flex items-center justify-center" style={{ width: tamanho, height: tamanho }} aria-hidden>
      {/* aro de órbita */}
      <div className="absolute inset-0 rounded-full border border-cyan-400/30 shadow-[0_0_12px_rgba(34,211,238,0.35)]" />
      {/* a TV gira para a posição em que foi montada (sentido anti-horário) */}
      <div className="flex flex-col items-center transition-transform duration-300 ease-out" style={{ transform: `rotate(${-rotacao}deg)` }}>
        <div className="relative overflow-hidden rounded-[3px] border border-cyan-300/90 bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 shadow-[0_0_10px_rgba(139,92,246,0.7)]"
          style={{ width: tvL, height: tvA }}>
          {/* a imagem gira de volta: para quem olha, fica sempre de pé (seta para cima = topo da imagem) */}
          <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out" style={{ transform: `rotate(${rotacao}deg)` }}>
            <svg viewBox="0 0 12 12" style={{ width: tvA * 0.7, height: tvA * 0.7 }} className="text-white drop-shadow">
              <path d="M6 1.5 L10 6 H7.4 V10.5 H4.6 V6 H2 Z" fill="currentColor" />
            </svg>
          </div>
        </div>
        {/* base/pé da TV */}
        <div className="h-[3px] rounded-b bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.9)]" style={{ width: tvL * 0.4 }} />
      </div>
    </div>
  );
}

export function SeletorDeRotacao({ valor, onMudar, desabilitado }: {
  valor: Rotacao; onMudar: (r: Rotacao) => void; desabilitado?: boolean; compacto?: boolean;
}) {
  const atual = ROTACOES.find((r) => r.valor === valor) ?? ROTACOES[0];
  return (
    <div className="flex items-center gap-3" data-testid="seletor-rotacao">
      <button type="button" disabled={desabilitado} data-testid="rotacao-botao" data-rotacao={valor}
        aria-label={`Rotação da tela: ${atual.titulo} (${valor}°). Toque para girar.`} title="Toque para girar a tela"
        onClick={() => onMudar(proximaRotacao(valor))}
        className="group relative flex flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-400/40 bg-slate-950/80 p-2 shadow-[inset_0_0_12px_rgba(34,211,238,0.15)] transition hover:border-cyan-300 hover:shadow-[0_0_14px_rgba(34,211,238,0.45)] active:scale-95 disabled:opacity-60">
        <IconeDaRotacao rotacao={valor} />
        <span className="absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(34,211,238,0.9)] transition-transform group-active:rotate-90">
          <RotateCw className="h-3 w-3" />
        </span>
      </button>
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-semibold"><span className="font-mono text-cyan-400">{valor}°</span> · {atual.titulo}</p>
        <p className="text-[11px] text-muted-foreground">{atual.base}. Toque no ícone para girar (4 posições).</p>
      </div>
    </div>
  );
}

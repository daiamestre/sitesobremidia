/**
 * F-148 — Mapa esquemático do Brasil por estado: cada estado é um bloco na posição aproximada dele no país.
 * Sem imagem nem serviço externo; destaca os estados onde há presença e mostra a quantidade.
 */
export interface PresencaPorUf { uf: string; total: number; detalhe?: string }

/** Posição de cada estado na grade (coluna, linha), de oeste para leste e de norte para sul. */
export const GRADE_DO_BRASIL: Record<string, [number, number]> = {
  RR: [1, 0], AP: [3, 0],
  AM: [1, 1], PA: [3, 1], MA: [5, 1], CE: [6, 1], RN: [7, 1],
  AC: [0, 2], RO: [1, 2], TO: [4, 2], PI: [5, 2], PE: [6, 2], PB: [7, 2],
  MT: [2, 3], DF: [4, 3], BA: [5, 3], SE: [6, 3], AL: [7, 3],
  MS: [2, 4], GO: [3, 4], MG: [5, 4], ES: [6, 4],
  SP: [4, 5], RJ: [5, 5],
  PR: [4, 6],
  SC: [4, 7],
  RS: [4, 8],
};
export const NOME_DO_ESTADO: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco',
  PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

export function MapaDoBrasil({ presenca, rotulo = 'clientes', className = '' }: { presenca: PresencaPorUf[]; rotulo?: string; className?: string }) {
  const porUf = new Map(presenca.filter((p) => GRADE_DO_BRASIL[p.uf]).map((p) => [p.uf, p]));
  const maior = Math.max(1, ...presenca.map((p) => p.total));
  return (
    <div className={`mx-auto grid w-full max-w-md gap-1 ${className}`} role="img" data-testid="mapa-do-brasil"
      aria-label={`Mapa do Brasil por estado: ${presenca.map((p) => `${NOME_DO_ESTADO[p.uf] ?? p.uf} ${p.total}`).join(', ') || 'sem presença'}`}
      style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gridTemplateRows: 'repeat(9, minmax(0, 1fr))', aspectRatio: '8 / 9', maxWidth: 420 }}>
      {Object.entries(GRADE_DO_BRASIL).map(([uf, [col, lin]]) => {
        const p = porUf.get(uf);
        const forca = p ? 0.35 + 0.65 * (p.total / maior) : 0;
        return (
          <div key={uf} data-uf={uf} data-ativo={p ? 'sim' : 'nao'}
            title={p ? `${NOME_DO_ESTADO[uf]}: ${p.total} ${rotulo}${p.detalhe ? ` · ${p.detalhe}` : ''}` : NOME_DO_ESTADO[uf]}
            className={`flex flex-col items-center justify-center rounded-md border text-center leading-none ${p ? 'border-primary text-white' : 'border-white/10 bg-white/5 text-slate-500'}`}
            style={{ gridColumn: col + 1, gridRow: lin + 1, ...(p ? { backgroundColor: `hsl(var(--primary) / ${forca.toFixed(2)})`, boxShadow: '0 0 12px hsl(var(--primary) / .45)' } : {}) }}>
            <span className="text-[10px] font-bold sm:text-xs">{uf}</span>
            {p && <span className="text-[10px] font-black sm:text-sm">{p.total}</span>}
          </div>
        );
      })}
    </div>
  );
}

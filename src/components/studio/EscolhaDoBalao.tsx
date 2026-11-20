/**
 * F-353 (pedido do dono): ESCOLHA DO BALÃO DE PREÇO no passo a passo e na edição — cada estilo do catálogo oficial
 * (ESTILOS_DE_BALAO, regra do dono: texto e valor centralizados) desenhado com um preço de exemplo, para o cliente ver como fica.
 */
import { useMemo } from 'react';
import { PreviaDocumento } from './PreviaDocumento';
import { ESTILOS_DE_BALAO, balaoEscolhido, seloDoPreco, type EstiloDeBalao } from '@/lib/studio/palco';
import type { Documento } from '@/lib/studio/documento';
import { cn } from '@/lib/utils';

const EXEMPLO = { preco: 23.99, precoDe: null, unidade: 'UN' };
/** a ordem: primeiro as estrelas do vídeo de referência, depois os outros balões */
const ORDEM = Object.keys(ESTILOS_DE_BALAO).sort((a, b) => Number(b.startsWith('estrela')) - Number(a.startsWith('estrela'))) as EstiloDeBalao[];

function docDoBalao(estilo: EstiloDeBalao | null): Documento {
  const d = 760;
  const c = estilo ? balaoEscolhido(EXEMPLO, 960, 540, d, estilo) : seloDoPreco(EXEMPLO, 960 - d / 2, 540 - d / 2, d);
  return { versao: 2, formato: '16:9', fundo: '#2a1458', camadas: c ? [c] : [] };
}

export function EscolhaDoBalao({ atual, aoEscolher }: { atual: EstiloDeBalao | null; aoEscolher: (b: EstiloDeBalao | null) => void }) {
  const docs = useMemo(() => [null, ...ORDEM].map((e) => ({ id: e, doc: docDoBalao(e) })), []);
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Balão de preço" data-testid="escolha-do-balao">
      {docs.map(({ id, doc }) => (
        <button key={id ?? 'redondo'} type="button" role="radio" aria-checked={atual === id} onClick={() => aoEscolher(id)} title={id ?? 'Redondo (padrão)'}
          className={cn('overflow-hidden rounded-lg border-2', atual === id ? 'border-[#FFD400]' : 'border-white/10 hover:border-[#8A2EFF]')} data-testid={`balao-${id ?? 'redondo'}`}>
          <PreviaDocumento doc={doc} className="w-full" />
        </button>
      ))}
    </div>
  );
}

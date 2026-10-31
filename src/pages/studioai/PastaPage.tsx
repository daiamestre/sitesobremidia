import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FolderOpen, Monitor, PenLine, Smartphone } from 'lucide-react';
import { MiniaturaDoModelo } from '@/components/studio/Vitrines';
import type { FormatoDoc } from '@/lib/studio/documento';
import { nomeDoSegmento } from '@/lib/studio/catalogo';
import type { ModeloDeArte } from '@/lib/studio/modelos';
import { useCatalogo } from '@/lib/studioai/modelos';
import { cn } from '@/lib/utils';

function Cartao({ m, formato }: { m: ModeloDeArte; formato: FormatoDoc }) {
  const destino = `/studio/editar/${m.id}?formato=${encodeURIComponent(formato)}`;
  return (
    <article className="flex flex-col rounded-xl border border-white/10 bg-[#140632] p-3 transition hover:border-[#8A2EFF]/70 hover:shadow-[0_0_28px_rgba(93,27,255,0.35)]" data-testid="studio-modelo-da-pasta">
      <Link to={destino} className={cn('mx-auto block w-full overflow-hidden rounded-lg bg-black', formato === '9:16' && 'max-w-[260px]')} aria-label={`Personalizar ${m.nome}`}>
        <MiniaturaDoModelo m={m} formato={formato} />
      </Link>
      <h3 className="mt-2 truncate text-sm font-semibold text-white" title={m.nome}>{m.nome}</h3>
      <Link to={destino} className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] py-2 text-sm font-semibold text-white transition hover:bg-[#8A2EFF]"><PenLine className="h-4 w-4" />Personalizar</Link>
    </article>
  );
}

/** Pasta de um card do catálogo: o modelo de capa e as variações do mesmo segmento, em 16:9 ou 9:16. */
export default function PastaPage() {
  const { pastaId } = useParams();
  const catalogo = useCatalogo();
  const pasta = catalogo.pastas.find((p) => p.capa.id === pastaId);
  const [formato, setFormato] = useState<FormatoDoc>(() => (pasta?.capa.formato as FormatoDoc) ?? '16:9');

  if (!pasta) return catalogo.carregando
    ? <p className="p-10 text-sm text-slate-400">Abrindo a pasta…</p>
    : <div className="p-10 text-sm text-slate-300">Pasta não encontrada. <Link to="/studio" className="text-[#FFD400] hover:underline">Voltar aos modelos</Link></div>;

  return (
    <div className="space-y-5" data-testid="studio-pasta">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/studio" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Modelos</Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-black text-white"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />{pasta.capa.nome.split(' – ')[0]}</h1>
          <p className="text-xs text-slate-400">{nomeDoSegmento(pasta.capa.segmento)} · {pasta.modelos.length} modelos com a mesma composição · todos em 16:9 e 9:16</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Formato">
          {(['16:9', '9:16'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={formato === f} onClick={() => setFormato(f)}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold', formato === f ? 'bg-[#5D1BFF] text-white' : 'text-slate-300 hover:bg-white/5')}>
              {f === '16:9' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}{f === '16:9' ? 'Horizontal 16:9' : 'Vertical 9:16'}
            </button>
          ))}
        </div>
      </div>
      <div className={cn('grid gap-4', formato === '16:9' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6')}>
        {pasta.modelos.map((m) => <Cartao key={m.id} m={m} formato={formato} />)}
      </div>
      <p className="text-xs text-slate-500">Tudo dentro do modelo é editável: arraste, gire e redimensione textos, formas, selos e fotos, troque cores, fontes e a foto pela do seu produto.</p>
    </div>
  );
}

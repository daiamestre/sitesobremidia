/**
 * F-303 (pedido do dono, 12/11/2026) — BIBLIOTECA DE LOOP: a pasta com os vídeos leves que passam em loop como capa das
 * pastas e da escolha de modelo (um por modelo de encarte e de palco, com os produtos de exemplo do segmento).
 * MP4 H.264 (toca em qualquer TV Box, tablet e celular), 360 px, 20 qps, sem som, ~200–350 KB cada. Cada vídeo só toca
 * enquanto aparece na tela.
 */
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { meuSaldo } from '@/lib/studioai/api';
import { Download, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { todasAsCapas } from '@/lib/studio/capasEmVideo';
import { SEGMENTOS_COM_OFERTAS, nomeDoSegmentoDeOfertas } from '@/lib/studio/pastasDoSegmento';
import { VideoDaCapa } from '@/components/studio/VideoDaCapa';

type Tipo = 'todos' | 'encarte' | 'palco';

export default function BibliotecaDeLoopPage() {
  // F-303 (dono): só owner/ADM ("uso interno"); os outros usuários gravam os próprios vídeos (Meus Projetos)
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  const [tipo, setTipo] = useState<Tipo>('todos');
  const [segmento, setSegmento] = useState<string>('todos');
  const capas = useMemo(() => todasAsCapas(), []);
  const totalKb = capas.reduce((s, c) => s + (c.kb ?? 0), 0);
  const filtradas = capas.filter((c) => (tipo === 'todos' || c.tipo === tipo) && (segmento === 'todos' || c.segmento === segmento));
  const grupos = SEGMENTOS_COM_OFERTAS.map((s) => ({ s, itens: filtradas.filter((c) => c.segmento === s) })).filter((g) => g.itens.length);
  if (saldo.isLoading) return <p className="p-10 text-sm text-slate-400">Abrindo…</p>;
  if (saldo.data?.paga !== false) return <Navigate to="/studio" replace />;
  const chip = (ativo: boolean) => cn('h-9 shrink-0 rounded-full border px-3 text-xs font-bold transition', ativo ? 'border-[#FFD400] bg-[#FFD400]/15 text-[#FFD400]' : 'border-white/10 text-slate-300 hover:bg-white/5');

  return (
    <div className="space-y-4" data-testid="biblioteca-de-loop">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-black text-white"><Repeat className="h-5 w-5 text-[#FFD400]" />Biblioteca de Loop</h1>
        <p className="text-xs text-slate-400 sm:text-sm">
          Vídeos leves que passam em loop como capa das pastas · {capas.length} vídeos · {(totalKb / 1024).toFixed(1)} MB no total · MP4 que toca em qualquer TV, tablet e celular
        </p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Tipo">
        {([['todos', 'Todos'], ['encarte', 'Encartes'], ['palco', 'Palco de Ofertas']] as const).map(([id, nome]) => (
          <button key={id} type="button" role="radio" aria-checked={tipo === id} onClick={() => setTipo(id)} className={chip(tipo === id)}>{nome}</button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Segmento">
        <button type="button" role="radio" aria-checked={segmento === 'todos'} onClick={() => setSegmento('todos')} className={chip(segmento === 'todos')}>Todos os segmentos</button>
        {SEGMENTOS_COM_OFERTAS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={segmento === s} onClick={() => setSegmento(s)} className={chip(segmento === s)}>{nomeDoSegmentoDeOfertas(s)}</button>
        ))}
      </div>
      {!grupos.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">Nenhum vídeo com esse filtro.</p>}
      {grupos.map(({ s, itens }) => (
        <section key={s} className="space-y-2" aria-label={nomeDoSegmentoDeOfertas(s)}>
          <h2 className="text-sm font-bold text-white">{nomeDoSegmentoDeOfertas(s)} <span className="font-normal text-slate-400">· {itens.length} vídeos</span></h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {itens.map((c) => (
              <article key={c.id} className="flex min-w-0 flex-col rounded-xl border border-white/10 bg-[#140632] p-2" data-testid="loop-item">
                <div className="overflow-hidden rounded-lg bg-black" style={{ aspectRatio: `${c.largura} / ${c.altura}` }}><VideoDaCapa capa={c} /></div>
                <p className="mt-2 line-clamp-2 text-xs font-bold leading-tight text-white" title={c.nome}>{(c.nome ?? c.id).replace(/^Ofertas – /, '')}</p>
                <p className="text-[10px] text-slate-400">{c.tipo === 'palco' ? 'Palco de Ofertas' : 'Encarte'} · {c.kb ?? '?'} KB · {c.segundos.toFixed(1)} s · {c.largura}×{c.altura}</p>
                <a href={c.video} download={`${c.id}.mp4`} className="mt-2 flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/15 text-xs font-semibold text-white hover:bg-white/5"><Download className="h-3.5 w-3.5" />Baixar</a>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

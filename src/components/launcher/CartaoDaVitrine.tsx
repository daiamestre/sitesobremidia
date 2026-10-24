import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, ListVideo, Monitor, Plus, Smartphone, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { VITRINES, type ItemDeFundo, type Vitrine } from '@/services/launcher.service';
import { ehVideo, PreviaRapidaDeMidia, tempoCurto } from './PreviaRapidaDeMidia';

/** Quanto tempo o item fica na tela: vídeo = a duração dele (se conhecida); foto = o tempo escolhido. */
export const segundosDoItem = (it: ItemDeFundo) =>
  ehVideo(it.media?.file_type) && it.media?.duration_ms ? it.media.duration_ms / 1000 : it.duracao_s;

/**
 * F-213 — cartão futurista de uma tela dos Destaques Sobre Mídia (TV 1, TV 2, Totem 1, Totem 2). Mostra a tela no
 * formato dela tocando a mídia escolhida (prévia rápida) e a LISTA DE REPRODUÇÃO no mesmo jeito da playlist de cada tela
 * do painel: posição, arrastar (setas no celular), miniatura, nome, tipo, duração, ligada/desligada, mudar de tela e
 * remover. Quantas mídias quiser: a lista não tem limite.
 */
export function CartaoDaVitrine({ vitrine, itens, onAdicionar, onReordenar, onAtualizar, onRemover }: {
  vitrine: (typeof VITRINES)[number];
  itens: ItemDeFundo[];
  onAdicionar: () => void;
  onReordenar: (novaOrdem: ItemDeFundo[]) => void;
  onAtualizar: (id: string, mudanca: Partial<Pick<ItemDeFundo, 'duracao_s' | 'ativo' | 'vitrine'>>) => void;
  onRemover: (id: string) => void;
}) {
  const emPe = vitrine.formato === '9:16';
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const atual = itens.find((i) => i.id === selecionado) ?? itens.find((i) => i.ativo) ?? itens[0] ?? null;
  useEffect(() => { setTocando(false); }, [atual?.id]);
  const ativos = itens.filter((i) => i.ativo);
  const total = ativos.reduce((s, i) => s + segundosDoItem(i), 0);
  const mover = (de: number, para: number) => {
    if (para < 0 || para >= itens.length || de === para) return;
    const nova = [...itens];
    const [it] = nova.splice(de, 1);
    nova.splice(para, 0, it);
    onReordenar(nova);
  };
  const Icone = emPe ? Smartphone : Monitor;

  return (
    <div data-testid={`vitrine-${vitrine.id}`}
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-slate-950 via-[#0B1240] to-slate-950 p-3 text-slate-100 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-500/10 blur-2xl" />
      <div className="relative flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.3)]">
          <Icone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
            {vitrine.nome}
            <Badge variant="outline" className="h-4 border-cyan-400/40 px-1 text-[10px] text-cyan-200">{vitrine.formato}</Badge>
          </p>
          <p className="text-[11px] text-slate-400">{ativos.length} {ativos.length === 1 ? 'mídia' : 'mídias'} · {tempoCurto(total)} por volta</p>
        </div>
        <Button size="sm" onClick={onAdicionar} className="h-8 gap-1 bg-cyan-500/90 px-2.5 text-xs text-slate-950 hover:bg-cyan-400" data-testid={`adicionar-${vitrine.id}`}>
          <Plus className="h-3.5 w-3.5" />Adicionar
        </Button>
      </div>

      {/* a tela no formato dela, com a mídia escolhida na lista */}
      <div className="relative mx-auto w-full overflow-hidden rounded-xl border border-cyan-400/40 bg-black shadow-[0_0_16px_rgba(34,211,238,0.18)]"
        style={{ maxWidth: emPe ? '10rem' : '24rem' }} data-testid={`tela-${vitrine.id}`}>
        {atual
          ? <PreviaRapidaDeMidia midia={atual.media} tocando={tocando} onTocar={setTocando} className={emPe ? 'aspect-[9/16] w-full' : 'aspect-video w-full'} />
          : <div className={`flex items-center justify-center text-xs font-black tracking-widest text-indigo-300/60 ${emPe ? 'aspect-[9/16]' : 'aspect-video'}`}>SOBRE MÍDIA</div>}
        {atual && <span className="pointer-events-none absolute left-1.5 top-1.5 max-w-[85%] truncate rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-cyan-100">{atual.media?.name ?? 'Mídia removida'}</span>}
      </div>

      <div className="relative">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-300/80"><ListVideo className="h-3.5 w-3.5" />Lista de reprodução</p>
        {itens.length === 0 && (
          <p className="rounded-lg border border-dashed border-cyan-400/25 p-4 text-center text-xs text-slate-400">Sem mídia: mostra a logo da Sobre Mídia.</p>
        )}
        <div className="max-h-80 space-y-1.5 overflow-y-auto pr-0.5" data-testid={`lista-${vitrine.id}`}>
          {itens.map((it, i) => (
            <div key={it.id} draggable
              onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i)); setArrastando(i); }}
              onDragEnd={() => setArrastando(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); mover(Number(e.dataTransfer.getData('text/plain')), i); setArrastando(null); }}
              onClick={() => setSelecionado(it.id)}
              className={`group flex cursor-pointer items-center gap-2 rounded-lg border p-1.5 transition ${atual?.id === it.id ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-white/5 bg-white/[0.03] hover:border-cyan-400/30'} ${it.ativo ? '' : 'opacity-50'} ${arrastando === i ? 'opacity-40' : ''}`}>
              <span className="w-4 shrink-0 text-center font-mono text-[10px] text-slate-500">{i + 1}</span>
              <span className="hidden cursor-grab text-slate-500 active:cursor-grabbing sm:block"><GripVertical className="h-4 w-4" /></span>
              <span className="flex flex-col sm:hidden">
                <button type="button" aria-label="Mover para cima" disabled={i === 0} onClick={(e) => { e.stopPropagation(); mover(i, i - 1); }} className="p-0.5 text-slate-400 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                <button type="button" aria-label="Mover para baixo" disabled={i === itens.length - 1} onClick={(e) => { e.stopPropagation(); mover(i, i + 1); }} className="p-0.5 text-slate-400 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
              </span>
              <span className={`relative shrink-0 overflow-hidden rounded bg-black ${emPe ? 'h-12 w-7' : 'h-9 w-16'}`}>
                {(it.media?.thumbnail_url || (!ehVideo(it.media?.file_type) && it.media?.file_url))
                  ? <img src={(it.media?.thumbnail_url || it.media?.file_url) ?? ''} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium" title={it.media?.name ?? ''}>{it.media?.name ?? 'Mídia removida'}</span>
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span className="rounded bg-white/10 px-1 font-bold uppercase">{ehVideo(it.media?.file_type) ? 'Vídeo' : 'Foto'}</span>
                  {ehVideo(it.media?.file_type) && it.media?.duration_ms ? tempoCurto(it.media.duration_ms / 1000) : null}
                </span>
              </span>
              {!ehVideo(it.media?.file_type) && (
                <span className="flex items-center gap-0.5 text-[10px] text-slate-400" onClick={(e) => e.stopPropagation()}>
                  <Input type="number" min={3} max={600} defaultValue={it.duracao_s} aria-label="Segundos na tela" className="h-7 w-12 px-1 text-center font-mono text-[11px]"
                    onBlur={(e) => { const s = Math.max(3, Math.min(600, Number(e.target.value) || 10)); if (s !== it.duracao_s) onAtualizar(it.id, { duracao_s: s }); }} />s
                </span>
              )}
              <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                <Switch checked={it.ativo} onCheckedChange={(on) => onAtualizar(it.id, { ativo: on })} aria-label="Ligada" className="scale-75" />
                <select aria-label="Mudar de tela" value={vitrine.id} className="h-7 w-[4.2rem] rounded border border-white/10 bg-slate-900 px-0.5 text-[10px]"
                  onChange={(e) => onAtualizar(it.id, { vitrine: e.target.value as Vitrine })}>
                  {VITRINES.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300" aria-label="Remover" onClick={() => onRemover(it.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

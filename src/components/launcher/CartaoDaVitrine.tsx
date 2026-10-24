import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, ListVideo, Monitor, Plus, Smartphone, Trash2, Upload } from 'lucide-react';
import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { midiasPorId, VITRINES, type ItemDeFundo, type MidiaEscolhivel, type Vitrine } from '@/services/launcher.service';
import { ehVideo, PreviaRapidaDeMidia, tempoCurto } from './PreviaRapidaDeMidia';

/** Quanto tempo o item fica na tela: vídeo = a duração dele (se conhecida); foto = o tempo escolhido. */
export const segundosDoItem = (it: ItemDeFundo) =>
  ehVideo(it.media?.file_type) && it.media?.duration_ms ? it.media.duration_ms / 1000 : it.duracao_s;

type Mudanca = Partial<Pick<ItemDeFundo, 'duracao_s' | 'ativo' | 'vitrine'>>;

function Miniatura({ it, emPe }: { it: ItemDeFundo; emPe: boolean }) {
  const src = it.media?.thumbnail_url || (!ehVideo(it.media?.file_type) ? it.media?.file_url : null);
  return (
    <span className={`relative shrink-0 overflow-hidden rounded bg-black ${emPe ? 'h-10 w-6' : 'h-8 w-14'}`}>
      {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
    </span>
  );
}

/**
 * F-213/F-216 — cartão futurista de uma tela dos Destaques Sobre Mídia (TV 1, TV 2, Totem 1, Totem 2): a tela no formato
 * dela tocando a mídia escolhida e a LISTA DE REPRODUÇÃO fina, com rolagem própria (número, miniatura, nome, tipo e
 * tempo, lixeira). "Lista de reprodução" abre o cartão de gerenciamento: adicionar, Upload, ordem (arrastar ou setas),
 * tempo das fotos, ligar/desligar, mudar de tela, lixeira e limpar a lista. Quantas mídias quiser.
 */
export function CartaoDaVitrine({ vitrine, itens, onAdicionar, onReordenar, onAtualizar, onRemover, onAdicionarMidias }: {
  vitrine: (typeof VITRINES)[number];
  itens: ItemDeFundo[];
  onAdicionar: () => void;
  onReordenar: (novaOrdem: ItemDeFundo[]) => void;
  onAtualizar: (id: string, mudanca: Mudanca) => void;
  onRemover: (id: string) => void;
  /** Upload direto do cartão de gerenciamento: as mídias enviadas entram no fim desta lista. */
  onAdicionarMidias?: (midias: MidiaEscolhivel[]) => Promise<void>;
}) {
  const emPe = vitrine.formato === '9:16';
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const [gerenciando, setGerenciando] = useState(false);
  const [enviando, setEnviando] = useState(false);
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
  const tipoETempo = (it: ItemDeFundo) => `${ehVideo(it.media?.file_type) ? 'Vídeo' : 'Foto'} · ${tempoCurto(segundosDoItem(it))}`;

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
        {/* o título abre o cartão de gerenciamento da lista */}
        <button type="button" onClick={() => setGerenciando(true)} data-testid={`abrir-lista-${vitrine.id}`}
          className="mb-1.5 flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-300/90 hover:bg-cyan-500/10">
          <ListVideo className="h-3.5 w-3.5" />Lista de reprodução ({itens.length})
          <span className="ml-auto flex items-center gap-0.5 normal-case tracking-normal text-cyan-200/80">Gerenciar<ChevronRight className="h-3.5 w-3.5" /></span>
        </button>
        {itens.length === 0 && (
          <p className="rounded-lg border border-dashed border-cyan-400/25 p-4 text-center text-xs text-slate-400">Sem mídia: mostra a logo da Sobre Mídia.</p>
        )}
        {/* lista fina com rolagem própria */}
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1" data-testid={`lista-${vitrine.id}`}>
          {itens.map((it, i) => (
            <div key={it.id} onClick={() => setSelecionado(it.id)} data-testid="item-da-lista"
              className={`flex h-11 cursor-pointer items-center gap-2 rounded-md border px-1.5 transition ${atual?.id === it.id ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-white/5 bg-white/[0.03] hover:border-cyan-400/30'} ${it.ativo ? '' : 'opacity-45'}`}>
              <span className="w-4 shrink-0 text-center font-mono text-[10px] text-slate-500">{i + 1}</span>
              <Miniatura it={it} emPe={false} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-xs font-medium" title={it.media?.name ?? ''}>{it.media?.name ?? 'Mídia removida'}</span>
                <span className="block truncate text-[10px] text-slate-400">{tipoETempo(it)}{it.ativo ? '' : ' · desligada'}</span>
              </span>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-red-400 hover:text-red-300" aria-label="Remover"
                onClick={(e) => { e.stopPropagation(); onRemover(it.id); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* cartão de gerenciamento da lista de reprodução */}
      <Dialog open={gerenciando && !enviando} onOpenChange={setGerenciando}>
        <DialogContent className="max-w-2xl" data-testid={`gerenciar-${vitrine.id}`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ListVideo className="h-5 w-5 text-primary" />Lista de reprodução — {vitrine.nome} ({vitrine.formato})</DialogTitle>
            <DialogDescription>{ativos.length} de {itens.length} {itens.length === 1 ? 'mídia ligada' : 'mídias ligadas'} · {tempoCurto(total)} por volta. Arraste (ou use as setas) para mudar a ordem.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => { setGerenciando(false); onAdicionar(); }}><Plus className="h-4 w-4" />Adicionar mídias</Button>
            {onAdicionarMidias && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEnviando(true)} data-testid={`upload-${vitrine.id}`}><Upload className="h-4 w-4" />Upload</Button>
            )}
            {itens.length > 0 && (
              <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-red-500 hover:text-red-400"
                onClick={() => { if (window.confirm(`Tirar as ${itens.length} mídias da lista da ${vitrine.nome}?`)) itens.forEach((it) => onRemover(it.id)); }}>
                <Trash2 className="h-4 w-4" />Limpar lista
              </Button>
            )}
          </div>
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
            {itens.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma mídia nesta tela ainda.</p>}
            {itens.map((it, i) => (
              <div key={it.id} draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i)); setArrastando(i); }}
                onDragEnd={() => setArrastando(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); mover(Number(e.dataTransfer.getData('text/plain')), i); setArrastando(null); }}
                className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border bg-muted/30 p-2 ${it.ativo ? '' : 'opacity-50'} ${arrastando === i ? 'opacity-40' : ''}`}>
                <span className="flex items-center gap-1">
                  <span className="w-5 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <span className="hidden cursor-grab text-muted-foreground active:cursor-grabbing sm:block"><GripVertical className="h-4 w-4" /></span>
                  <span className="flex flex-col">
                    <button type="button" aria-label="Mover para cima" disabled={i === 0} onClick={() => mover(i, i - 1)} className="p-0.5 text-muted-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Mover para baixo" disabled={i === itens.length - 1} onClick={() => mover(i, i + 1)} className="p-0.5 text-muted-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </span>
                </span>
                <Miniatura it={it} emPe={emPe} />
                <span className="min-w-[8rem] flex-1 leading-tight">
                  <span className="block truncate text-sm font-medium" title={it.media?.name ?? ''}>{it.media?.name ?? 'Mídia removida'}</span>
                  <span className="text-xs text-muted-foreground">{tipoETempo(it)}</span>
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {!ehVideo(it.media?.file_type) && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Input type="number" min={3} max={600} defaultValue={it.duracao_s} aria-label="Segundos na tela" className="h-8 w-14 px-1 text-center font-mono text-xs"
                        onBlur={(e) => { const s = Math.max(3, Math.min(600, Number(e.target.value) || 10)); if (s !== it.duracao_s) onAtualizar(it.id, { duracao_s: s }); }} />s
                    </span>
                  )}
                  <Switch checked={it.ativo} onCheckedChange={(on) => onAtualizar(it.id, { ativo: on })} aria-label="Ligada" />
                  <select aria-label="Mudar de tela" value={vitrine.id} className="h-8 rounded-md border bg-background px-1.5 text-xs"
                    onChange={(e) => onAtualizar(it.id, { vitrine: e.target.value as Vitrine })}>
                    {VITRINES.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-400" aria-label="Remover" onClick={() => onRemover(it.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setGerenciando(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {onAdicionarMidias && (
        <MediaUploadDialog
          open={enviando}
          onOpenChange={(v) => { if (!v) setEnviando(false); }}
          onUploadComplete={() => undefined}
          semPlaylist
          titulo={`Upload para ${vitrine.nome} (${vitrine.formato})`}
          onUploadedIds={async (ids) => {
            const novas = await midiasPorId(ids);
            if (!novas.length) { toast.error('Nenhuma mídia enviada.'); return; }
            await onAdicionarMidias(novas);
            setEnviando(false);
          }}
        />
      )}
    </div>
  );
}

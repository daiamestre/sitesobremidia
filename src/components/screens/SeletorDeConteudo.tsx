import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Film, FolderOpen, Images, ListVideo, Loader2, Search, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { duracaoPadraoDoWidget, rotuloDoTipo } from '@/lib/adicionarNaPlaylist';

/**
 * F-152 — "Adicionar mídia": as duas opções que valem em toda a criação de telas e de zonas —
 * "Mídias da galeria" (abre todas as mídias, com busca pelo nome) e "Playlist" (abre as playlists já criadas).
 */
/**
 * Item da galeria: uma mídia (Minhas Mídias ou Biblioteca) ou um widget (file_type 'widget', id = id do widget).
 * `origem` diz de onde veio, só para mostrar na tela.
 */
export interface MidiaDaGaleria {
  id: string; name: string; file_type: string; thumbnail_url: string | null; file_url: string | null; duration_ms: number | null;
  origem?: 'minha' | 'biblioteca' | 'widget';
  widget_type?: string;
}
export interface PlaylistCriada { id: string; name: string; resolution?: string | null }

/** Duração padrão de um item: o vídeo inteiro; imagem, 10 segundos. */
export const duracaoPadraoDoItem = (m: Pick<MidiaDaGaleria, 'file_type' | 'duration_ms'> & { widget_type?: string }) =>
  (m.file_type === 'widget' ? duracaoPadraoDoWidget(m.widget_type ?? '') : m.file_type === 'video' ? Math.max(1, Math.round((m.duration_ms || 10000) / 1000)) : 10);

/** Linha de playlist_items para o item: widget vai em widget_id, mídia em media_id. */
const colunaDoItem = (m: MidiaDaGaleria) => (m.file_type === 'widget' ? { widget_id: m.id } : { media_id: m.id });

/** Acrescenta a mídia no fim da playlist. */
export async function adicionarMidiaNaPlaylist(playlistId: string, m: MidiaDaGaleria): Promise<void> {
  const { data: ultimo } = await supabase.from('playlist_items').select('position').eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1);
  const posicao = ((ultimo as Array<{ position: number }> | null)?.[0]?.position ?? -1) + 1;
  const { error } = await supabase.from('playlist_items').insert({ playlist_id: playlistId, ...colunaDoItem(m), position: posicao, duration: duracaoPadraoDoItem(m) } as never);
  if (error) throw new Error(error.message);
}

/** Cria uma playlist já com as mídias escolhidas (na ordem) e devolve a playlist. */
export async function criarPlaylistComMidias(userId: string, nome: string, resolucao: string, midias: MidiaDaGaleria[]): Promise<PlaylistCriada> {
  const { data, error } = await supabase.from('playlists').insert({ user_id: userId, name: nome.trim().slice(0, 120) || 'Playlist', resolution: resolucao, is_active: true } as never).select('id, name, resolution').single();
  if (error || !data) throw new Error(error?.message || 'Não foi possível criar a playlist.');
  const playlist = data as unknown as PlaylistCriada;
  if (midias.length) {
    const { error: erroItens } = await supabase.from('playlist_items').insert(midias.map((m, i) => ({ playlist_id: playlist.id, ...colunaDoItem(m), position: i, duration: duracaoPadraoDoItem(m) })) as never);
    if (erroItens) throw new Error(erroItens.message);
  }
  return playlist;
}

type Passo = 'opcoes' | 'galeria' | 'playlist';

export function SeletorDeConteudo({ aberto, titulo, onFechar, onMidia, onPlaylist, variasMidias = false, onMidias, playlistAtual, passoInicial = 'opcoes', donos }: {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  /** Uma mídia escolhida (a janela continua aberta para escolher outras). */
  onMidia?: (m: MidiaDaGaleria) => void | Promise<void>;
  onPlaylist: (p: PlaylistCriada) => void | Promise<void>;
  /** Escolher várias mídias e confirmar de uma vez (criação de tela). */
  variasMidias?: boolean;
  onMidias?: (ms: MidiaDaGaleria[]) => void;
  playlistAtual?: string | null;
  passoInicial?: Passo;
  /** Donos do conteúdo (quem está logado e o dono da tela): "Minhas mídias" e widgets vêm só deles. Sem isso, vale o que a segurança já deixa ver. */
  donos?: string[];
}) {
  const [passo, setPasso] = useState<Passo>(passoInicial);
  const [busca, setBusca] = useState('');
  const [minhas, setMinhas] = useState<MidiaDaGaleria[]>([]);
  const [widgets, setWidgets] = useState<MidiaDaGaleria[]>([]);
  const [biblioteca, setBiblioteca] = useState<MidiaDaGaleria[]>([]);
  const [filtro, setFiltro] = useState<'todas' | 'minhas' | 'widgets' | 'biblioteca'>('todas');
  const [playlists, setPlaylists] = useState<PlaylistCriada[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [marcadas, setMarcadas] = useState<MidiaDaGaleria[]>([]);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const donosChave = donos?.join(',') ?? '';

  useEffect(() => { if (aberto) { setPasso(passoInicial); setBusca(''); setMarcadas([]); setFiltro('todas'); } }, [aberto, passoInicial]);

  useEffect(() => {
    if (!aberto || passo === 'opcoes') return;
    const t = setTimeout(async () => {
      setCarregando(true);
      if (passo === 'galeria') {
        const termo = busca.trim();
        const dono = donosChave ? donosChave.split(',') : null;
        // três origens, cada uma com a sua consulta (antes uma consulta só, limitada a 60, era tomada pela Biblioteca)
        let qMinhas = supabase.from('media').select('id, name, file_type, thumbnail_url, file_url, duration_ms' as never).in('file_type', ['image', 'video']).eq('biblioteca' as never, false as never).order('created_at', { ascending: false }).limit(300);
        let qBiblioteca = supabase.from('media').select('id, name, file_type, thumbnail_url, file_url, duration_ms' as never).in('file_type', ['image', 'video']).eq('biblioteca' as never, true as never).order('created_at', { ascending: false }).limit(60);
        let qWidgets = supabase.from('widgets').select('id, name, widget_type, thumbnail_url' as never).eq('is_active', true).order('name').limit(200);
        if (dono) { qMinhas = qMinhas.in('user_id', dono); qWidgets = qWidgets.in('user_id', dono); }
        if (termo) { qMinhas = qMinhas.ilike('name', `%${termo}%`); qBiblioteca = qBiblioteca.ilike('name', `%${termo}%`); qWidgets = qWidgets.ilike('name', `%${termo}%`); }
        const [rm, rb, rw] = await Promise.all([qMinhas, qBiblioteca, qWidgets]);
        setMinhas(((rm.data as unknown as MidiaDaGaleria[] | null) ?? []).map((m) => ({ ...m, origem: 'minha' as const })));
        setBiblioteca(((rb.data as unknown as MidiaDaGaleria[] | null) ?? []).map((m) => ({ ...m, origem: 'biblioteca' as const })));
        setWidgets(((rw.data as unknown as Array<{ id: string; name: string; widget_type: string; thumbnail_url: string | null }> | null) ?? [])
          .map((w) => ({ id: w.id, name: w.name, file_type: 'widget', thumbnail_url: w.thumbnail_url, file_url: null, duration_ms: null, origem: 'widget' as const, widget_type: w.widget_type })));
      } else {
        let q = supabase.from('playlists').select('id, name, resolution').order('name').limit(200);
        if (busca.trim()) q = q.ilike('name', `%${busca.trim()}%`);
        const { data } = await q;
        setPlaylists((data as unknown as PlaylistCriada[] | null) ?? []);
      }
      setCarregando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [aberto, passo, busca, donosChave]);

  const escolherMidia = async (m: MidiaDaGaleria) => {
    if (variasMidias) { setMarcadas((l) => (l.some((x) => x.id === m.id) ? l.filter((x) => x.id !== m.id) : [...l, m])); return; }
    setOcupada(m.id);
    try { await onMidia?.(m); } finally { setOcupada(null); }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-3 overflow-hidden p-4 sm:p-5" style={{ width: 'min(820px, 95vw)', maxWidth: 'none' }} data-testid="seletor-de-conteudo">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {passo !== 'opcoes' && <button type="button" aria-label="Voltar" className="rounded p-1 hover:bg-muted/40" onClick={() => { setPasso('opcoes'); setBusca(''); }}><ArrowLeft className="h-4 w-4" /></button>}
            {titulo}
          </DialogTitle>
          <DialogDescription>
            {passo === 'opcoes' ? 'Escolha de onde vem o conteúdo.' : passo === 'galeria' ? (variasMidias ? 'Toque nas mídias e widgets que quer colocar e confirme.' : 'Toque para colocar. Você pode colocar vários.') : 'Toque na playlist que quer usar.'}
          </DialogDescription>
        </DialogHeader>

        {passo === 'opcoes' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setPasso('galeria')} data-testid="opcao-galeria"
              className="flex flex-col items-center gap-2 rounded-2xl border border-primary/50 bg-primary/10 p-6 text-center hover:bg-primary/20">
              <Images className="h-9 w-9 text-primary" />
              <span className="text-base font-bold">Mídias da galeria</span>
              <span className="text-xs text-muted-foreground">Minhas mídias (vídeos e imagens), widgets e a Biblioteca</span>
            </button>
            <button type="button" onClick={() => setPasso('playlist')} data-testid="opcao-playlist"
              className="flex flex-col items-center gap-2 rounded-2xl border border-primary/50 bg-primary/10 p-6 text-center hover:bg-primary/20">
              <ListVideo className="h-9 w-9 text-primary" />
              <span className="text-base font-bold">Playlist</span>
              <span className="text-xs text-muted-foreground">Usar uma playlist que já está criada</span>
            </button>
          </div>
        )}

        {passo !== 'opcoes' && (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={passo === 'galeria' ? 'Pesquisar mídia pelo nome' : 'Pesquisar playlist pelo nome'} className="h-9 pl-8" data-testid="busca-do-seletor" />
            </div>
            <div className="min-h-[180px] flex-1 overflow-y-auto">
              {carregando && <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-muted-foreground" />}
              {!carregando && passo === 'galeria' && (
                <div className="space-y-3" data-testid="galeria-do-seletor">
                  {/* filtro por origem: tudo junto por padrão */}
                  <div className="flex flex-wrap gap-1" data-testid="filtro-da-galeria">
                    {([['todas', 'Tudo', minhas.length + widgets.length + biblioteca.length], ['minhas', 'Minhas mídias', minhas.length], ['widgets', 'Widgets', widgets.length], ['biblioteca', 'Biblioteca', biblioteca.length]] as const).map(([id, rotulo, qtd]) => (
                      <button key={id} type="button" data-testid={`filtro-${id}`} onClick={() => setFiltro(id)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${filtro === id ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 text-muted-foreground hover:bg-muted/40'}`}>
                        {rotulo} ({qtd})
                      </button>
                    ))}
                  </div>
                  {([['minhas', 'Minhas mídias', minhas], ['widgets', 'Widgets', widgets], ['biblioteca', 'Biblioteca', biblioteca]] as const)
                    .filter(([id, , lista]) => (filtro === 'todas' || filtro === id) && lista.length > 0)
                    .map(([id, titulo, lista]) => (
                      <section key={id} data-testid={`secao-${id}`}>
                        <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{titulo}{id === 'biblioteca' && lista.length >= 60 ? ' · mostrando 60 — pesquise pelo nome para achar outras' : ''}</h4>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {lista.map((m) => {
                            const marcada = marcadas.some((x) => x.id === m.id);
                            return (
                              <button key={`${m.origem}-${m.id}`} type="button" title={m.name} disabled={ocupada === m.id} onClick={() => escolherMidia(m)} data-testid="midia-do-seletor" data-origem={m.origem}
                                className={`relative overflow-hidden rounded-lg border bg-muted/20 text-left ${marcada ? 'border-emerald-400 ring-2 ring-emerald-400/60' : 'border-border/60 hover:border-primary'}`}>
                                <div className="flex aspect-video items-center justify-center bg-slate-900">
                                  {m.file_type === 'widget'
                                    ? <div className="flex flex-col items-center gap-0.5 text-primary"><Sparkles className="h-6 w-6" /><span className="text-[10px] font-semibold">{rotuloDoTipo(m.widget_type ?? '')}</span></div>
                                    : m.thumbnail_url || (m.file_type === 'image' && m.file_url)
                                      ? <img src={m.thumbnail_url || m.file_url || ''} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
                                      : <Film className="h-6 w-6 text-muted-foreground" />}
                                </div>
                                <div className="flex items-center gap-1 px-1.5 py-1 text-[11px]">
                                  {m.origem === 'biblioteca' && <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />}
                                  <span className="truncate">{m.name}</span>
                                </div>
                                {marcada && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" /></span>}
                                {ocupada === m.id && <span className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="h-5 w-5 animate-spin text-white" /></span>}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  {minhas.length + widgets.length + biblioteca.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nada na galeria{busca ? ' com esse nome' : ''}.</p>}
                  {minhas.length + widgets.length + biblioteca.length > 0 && (filtro === 'minhas' ? minhas : filtro === 'widgets' ? widgets : filtro === 'biblioteca' ? biblioteca : [1]).length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">Nada nessa origem{busca ? ' com esse nome' : ''}.</p>
                  )}
                </div>
              )}
              {!carregando && passo === 'playlist' && (
                <ul className="space-y-1" data-testid="playlists-do-seletor">
                  {playlists.map((p) => (
                    <li key={p.id}>
                      <button type="button" disabled={ocupada === p.id} data-testid="playlist-do-seletor"
                        onClick={async () => { setOcupada(p.id); try { await onPlaylist(p); } finally { setOcupada(null); } }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${playlistAtual === p.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-border/60 hover:border-primary hover:bg-muted/30'}`}>
                        <span className="flex min-w-0 items-center gap-2"><ListVideo className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{p.name}</span></span>
                        {playlistAtual === p.id ? <span className="shrink-0 text-xs text-emerald-400">em uso</span> : <span className="shrink-0 text-xs text-muted-foreground">{p.resolution === '9x16' ? 'em pé' : p.resolution === '16x9' ? 'deitada' : ''}</span>}
                      </button>
                    </li>
                  ))}
                  {playlists.length === 0 && <li className="py-8 text-center text-sm text-muted-foreground">Nenhuma playlist criada{busca ? ' com esse nome' : ''}.</li>}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
              {variasMidias && passo === 'galeria' && (
                <Button type="button" disabled={marcadas.length === 0} onClick={() => { onMidias?.(marcadas); onFechar(); }} data-testid="confirmar-midias">
                  Usar {marcadas.length} {marcadas.length === 1 ? 'mídia' : 'mídias'}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onFechar}>{variasMidias ? 'Cancelar' : 'Concluir'}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

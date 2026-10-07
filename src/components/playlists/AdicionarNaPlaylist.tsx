import { useEffect, useMemo, useState } from 'react';
import { Check, FolderOpen, Film, Link2, ListVideo, Loader2, Search, Sparkles, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { supabase } from '@/integrations/supabase/client';
import { listarPastas, type PastaBiblioteca } from '@/lib/biblioteca';
import {
  CATEGORIAS_DINAMICAS, MODELOS_PRONTOS, agruparWidgets, alternarEscolha, escolhaDeLink, escolhaDeMidia, escolhaDeModelo,
  escolhaDePasta, escolhaDePlaylist, escolhaDeWidget, rotuloDoTipo, textoDoConfirmar, type CategoriaDinamica, type Escolha, type Posicao,
} from '@/lib/adicionarNaPlaylist';
import type { ExternalLink, Media, Widget } from '@/types/models';

/**
 * F-155 — Diálogo "Adicionar à playlist": abas "Meu conteúdo | Conteúdo dinâmico | Conteúdo da plataforma",
 * seleção de VÁRIOS itens, painel "Selecionados" (com Limpar) e escolha Início/Final antes de confirmar.
 */
type Aba = 'meu' | 'dinamico' | 'plataforma';
type SubAba = 'videos' | 'imagens' | 'audios' | 'playlists' | 'links';

interface PlaylistResumo { id: string; name: string; resolution?: string | null }

const SUBABAS: Array<{ id: SubAba; rotulo: string }> = [
  { id: 'videos', rotulo: 'Vídeos' }, { id: 'imagens', rotulo: 'Imagens' }, { id: 'audios', rotulo: 'Áudios' },
  { id: 'playlists', rotulo: 'Playlists' }, { id: 'links', rotulo: 'Links' },
];

const icone = (tipo: Escolha['tipo']) => {
  switch (tipo) {
    case 'midia': return <Film className="h-3.5 w-3.5" />;
    case 'link': return <Link2 className="h-3.5 w-3.5" />;
    case 'pasta': return <FolderOpen className="h-3.5 w-3.5" />;
    case 'playlist': return <ListVideo className="h-3.5 w-3.5" />;
    default: return <Sparkles className="h-3.5 w-3.5" />;
  }
};
const legenda = (e: Escolha) => {
  switch (e.tipo) {
    case 'midia': return e.midia.file_type === 'video' ? 'Vídeo' : e.midia.file_type === 'audio' ? 'Áudio' : 'Imagem';
    case 'widget': return rotuloDoTipo(e.widget.widget_type);
    case 'modelo': return 'Conteúdo dinâmico';
    case 'link': return e.link.platform;
    case 'pasta': return 'Pasta da plataforma';
    case 'playlist': return 'Playlist inteira';
  }
};

function CartaoBase({ escolha, marcada, onAlternar, children, aviso }: { escolha: Escolha; marcada: (chave: string) => boolean; onAlternar: (e: Escolha) => void; children: React.ReactNode; aviso?: string }) {
  const m = marcada(escolha.chave);
  return (
    <button type="button" onClick={() => onAlternar(escolha)} aria-pressed={m} data-testid="item-escolhivel" data-chave={escolha.chave}
      className={`relative flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors ${m ? 'border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/60' : 'border-border/60 hover:border-primary hover:bg-muted/30'}`}>
      {children}
      {aviso && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">{aviso}</span>}
      {m && <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" /></span>}
    </button>
  );
}

export function AdicionarNaPlaylist({ aberto, onFechar, midias, widgets, links, idsDeMidiaNaPlaylist = [], playlistAtualId, onConfirmar }: {
  aberto: boolean;
  onFechar: () => void;
  midias: Media[];
  widgets: Widget[];
  links: ExternalLink[];
  /** Mídias que já estão na playlist: aparecem com o aviso "já está" (pode repetir, o Player aceita). */
  idsDeMidiaNaPlaylist?: string[];
  playlistAtualId?: string | null;
  onConfirmar: (escolhas: Escolha[], posicao: Posicao) => void | Promise<void>;
}) {
  const [aba, setAba] = useState<Aba>('meu');
  const [subaba, setSubaba] = useState<SubAba>('videos');
  const [categoria, setCategoria] = useState<CategoriaDinamica | 'todas'>('todas');
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Escolha[]>([]);
  const [posicao, setPosicao] = useState<Posicao>('final');
  const [pastas, setPastas] = useState<PastaBiblioteca[] | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistResumo[] | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setAba('meu'); setSubaba('videos'); setCategoria('todas'); setBusca(''); setSelecionados([]); setPosicao('final');
  }, [aberto]);

  // pastas e playlists só são buscadas quando a aba é aberta
  useEffect(() => {
    if (!aberto || aba !== 'plataforma' || pastas) return;
    listarPastas().then(setPastas).catch(() => setPastas([]));
  }, [aberto, aba, pastas]);
  useEffect(() => {
    if (!aberto || aba !== 'meu' || subaba !== 'playlists' || playlists) return;
    supabase.from('playlists').select('id, name, resolution').order('name').limit(200)
      .then(({ data }) => setPlaylists(((data as unknown as PlaylistResumo[] | null) ?? []).filter((p) => p.id !== playlistAtualId)));
  }, [aberto, aba, subaba, playlists, playlistAtualId]);
  useEffect(() => { if (!aberto) { setPastas(null); setPlaylists(null); } }, [aberto]);

  const termo = busca.trim().toLowerCase();
  const casa = (nome: string) => !termo || nome.toLowerCase().includes(termo);
  const marcada = (chave: string) => selecionados.some((e) => e.chave === chave);
  const alternar = (e: Escolha) => setSelecionados((l) => alternarEscolha(l, e));
  const jaEsta = useMemo(() => new Set(idsDeMidiaNaPlaylist), [idsDeMidiaNaPlaylist]);

  const midiasDaSubaba = midias.filter((m) => (subaba === 'videos' ? m.file_type === 'video' : subaba === 'imagens' ? m.file_type === 'image' : m.file_type === 'audio') && casa(m.name));
  const contagem = (t: string) => midias.filter((m) => m.file_type === t).length;

  const gruposDeWidgets = agruparWidgets(widgets.filter((w) => w.is_active !== false && casa(w.name)))
    .filter((g) => categoria === 'todas' || g.categoria === categoria);
  const modelos = MODELOS_PRONTOS.filter((m) => (categoria === 'todas' || m.categoria === categoria) && casa(m.nome));

  const confirmar = async () => {
    if (!selecionados.length || salvando) return;
    setSalvando(true);
    try { await onConfirmar(selecionados, posicao); onFechar(); } catch { /* quem chamou já avisou o erro; a janela continua aberta com a seleção */ } finally { setSalvando(false); }
  };

  const vazio = (texto: string) => <p className="col-span-full py-8 text-center text-sm text-muted-foreground">{texto}</p>;

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 overflow-hidden p-4 sm:p-5" style={{ width: 'min(980px, 96vw)', maxWidth: 'none' }} data-testid="adicionar-na-playlist">
        <DialogHeader>
          <DialogTitle>Adicionar à playlist</DialogTitle>
          <DialogDescription>Marque quantos itens quiser, confira em "Selecionados" e escolha se entram no início ou no final.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border/60" role="tablist">
          {([['meu', 'Meu conteúdo'], ['dinamico', 'Conteúdo dinâmico'], ['plataforma', 'Conteúdo da plataforma']] as const).map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} data-testid={`aba-${id}`} onClick={() => { setAba(id); setBusca(''); }}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${aba === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {rotulo}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[1fr_260px]">
          <div className="flex min-h-0 flex-col gap-2">
            {aba === 'meu' && (
              <div className="flex flex-wrap gap-1" data-testid="subabas">
                {SUBABAS.map((s) => (
                  <button key={s.id} type="button" data-testid={`subaba-${s.id}`} onClick={() => setSubaba(s.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${subaba === s.id ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 text-muted-foreground hover:bg-muted/40'}`}>
                    {s.rotulo}{s.id === 'videos' ? ` (${contagem('video')})` : s.id === 'imagens' ? ` (${contagem('image')})` : s.id === 'audios' ? ` (${contagem('audio')})` : s.id === 'links' ? ` (${links.length})` : ''}
                  </button>
                ))}
              </div>
            )}
            {aba === 'dinamico' && (
              <div className="flex flex-wrap gap-1" data-testid="categorias">
                {(['todas', ...CATEGORIAS_DINAMICAS] as const).map((c) => (
                  <button key={c} type="button" data-testid={`categoria-${c}`} onClick={() => setCategoria(c)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${categoria === c ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 text-muted-foreground hover:bg-muted/40'}`}>
                    {c === 'todas' ? 'Todas' : c}
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar pelo nome" className="h-9 pl-8" data-testid="busca-adicionar" />
            </div>

            <div className="min-h-[220px] flex-1 overflow-y-auto pr-1">
              {aba === 'meu' && (subaba === 'videos' || subaba === 'imagens' || subaba === 'audios') && (
                <div className="grid gap-2 sm:grid-cols-2" data-testid="lista-midias">
                  {midiasDaSubaba.map((m) => (
                    <CartaoBase marcada={marcada} onAlternar={alternar} key={m.id} escolha={escolhaDeMidia(m)} aviso={jaEsta.has(m.id) ? 'já está' : undefined}>
                      <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                        <MediaThumbnail media={m} showIcon={false} />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                    </CartaoBase>
                  ))}
                  {midiasDaSubaba.length === 0 && vazio(busca ? 'Nada com esse nome.' : subaba === 'videos' ? 'Nenhum vídeo enviado ainda.' : subaba === 'imagens' ? 'Nenhuma imagem enviada ainda.' : 'Nenhum áudio enviado ainda.')}
                </div>
              )}

              {aba === 'meu' && subaba === 'playlists' && (
                <div className="grid gap-2 sm:grid-cols-2" data-testid="lista-playlists">
                  {playlists === null && <Loader2 className="col-span-full mx-auto my-8 h-5 w-5 animate-spin text-muted-foreground" />}
                  {(playlists ?? []).filter((p) => casa(p.name)).map((p) => (
                    <CartaoBase marcada={marcada} onAlternar={alternar} key={p.id} escolha={escolhaDePlaylist(p)}>
                      <ListVideo className="h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{p.resolution === '9x16' ? 'em pé' : p.resolution === '16x9' ? 'deitada' : ''}</span>
                    </CartaoBase>
                  ))}
                  {playlists !== null && playlists.filter((p) => casa(p.name)).length === 0 && vazio('Nenhuma outra playlist criada.')}
                  {playlists !== null && playlists.length > 0 && <p className="col-span-full text-[11px] text-muted-foreground">A playlist escolhida entra com todos os itens dela (uma cópia; mudar depois não altera a original).</p>}
                </div>
              )}

              {aba === 'meu' && subaba === 'links' && (
                <div className="grid gap-2 sm:grid-cols-2" data-testid="lista-links">
                  {links.filter((l) => casa(l.title)).map((l) => (
                    <CartaoBase marcada={marcada} onAlternar={alternar} key={l.id} escolha={escolhaDeLink(l)}>
                      <Link2 className="h-5 w-5 shrink-0 text-purple-400" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm">{l.title}</span><span className="text-[10px] text-muted-foreground">{l.platform}</span></span>
                    </CartaoBase>
                  ))}
                  {links.filter((l) => casa(l.title)).length === 0 && vazio('Nenhum link externo. Crie na seção Links Externos.')}
                </div>
              )}

              {aba === 'dinamico' && (
                <div className="space-y-4" data-testid="lista-dinamico">
                  {modelos.length > 0 && (
                    <section>
                      <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Prontos para usar (criados na hora)</h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {modelos.map((m) => (
                          <CartaoBase marcada={marcada} onAlternar={alternar} key={m.id} escolha={escolhaDeModelo(m)}>
                            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{m.nome}</span><span className="line-clamp-2 text-[10px] text-muted-foreground">{m.descricao}</span></span>
                          </CartaoBase>
                        ))}
                      </div>
                    </section>
                  )}
                  {gruposDeWidgets.map((g) => (
                    <section key={g.categoria} data-testid="grupo-dinamico">
                      <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Meus widgets · {g.categoria}</h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {g.itens.map((w) => (
                          <CartaoBase marcada={marcada} onAlternar={alternar} key={w.id} escolha={escolhaDeWidget(w)}>
                            <Sparkles className="h-5 w-5 shrink-0 text-accent" />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm">{w.name}</span><span className="text-[10px] text-muted-foreground">{rotuloDoTipo(w.widget_type)}</span></span>
                          </CartaoBase>
                        ))}
                      </div>
                    </section>
                  ))}
                  {modelos.length === 0 && gruposDeWidgets.length === 0 && vazio('Nada nessa categoria.')}
                </div>
              )}

              {aba === 'plataforma' && (
                <div className="grid gap-2 sm:grid-cols-2" data-testid="lista-plataforma">
                  {pastas === null && <Loader2 className="col-span-full mx-auto my-8 h-5 w-5 animate-spin text-muted-foreground" />}
                  {(pastas ?? []).filter((p) => casa(p.nome)).map((p) => (
                    <CartaoBase marcada={marcada} onAlternar={alternar} key={p.id} escolha={escolhaDePasta(p)}>
                      <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                        {p.capa_url ? <img src={p.capa_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <FolderOpen className="h-5 w-5 text-primary" />}
                      </div>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.nome}</span><span className="text-[10px] text-muted-foreground">{p.total} {p.total === 1 ? 'conteúdo' : 'conteúdos'} · 1 por volta</span></span>
                    </CartaoBase>
                  ))}
                  {pastas !== null && pastas.filter((p) => casa(p.nome)).length === 0 && vazio('Nenhuma pasta da plataforma disponível.')}
                </div>
              )}
            </div>
          </div>

          <aside className="flex min-h-[140px] flex-col rounded-xl border border-border/60 bg-muted/20 p-2" data-testid="painel-selecionados">
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-sm font-bold">Selecionados <span data-testid="qtd-selecionados" className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">{selecionados.length}</span></h4>
              <button type="button" onClick={() => setSelecionados([])} disabled={!selecionados.length} data-testid="limpar-selecao"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"><Trash2 className="h-3 w-3" />Limpar</button>
            </div>
            <ul className="flex-1 space-y-1 overflow-y-auto" data-testid="lista-selecionados">
              {selecionados.map((e, i) => (
                <li key={e.chave} className="flex items-center gap-1.5 rounded-md bg-background/60 px-2 py-1 text-xs">
                  <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                  <span className="shrink-0 text-primary">{icone(e.tipo)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{e.nome}</span><span className="text-[10px] text-muted-foreground">{legenda(e)}</span></span>
                  <button type="button" aria-label={`Tirar ${e.nome}`} onClick={() => alternar(e)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                </li>
              ))}
              {selecionados.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">Nada selecionado ainda.</li>}
            </ul>
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2 text-sm" data-testid="posicao-na-playlist">
            <span className="text-muted-foreground">Colocar no</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-border/60" role="radiogroup" aria-label="Posição na playlist">
              {(['final', 'inicio'] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={posicao === p} data-testid={`posicao-${p}`} onClick={() => setPosicao(p)}
                  className={`px-3 py-1.5 text-xs font-semibold ${posicao === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40'}`}>
                  {p === 'final' ? 'Final' : 'Início'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="button" onClick={confirmar} disabled={!selecionados.length || salvando} data-testid="confirmar-adicionar">
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{textoDoConfirmar(selecionados.length)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

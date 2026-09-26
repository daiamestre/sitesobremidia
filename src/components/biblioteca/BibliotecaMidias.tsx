import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, Folder, FolderPlus, Library, Loader2, MoreVertical, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';
import {
  adicionarAPlaylists, adicionarATelas, buscarMidias, buscarPlaylists, buscarTelas, contagemPasta, copiarMidia, criarPasta,
  duplicarPasta, editarMidia, excluirMidia, excluirPasta, listarPastas, moverMidia, renomearPasta, souAdminBiblioteca,
  vincularMidias, type ContextoBiblioteca, type MidiaBiblioteca, type PastaBiblioteca, type TipoMidia,
} from '@/lib/biblioteca';
import { MidiaBibliotecaCard } from './MidiaBibliotecaCard';
import { ConteudoAutomatico } from './ConteudoAutomatico';
import { DestinoDialog, useDebounced } from './DestinoDialog';
import { ConfirmarDialog, EditarMidiaDialog, EscolherPastaDialog, LixeiraDialog, PastaNomeDialog, PreviewDialog } from './BibliotecaDialogs';

const FILTROS: Array<{ valor: TipoMidia | ''; rotulo: string }> = [
  { valor: '', rotulo: 'Todos' }, { valor: 'video', rotulo: 'Vídeos' }, { valor: 'image', rotulo: 'Imagens' }, { valor: 'audio', rotulo: 'Áudios' },
];

/**
 * Biblioteca de Mídias — acervo oficial da empresa. Mesma página no painel (Owner/ADM/Gestor) e no portal (Anunciante).
 * Owner/ADM veem as ações de administração; o banco confere cada uma (esconder botão não é a segurança).
 */
export function BibliotecaMidias({ contexto }: { contexto: ContextoBiblioteca }) {
  const [params, setParams] = useSearchParams();
  const pastaId = params.get('pasta');
  const [admin, setAdmin] = useState(false);
  const [pastas, setPastas] = useState<PastaBiblioteca[] | null>(null);
  const [busca, setBusca] = useState('');
  const buscaAtrasada = useDebounced(busca);
  const [tipo, setTipo] = useState<TipoMidia | ''>('');
  const [midias, setMidias] = useState<MidiaBiblioteca[] | null>(null);

  // diálogos
  const [preview, setPreview] = useState<MidiaBiblioteca | null>(null);
  const [destinoPlaylist, setDestinoPlaylist] = useState<MidiaBiblioteca | null>(null);
  const [destinoTela, setDestinoTela] = useState<MidiaBiblioteca | null>(null);
  const [novaPasta, setNovaPasta] = useState(false);
  const [renomear, setRenomear] = useState<PastaBiblioteca | null>(null);
  const [excluirPastaAlvo, setExcluirPastaAlvo] = useState<PastaBiblioteca | null>(null);
  const [upload, setUpload] = useState(false);
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [editar, setEditar] = useState<MidiaBiblioteca | null>(null);
  const [mover, setMover] = useState<{ midia: MidiaBiblioteca; copiar: boolean } | null>(null);
  const [excluirMidiaAlvo, setExcluirMidiaAlvo] = useState<MidiaBiblioteca | null>(null);

  const pastaAtual = useMemo(() => pastas?.find((p) => p.id === pastaId) ?? null, [pastas, pastaId]);
  const modoBusca = !pastaId && (buscaAtrasada.trim() !== '' || tipo !== '');

  useEffect(() => { souAdminBiblioteca().then(setAdmin).catch(() => setAdmin(false)); }, []);
  const carregarPastas = useCallback(() => listarPastas().then(setPastas).catch((e) => { setPastas([]); toast.error(e instanceof Error ? e.message : 'Erro ao carregar a Biblioteca'); }), []);
  useEffect(() => { carregarPastas(); }, [carregarPastas]);

  const carregarMidias = useCallback(() => {
    if (!pastaId && !modoBusca) { setMidias(null); return; }
    setMidias(null);
    buscarMidias({ busca: buscaAtrasada, tipo, pastaId })
      .then(setMidias)
      .catch((e) => { setMidias([]); toast.error(e instanceof Error ? e.message : 'Erro ao buscar mídias'); });
  }, [pastaId, modoBusca, buscaAtrasada, tipo]);
  useEffect(() => { carregarMidias(); }, [carregarMidias]);

  const abrirPasta = (id: string | null) => {
    setBusca(''); setTipo('');
    setParams((p) => { const n = new URLSearchParams(p); if (id) n.set('pasta', id); else n.delete('pasta'); return n; });
  };
  const recarregarTudo = () => { carregarPastas(); carregarMidias(); };

  const acoesAdmin = admin ? {
    onEditar: (m: MidiaBiblioteca) => setEditar(m),
    onMover: (m: MidiaBiblioteca) => setMover({ midia: m, copiar: false }),
    onDuplicar: (m: MidiaBiblioteca) => setMover({ midia: m, copiar: true }),
    onExcluir: (m: MidiaBiblioteca) => setExcluirMidiaAlvo(m),
  } : null;

  const buscarPl = useCallback((t: string) => buscarPlaylists(contexto, t), [contexto]);
  const buscarTl = useCallback((t: string) => buscarTelas(contexto, t), [contexto]);

  return (
    <div className="space-y-6" data-testid="biblioteca-midias">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {pastaId ? (
            <>
              <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => abrirPasta(null)}><ArrowLeft className="mr-1 h-4 w-4" /> Biblioteca</Button>
              <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><Folder className="h-7 w-7 text-primary" /> {pastaAtual?.nome ?? '…'}</h1>
              {pastaAtual && <p className="text-muted-foreground">{contagemPasta(pastaAtual)}</p>}
            </>
          ) : (
            <>
              <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><Library className="h-7 w-7 text-primary" /> Biblioteca de Mídias</h1>
              <p className="text-muted-foreground">
                {admin ? 'Acervo oficial da SOBRE MÍDIA: organize pastas e conteúdos para todos os usuários.' : 'Encontre conteúdos prontos para usar nas suas telas.'}
              </p>
            </>
          )}
        </div>
        {admin && (
          <div className="flex flex-wrap gap-2">
            {pastaId && pastaAtual && <Button onClick={() => setUpload(true)} data-testid="adicionar-midia"><Upload className="mr-2 h-4 w-4" /> Adicionar mídia</Button>}
            {!pastaId && <Button onClick={() => setNovaPasta(true)} data-testid="nova-pasta"><FolderPlus className="mr-2 h-4 w-4" /> Nova Pasta</Button>}
            <Button variant="outline" onClick={() => setLixeiraAberta(true)} data-testid="abrir-lixeira"><Trash2 className="mr-2 h-4 w-4" /> Lixeira</Button>
          </div>
        )}
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" data-testid="busca-biblioteca"
            placeholder={pastaId ? 'Pesquisar nesta pasta...' : 'Pesquisar mídia, pasta ou categoria...'} />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de mídia">
          {FILTROS.map((f) => (
            <Button key={f.rotulo} size="sm" variant={tipo === f.valor ? 'default' : 'outline'} onClick={() => setTipo(f.valor)} aria-pressed={tipo === f.valor}>{f.rotulo}</Button>
          ))}
        </div>
      </div>

      {/* Conteúdo automático (esportes e notícias) — painel; no portal do Anunciante a Biblioteca segue só com mídias */}
      {contexto === 'painel' && !pastaId && !modoBusca && <ConteudoAutomatico />}

      {/* Pastas */}
      {!pastaId && !modoBusca && (
        pastas === null ? <Carregando /> : pastas.length === 0 ? (
          <Vazio texto={admin ? 'Nenhuma pasta ainda. Crie a primeira com "Nova Pasta".' : 'A Biblioteca ainda não tem conteúdos.'} />
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]" data-testid="pastas-biblioteca">
            {pastas.map((p) => (
              <div key={p.id} className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md" data-testid="pasta-card">
                <button type="button" className="block w-full text-left" onClick={() => abrirPasta(p.id)}>
                  <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-muted">
                    {p.capa_url
                      ? <img src={p.capa_url} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.03]" />
                      : <Folder className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-primary/60" />}
                  </div>
                  <div className="flex items-center gap-2 p-3 pr-10">
                    <Folder className="h-4 w-4 flex-shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={p.nome}>{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{contagemPasta(p)}</p>
                    </div>
                  </div>
                </button>
                {admin && (
                  <div className="absolute bottom-2.5 right-1.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações da pasta ${p.nome}`}><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setRenomear(p)}><Pencil className="mr-2 h-4 w-4" /> Renomear</DropdownMenuItem>
                        <DropdownMenuItem onClick={async () => {
                          try { await duplicarPasta(p.id); toast.success(`Pasta "${p.nome}" duplicada (mesmas mídias, sem copiar arquivos)`); carregarPastas(); }
                          catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível duplicar'); }
                        }}><Copy className="mr-2 h-4 w-4" /> Duplicar pasta</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setExcluirPastaAlvo(p)}><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Mídias (dentro da pasta ou resultado da busca) */}
      {(pastaId || modoBusca) && (
        midias === null ? <Carregando /> : midias.length === 0 ? (
          <Vazio texto={pastaId && !busca && !tipo
            ? (admin ? 'Pasta vazia. Use "Adicionar mídia" para enviar conteúdos.' : 'Esta pasta ainda não tem conteúdos.')
            : 'Nenhuma mídia encontrada.'} />
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]" data-testid="midias-biblioteca">
            {midias.map((m) => (
              <MidiaBibliotecaCard key={m.item_id} midia={m} mostrarPasta={!pastaId} admin={acoesAdmin}
                onPreview={setPreview} onPlaylist={setDestinoPlaylist} onTela={setDestinoTela} />
            ))}
          </div>
        )
      )}

      {/* ----- diálogos ----- */}
      <PreviewDialog midia={preview} onOpenChange={(v) => !v && setPreview(null)} />

      <DestinoDialog
        open={!!destinoPlaylist} onOpenChange={(v) => !v && setDestinoPlaylist(null)}
        titulo="Adicionar à Playlist" descricao={destinoPlaylist ? `"${destinoPlaylist.nome}" será adicionada ao final das playlists escolhidas.` : ''}
        grupo="Minhas Playlists" placeholder="Pesquisar Playlist..."
        vazio={contexto === 'portal' ? 'Nenhuma playlist encontrada. Crie uma em Playlists.' : 'Nenhuma playlist encontrada.'}
        buscar={buscarPl}
        confirmar={(ids) => adicionarAPlaylists(contexto, destinoPlaylist!.media_id, ids)}
        rotuloSucesso={(n) => `Mídia adicionada a ${n} playlist(s)`}
      />

      <DestinoDialog
        open={!!destinoTela} onOpenChange={(v) => !v && setDestinoTela(null)}
        titulo="Adicionar à Tela"
        descricao={contexto === 'portal'
          ? 'A mídia entra na sua playlist publicada em cada tela escolhida e a tela é atualizada.'
          : 'A mídia entra na playlist de cada tela escolhida (tela sem playlist ganha uma).'}
        grupo={contexto === 'portal' ? 'Telas com playlist sua publicada' : 'Minhas Telas'} placeholder="Pesquisar Tela..."
        vazio={contexto === 'portal'
          ? 'Nenhuma tela com playlist sua publicada. Adicione à Playlist e publique no seu ponto contratado.'
          : 'Nenhuma tela encontrada.'}
        buscar={buscarTl}
        confirmar={(ids) => adicionarATelas(contexto, destinoTela!.media_id, ids)}
        rotuloSucesso={(n) => `Mídia enviada para ${n} tela(s)`}
      />

      {admin && (
        <>
          <PastaNomeDialog open={novaPasta} onOpenChange={setNovaPasta} titulo="Criar nova pasta" rotulo="Criar pasta"
            onConfirmar={async (nome) => { await criarPasta(nome); toast.success(`Pasta "${nome}" criada`); carregarPastas(); }} />
          <PastaNomeDialog open={!!renomear} onOpenChange={(v) => !v && setRenomear(null)} titulo="Renomear pasta" rotulo="Salvar" inicial={renomear?.nome}
            onConfirmar={async (nome) => { await renomearPasta(renomear!.id, nome); toast.success('Pasta renomeada'); carregarPastas(); }} />
          <ConfirmarDialog aberto={!!excluirPastaAlvo} onOpenChange={(v) => !v && setExcluirPastaAlvo(null)} destrutivo rotulo="Mover para a Lixeira"
            titulo={`Excluir a pasta "${excluirPastaAlvo?.nome}"?`}
            texto="A pasta vai para a Lixeira e some da Biblioteca. As mídias já usadas em playlists continuam tocando nas telas. Você pode restaurar pela Lixeira."
            onConfirmar={async () => { await excluirPasta(excluirPastaAlvo!.id); toast.success('Pasta movida para a Lixeira'); carregarPastas(); }} />
          <ConfirmarDialog aberto={!!excluirMidiaAlvo} onOpenChange={(v) => !v && setExcluirMidiaAlvo(null)} destrutivo rotulo="Mover para a Lixeira"
            titulo={`Excluir "${excluirMidiaAlvo?.nome}"?`}
            texto="A mídia sai desta pasta e vai para a Lixeira. Se já estiver em alguma playlist, continua tocando nas telas."
            onConfirmar={async () => { await excluirMidia(excluirMidiaAlvo!.item_id); toast.success('Mídia movida para a Lixeira'); recarregarTudo(); }} />
          <EditarMidiaDialog midia={editar} onOpenChange={(v) => !v && setEditar(null)}
            onSalvar={async (titulo, descricao, tags) => { await editarMidia(editar!.item_id, titulo, descricao, tags); toast.success('Mídia atualizada'); carregarMidias(); }} />
          <EscolherPastaDialog aberto={!!mover} onOpenChange={(v) => !v && setMover(null)} pastas={pastas ?? []} excluirId={mover?.midia.pasta_id}
            titulo={mover?.copiar ? 'Duplicar mídia em outra pasta' : 'Mover mídia'}
            onEscolher={async (destino) => {
              if (mover!.copiar) { await copiarMidia(mover!.midia.item_id, destino); toast.success('Mídia também disponível na outra pasta (sem copiar o arquivo)'); }
              else { await moverMidia(mover!.midia.item_id, destino); toast.success('Mídia movida'); }
              recarregarTudo();
            }} />
          <LixeiraDialog aberto={lixeiraAberta} onOpenChange={setLixeiraAberta} onMudou={recarregarTudo} />
          {pastaAtual && (
            <MediaUploadDialog open={upload} onOpenChange={setUpload} semPlaylist titulo={`Adicionar mídia em "${pastaAtual.nome}"`}
              onUploadedIds={async (ids) => { const n = await vincularMidias(pastaAtual.id, ids); toast.success(`${n} mídia(s) adicionada(s) à pasta`); }}
              onUploadComplete={() => { setUpload(false); recarregarTudo(); }} />
          )}
        </>
      )}
    </div>
  );
}

function Carregando() {
  return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
}
function Vazio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
      <Library className="h-10 w-10 text-muted-foreground/60" />
      <p className="max-w-sm text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

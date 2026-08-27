import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ListVideo, Plus, Loader2, Trash2, Film, Image as ImageIcon,
  MapPin, Copy, XCircle, ShieldCheck, MonitorPlay,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  playlistClienteService, VALOR_VIDEO_ADICIONAL,
  type PlaylistCliente, type PontoContratado,
} from '@/modules/crm/services/playlistCliente.service';

const brl = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PlaylistsClientePage() {
  const qc = useQueryClient();

  const [dialogNova, setDialogNova] = useState(false);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [criando, setCriando] = useState(false);

  const [playlistAtiva, setPlaylistAtiva] = useState<PlaylistCliente | null>(null);

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['playlists-cliente'],
    queryFn: () => playlistClienteService.listarPlaylists(),
    refetchInterval: 30000,
  });

  const totalVideos = (p: PlaylistCliente) => (p.itens ?? []).filter((i) => i.asset?.tipo === 'video').length;

  const criarPlaylist = async () => {
    if (nome.trim().length < 2) {
      toast.error('Informe um nome para a playlist.');
      return;
    }
    setCriando(true);
    try {
      await playlistClienteService.criarPlaylist(nome.trim(), descricao.trim() || undefined);
      toast.success('Playlist criada!');
      setDialogNova(false);
      setNome('');
      setDescricao('');
      qc.invalidateQueries({ queryKey: ['playlists-cliente'] });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar playlist.');
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListVideo className="h-6 w-6 text-primary" /> Playlists
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Organize suas mídias em playlists e vincule aos seus pontos contratados.
            Cada playlist inclui <strong className="text-emerald-400">1 vídeo gratuito</strong>;
            vídeos adicionais: {brl(VALOR_VIDEO_ADICIONAL)} cada.
          </p>
        </div>
        <Button onClick={() => setDialogNova(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Criar Playlist
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : playlists.length === 0 ? (
        <Card className="border-dashed border-white/10 bg-white/[0.02]">
          <CardContent className="py-16 text-center">
            <ListVideo className="h-12 w-12 mx-auto text-slate-600 mb-4" />
            <h3 className="font-semibold text-lg">Nenhuma playlist ainda</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Crie sua primeira playlist: o primeiro vídeo é gratuito. Depois vincule-a
              aos seus pontos contratados para entrar no ar.
            </p>
            <Button onClick={() => setDialogNova(true)} className="mt-5 gap-2">
              <Plus className="h-4 w-4" /> Criar minha primeira playlist
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {playlists.map((p) => (
            <Card
              key={p.id}
              className="border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition-all cursor-pointer"
              onClick={() => setPlaylistAtiva(p)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold truncate">{p.nome}</h3>
                    {p.descricao && (
                      <p className="text-xs text-slate-500 line-clamp-1">{p.descricao}</p>
                    )}
                  </div>
                  <Badge variant={p.status === 'ATIVA' ? 'default' : 'secondary'}>{p.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  <Badge variant="outline" className="border-white/10 text-slate-300">
                    {(p.itens ?? []).length} mídia{(p.itens ?? []).length === 1 ? '' : 's'}
                  </Badge>
                  <Badge variant="outline" className="border-white/10 text-slate-300">
                    {totalVideos(p)} vídeo{totalVideos(p) === 1 ? '' : 's'}
                  </Badge>
                  <Badge variant="outline" className="border-white/10 text-slate-300">
                    <MapPin className="h-3 w-3 mr-1" />
                    {(p.pontos ?? []).length} ponto{(p.pontos ?? []).length === 1 ? '' : 's'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NovaPlaylistDialog
        open={dialogNova}
        onOpenChange={setDialogNova}
        nome={nome}
        setNome={setNome}
        descricao={descricao}
        setDescricao={setDescricao}
        criando={criando}
        onCriar={criarPlaylist}
      />

      {playlistAtiva && (
        <DetalhePlaylistDialog
          playlistId={playlistAtiva.id}
          onClose={() => setPlaylistAtiva(null)}
        />
      )}
    </div>
  );
}

function NovaPlaylistDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nome: string;
  setNome: (v: string) => void;
  descricao: string;
  setDescricao: (v: string) => void;
  criando: boolean;
  onCriar: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="bg-slate-900 border-white/10 text-slate-200 max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Playlist</DialogTitle>
          <DialogDescription>
            O primeiro vídeo é gratuito. Vídeos adicionais custam{' '}
            {brl(VALOR_VIDEO_ADICIONAL)} por cobrança PIX.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input
              value={props.nome}
              onChange={(e) => props.setNome(e.target.value)}
              placeholder="Ex.: Campanha Agosto"
              className="bg-slate-950 border-slate-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={props.descricao}
              onChange={(e) => props.setDescricao(e.target.value)}
              placeholder="Opcional"
              rows={3}
              className="bg-slate-950 border-slate-700"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button>
          <Button onClick={props.onCriar} disabled={props.criando || props.nome.trim().length < 2}>
            {props.criando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Criar playlist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Detalhe da playlist: mídias (com regra do vídeo pago) + pontos */
function DetalhePlaylistDialog({ playlistId, onClose }: { playlistId: string; onClose: () => void }) {
  const qc = useQueryClient();

  const [assetSelecionado, setAssetSelecionado] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [cobrancaPendente, setCobrancaPendente] = useState<{ cobrancaId: string; codigo: string; assetId: string; duracao?: number | null } | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [pontosSelecionados, setPontosSelecionados] = useState<Set<string>>(new Set());
  const [publicandoPonto, setPublicandoPonto] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);

  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists-cliente'],
    queryFn: () => playlistClienteService.listarPlaylists(),
    refetchInterval: cobrancaPendente ? 8000 : false,
  });
  const playlist = useMemo(() => playlists.find((p) => p.id === playlistId) ?? null, [playlists, playlistId]);

  const { data: assets = [] } = useQuery({
    queryKey: ['cliente-assets'],
    queryFn: async () => {
      const { data, error } = await supabaseAssets.listar();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: pontosContratados = [] } = useQuery({
    queryKey: ['pontos-contratados'],
    queryFn: () => playlistClienteService.listarPontosContratados(),
  });

  // Polling do status da cobrança pendente
  useQuery({
    queryKey: ['status-cobranca-video', cobrancaPendente?.cobrancaId],
    queryFn: async () => {
      if (!cobrancaPendente) return null;
      const st = await playlistClienteService.statusCobranca(cobrancaPendente.cobrancaId);
      if (st === 'PAGAMENTO CONFIRMADO') {
        try {
          await playlistClienteService.confirmarVideoPago(
            cobrancaPendente.cobrancaId,
            playlistId,
            cobrancaPendente.assetId,
            cobrancaPendente.duracao
          );
          toast.success('Pagamento confirmado! Vídeo adicionado à playlist.');
          qc.invalidateQueries({ queryKey: ['playlists-cliente'] });
          setCobrancaPendente(null);
        } catch (e: any) {
          toast.error(e?.message || 'Falha ao liberar vídeo.');
        }
      }
      return st;
    },
    enabled: !!cobrancaPendente,
    refetchInterval: 8000,
  });

  const videosNaPlaylist = (playlist?.itens ?? []).filter((i) => i.asset?.tipo === 'video').length;

  const adicionarMidia = async () => {
    if (!assetSelecionado || !playlist) return;
    setAdicionando(true);
    try {
      const asset = assets.find((a: any) => a.id === assetSelecionado);
      const r = await playlistClienteService.adicionarMidia(
        playlist.id,
        assetSelecionado,
        asset?.duracao ?? null
      );
      if (!r.cobrado) {
        toast.success('Mídia adicionada!');
      } else {
        toast.info(`Esta playlist já possui seu vídeo gratuito. Cobrança de ${brl(r.valor)} gerada (${r.codigo}).`);
        setCobrancaPendente({
          cobrancaId: r.cobrancaId!,
          codigo: r.codigo!,
          assetId: assetSelecionado,
          duracao: asset?.duracao ?? null,
        });
      }
      setAssetSelecionado(null);
      qc.invalidateQueries({ queryKey: ['playlists-cliente'] });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao adicionar mídia.');
    } finally {
      setAdicionando(false);
    }
  };

  const vincularPontos = async () => {
    if (!playlist || pontosSelecionados.size === 0) return;
    setVinculando(true);
    try {
      await playlistClienteService.vincularPontos(playlist.id, Array.from(pontosSelecionados));
      toast.success('Pontos vinculados!');
      setPontosSelecionados(new Set());
      setVinculando(false);
      qc.invalidateQueries({ queryKey: ['playlists-cliente'] });
    } catch (e: any) {
      setVinculando(false);
      toast.error(e?.message || 'Erro ao vincular pontos.');
    }
  };

  const publicarNoPlayer = async () => {
    if (!playlist || videosNaPlaylist === 0) return;
    setPublicando(true);
    try {
      const r = await playlistClienteService.publicarNoPlayer(playlist.id);
      toast.success(
        `Playlist "${r.nome}" publicada no Player (${r.itens} item${r.itens === 1 ? '' : 's'}). A operação vincula o canal às telas do ponto.`
      );
      qc.invalidateQueries({ queryKey: ['playlists-cliente'] });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao publicar playlist.');
    } finally {
      setPublicando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-slate-900 border-white/10 text-slate-200 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{playlist?.nome}</DialogTitle>
          <DialogDescription>
            {videosNaPlaylist === 0
              ? 'Nenhum vídeo ainda â€” o primeiro é gratuito.'
              : videosNaPlaylist === 1
                ? `1 vídeo gratuito utilizado. Próximos vídeos: ${brl(VALOR_VIDEO_ADICIONAL)} cada.`
                : `${videosNaPlaylist - 1} vídeo(s) adicional(is) cobrado(s).`}
          </DialogDescription>
        </DialogHeader>

        {/* Mídias da playlist */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Mídias</h4>
          {(playlist?.itens ?? []).length === 0 && (
            <p className="text-xs text-slate-500">Adicione a primeira mídia abaixo.</p>
          )}
          <div className="space-y-1.5">
            {(playlist?.itens ?? []).map((item) => (
              <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                {item.asset?.tipo === 'video'
                  ? <Film className="h-4 w-4 text-purple-400 flex-shrink-0" />
                  : <ImageIcon className="h-4 w-4 text-sky-400 flex-shrink-0" />}
                <span className="flex-1 text-sm truncate">{item.asset?.nome ?? item.asset_id}</span>
                {item.cobranca_id && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">pago</Badge>
                )}
                {!item.cobranca_id && item.asset?.tipo === 'video' && (
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">grátis</Badge>
                )}
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-rose-400"
                  onClick={async () => {
                    try {
                      await playlistClienteService.removerItem(item.id);
                      qc.invalidateQueries({ queryKey: ['playlists-cliente'] });
                    } catch (e: any) {
                      toast.error(e?.message || 'Erro ao remover.');
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Adicionar mídia */}
          <div className="flex gap-2 pt-1">
            <select
              value={assetSelecionado ?? ''}
              onChange={(e) => setAssetSelecionado(e.target.value || null)}
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
            >
              <option value="">Selecione uma mídia da bibliotecaâ€¦</option>
              {(assets as any[])
                .filter((a) => a.tipo === 'imagem' || a.tipo === 'video')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.tipo === 'video' ? 'vídeo' : 'imagem'}] {a.nome}
                  </option>
                ))}
            </select>
            <Button size="sm" disabled={!assetSelecionado || adicionando} onClick={adicionarMidia}>
              {adicionando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Adicionar
            </Button>
          </div>
          {(assets as any[]).filter((a) => a.tipo === 'imagem' || a.tipo === 'video').length === 0 && (
            <p className="text-xs text-amber-400/80">
              Sua biblioteca está vazia â€” envie mídias em Minhas Mídias â†’ Biblioteca.
            </p>
          )}
        </section>

        {/* Pontos vinculados */}
        <section className="space-y-2 pt-2">
          <h4 className="text-sm font-semibold">Pontos vinculados</h4>
          {(playlist?.pontos ?? []).length > 0 ? (
            <div className="space-y-1.5">
              {(playlist?.pontos ?? []).map((pv) => (
                <div key={pv.ponto_id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                  <MapPin className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  <span className="flex-1 text-sm truncate">{pv.nome}</span>
                  <span className="text-xs text-slate-500">{[pv.cidade, pv.estado].filter(Boolean).join(' - ')}</span>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-rose-400"
                    onClick={async () => {
                      try {
                        await playlistClienteService.desvincularPonto(playlist!.id, pv.ponto_id);
                        qc.invalidateQueries({ queryKey: ['playlists-cliente'] });
                      } catch (e: any) {
                        toast.error(e?.message || 'Erro ao desvincular.');
                      }
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Nenhum ponto vinculado. Somente pontos CONTRATADOS e ativos podem receber esta playlist.
            </p>
          )}

          {pontosContratados.length > 0 && (
            <div className="rounded-lg border border-white/10 p-3 space-y-2">
              <p className="text-xs text-slate-400">Pontos contratados â€” publicar no Player:</p>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {pontosContratados.map((pc: PontoContratado) => {
                  const jaVinculado = (playlist?.pontos ?? []).some((pv) => pv.ponto_id === pc.ponto_id);
                  return (
                    <div key={pc.ponto_id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={pontosSelecionados.has(pc.ponto_id)}
                        onChange={(e) => {
                          setPontosSelecionados((prev) => {
                            const n = new Set(prev);
                            if (e.target.checked) n.add(pc.ponto_id); else n.delete(pc.ponto_id);
                            return n;
                          });
                        }}
                        className="h-4 w-4"
                      />
                      <span className="truncate flex-1">{pc.nome}</span>
                      {jaVinculado ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={publicandoPonto === pc.ponto_id}
                          onClick={async () => {
                            setPublicandoPonto(pc.ponto_id);
                            try {
                              const r = await playlistClienteService.publicarNoPonto(playlist!.id, pc.ponto_id);
                              toast.success(
                                `Publicada no Player: ${r.telas_vinculadas} tela(s) vinculada(s)` +
                                (r.telas_ignoradas > 0 ? ` Â· ${r.telas_ignoradas} ocupada(s) preservada(s)` : ''),
                              );
                            } catch (e: any) {
                              toast.error(e?.message || 'Erro ao publicar.');
                            } finally {
                              setPublicandoPonto(null);
                            }
                          }}
                          className="h-7 px-2 text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        >
                          {publicandoPonto === pc.ponto_id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <MonitorPlay className="h-3.5 w-3.5" />}
                          Publicar no Player
                        </Button>
                      ) : (
                        <span className="text-[10px] text-slate-600">vincule primeiro</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={vinculando || pontosSelecionados.size === 0} onClick={vincularPontos}>
                  {vinculando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MapPin className="h-4 w-4 mr-1" />}
                  Vincular selecionados
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Publicação no Player (ponte para a distribuição existente) */}
        <section className="space-y-2 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                <MonitorPlay className="h-4 w-4 text-primary" /> Publicar no Player
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Envia esta playlist para o sistema de exibição. Vídeos adicionais só são publicados após o pagamento.
              </p>
            </div>
            <Button
              size="sm"
              disabled={publicando || videosNaPlaylist === 0 || !!cobrancaPendente}
              onClick={publicarNoPlayer}
            >
              {publicando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MonitorPlay className="h-4 w-4 mr-1" />}
              {cobrancaPendente ? 'Conclua o pagamento' : videosNaPlaylist === 0 ? 'Adicione um vídeo' : 'Publicar'}
            </Button>
          </div>
        </section>

        {/* Cobrança PIX pendente */}
        {cobrancaPendente && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-amber-400">{cobrancaPendente.codigo}</span>
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                AGUARDANDO PAGAMENTO Â· {brl(VALOR_VIDEO_ADICIONAL)}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 break-all font-mono">
              {playlistClienteService.gerarBrcodePix(cobrancaPendente.codigo, VALOR_VIDEO_ADICIONAL)}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    playlistClienteService.gerarBrcodePix(cobrancaPendente.codigo, VALOR_VIDEO_ADICIONAL)
                  );
                  toast.success('PIX copia e cola copiado.');
                } catch {
                  toast.error('Não foi possível copiar.');
                }
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar PIX
            </Button>
            <p className="text-[11px] text-emerald-400/90 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              O vídeo será liberado automaticamente após a conciliação do pagamento.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Import isolado para evitar ciclo com AssetLibraryPage
import { supabase } from '@/integrations/supabase/client';
const supabaseAssets = {
  listar: () =>
    supabase
      .from('cliente_assets')
      .select('id, nome, tipo, object_url, mime_type, tamanho, duracao')
      .order('created_at', { ascending: false }),
};

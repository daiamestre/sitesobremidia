import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ListVideo, Loader2, MonitorPlay, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PixDaCobranca } from '@/components/pagamento/PixDaCobranca';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { destinos, publicar, salvarNasMidias, type Destino, type Salvo } from '@/lib/studioai/api';
import type { PastaDaGaleria } from '@/lib/galeria';
import type { VideoGravado } from '@/lib/studio/video';
import { playlistClienteService } from '@/modules/crm/services/playlistCliente.service';

/**
 * Salvar a arte nas mídias e mandar para uma playlist ou tela, pelos caminhos oficiais:
 * anunciante → Minhas Mídias (análise de conteúdo) + regra de mídias da playlist (grátis, cortesia ou PIX);
 * equipe → Mídias + item no fim da playlist (ou da playlist da tela).
 */
export function PublicarDialog({ aberto, onFechar, gerarPng, nome, formato, clienteId, pasta, video = false }: {
  aberto: boolean; onFechar: () => void; gerarPng: () => Promise<{ png?: Blob; video?: VideoGravado; largura: number; altura: number }>; nome: string; formato: string; clienteId: string | null;
  /** F-225: pasta da galeria (a do modelo do Studio) em que a mídia entra */ pasta?: PastaDaGaleria | null; video?: boolean;
}) {
  const { user } = useAuth();
  const [salvo, setSalvo] = useState<Salvo | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aba, setAba] = useState<'playlist' | 'tela'>('playlist');
  const [lista, setLista] = useState<{ playlists: Destino[]; telas: Destino[] } | null>(null);
  const [cobranca, setCobranca] = useState<{ id: string; valor: number; playlistId: string } | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  useEffect(() => { if (!aberto) { setSalvo(null); setCobranca(null); setFeito(null); setLista(null); } }, [aberto]);
  useEffect(() => { if (salvo && !lista) destinos(clienteId).then(setLista).catch(() => setLista({ playlists: [], telas: [] })); }, [salvo, lista, clienteId]);

  const salvar = async () => {
    if (!user) return;
    setOcupado('salvar');
    try {
      const { png, video: gravado, largura, altura } = await gerarPng();
      const s = await salvarNasMidias({ userId: user.id, clienteId, png, video: gravado, nome, largura, altura, formato, pasta });
      setSalvo(s);
      toast.success(clienteId ? `Salvo em Minhas Mídias${pasta ? ` (pasta ${pasta.nome})` : ''}. Passa pela análise de conteúdo antes de ir às telas.` : `Salvo nas mídias${pasta ? ` (pasta ${pasta.nome})` : ''}.`);
    } catch (e) { toast.error((e as Error).message || 'Não foi possível salvar.'); } finally { setOcupado(null); }
  };

  const enviar = async (d: Destino) => {
    if (!salvo) return;
    setOcupado(d.id);
    try {
      const r = await publicar(salvo, { tipo: aba, id: d.id, nome: d.nome });
      if (r.cobrancaId && r.playlistId) { setCobranca({ id: r.cobrancaId, valor: r.valor ?? 0, playlistId: r.playlistId }); toast.info(r.mensagem); }
      else { setFeito(`${r.mensagem} (${aba === 'tela' ? 'tela' : 'playlist'}: ${d.nome})`); toast.success(r.mensagem); }
    } catch (e) { toast.error((e as Error).message || 'Não foi possível adicionar.'); } finally { setOcupado(null); }
  };

  const confirmarPagamento = async () => {
    if (!cobranca || !salvo) return;
    setOcupado('pix');
    try {
      await playlistClienteService.conferirPix(cobranca.id);
      if ((await playlistClienteService.statusCobranca(cobranca.id)) !== 'PAGAMENTO CONFIRMADO') { toast.info('O pagamento ainda não apareceu. Aguarde alguns segundos e tente de novo.'); return; }
      await playlistClienteService.confirmarVideoPago(cobranca.id, cobranca.playlistId, salvo.id, 10);
      setCobranca(null);
      setFeito('Pagamento confirmado: a arte entrou na playlist.');
    } catch (e) { toast.error((e as Error).message || 'Não foi possível confirmar.'); } finally { setOcupado(null); }
  };

  const opcoes = aba === 'playlist' ? lista?.playlists : lista?.telas;
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-lg border-[#8A2EFF]/40 bg-[#14062f] text-slate-100">
        <DialogHeader>
          <DialogTitle>{video ? 'Salvar e publicar o vídeo' : 'Salvar e publicar'}</DialogTitle>
          <DialogDescription className="text-slate-400">{video ? 'Salve o vídeo' : 'Salve a arte'} nas suas mídias{pasta ? ` (pasta ${pasta.nome})` : ''} e escolha uma playlist ou uma tela.</DialogDescription>
        </DialogHeader>
        {!salvo ? (
          <Button className="w-full bg-[#5D1BFF] text-white hover:bg-[#8A2EFF]" disabled={!!ocupado} onClick={salvar} data-testid="studio-salvar-midias">
            {ocupado === 'salvar' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar nas minhas mídias
          </Button>
        ) : (
          <div className="space-y-4">
            <p className="flex items-center gap-2 rounded-lg bg-[#25D366]/10 p-3 text-sm text-[#7dffb0]"><CheckCircle2 className="h-4 w-4" />{video ? 'Vídeo salvo' : 'Arte salva'} nas suas mídias{pasta ? ` · pasta ${pasta.nome}` : ''}.</p>
            {feito ? (
              <div className="space-y-3 text-sm">
                <p className="rounded-lg bg-[#25D366]/10 p-3 text-[#7dffb0]">{feito}</p>
                <Link to={clienteId ? '/portal/playlists' : '/dashboard/playlists'} className="text-[#FFD400] hover:underline">Ver playlists</Link>
              </div>
            ) : cobranca ? (
              <div className="space-y-3">
                <PixDaCobranca cobrancaId={cobranca.id} valorTexto={cobranca.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                <Button className="w-full bg-[#25D366] font-bold text-black hover:brightness-105" disabled={ocupado === 'pix'} onClick={confirmarPagamento}>
                  {ocupado === 'pix' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Já paguei
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(['playlist', 'tela'] as const).map((a) => (
                    <button key={a} type="button" onClick={() => setAba(a)} className={cn('flex items-center justify-center gap-2 rounded-lg border py-2 text-sm', aba === a ? 'border-[#B04DFF] bg-[#5D1BFF]/40 text-white' : 'border-white/10 text-slate-300')}>
                      {a === 'playlist' ? <ListVideo className="h-4 w-4" /> : <MonitorPlay className="h-4 w-4" />}{a === 'playlist' ? 'Playlist' : 'Tela'}
                    </button>
                  ))}
                </div>
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {!opcoes && <p className="text-sm text-slate-400"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p>}
                  {opcoes?.length === 0 && <p className="text-sm text-slate-400">{aba === 'playlist' ? 'Você ainda não tem playlists.' : 'Nenhuma tela disponível.'} <Link to={clienteId ? '/portal/playlists' : '/dashboard/playlists'} className="text-[#FFD400] hover:underline">Criar</Link></p>}
                  {opcoes?.map((d) => (
                    <button key={d.id} type="button" disabled={!!ocupado} onClick={() => void enviar(d)} className="flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2.5 text-left text-sm hover:border-[#8A2EFF]/60 hover:bg-white/5">
                      <span><span className="text-white">{d.nome}</span>{d.detalhe && aba === 'playlist' && <span className="block text-xs text-slate-500">{d.detalhe}</span>}</span>
                      {ocupado === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs font-semibold text-[#B04DFF]">Adicionar</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

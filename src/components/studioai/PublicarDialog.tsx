import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, FolderOpen, ListVideo, Loader2, MonitorPlay, RefreshCw, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PixDaCobranca } from '@/components/pagamento/PixDaCobranca';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { destinos, exibidaNaTela, formatoDaTela, publicar, salvarNasMidias, type Destino, type Salvo } from '@/lib/studioai/api';
import type { PastaDaGaleria } from '@/lib/galeria';
import type { VideoGravado } from '@/lib/studio/video';
import { playlistClienteService } from '@/modules/crm/services/playlistCliente.service';

type Gerado = { png?: Blob; video?: VideoGravado; largura: number; altura: number };
/** Situação de cada envio: na playlist → a tela exibiu (prova pelo registro de exibição do Player). */
interface Envio { destino: Destino; tipo: 'playlist' | 'tela'; estado: 'enviando' | 'na-playlist' | 'exibindo' | 'analise' | 'erro'; mensagem: string; midiaId?: string; quando?: string }

const ACOMPANHAR_MS = 5 * 60_000;

/**
 * F-229 — Salvar e publicar em CARTÕES:
 * 1) ao abrir, a arte/vídeo já é salva na galeria (pasta do modelo), sem cópia repetida;
 * 2) a pessoa marca uma ou várias TELAS (ou playlists): cada tela recebe a versão no formato dela (em pé 9:16 / deitada 16:9);
 *    tela sem playlist ganha uma;
 * 3) o cartão acompanha até a tela EXIBIR (registro de exibição enviado pelo Player).
 * Anunciante: Minhas Mídias + análise de conteúdo + regra de mídias da playlist (grátis, cortesia ou PIX).
 */
export function PublicarDialog({ aberto, onFechar, gerarPng, nome, formato, clienteId, pasta, video = false, formatos }: {
  aberto: boolean; onFechar: () => void; gerarPng: (formato?: string) => Promise<Gerado>; nome: string; formato: string; clienteId: string | null;
  /** F-225: pasta da galeria (a do modelo do Studio) em que a mídia entra */ pasta?: PastaDaGaleria | null; video?: boolean;
  /** formatos que a arte sabe gerar (editor: 16:9 e 9:16) — cada tela recebe o dela */ formatos?: string[];
}) {
  const { user } = useAuth();
  const [salvos, setSalvos] = useState<Record<string, Salvo>>({});
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [aba, setAba] = useState<'tela' | 'playlist'>('tela');
  const [lista, setLista] = useState<{ playlists: Destino[]; telas: Destino[] } | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [envios, setEnvios] = useState<Envio[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cobranca, setCobranca] = useState<{ id: string; valor: number; playlistId: string; midiaId: string } | null>(null);
  const [pagando, setPagando] = useState(false);
  const salvando = useRef<Record<string, Promise<Salvo>>>({});
  const principal = salvos[formato];
  const anunciante = !!clienteId;
  const galeria = anunciante ? '/portal/assets' : '/dashboard/medias';

  useEffect(() => {
    if (aberto) return;
    setSalvos({}); setErroSalvar(null); setLista(null); setMarcados([]); setEnvios(null); setCobranca(null); salvando.current = {};
  }, [aberto]);

  /** Salva (uma vez) a versão no formato pedido; a mesma arte nunca vira duas mídias. */
  const versao = (f: string): Promise<Salvo> => {
    if (!user) return Promise.reject(new Error('Entre na sua conta.'));
    salvando.current[f] ??= (async () => {
      const g = await gerarPng(f);
      const s = await salvarNasMidias({ userId: user.id, clienteId, png: g.png, video: g.video, nome: f === formato ? nome : `${nome} (${f === '9:16' ? 'em pé' : 'deitada'})`, largura: g.largura, altura: g.altura, formato: f, pasta });
      setSalvos((x) => ({ ...x, [f]: s }));
      return s;
    })().catch((e) => { delete salvando.current[f]; throw e; });
    return salvando.current[f];
  };

  // 1) abriu → salva na galeria na hora
  useEffect(() => {
    if (!aberto || !user) return;
    versao(formato).catch((e) => setErroSalvar((e as Error).message || 'Não foi possível salvar.'));
    destinos(clienteId).then(setLista).catch(() => setLista({ playlists: [], telas: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, user?.id]);

  // 3) acompanha as telas até exibirem
  useEffect(() => {
    if (!envios?.some((e) => e.tipo === 'tela' && e.estado === 'na-playlist' && e.midiaId)) return;
    const inicio = Date.now();
    const desde = new Date(inicio - 2 * 60_000).toISOString();
    const t = window.setInterval(async () => {
      if (Date.now() - inicio > ACOMPANHAR_MS) { window.clearInterval(t); return; }
      const atual = await Promise.all((envios ?? []).map(async (e) => {
        if (e.tipo !== 'tela' || e.estado !== 'na-playlist' || !e.midiaId) return e;
        const quando = await exibidaNaTela(e.midiaId, e.destino.id, desde).catch(() => null);
        return quando ? { ...e, estado: 'exibindo' as const, quando } : e;
      }));
      if (atual.some((e, i) => e !== envios?.[i])) setEnvios(atual);
    }, 6000);
    return () => window.clearInterval(t);
  }, [envios]);

  const opcoes = aba === 'playlist' ? lista?.playlists : lista?.telas;
  const alternar = (id: string) => setMarcados((m) => (anunciante ? (m[0] === id ? [] : [id]) : m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const formatoPara = (d: Destino) => {
    if (aba !== 'tela' || !d.orientacao) return formato;
    const quer = formatoDaTela(d.orientacao);
    return formatos?.includes(quer) ? quer : formato;
  };
  // telas que dividem a MESMA playlist recebem uma versão só (a da 1ª marcada); senão cada tela passaria as duas
  const formatoNoEnvio = (d: Destino) => {
    const primeira = d.playlistId ? (opcoes ?? []).find((o) => o.playlistId === d.playlistId && marcados.includes(o.id)) : null;
    return formatoPara(primeira ?? d);
  };

  const enviar = async () => {
    const escolhidos = (opcoes ?? []).filter((d) => marcados.includes(d.id));
    if (!escolhidos.length) return;
    setEnviando(true);
    const tipo = aba;
    const resultado: Envio[] = escolhidos.map((d) => ({ destino: d, tipo, estado: 'enviando', mensagem: 'Enviando…' }));
    setEnvios([...resultado]);
    for (const [i, d] of escolhidos.entries()) {
      try {
        const s = await versao(formatoNoEnvio(d));
        const r = await publicar(s, { tipo, id: d.id, nome: d.nome });
        if (r.cobrancaId && r.playlistId) {
          setCobranca({ id: r.cobrancaId, valor: r.valor ?? 0, playlistId: r.playlistId, midiaId: s.id });
          resultado[i] = { ...resultado[i], estado: 'erro', mensagem: r.mensagem };
        } else {
          resultado[i] = { ...resultado[i], midiaId: s.id, estado: anunciante ? 'analise' : 'na-playlist', mensagem: r.mensagem };
        }
      } catch (e) {
        resultado[i] = { ...resultado[i], estado: 'erro', mensagem: (e as Error).message || 'Não foi possível enviar.' };
      }
      setEnvios([...resultado]);
    }
    setEnviando(false);
    const ok = resultado.filter((r) => r.estado !== 'erro').length;
    if (ok) toast.success(ok === 1 ? 'Enviado! Acompanhe a tela no cartão.' : `Enviado para ${ok} destinos.`);
    void destinos(clienteId).then(setLista).catch(() => undefined);
  };

  const confirmarPagamento = async () => {
    if (!cobranca) return;
    setPagando(true);
    try {
      await playlistClienteService.conferirPix(cobranca.id);
      if ((await playlistClienteService.statusCobranca(cobranca.id)) !== 'PAGAMENTO CONFIRMADO') { toast.info('O pagamento ainda não apareceu. Aguarde alguns segundos e tente de novo.'); return; }
      await playlistClienteService.confirmarVideoPago(cobranca.id, cobranca.playlistId, cobranca.midiaId, principal?.duracao ?? 10);
      setCobranca(null);
      setEnvios((l) => l?.map((e) => (e.estado === 'erro' ? { ...e, estado: 'analise', mensagem: 'Pagamento confirmado: a mídia entrou na playlist.' } : e)) ?? null);
    } catch (e) { toast.error((e as Error).message || 'Não foi possível confirmar.'); } finally { setPagando(false); }
  };

  const oQue = video ? 'vídeo' : 'arte';
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto border-[#8A2EFF]/40 bg-[#14062f] text-slate-100">
        <DialogHeader>
          <DialogTitle>{video ? 'Salvar e enviar o vídeo às telas' : 'Salvar e enviar às telas'}</DialogTitle>
          <DialogDescription className="text-slate-400">A {oQue} fica na sua galeria e você escolhe em quais telas ela vai passar.</DialogDescription>
        </DialogHeader>

        {/* CARTÃO 1 — galeria */}
        <section className={cn('flex items-center gap-3 rounded-xl border p-3', principal ? 'border-[#25D366]/40 bg-[#25D366]/10' : erroSalvar ? 'border-red-400/40 bg-red-500/10' : 'border-white/10 bg-white/5')} data-testid="studio-cartao-galeria">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black">
            {principal ? (principal.video ? <video src={principal.url} muted playsInline className="h-full w-full object-contain" /> : <img src={principal.url} alt="" className="h-full w-full object-contain" />)
              : erroSalvar ? <AlertTriangle className="h-6 w-6 text-red-300" /> : <Loader2 className="h-6 w-6 animate-spin text-[#B04DFF]" />}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-white">{principal ? (principal.repetido ? `Esta ${oQue} já está na sua galeria` : `${video ? 'Vídeo salvo' : 'Arte salva'} na sua galeria`) : erroSalvar ? 'Não foi possível salvar' : `Salvando a ${oQue} na galeria…`}</p>
            <p className="truncate text-xs text-slate-300">{erroSalvar ?? (<>{nome}{pasta ? <> · pasta <b>{pasta.nome}</b></> : null}{anunciante ? ' · passa pela análise de conteúdo antes de ir às telas' : ''}</>)}</p>
            {principal && <Link to={galeria} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#FFD400] hover:underline"><FolderOpen className="h-3.5 w-3.5" />Abrir a galeria</Link>}
          </div>
          {erroSalvar && <Button size="sm" variant="outline" onClick={() => { setErroSalvar(null); versao(formato).catch((e) => setErroSalvar((e as Error).message)); }}><RefreshCw className="mr-1 h-3.5 w-3.5" />Tentar de novo</Button>}
        </section>

        {/* CARTÃO 3 — situação de cada envio */}
        {envios && (
          <section className="space-y-2" data-testid="studio-envios">
            {envios.map((e) => (
              <div key={e.destino.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                {e.estado === 'enviando' ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[#B04DFF]" />
                  : e.estado === 'erro' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
                  : e.estado === 'exibindo' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#25D366]" />
                  : <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[#FFD400]" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{e.destino.nome}</p>
                  <p className="text-xs text-slate-300">
                    {e.estado === 'exibindo' ? `Exibindo na tela desde ${new Date(e.quando!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓`
                      : e.estado === 'na-playlist' ? (e.destino.online === false ? 'Na playlist ✓ · a tela está desligada: passa a exibir assim que ligar.' : 'Na playlist ✓ · aguardando a tela baixar e exibir (até 1 a 2 min)…')
                      : e.estado === 'analise' ? `${e.mensagem} Vai às telas depois da análise de conteúdo.`
                      : e.mensagem}
                  </p>
                </div>
              </div>
            ))}
            {cobranca && (
              <div className="space-y-3 rounded-xl border border-[#FFD400]/40 bg-[#FFD400]/5 p-3">
                <PixDaCobranca cobrancaId={cobranca.id} valorTexto={cobranca.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                <Button className="w-full bg-[#25D366] font-bold text-black hover:brightness-105" disabled={pagando} onClick={confirmarPagamento}>{pagando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Já paguei</Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setEnvios(null); setMarcados([]); }} disabled={enviando}>Enviar para outras telas</Button>
              <Link to={anunciante ? '/portal/playlists' : '/dashboard/playlists'} className="inline-flex items-center px-2 text-sm text-[#FFD400] hover:underline">Ver playlists</Link>
            </div>
          </section>
        )}

        {/* CARTÃO 2 — escolher as telas */}
        {!envios && (
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['tela', 'playlist'] as const).map((a) => (
                <button key={a} type="button" onClick={() => { setAba(a); setMarcados([]); }} className={cn('flex items-center justify-center gap-2 rounded-lg border py-2 text-sm', aba === a ? 'border-[#B04DFF] bg-[#5D1BFF]/40 text-white' : 'border-white/10 text-slate-300')}>
                  {a === 'playlist' ? <ListVideo className="h-4 w-4" /> : <MonitorPlay className="h-4 w-4" />}{a === 'playlist' ? 'Playlists' : 'Telas'}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">{aba === 'tela' ? (anunciante ? 'Toque na tela em que a mídia vai passar.' : 'Marque uma ou várias telas: a mídia entra na playlist que cada tela já está passando, no formato dela.') : 'Prefere escolher a playlist? A mídia entra no fim da playlist marcada (e passa em todas as telas dela).'}</p>
            <div className="grid max-h-[42dvh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2" data-testid="studio-destinos">
              {!opcoes && <p className="text-sm text-slate-400"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p>}
              {opcoes?.length === 0 && <p className="text-sm text-slate-400">{aba === 'playlist' ? 'Você ainda não tem playlists.' : 'Nenhuma tela disponível.'} <Link to={anunciante ? '/portal/playlists' : '/dashboard/playlists'} className="text-[#FFD400] hover:underline">Criar</Link></p>}
              {opcoes?.map((d) => {
                const on = marcados.includes(d.id);
                const vai = on ? formatoNoEnvio(d) : formatoPara(d);
                const torto = aba === 'tela' && d.orientacao && vai !== formatoDaTela(d.orientacao);
                return (
                  <button key={d.id} type="button" onClick={() => alternar(d.id)} aria-pressed={on} data-testid="studio-destino"
                    className={cn('flex items-start gap-2.5 rounded-xl border p-3 text-left text-sm transition', on ? 'border-[#25D366] bg-[#25D366]/10' : 'border-white/10 bg-white/[0.03] hover:border-[#8A2EFF]/60')}>
                    {on ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#25D366]" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold text-white">
                        {aba === 'tela' && d.orientacao && (d.orientacao === 'portrait' ? <Smartphone className="h-3.5 w-3.5 shrink-0 text-[#B04DFF]" /> : <MonitorPlay className="h-3.5 w-3.5 shrink-0 text-[#B04DFF]" />)}
                        <span className="truncate">{d.nome}</span>
                      </span>
                      {d.online !== undefined && <span className={cn('mt-0.5 flex items-center gap-1 text-[11px]', d.online ? 'text-[#7dffb0]' : 'text-slate-400')}><span className={cn('h-1.5 w-1.5 rounded-full', d.online ? 'bg-[#25D366]' : 'bg-slate-500')} />{d.online ? 'Ligada agora' : 'Desligada'}</span>}
                      {d.detalhe && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{d.detalhe}</span>}
                      {aba === 'tela' && d.orientacao && <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold', torto ? 'bg-[#FFD400]/15 text-[#FFD400]' : 'bg-[#5D1BFF]/30 text-[#d9c2ff]')}>{torto ? `Tela ${d.orientacao === 'portrait' ? 'em pé' : 'deitada'}: a ${oQue} ${vai} fica com bordas` : `Vai a versão ${vai === '9:16' ? 'em pé (9:16)' : 'deitada (16:9)'}`}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button className="h-12 w-full bg-[#25D366] text-base font-bold text-[#0b2a17] hover:brightness-105" disabled={!marcados.length || enviando} onClick={() => void enviar()} data-testid="studio-enviar-telas">
              {enviando ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
              {marcados.length ? `Enviar para ${marcados.length} ${aba === 'tela' ? (marcados.length > 1 ? 'telas' : 'tela') : marcados.length > 1 ? 'playlists' : 'playlist'}` : `Escolha ${aba === 'tela' ? 'as telas' : 'a playlist'}`}
            </Button>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle2, Clock, ImagePlus, Loader2, Megaphone, Monitor, PauseCircle, PlayCircle, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DiretrizesConteudo } from '@/components/portal/DiretrizesConteudo';
import { cn } from '@/lib/utils';
import { linkDaFatura } from '@/lib/situacaoCobranca';
import {
  brl, ROTULO_ANUNCIO, type AnuncioNoPonto, type MidiaDoCliente, type ResultadoAnunciar, type TelaParaAnunciar,
} from './pontosParceiros';

/**
 * F-110 — "Anunciar aqui": 1) mídia  2) telas do ponto (valor de cada uma)  3) pagamento.
 * Mídia ainda em análise: o anúncio aguarda a análise e a cobrança sai quando for aprovada.
 */
export function AnunciarNoPontoDialog({ aberto, onFechar, nomePonto, telas, midias, carregandoMidias, anunciosAtivos, enviando, onConfirmar, resultado, contratadas = [] }: {
  aberto: boolean;
  onFechar: () => void;
  nomePonto: string;
  telas: TelaParaAnunciar[];
  midias: MidiaDoCliente[];
  carregandoMidias: boolean;
  anunciosAtivos: string[];
  enviando: boolean;
  onConfirmar: (asset: string, telas: string[], zona?: number | null) => void;
  resultado: ResultadoAnunciar | null;
  /** F-113: telas já vendidas no contrato (sem custo extra). */
  contratadas?: string[];
}) {
  const navigate = useNavigate();
  const [passo, setPasso] = useState<1 | 2>(1);
  const [midia, setMidia] = useState<string | null>(null);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  // F-148: área da tela (zona) — só aparece quando TODAS as telas escolhidas têm a mesma área disponível
  const [zona, setZona] = useState<number | null>(null);
  const zonasComuns = useMemo(() => {
    const marcadas = telas.filter((t) => escolhidas.includes(t.id));
    if (marcadas.length === 0 || marcadas.some((t) => !t.zonas?.length)) return [];
    return (marcadas[0].zonas ?? []).filter((z) => marcadas.every((t) => t.zonas?.some((o) => o.numero === z.numero)));
  }, [telas, escolhidas]);
  useEffect(() => { if (zona !== null && !zonasComuns.some((z) => z.numero === zona)) setZona(null); }, [zonasComuns, zona]);

  useEffect(() => {
    if (aberto) { setPasso(1); setMidia(null); setEscolhidas(contratadas.length ? telas.filter((t) => contratadas.includes(t.id)).map((t) => t.id) : telas.map((t) => t.id)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, telas, contratadas.join()]);

  // F-113: só telas do contrato → sem custo; misturando com outras, a cobrança avulsa vale para todas as escolhidas
  const soContrato = escolhidas.length > 0 && escolhidas.every((id) => contratadas.includes(id));
  // F-119: só telas grátis (R$ 0,00) — sem cobrança, vai ao ar quando a mídia for aprovada
  const semCusto = !soContrato && escolhidas.length > 0 && telas.filter((t) => escolhidas.includes(t.id)).every((t) => Number(t.valor) === 0);
  const total = useMemo(() => (soContrato ? 0 : telas.filter((t) => escolhidas.includes(t.id)).reduce((s, t) => s + Number(t.valor || 0), 0)), [telas, escolhidas, soContrato]);
  const utilizaveis = midias.filter((m) => m.moderacao_status !== 'RECUSADA');
  const midiaSel = midias.find((m) => m.id === midia);
  const link = resultado?.cobranca ? linkDaFatura(resultado.cobranca.codigo, resultado.cobranca.identificador) : null;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-white/10 bg-slate-900 text-white">
        <DialogHeader>
          <DialogTitle>Anunciar em {nomePonto}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {resultado ? 'Tudo certo!' : passo === 1 ? 'Passo 1 de 2 — escolha a mídia' : 'Passo 2 de 2 — escolha as telas'}
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-4 py-2 text-center" data-testid="resultado-anuncio">
            {resultado.origem === 'GRATUITO' && resultado.status === 'ATIVO' ? (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                <p className="text-slate-200">Seu anúncio já está no ar em {resultado.telas} {resultado.telas === 1 ? 'tela grátis' : 'telas grátis'}.</p>
                <p className="text-sm text-slate-400">Sem cobrança: o ponto deixou estas telas grátis para os anunciantes.</p>
              </>
            ) : resultado.origem === 'CONTRATO' && resultado.status !== 'EM_ANALISE' ? (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                {resultado.status === 'ATIVO'
                  ? <p className="text-slate-200">Seu anúncio já está no ar em {resultado.telas} {resultado.telas === 1 ? 'tela' : 'telas'} do seu contrato.</p>
                  : <p className="text-slate-200">Anúncio incluído no seu contrato ({resultado.telas} {resultado.telas === 1 ? 'tela' : 'telas'}). Ele entra no ar assim que a fatura do contrato estiver paga.</p>}
                <p className="text-sm text-slate-400">Sem cobrança extra: estas telas já fazem parte do seu contrato.</p>
              </>
            ) : resultado.status === 'AGUARDANDO_PAGAMENTO' ? (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                <p className="text-slate-200">Seu anúncio foi reservado em {resultado.telas} {resultado.telas === 1 ? 'tela' : 'telas'} por <strong>{brl(resultado.valor)}/mês</strong>.</p>
                <p className="text-sm text-slate-400">Assim que o pagamento for confirmado, ele entra no ar sozinho, depois dos anúncios que já estão passando.</p>
                {link && <Link to={link}><Button className="gap-2"><QrCode className="h-4 w-4" /> Pagar agora</Button></Link>}
              </>
            ) : (
              <>
                <Clock className="mx-auto h-10 w-10 text-sky-400" />
                <p className="text-slate-200">Sua mídia está em análise.</p>
                <p className="text-sm text-slate-400">{resultado.origem === 'GRATUITO'
                  ? 'Quando for aprovada, ela entra no ar nas telas grátis, sem cobrança.'
                  : resultado.origem === 'CONTRATO'
                  ? 'Quando for aprovada, ela entra no ar nas telas do seu contrato, sem cobrança extra.'
                  : `Quando for aprovada, a cobrança de ${brl(resultado.valor)}/mês aparece em Contratos e Faturas e você recebe um aviso. Pagou, entra no ar.`}</p>
              </>
            )}
            <Button variant="ghost" className="text-slate-300" onClick={onFechar}>Fechar</Button>
          </div>
        ) : carregandoMidias ? (
          <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-primary" />
        ) : midias.length === 0 ? (
          <div className="space-y-4 py-6 text-center" data-testid="sem-midias">
            <ImagePlus className="mx-auto h-10 w-10 text-slate-500" />
            <p className="text-slate-300">Você ainda não tem mídias para anúncios criadas.</p>
            <Button className="gap-2" onClick={() => navigate('/portal/criar-midia')}><ImagePlus className="h-4 w-4" /> Crie sua primeira mídia</Button>
            <DiretrizesConteudo compacto className="text-left" />
          </div>
        ) : passo === 1 ? (
          <>
            <div className="grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3" data-testid="escolher-midia">
              {midias.map((m) => {
                const jaAqui = anunciosAtivos.includes(m.id);
                const recusada = m.moderacao_status === 'RECUSADA';
                const analise = m.moderacao_status === 'PENDENTE' || m.moderacao_status === 'EM_ANALISE_MANUAL';
                return (
                  <button key={m.id} type="button" disabled={jaAqui || recusada} onClick={() => setMidia(m.id)}
                    className={cn('overflow-hidden rounded-xl border text-left transition-colors',
                      midia === m.id ? 'border-primary ring-2 ring-primary' : 'border-white/10 hover:border-white/30',
                      (jaAqui || recusada) && 'cursor-not-allowed opacity-50')}>
                    {m.tipo === 'imagem'
                      ? <img src={m.object_url} alt="" className="aspect-video w-full object-cover" />
                      : <video src={m.object_url} className="aspect-video w-full bg-black object-cover" muted preload="metadata" />}
                    <span className="block truncate px-2 pt-1.5 text-xs text-slate-200">{m.nome}</span>
                    <span className={cn('block px-2 pb-1.5 text-[11px]', recusada ? 'text-red-400' : analise ? 'text-sky-300' : 'text-emerald-400')}>
                      {jaAqui ? 'já neste ponto' : recusada ? 'recusada' : analise ? 'em análise' : 'aprovada'}
                    </span>
                  </button>
                );
              })}
            </div>
            {midiaSel && (midiaSel.moderacao_status === 'PENDENTE' || midiaSel.moderacao_status === 'EM_ANALISE_MANUAL') && (
              <p className="text-xs text-sky-300">Esta mídia ainda está em análise: você pode reservar o ponto agora e a cobrança sai quando ela for aprovada.</p>
            )}
            {utilizaveis.length === 0 && <p className="text-xs text-red-400">Suas mídias foram recusadas. Crie uma nova mídia seguindo as diretrizes.</p>}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" className="gap-2 text-slate-300" onClick={() => navigate('/portal/criar-midia')}><ImagePlus className="h-4 w-4" /> Criar outra mídia</Button>
              <Button className="gap-2" disabled={!midia} onClick={() => setPasso(2)}>Escolher telas</Button>
            </div>
          </>
        ) : (
          <>
            <ul className="space-y-2" data-testid="escolher-telas">
              {telas.map((t) => {
                const marcada = escolhidas.includes(t.id);
                return (
                  <li key={t.id}>
                    <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-2', marcada ? 'border-primary bg-primary/10' : 'border-white/10')}>
                      <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={marcada}
                        onChange={(e) => setEscolhidas((x) => (e.target.checked ? [...x, t.id] : x.filter((y) => y !== t.id)))} />
                      {t.foto_url ? <img src={t.foto_url} alt="" className="h-10 w-14 flex-shrink-0 rounded-lg object-cover" />
                        : <span className="flex h-10 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800"><Monitor className="h-4 w-4 text-slate-500" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{t.local}</span>
                        <span className="block text-xs text-slate-400">{t.orientacao === 'portrait' ? 'Em pé' : 'Deitada'}{t.polegadas ? ` · ${t.polegadas}"` : ''}</span>
                      </span>
                      {contratadas.includes(t.id)
                        ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300" data-testid="tela-no-contrato">No seu contrato</span>
                        : Number(t.valor) === 0
                          ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">Grátis</span>
                          : <span className="text-sm font-semibold text-slate-100">{brl(t.valor)}<span className="text-xs font-normal text-slate-500">/mês</span></span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 p-3">
              <span className="text-sm text-slate-300">{escolhidas.length} {escolhidas.length === 1 ? 'tela' : 'telas'} · total</span>
              <span className="text-lg font-bold text-white" data-testid="total-anuncio">{semCusto ? 'Grátis' : <>{brl(total)}<span className="text-xs font-normal text-slate-500">/mês</span></>}</span>
            </div>
            {zonasComuns.length > 0 && (
              <label className="block space-y-1 rounded-xl border border-white/10 bg-slate-950/60 p-3" data-testid="escolher-zona">
                <span className="text-sm text-slate-300">Onde o anúncio aparece na tela</span>
                <select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-2 text-sm text-white" value={zona ?? ''}
                  onChange={(e) => setZona(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Em toda a programação da tela</option>
                  {zonasComuns.map((z) => <option key={z.numero} value={z.numero}>Só na área "{z.nome}" ({z.parte_da_tela}% da tela)</option>)}
                </select>
              </label>
            )}
            {contratadas.length > 0 && !soContrato && escolhidas.some((id) => contratadas.includes(id)) && (
              <p className="text-xs text-amber-300">Com telas fora do contrato, o anúncio é cobrado à parte em todas as telas escolhidas. Para usar só o contrato, deixe marcadas apenas as telas “No seu contrato”.</p>
            )}
            <DiretrizesConteudo compacto />
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
              <Button variant="ghost" className="gap-2 text-slate-300" onClick={() => setPasso(1)}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
              <Button className="gap-2" disabled={!midia || escolhidas.length === 0 || enviando} onClick={() => midia && onConfirmar(midia, escolhidas, zona)}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />} {soContrato || semCusto ? 'Colocar no ar' : 'Reservar e pagar'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Seus anúncios neste ponto: situação, validade, pagar, pausar e reativar. */
export function MeusAnunciosNoPonto({ anuncios, onPausar, onReativar, ocupado }: {
  anuncios: AnuncioNoPonto[];
  onPausar: (id: string) => void;
  onReativar: (id: string) => void;
  ocupado: boolean;
}) {
  if (!anuncios.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4" data-testid="meus-anuncios-no-ponto">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Megaphone className="h-4 w-4 text-primary" /> Seus anúncios neste ponto</p>
      <ul className="space-y-2">
        {anuncios.map((a) => {
          const r = ROTULO_ANUNCIO[a.status];
          const link = a.cobranca && ['AGUARDANDO_PAGAMENTO', 'SUSPENSO', 'ATIVO'].includes(a.status)
            && !['PAGA', 'PAGO', 'CONCILIADA'].includes(String(a.cobranca.status).toUpperCase())
            ? linkDaFatura(a.cobranca.codigo, a.cobranca.identificador) : null;
          return (
            <li key={a.id} className="flex flex-col gap-2 rounded-xl bg-slate-950/60 p-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex min-w-0 items-center gap-3">
                {a.url && a.tipo === 'imagem'
                  ? <img src={a.url} alt="" className="h-10 w-16 flex-shrink-0 rounded object-cover" />
                  : <span className="flex h-10 w-16 flex-shrink-0 items-center justify-center rounded bg-slate-800 text-[10px] text-slate-400">vídeo</span>}
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white">{a.nome}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', r.cor)}>{r.texto}</span>
                    {a.valor != null && <span>{Number(a.valor) === 0 ? 'Sem custo' : `${brl(a.valor)}/mês`} · {a.telas} {a.telas === 1 ? 'tela' : 'telas'}</span>}
                    {a.status === 'ATIVO' && a.valido_ate && <span>até {format(new Date(a.valido_ate + 'T12:00:00'), 'dd/MM/yyyy')}</span>}
                  </span>
                  {a.motivo && <span className="block text-xs text-red-400">{a.motivo}</span>}
                </span>
              </span>
              <span className="flex flex-shrink-0 gap-2">
                {link && <Link to={link}><Button size="sm" className="gap-1"><QrCode className="h-4 w-4" /> Pagar</Button></Link>}
                {a.status === 'ATIVO' && (
                  <Button size="sm" variant="ghost" className="gap-1 text-slate-300" disabled={ocupado} onClick={() => onPausar(a.id)}><PauseCircle className="h-4 w-4" /> Pausar</Button>
                )}
                {a.status === 'PAUSADO' && (
                  <Button size="sm" variant="outline" className="gap-1 border-white/10" disabled={ocupado} onClick={() => onReativar(a.id)}><PlayCircle className="h-4 w-4" /> Reativar</Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

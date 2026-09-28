import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft, CheckCircle2, Clock, ExternalLink, ImagePlus, Loader2, MapPin, Megaphone, Monitor, PauseCircle, Users, Wifi,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { brl, enderecoCompleto, pontosParceirosService, type MidiaDoCliente } from './pontosParceiros';

/**
 * F-107 — Ficha do ponto parceiro: capa, endereço, localização, informações e "Anunciar aqui".
 * Sem mídia: "Você ainda não tem mídias para anúncios criadas" + "Crie sua primeira mídia".
 */
export default function PontoParceiroPage() {
  const { id = '' } = useParams();
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [escolhendo, setEscolhendo] = useState(false);
  const [midiaEscolhida, setMidiaEscolhida] = useState<string | null>(null);

  const ponto = useQuery({ queryKey: ['portal-ponto-parceiro', id], queryFn: () => pontosParceirosService.detalhe(id), enabled: !!id });
  const midias = useQuery({
    queryKey: ['portal-minhas-midias-anuncio', usuario?.cliente_id],
    queryFn: () => pontosParceirosService.minhasMidias(usuario!.cliente_id!),
    enabled: !!usuario?.cliente_id,
  });

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['portal-ponto-parceiro', id] });
    qc.invalidateQueries({ queryKey: ['portal-pontos-parceiros'] });
    qc.invalidateQueries({ queryKey: ['vitrine-anunciante'] });
  };

  const anunciar = useMutation({
    mutationFn: (asset: string) => pontosParceirosService.anunciar(id, asset),
    onSuccess: (r) => {
      toast.success(r.telas_no_ponto > 0
        ? 'Pronto! Sua mídia entrou na programação das telas deste ponto.'
        : 'Anúncio registrado. Ele começa a tocar assim que a tela do ponto for conectada.');
      setEscolhendo(false); setMidiaEscolhida(null); atualizar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pausar = useMutation({
    mutationFn: (anuncio: string) => pontosParceirosService.pausar(anuncio),
    onSuccess: () => { toast.success('Anúncio pausado neste ponto.'); atualizar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (ponto.isLoading) return <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-primary" />;
  const p = ponto.data;
  if (!p) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-12 text-center">
        <p className="text-slate-400">Ponto parceiro não encontrado.</p>
        <Button variant="outline" onClick={() => navigate('/portal/pontos-parceiros')}>Ver pontos parceiros</Button>
      </div>
    );
  }

  const temCoordenadas = p.latitude != null && p.longitude != null;
  const lat = Number(p.latitude); const lng = Number(p.longitude);
  const mapaEmbed = temCoordenadas
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.006}%2C${lat - 0.004}%2C${lng + 0.006}%2C${lat + 0.004}&layer=mapnik&marker=${lat}%2C${lng}`
    : null;
  const linkMapa = temCoordenadas
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto(p))}`;
  const credito = p.galeria?.[0]?.credito;
  const ativos = p.meus_anuncios.filter((a) => a.status === 'ATIVO');
  const lista: MidiaDoCliente[] = midias.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12" data-testid="ficha-ponto-parceiro">
      <Link to="/portal/pontos-parceiros" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Pontos parceiros
      </Link>

      {/* Capa */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-800">
        {p.foto_url
          ? <img src={p.foto_url} alt={p.nome} className="aspect-[21/9] w-full object-cover" />
          : <div className="aspect-[21/9] w-full" />}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {p.categoria && <Badge className="mb-2 border-0 bg-primary/90 text-white">{p.categoria}</Badge>}
            <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{p.nome}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-200"><MapPin className="h-4 w-4" /> {enderecoCompleto(p)}</p>
          </div>
          <Button size="lg" className="gap-2 shadow-lg" onClick={() => setEscolhendo(true)} data-testid="botao-anunciar-aqui">
            <Megaphone className="h-5 w-5" /> Anunciar aqui
          </Button>
        </div>
        {credito && <span className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/70">{credito}</span>}
      </div>

      {/* Seus anúncios aqui */}
      {p.meus_anuncios.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4" data-testid="meus-anuncios-no-ponto">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Seus anúncios neste ponto</p>
          <ul className="space-y-2">
            {p.meus_anuncios.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/70 p-2">
                <span className="flex min-w-0 items-center gap-3">
                  {a.url && a.tipo === 'imagem'
                    ? <img src={a.url} alt="" className="h-10 w-16 flex-shrink-0 rounded object-cover" />
                    : <span className="flex h-10 w-16 flex-shrink-0 items-center justify-center rounded bg-slate-800 text-[10px] text-slate-400">vídeo</span>}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">{a.nome}</span>
                    <span className="block text-xs text-slate-400">desde {format(new Date(a.desde), 'dd/MM/yyyy')}</span>
                  </span>
                </span>
                {a.status === 'ATIVO' ? (
                  <Button size="sm" variant="ghost" className="gap-1 text-slate-300" onClick={() => pausar.mutate(a.id)} disabled={pausar.isPending}>
                    <PauseCircle className="h-4 w-4" /> Pausar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="border-white/10" onClick={() => anunciar.mutate(a.asset_id)} disabled={anunciar.isPending}>Reativar</Button>
                )}
              </li>
            ))}
          </ul>
          {ativos.length > 0 && p.telas_conectadas === 0 && (
            <p className="mt-2 text-xs text-amber-400">As telas deste ponto ainda estão sendo instaladas; seu anúncio começa a tocar assim que forem conectadas.</p>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* Informações */}
        <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/80 p-5">
          <h2 className="font-semibold text-white">Sobre o ponto</h2>
          {p.descricao && <p className="text-sm leading-relaxed text-slate-300">{p.descricao}</p>}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info icone={Monitor} rotulo="Telas" valor={`${p.quantidade_telas ?? p.telas_conectadas}`} />
            <Info icone={Wifi} rotulo="Telas online agora" valor={`${p.telas_online}`} />
            <Info icone={Users} rotulo="Público por dia" valor={p.publico_estimado_dia ? `~${p.publico_estimado_dia.toLocaleString('pt-BR')} pessoas` : '—'} />
            <Info icone={Megaphone} rotulo="Valor do anúncio" valor={`${brl(p.valor_anuncio)} / ${String(p.periodicidade || 'MENSAL').toLowerCase()}`} />
          </div>
          {p.horario_funcionamento && (
            <p className="flex items-start gap-2 text-sm text-slate-300"><Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> {p.horario_funcionamento}</p>
          )}
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-wide text-slate-500">Endereço</p>
            <p>{[p.logradouro, p.numero].filter(Boolean).join(', ')}{p.complemento ? ` — ${p.complemento}` : ''}</p>
            <p>{p.bairro} · {p.cidade} - {p.estado}{p.cep ? ` · CEP ${p.cep}` : ''}</p>
          </div>
        </div>

        {/* Localização */}
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/80 p-3">
          <p className="px-1 text-sm font-semibold text-white">Localização</p>
          {mapaEmbed
            ? <iframe title={`Mapa de ${p.nome}`} src={mapaEmbed} className="h-64 w-full rounded-xl border-0" loading="lazy" />
            : <div className="flex h-64 items-center justify-center rounded-xl bg-slate-800 text-sm text-slate-500">Mapa indisponível</div>}
          <a href={linkMapa} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-sm text-primary hover:underline">
            Abrir no Google Maps <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Escolher a mídia */}
      <Dialog open={escolhendo} onOpenChange={(o) => { setEscolhendo(o); if (!o) setMidiaEscolhida(null); }}>
        <DialogContent className="max-w-2xl border-white/10 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle>Anunciar em {p.nome}</DialogTitle>
            <DialogDescription className="text-slate-400">Escolha a mídia que vai passar nas telas deste ponto.</DialogDescription>
          </DialogHeader>
          {midias.isLoading ? (
            <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-primary" />
          ) : lista.length === 0 ? (
            <div className="space-y-4 py-6 text-center" data-testid="sem-midias">
              <ImagePlus className="mx-auto h-10 w-10 text-slate-500" />
              <p className="text-slate-300">Você ainda não tem mídias para anúncios criadas.</p>
              <Button className="gap-2" onClick={() => navigate('/portal/criar-midia')}>
                <ImagePlus className="h-4 w-4" /> Crie sua primeira mídia
              </Button>
            </div>
          ) : (
            <>
              <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3" data-testid="escolher-midia">
                {lista.map((m) => {
                  const jaAtivo = ativos.some((a) => a.asset_id === m.id);
                  return (
                    <button key={m.id} type="button" disabled={jaAtivo} onClick={() => setMidiaEscolhida(m.id)}
                      className={cn('overflow-hidden rounded-xl border text-left transition-colors',
                        midiaEscolhida === m.id ? 'border-primary ring-2 ring-primary' : 'border-white/10 hover:border-white/30',
                        jaAtivo && 'opacity-50')}>
                      {m.tipo === 'imagem'
                        ? <img src={m.object_url} alt="" className="aspect-video w-full object-cover" />
                        : <video src={m.object_url} className="aspect-video w-full bg-black object-cover" muted preload="metadata" />}
                      <span className="block truncate px-2 py-1.5 text-xs text-slate-200">{m.nome}{jaAtivo ? ' · já no ar aqui' : ''}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
                <Button variant="ghost" className="gap-2 text-slate-300" onClick={() => navigate('/portal/criar-midia')}><ImagePlus className="h-4 w-4" /> Criar outra mídia</Button>
                <Button className="gap-2" disabled={!midiaEscolhida || anunciar.isPending} onClick={() => midiaEscolhida && anunciar.mutate(midiaEscolhida)}>
                  {anunciar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />} Colocar no ar neste ponto
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ icone: Icone, rotulo, valor }: { icone: React.ComponentType<{ className?: string }>; rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
      <p className="flex items-center gap-1 text-xs text-slate-500"><Icone className="h-3.5 w-3.5" /> {rotulo}</p>
      <p className="mt-0.5 font-semibold text-white">{valor}</p>
    </div>
  );
}

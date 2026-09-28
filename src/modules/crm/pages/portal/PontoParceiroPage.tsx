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
import { brl, enderecoCompleto, pontosParceirosService, type ResultadoAnunciar } from './pontosParceiros';
import { AnunciarNoPontoDialog, MeusAnunciosNoPonto } from './AnunciarNoPonto';
import { GaleriaDoPonto } from './GaleriaDoPonto';

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
  const [resultado, setResultado] = useState<ResultadoAnunciar | null>(null);

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
    mutationFn: ({ asset, telas }: { asset: string; telas: string[] }) => pontosParceirosService.anunciar(id, asset, telas),
    onSuccess: (r) => { setResultado(r); atualizar(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reativar = useMutation({
    mutationFn: (anuncio: string) => pontosParceirosService.reativar(anuncio),
    onSuccess: (r) => { toast.success(r.status === 'ATIVO' ? 'Anúncio de volta ao ar.' : 'Nova cobrança gerada: pague para voltar ao ar.'); atualizar(); },
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

      {/* F-108: fotos dos locais onde as telas estão */}
      <GaleriaDoPonto fotos={(p.galeria ?? []).filter((f) => f?.url)} nome={p.nome} />

      {/* Seus anúncios aqui */}
      <MeusAnunciosNoPonto anuncios={p.meus_anuncios} onPausar={(a) => pausar.mutate(a)} onReativar={(a) => reativar.mutate(a)}
        ocupado={pausar.isPending || reativar.isPending} />
      {p.meus_anuncios.some((a) => a.status === 'ATIVO') && p.telas_online === 0 && (
        <p className="text-xs text-amber-400">As telas deste ponto ainda estão sendo instaladas; seu anúncio começa a tocar assim que forem conectadas.</p>
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
          {!!p.onde_ficam_as_telas?.length && (
            <div className="space-y-2" data-testid="onde-ficam-as-telas">
              <p className="text-xs uppercase tracking-wide text-slate-500">Onde as telas estão</p>
              <ul className="space-y-2">
                {p.onde_ficam_as_telas.map((t, i) => (
                  <li key={t.local + i} className="flex gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Monitor className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">Tela {i + 1} · {t.local}</span>
                      {t.detalhe && <span className="block text-xs text-slate-400">{t.detalhe}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

      {/* Anunciar: mídia → telas → pagamento */}
      <AnunciarNoPontoDialog
        aberto={escolhendo}
        onFechar={() => { setEscolhendo(false); setResultado(null); }}
        nomePonto={p.nome}
        telas={p.telas ?? []}
        midias={midias.data ?? []}
        carregandoMidias={midias.isLoading}
        anunciosAtivos={p.meus_anuncios.filter((a) => ['ATIVO', 'AGUARDANDO_PAGAMENTO', 'EM_ANALISE'].includes(a.status)).map((a) => a.asset_id)}
        enviando={anunciar.isPending}
        onConfirmar={(asset, telas) => anunciar.mutate({ asset, telas })}
        resultado={resultado}
      />
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

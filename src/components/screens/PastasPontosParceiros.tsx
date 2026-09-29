import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Clock, Folder, ListVideo, MapPin, Monitor, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * F-112 — Telas dos pontos parceiros em PASTAS: uma pasta por estabelecimento e, dentro dela, cada tela
 * separada. Clicar na tela abre o painel dela (/dashboard/screens/:id), onde a grade/mídias são só daquela tela.
 * Leitura por empresa (política scr_select_own: telas do mesmo tenant).
 */
export interface TelaDoPonto {
  id: string; name: string; custom_id: string | null; codigo_operacional: string | null;
  local_instalacao: string | null; foto_local_url: string | null; orientation: string | null; tamanho_polegadas: number | null;
  status_grade: 'AGUARDANDO_GRADE' | 'PRONTA' | null; last_ping_at: string | null; bound_device_id: string | null;
  is_active: boolean | null; ponto_id: string;
  ponto: { id: string; nome: string; bairro: string | null; cidade: string | null; foto_url: string | null } | null;
  playlist: { name: string } | null;
}

export const telaOnline = (t: { last_ping_at: string | null; is_active?: boolean | null }) =>
  t.is_active !== false && !!t.last_ping_at && Date.now() - new Date(t.last_ping_at).getTime() < 3 * 60_000;

export function useTelasDosPontos(ativo = true) {
  return useQuery({
    queryKey: ['telas-dos-pontos-parceiros'],
    enabled: ativo,
    staleTime: 30_000,
    queryFn: async (): Promise<TelaDoPonto[]> => {
      const { data, error } = await supabase
        .from('screens')
        .select(`id, name, custom_id, codigo_operacional, local_instalacao, foto_local_url, orientation, tamanho_polegadas,
                 status_grade, last_ping_at, bound_device_id, is_active, ponto_id,
                 ponto:pontos(id, nome, bairro, cidade, foto_url), playlist:playlists(name)` as never)
        .eq('tipo_tela' as never, 'PARCEIRA' as never)
        .order('created_at');
      if (error) throw error;
      return ((data ?? []) as unknown as TelaDoPonto[]).filter((t) => t.ponto_id);
    },
  });
}

interface Pasta { id: string; nome: string; local: string; foto: string | null; telas: TelaDoPonto[] }

/** Número da tela como está no nome oficial ("Academia — Tela 2 · Recepção"), para bater com o painel da tela. */
export const numeroDaTela = (t: { name: string }) => {
  const m = t.name.match(/Tela\s+(\d+)/i);
  return m ? Number(m[1]) : null;
};

export function PastasPontosParceiros({ pontoId, onAbrirPonto, onVoltar }: {
  pontoId: string | null; onAbrirPonto: (id: string) => void; onVoltar: () => void;
}) {
  const navigate = useNavigate();
  const { data: telas = [], isLoading, error } = useTelasDosPontos();

  const pastas = useMemo(() => {
    const mapa = new Map<string, Pasta>();
    for (const t of telas) {
      const p = mapa.get(t.ponto_id) ?? {
        id: t.ponto_id, nome: t.ponto?.nome ?? 'Ponto parceiro', foto: t.ponto?.foto_url ?? null,
        local: [t.ponto?.bairro, t.ponto?.cidade].filter(Boolean).join(', '), telas: [],
      };
      p.telas.push(t);
      mapa.set(t.ponto_id, p);
    }
    for (const p of mapa.values()) p.telas.sort((a, b) => (numeroDaTela(a) ?? 999) - (numeroDaTela(b) ?? 999));
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [telas]);

  if (isLoading) {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>;
  }
  if (error) return <p className="text-sm text-destructive">Não foi possível carregar as telas dos pontos parceiros.</p>;

  const voltar = (
    <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Pastas dos pontos parceiros
    </button>
  );

  // Dentro da pasta: cada tela do estabelecimento, separada
  if (pontoId) {
    const pasta = pastas.find((p) => p.id === pontoId);
    if (!pasta) return <div className="space-y-3">{voltar}<p className="text-sm text-muted-foreground">Estabelecimento não encontrado.</p></div>;
    return (
      <div className="space-y-4" data-testid="pasta-do-ponto">
        {voltar}
        <div className="flex items-center gap-3">
          {pasta.foto
            ? <img src={pasta.foto} alt="" className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" />
            : <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10"><Folder className="h-7 w-7 text-primary" /></span>}
          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-tight">{pasta.nome}</h2>
            <p className="text-sm text-muted-foreground">{pasta.telas.length} tela{pasta.telas.length === 1 ? '' : 's'} · toque na tela para escolher as mídias dela</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pasta.telas.map((t, i) => {
            const on = telaOnline(t);
            const abrir = () => navigate(`/dashboard/screens/${t.codigo_operacional || t.custom_id || t.id}`);
            return (
              <Card key={t.id} role="button" tabIndex={0} data-testid="tela-do-ponto"
                className="glass cursor-pointer overflow-hidden transition-shadow hover:shadow-lg"
                onClick={abrir} onKeyDown={(e) => { if (e.key === 'Enter') abrir(); }}>
                {t.foto_local_url
                  ? <img src={t.foto_local_url} alt={t.local_instalacao ?? t.name} className="aspect-video w-full object-cover" />
                  : <div className="flex aspect-video w-full items-center justify-center bg-muted"><Monitor className="h-10 w-10 text-muted-foreground" /></div>}
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight">Tela {numeroDaTela(t) ?? i + 1}</p>
                      <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">{t.local_instalacao ?? t.name}</span></p>
                    </div>
                    {on
                      ? <Badge className="flex-shrink-0 bg-green-500 hover:bg-green-600"><Wifi className="mr-1 h-3 w-3" /> Online</Badge>
                      : <Badge variant="secondary" className="flex-shrink-0 bg-destructive/10 text-destructive"><WifiOff className="mr-1 h-3 w-3" /> {t.bound_device_id ? 'Offline' : 'Sem TV'}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.orientation === 'portrait' ? 'Em pé' : 'Deitada'}{t.tamanho_polegadas ? ` · ${t.tamanho_polegadas}"` : ''}
                  </p>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs">
                    {t.playlist
                      ? <span className="flex min-w-0 items-center gap-1 text-primary"><ListVideo className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">{t.playlist.name}</span></span>
                      : <span className="flex items-center gap-1 text-amber-500"><Clock className="h-3.5 w-3.5" /> Aguardando grade</span>}
                    <span className="flex flex-shrink-0 items-center gap-0.5 font-medium text-primary">Mídias <ChevronRight className="h-3.5 w-3.5" /></span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Pastas: um estabelecimento por pasta
  if (!pastas.length) {
    return (
      <EmptyState icon={Folder} title="Nenhum ponto parceiro com telas"
        description="Ao cadastrar um ponto parceiro com as telas dele, a pasta do estabelecimento aparece aqui." />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="pastas-pontos-parceiros">
      {pastas.map((p) => {
        const online = p.telas.filter(telaOnline).length;
        const semGrade = p.telas.filter((t) => !t.playlist).length;
        return (
          <Card key={p.id} role="button" tabIndex={0} data-testid="pasta-ponto"
            className="glass cursor-pointer transition-shadow hover:shadow-lg"
            onClick={() => onAbrirPonto(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') onAbrirPonto(p.id); }}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="relative flex-shrink-0">
                {p.foto
                  ? <img src={p.foto} alt="" className="h-16 w-16 rounded-xl object-cover" />
                  : <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10"><Folder className="h-8 w-8 text-primary" /></span>}
                <span className="absolute -bottom-1 -right-1 rounded-md bg-primary p-1"><Folder className="h-3.5 w-3.5 text-primary-foreground" /></span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.nome}</p>
                {p.local && <p className="truncate text-xs text-muted-foreground">{p.local}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.telas.length} tela{p.telas.length === 1 ? '' : 's'} · {online} online{semGrade ? ` · ${semGrade} sem grade` : ''}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

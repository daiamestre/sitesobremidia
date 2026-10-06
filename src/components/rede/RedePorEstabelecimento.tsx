import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronDown, Loader2, Network, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { tempoDesde } from '@/lib/dashboardResumo';
import { MapaDaRede } from './MapaDaRede';

/**
 * F-148 — Painel da rede: telas agrupadas por estabelecimento, com online/offline, mídias, zonas e último sinal.
 * Lê fn_rede_por_estabelecimento (as mesmas telas que o usuário já enxerga) e atualiza sozinho a cada minuto.
 */
interface TelaDaRede { id: string; nome: string; online: boolean; midias: number; zonas: number; ultimo_sinal: string | null; sem_playlist: boolean }
interface Estabelecimento { id: string | null; nome: string; cidade: string | null; estado: string | null; telas: number; online: number; offline: number; midias: number; zonas: number; ultimo_sinal: string | null; lista: TelaDaRede[] }
interface Rede { totais: { telas: number; online: number; offline: number; midias: number; zonas: number }; estabelecimentos: Estabelecimento[] }

export function resumoDoEstabelecimento(e: Pick<Estabelecimento, 'telas' | 'online' | 'offline'>): string {
  return `${e.telas} ${e.telas === 1 ? 'tela' : 'telas'} · ${e.online} online · ${e.offline} offline`;
}

export function RedePorEstabelecimento() {
  const [rede, setRede] = useState<Rede | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = async () => {
    const { data } = await supabase.rpc('fn_rede_por_estabelecimento' as never, { p_offline_min: 10 } as never);
    if (data) setRede(data as unknown as Rede);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
  }, []);

  if (carregando) return <Card className="glass"><CardContent className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  if (!rede || rede.totais.telas === 0) return null;
  const t = rede.totais;

  return (
    <Card className="glass" data-testid="rede-por-estabelecimento">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2"><Network className="h-5 w-5 text-primary" /> Rede por estabelecimento</span>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => { setCarregando(true); carregar(); }}><RefreshCw className="h-3.5 w-3.5" /> Atualizar</Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="rede-totais">
          {([['Telas', t.telas, ''], ['Online', t.online, 'text-emerald-400'], ['Offline', t.offline, t.offline ? 'text-rose-400' : ''], ['Mídias', t.midias, ''], ['Zonas', t.zonas, '']] as const).map(([rotulo, valor, cor]) => (
            <div key={rotulo} className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground">{rotulo}</p>
              <p className={`text-2xl font-bold ${cor}`}>{valor}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <ul className="space-y-2">
            {rede.estabelecimentos.map((e) => {
              const chave = e.id ?? 'sem';
              const expandido = aberto === chave;
              return (
                <li key={chave} className="overflow-hidden rounded-xl border border-border/60 bg-card/60" data-testid="estabelecimento">
                  <button type="button" className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/30" onClick={() => setAberto(expandido ? null : chave)} aria-expanded={expandido}>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${e.offline === 0 ? 'bg-emerald-400' : e.online === 0 ? 'bg-rose-500' : 'bg-amber-400'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate font-semibold"><Building2 className="h-4 w-4 shrink-0 text-muted-foreground" /> {e.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {resumoDoEstabelecimento(e)} · {e.midias} mídias · {e.zonas} zonas{e.cidade ? ` · ${e.cidade}${e.estado ? `/${e.estado}` : ''}` : ''}
                      </span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expandido ? 'rotate-180' : ''}`} />
                  </button>
                  {expandido && (
                    <ul className="divide-y divide-border/40 border-t border-border/60 bg-background/40">
                      {e.lista.map((tela) => (
                        <li key={tela.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                          <Link to={`/dashboard/screens/${tela.id}`} className="flex min-w-0 items-center gap-2 hover:text-primary">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${tela.online ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                            <span className="truncate">{tela.nome}</span>
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {tela.online ? 'Online' : 'Offline'} · {tela.sem_playlist ? 'sem playlist' : `${tela.midias} mídias`} · {tela.zonas ? `${tela.zonas} zonas` : 'tela cheia'}
                            {' · '}{tela.ultimo_sinal ? `sinal ${tempoDesde(tela.ultimo_sinal)}` : 'nunca deu sinal'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {/* F-150: mapa automático (cadastro de anunciantes, gestores e pontos parceiros), com aproximação */}
          <div>
            <p className="mb-2 text-sm font-semibold">Onde a rede está</p>
            <MapaDaRede />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

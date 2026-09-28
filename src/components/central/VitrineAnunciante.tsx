import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { MapPin, Megaphone, PlayCircle, Rocket, TrendingUp, Wifi } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { EmptyLine, SummaryCard } from '@/components/central/SummaryCard';
import { SemPermissaoError } from '@/lib/dashboardResumo';
import { cn } from '@/lib/utils';

/**
 * Primeira vista do Portal do Anunciante (F-101): onde o anúncio passa, quantas
 * vezes passou em cada ponto parceiro e as campanhas rodando com seus pontos.
 * Fonte única: RPC fn_portal_anunciante_vitrine (só o cliente do próprio usuário).
 */
export interface VitrinePonto {
  chave: string;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  categoria: string | null;
  foto_url: string | null;
  origens: string[];
  telas: number;
  telas_online: number;
  exibicoes_hoje: number;
  exibicoes_30d: number;
  ultima_exibicao: string | null;
}

export interface VitrineCampanha {
  id: string;
  titulo: string;
  status: string;
  inicio: string;
  fim: string;
  no_ar: boolean;
  total_telas: number | null;
  pontos: string[];
  exibicoes_30d: number;
}

export interface VitrineAnuncianteDados {
  status: 'OK';
  exibicoes: { hoje: number; ultimos_7_dias: number; ultimos_30_dias: number };
  pontos: VitrinePonto[];
  campanhas: VitrineCampanha[];
}

export async function fetchVitrineAnunciante(): Promise<VitrineAnuncianteDados> {
  const { data, error } = await supabase.rpc('fn_portal_anunciante_vitrine' as never);
  if (error) throw error;
  const r = data as unknown as VitrineAnuncianteDados | { status: 'SEM_PERMISSAO' };
  if (!r || r.status !== 'OK') throw new SemPermissaoError();
  return r as VitrineAnuncianteDados;
}

const num = (n: number) => n.toLocaleString('pt-BR');

function Numero({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className={cn('rounded-xl border border-border/50 bg-muted/20 px-3 py-2', destaque && 'border-primary/40 bg-primary/10')}>
      <p className="text-lg font-bold tabular-nums text-foreground">{num(valor)}</p>
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
    </div>
  );
}

export function VitrineAnunciante() {
  const q = useQuery({
    queryKey: ['vitrine-anunciante'],
    queryFn: fetchVitrineAnunciante,
    refetchInterval: 60_000,
    retry: (n, e) => !(e instanceof SemPermissaoError) && n < 2,
  });
  if (q.isError) return null;
  const v = q.data;

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="vitrine-anunciante">
      <SummaryCard title="Onde seu anúncio passa" icon={MapPin} to="/portal/pontos" loading={q.isLoading} testId="anu-card-pontos"
        headline={v ? num(v.exibicoes.ultimos_30_dias) : undefined}
        caption={v ? 'exibições do seu anúncio nos últimos 30 dias' : undefined}>
        {v && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Numero valor={v.exibicoes.hoje} rotulo="hoje" destaque />
              <Numero valor={v.exibicoes.ultimos_7_dias} rotulo="7 dias" />
              <Numero valor={v.pontos.length} rotulo={v.pontos.length === 1 ? 'ponto parceiro' : 'pontos parceiros'} />
            </div>
            {v.pontos.length ? (
              <ul className="divide-y divide-border/40" data-testid="anu-lista-pontos">
                {v.pontos.slice(0, 6).map((p) => (
                  <li key={p.chave} className="flex items-center gap-3 py-2 min-w-0">
                    {p.foto_url ? (
                      <img src={p.foto_url} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <MapPin className="h-4 w-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{p.nome}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Wifi className={cn('h-3 w-3 flex-shrink-0', p.telas_online > 0 ? 'text-emerald-400' : 'text-muted-foreground')} />
                        {p.telas_online}/{p.telas} {p.telas === 1 ? 'tela online' : 'telas online'}
                        {p.cidade ? ` · ${p.bairro ? `${p.bairro}, ` : ''}${p.cidade}` : ''}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-right">
                      <span className="block text-sm font-bold tabular-nums text-foreground">{num(p.exibicoes_30d)}</span>
                      <span className="block text-[11px] text-muted-foreground">{num(p.exibicoes_hoje)} hoje</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-3">
                <EmptyLine>Seu anúncio ainda não está em nenhum ponto parceiro.</EmptyLine>
                <Link to="/portal/expansao"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  <TrendingUp className="h-4 w-4" /> Anunciar em pontos parceiros
                </Link>
              </div>
            )}
          </div>
        )}
      </SummaryCard>

      <SummaryCard title="Suas campanhas" icon={Megaphone} to="/portal/campanhas" loading={q.isLoading} testId="anu-card-campanhas"
        headline={v ? num(v.campanhas.filter((c) => c.no_ar).length) : undefined}
        caption={v ? 'campanhas no ar agora' : undefined}>
        {v && (v.campanhas.length ? (
          <ul className="divide-y divide-border/40" data-testid="anu-lista-campanhas">
            {v.campanhas.slice(0, 4).map((c) => (
              <li key={c.id} className="py-2.5 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{c.titulo}</span>
                    <span className="block text-xs text-muted-foreground">
                      {format(new Date(c.inicio), 'dd/MM/yyyy')} a {format(new Date(c.fim), 'dd/MM/yyyy')}
                      {` · `}<PlayCircle className="inline h-3 w-3 -mt-0.5" /> {num(c.exibicoes_30d)} exibições
                    </span>
                  </span>
                  <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    c.no_ar ? 'bg-emerald-500/15 text-emerald-400' : new Date(c.inicio) > new Date() ? 'bg-amber-500/15 text-amber-400' : 'bg-muted text-muted-foreground')}>
                    {c.no_ar ? 'No ar' : new Date(c.inicio) > new Date() ? 'Em breve' : 'Encerrada'}
                  </span>
                </div>
                {c.pontos.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.pontos.map((nome) => (
                      <span key={nome} className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        <MapPin className="h-3 w-3 flex-shrink-0" /> {nome}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            <EmptyLine>Você ainda não tem campanha rodando.</EmptyLine>
            <Link to="/portal/nova-campanha"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Rocket className="h-4 w-4" /> Criar campanha
            </Link>
          </div>
        ))}
      </SummaryCard>
    </div>
  );
}

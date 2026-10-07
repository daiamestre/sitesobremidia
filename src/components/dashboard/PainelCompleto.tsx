import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, HardDrive, Loader2, Minus, Monitor, Plus, PlayCircle, RefreshCw, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { tempoDesde } from '@/lib/dashboardResumo';
import { ALTURA_DO_MAPA, APROXIMACAO_MAXIMA, LARGURA_DO_MAPA, caminhoDoEstado, caixaDoEstado, projetar, type Municipios } from '@/lib/redePresenca';
import {
  CARTOES_DO_PAINEL, COR_SYNC, ESTADOS_SYNC, ROTULO_SYNC, afastarPontos, alternarCartao, arcosDaRosca, diaDaSemana, formatarMb, formatarTamanho,
  lerCartoesOcultos, localizarTelas, normalizarPainel, porcentagem, resumoDePresenca, salvarCartoesOcultos, tendencia, textoDaVariacao, variacaoPercentual,
  type CartaoDoPainel, type PainelCompleto as Painel, type TelaNoMapa,
} from '@/lib/painelCompleto';

/**
 * F-156 — Painel completo (imagens 2 e 4 do modelo de referência), em estilo próprio.
 * Lê fn_dashboard_completo (só leitura; cada perfil vê só as telas que já enxerga) e atualiza sozinho a cada minuto.
 */
interface EstadoGeo { uf: string; nome: string; lat: number; lon: number; aneis: number[][][] }
const armazenamento = () => { try { return window.localStorage; } catch { return null; } };

let geoEmCache: Promise<{ ufs: EstadoGeo[]; municipios: Municipios }> | null = null;
const carregarGeo = () => (geoEmCache ??= Promise.all([
  fetch('/geo/brasil-ufs.json').then((r) => r.json() as Promise<EstadoGeo[]>),
  fetch('/geo/brasil-municipios.json').then((r) => r.json() as Promise<Municipios>),
]).then(([ufs, municipios]) => ({ ufs, municipios })).catch((e) => { geoEmCache = null; throw e; }));

function Cartao({ id, titulo, icone, children, className = '' }: { id: CartaoDoPainel; titulo: string; icone?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={`glass ${className}`} data-testid={`cartao-${id}`}>
      <CardHeader className="p-2 pb-1 sm:p-4 sm:pb-2"><CardTitle className="flex items-center gap-1 text-[11px] font-semibold leading-tight text-muted-foreground sm:gap-2 sm:text-sm">{icone}{titulo}</CardTitle></CardHeader>
      <CardContent className="p-2 pt-0 sm:p-4 sm:pt-0">{children}</CardContent>
    </Card>
  );
}

function Rosca({ itens, centro, rotulo }: { itens: Array<{ chave: string; valor: number; cor: string }>; centro: string; rotulo: string }) {
  const arcos = arcosDaRosca(itens, 40);
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={rotulo} className="mx-auto h-24 w-24 -rotate-90 sm:h-36 sm:w-36" data-testid="rosca">
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth="14" />
      {total > 0 && arcos.map((a, i) => a.valor > 0 && (
        <circle key={a.chave} cx="50" cy="50" r="40" fill="none" stroke={itens[i].cor} strokeWidth="14" strokeDasharray={a.dasharray} strokeDashoffset={a.dashoffset} data-chave={a.chave}>
          <title>{`${itens[i].chave}: ${a.valor} (${a.pct}%)`}</title>
        </circle>
      ))}
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" transform="rotate(90 50 50)" className="fill-current text-[18px] font-bold">{centro}</text>
    </svg>
  );
}

/** Mapa do Brasil com um ponto por tela, na cor do estado de sincronização; aproximar com + / − / roda. */
function MapaDaSincronizacao({ painel }: { painel: Painel }) {
  const [geo, setGeo] = useState<{ ufs: EstadoGeo[]; municipios: Municipios } | null>(null);
  const [erro, setErro] = useState(false);
  const [escala, setEscala] = useState(1);
  const [centro, setCentro] = useState<[number, number]>([LARGURA_DO_MAPA / 2, ALTURA_DO_MAPA / 2]);
  const [larguraNaTela, setLarguraNaTela] = useState(600);
  const svg = useRef<SVGSVGElement>(null);
  const arrasto = useRef<{ x: number; y: number; centro: [number, number]; moveu: boolean } | null>(null);

  useEffect(() => { carregarGeo().then(setGeo).catch(() => setErro(true)); }, []);
  const pronto = !!geo;
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const medir = () => { const w = el.getBoundingClientRect().width; if (w > 0) setLarguraNaTela(w); };
    medir();
    let o: ResizeObserver | null = null;
    try { o = new ResizeObserver(medir); o.observe(el); } catch { o = null; }
    return () => o?.disconnect();
  }, [pronto]);

  const ajustar = useCallback((e: number, c: [number, number]) => {
    const esc = Math.min(Math.max(e, 1), APROXIMACAO_MAXIMA);
    const w = LARGURA_DO_MAPA / esc; const h = ALTURA_DO_MAPA / esc;
    setEscala(esc); setCentro([Math.min(Math.max(c[0], w / 2), LARGURA_DO_MAPA - w / 2), Math.min(Math.max(c[1], h / 2), ALTURA_DO_MAPA - h / 2)]);
  }, []);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const aoRolar = (e: WheelEvent) => { e.preventDefault(); ajustar(escala * (e.deltaY < 0 ? 1.25 : 0.8), centro); };
    el.addEventListener('wheel', aoRolar, { passive: false });
    return () => el.removeEventListener('wheel', aoRolar);
  }, [pronto, escala, centro, ajustar]);

  const formas = useMemo(() => (geo?.ufs ?? []).map((u) => ({ uf: u.uf, nome: u.nome, d: caminhoDoEstado(u.aneis), caixa: caixaDoEstado(u.aneis) })), [geo]);
  const { noMapa, semLocal } = useMemo(() => (geo ? localizarTelas(painel.telas_sync, geo.municipios) : { noMapa: [], semLocal: [] }), [geo, painel.telas_sync]);

  // posição de cada tela: cidade (se reconhecida) ou o centro do estado; telas no mesmo ponto ficam em espiral
  const pontos = useMemo(() => {
    const grupos = new Map<string, Array<{ t: TelaNoMapa; x: number; y: number }>>();
    for (const t of noMapa) {
      const caixa = formas.find((f) => f.uf === t.uf)?.caixa;
      const [x, y] = t.lat !== null && t.lon !== null ? projetar(t.lon, t.lat) : caixa ? [caixa.x + caixa.largura / 2, caixa.y + caixa.altura / 2] : [0, 0];
      const chave = `${x.toFixed(1)}|${y.toFixed(1)}`;
      grupos.set(chave, [...(grupos.get(chave) ?? []), { t, x, y }]);
    }
    return [...grupos.values()].flatMap((g) => { const d = afastarPontos(g.length); return g.map((p, i) => ({ ...p, dx: d[i][0], dy: d[i][1] })); });
  }, [noMapa, formas]);

  if (erro && !geo) return <p className="py-6 text-center text-sm text-muted-foreground">Não foi possível carregar o mapa agora.</p>;
  if (!geo) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const w = LARGURA_DO_MAPA / escala; const h = ALTURA_DO_MAPA / escala;
  const k = (LARGURA_DO_MAPA / Math.max(larguraNaTela, 1)) / escala; // unidades do desenho por pixel da tela
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-slate-950/50">
        <svg ref={svg} role="img" aria-label={`Mapa da sincronização: ${pontos.length} telas localizadas`} viewBox={`${centro[0] - w / 2} ${centro[1] - h / 2} ${w} ${h}`}
          className="block w-full cursor-grab select-none active:cursor-grabbing" style={{ aspectRatio: `${LARGURA_DO_MAPA} / ${ALTURA_DO_MAPA}`, maxHeight: '46dvh', touchAction: 'none' }} data-testid="mapa-sincronizacao"
          onPointerDown={(e) => { svg.current?.setPointerCapture?.(e.pointerId); arrasto.current = { x: e.clientX, y: e.clientY, centro, moveu: false }; }}
          onPointerMove={(e) => {
            const a = arrasto.current; const r = svg.current?.getBoundingClientRect();
            if (!a || !r) return;
            const dx = e.clientX - a.x; const dy = e.clientY - a.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) a.moveu = true;
            ajustar(escala, [a.centro[0] - (dx / r.width) * w, a.centro[1] - (dy / r.height) * h]);
          }}
          onPointerUp={(e) => { svg.current?.releasePointerCapture?.(e.pointerId); arrasto.current = null; }} onPointerCancel={() => { arrasto.current = null; }}>
          {formas.map((f) => <path key={f.uf} d={f.d} vectorEffect="non-scaling-stroke" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.22)" strokeWidth={1}><title>{f.nome}</title></path>)}
          {pontos.map(({ t, x, y, dx, dy }) => (
            <g key={t.id} transform={`translate(${x} ${y}) scale(${k})`} data-testid="ponto-tela" data-sync={t.sync}>
              <circle cx={dx} cy={dy} r={5.5} fill={COR_SYNC[t.sync]} stroke="#020617" strokeWidth={1.5}>
                <title>{`${t.nome}${t.cidade ? ` — ${t.cidade}${t.uf ? `/${t.uf}` : ''}` : ''}\n${ROTULO_SYNC[t.sync]}${t.pendentes ? ` · ${t.pendentes} de ${t.midias} mídias pendentes` : ''}`}</title>
              </circle>
            </g>
          ))}
        </svg>
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button type="button" aria-label="Aproximar" onClick={() => ajustar(escala * 1.6, centro)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/90 text-white ring-1 ring-white/20 hover:bg-slate-800" data-testid="sync-aproximar"><Plus className="h-4 w-4" /></button>
          <button type="button" aria-label="Afastar" onClick={() => ajustar(escala / 1.6, centro)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/90 text-white ring-1 ring-white/20 hover:bg-slate-800"><Minus className="h-4 w-4" /></button>
          <button type="button" aria-label="Ver o Brasil inteiro" onClick={() => ajustar(1, [LARGURA_DO_MAPA / 2, ALTURA_DO_MAPA / 2])} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/90 text-white ring-1 ring-white/20 hover:bg-slate-800"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] sm:gap-x-4 sm:text-xs" data-testid="legenda-sincronizacao">
        {ESTADOS_SYNC.map((s) => (
          <span key={s} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_SYNC[s] }} />{ROTULO_SYNC[s]} <b>{painel.sincronizacao[s]}</b></span>
        ))}
        {semLocal.length > 0 && <span className="text-muted-foreground">· {semLocal.length} {semLocal.length === 1 ? 'tela sem' : 'telas sem'} estado cadastrado (fora do mapa)</span>}
      </div>
    </div>
  );
}

export function PainelCompleto() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [ocultos, setOcultos] = useState<CartaoDoPainel[]>(() => lerCartoesOcultos(armazenamento()));
  const [editando, setEditando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_dashboard_completo' as never, { p_offline_min: 10 } as never);
    if (error) setFalhou(true); else { setPainel(normalizarPainel(data)); setFalhou(false); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); const t = setInterval(carregar, 60_000); return () => clearInterval(t); }, [carregar]);

  const alternar = (id: CartaoDoPainel) => setOcultos((atual) => { const novo = alternarCartao(atual, id); salvarCartoesOcultos(armazenamento(), novo); return novo; });
  const ver = (id: CartaoDoPainel) => !ocultos.includes(id);

  if (carregando) return <Card className="glass"><CardContent className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  if (falhou && !painel) return null; // o resto do painel continua funcionando
  if (!painel || painel.telas.total === 0) return null;

  const t = painel.telas;
  const pctOnline = porcentagem(t.online, t.total);
  const d = painel.disco;
  const pctDisco = porcentagem(d.aparelhos_usado_mb, d.aparelhos_total_mb);
  const varExib = variacaoPercentual(painel.exibicoes.atual, painel.exibicoes.anterior);
  const resumo = resumoDePresenca(painel.presenca);
  const maxDia = Math.max(1, ...painel.presenca.dias.map((x) => x.ligadas));
  const sincTotal = ESTADOS_SYNC.reduce((s, e) => s + painel.sincronizacao[e], 0);
  const listaSync = painel.telas_sync.filter((x) => x.sync !== 'sem_info').slice(0, 8);

  return (
    <section className="space-y-2 sm:space-y-4" data-testid="painel-completo" aria-label="Painel da rede">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg"><Monitor className="h-5 w-5 text-primary" /> Painel da rede</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => { setCarregando(true); carregar(); }}><RefreshCw className="h-3.5 w-3.5" /> Atualizar</Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setEditando((v) => !v)} aria-expanded={editando} data-testid="editar-painel"><SlidersHorizontal className="h-3.5 w-3.5" /> Editar painel</Button>
          <Button size="sm" className="h-8 gap-1 text-xs" asChild data-testid="ativar-tela"><Link to="/dashboard/screens"><PlayCircle className="h-3.5 w-3.5" /> Ativar uma tela</Link></Button>
        </div>
      </div>

      {editando && (
        <Card className="glass" data-testid="editar-painel-opcoes">
          <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
            {CARTOES_DO_PAINEL.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-sm">
                <input type="checkbox" checked={ver(c.id)} onChange={() => alternar(c.id)} data-testid={`mostrar-${c.id}`} />{c.rotulo}
              </label>
            ))}
            <p className="col-span-full text-[11px] text-muted-foreground">A escolha vale só neste navegador.</p>
          </CardContent>
        </Card>
      )}

      {(ver('telas') || ver('disco') || ver('exibicoes')) && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {ver('telas') && (
            <Cartao id="telas" titulo="Telas online" icone={<Monitor className="h-4 w-4" />}>
              <p className="text-xl font-bold sm:text-3xl"><span className="text-emerald-400" data-testid="kpi-online">{t.online}</span><span className="text-sm text-muted-foreground sm:text-xl">/{t.total}</span> <span className="text-xs font-semibold text-muted-foreground sm:text-base">{pctOnline}%</span></p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pctOnline} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-emerald-400" style={{ width: `${pctOnline}%` }} /></div>
            </Cartao>
          )}
          {ver('disco') && (
            <Cartao id="disco" titulo="Espaço de disco" icone={<HardDrive className="h-4 w-4" />}>
              {d.aparelhos > 0 ? (
                <>
                  <p className="text-xl font-bold sm:text-3xl" data-testid="kpi-disco">{pctDisco}% <span className="hidden text-base font-semibold text-muted-foreground sm:inline">usado nos aparelhos</span></p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${pctDisco >= 90 ? 'bg-rose-500' : pctDisco >= 75 ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${pctDisco}%` }} /></div>
                  <p className="mt-1 text-[10px] leading-tight text-muted-foreground sm:text-xs">{formatarMb(d.aparelhos_usado_mb)} de {formatarMb(d.aparelhos_total_mb)} · {d.aparelhos} {d.aparelhos === 1 ? 'aparelho informou' : 'aparelhos informaram'}</p>
                </>
              ) : <p className="text-[10px] text-muted-foreground sm:text-sm">Os aparelhos ainda não informaram o espaço de disco.</p>}
              <p className="mt-1 flex items-center gap-1 text-[10px] leading-tight text-muted-foreground sm:text-xs"><Cloud className="hidden h-3 w-3 shrink-0 sm:block" /> Mídias enviadas: {formatarTamanho(d.nuvem_bytes)} em {d.nuvem_arquivos} {d.nuvem_arquivos === 1 ? 'arquivo' : 'arquivos'}</p>
            </Cartao>
          )}
          {ver('exibicoes') && (
            <Cartao id="exibicoes" titulo="Exibições em 30 dias" icone={<PlayCircle className="h-4 w-4" />}>
              <p className="text-xl font-bold sm:text-3xl" data-testid="kpi-exibicoes">{painel.exibicoes.atual.toLocaleString('pt-BR')}</p>
              <p className={`text-[11px] font-semibold leading-tight sm:text-sm ${tendencia(varExib) === 'sobe' ? 'text-emerald-400' : tendencia(varExib) === 'desce' ? 'text-rose-400' : 'text-muted-foreground'}`} data-testid="kpi-variacao">{textoDaVariacao(varExib)}{varExib !== null && <span className="hidden font-normal text-muted-foreground sm:inline"> contra os 30 dias anteriores</span>}</p>
            </Cartao>
          )}
        </div>
      )}

      {(ver('mapa') || ver('sincronizacao')) && (
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2 sm:gap-3">
          {ver('mapa') && <Cartao id="mapa" titulo="Mapa da sincronização"><MapaDaSincronizacao painel={painel} /></Cartao>}
          {ver('sincronizacao') && (
            <Cartao id="sincronizacao" titulo="Sincronização de mídia">
              <Rosca itens={ESTADOS_SYNC.map((s) => ({ chave: ROTULO_SYNC[s], valor: painel.sincronizacao[s], cor: COR_SYNC[s] }))} centro={`${porcentagem(painel.sincronizacao.atualizado, sincTotal)}%`} rotulo="Telas por estado de sincronização" />
              <ul className="mt-2 grid grid-cols-1 gap-0.5 text-[10px] sm:grid-cols-2 sm:gap-1 sm:text-xs" data-testid="sincronizacao-contagem">
                {ESTADOS_SYNC.map((s) => <li key={s} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_SYNC[s] }} />{ROTULO_SYNC[s]} <b>{painel.sincronizacao[s]}</b></li>)}
              </ul>
              {painel.sincronizacao.reportando === 0 && <p className="mt-2 text-[10px] leading-tight text-muted-foreground sm:text-[11px]">Nenhum aparelho informou a sincronização ainda: elas aparecem aqui assim que o Player novo estiver instalado.</p>}
              {listaSync.length > 0 && (
                <ul className="mt-2 hidden space-y-1 text-xs sm:block" data-testid="sincronizacao-lista">
                  {listaSync.map((x) => <li key={x.id} className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COR_SYNC[x.sync] }} /><span className="truncate">{x.nome}</span></span><span className="shrink-0 text-muted-foreground">{tempoDesde(x.ultimo_sync)}</span></li>)}
                </ul>
              )}
            </Cartao>
          )}
        </div>
      )}

      {(ver('ligadas') || ver('status') || ver('desatualizado')) && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {ver('ligadas') && (
            <Cartao id="ligadas" titulo="Telas ligadas — últimos 7 dias" >
              <div className="flex h-24 items-end gap-0.5 sm:h-36 sm:gap-2" data-testid="barras-ligadas" role="img" aria-label="Telas com sinal em cada um dos últimos 7 dias">
                {painel.presenca.dias.map((x) => (
                  <div key={x.dia} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${diaDaSemana(x.dia)} ${x.dia.slice(8)}/${x.dia.slice(5, 7)}: ${x.ligadas} ${x.ligadas === 1 ? 'tela' : 'telas'} com sinal, ${x.exibiram} exibiram`}>
                    <span className="text-[9px] text-muted-foreground sm:text-[10px]">{x.ligadas}</span>
                    <div className="flex w-full flex-1 flex-col justify-end overflow-hidden rounded-t">
                      <div style={{ height: `${((x.ligadas - x.exibiram) / maxDia) * 100}%`, backgroundColor: '#38bdf8', marginBottom: x.ligadas - x.exibiram > 0 && x.exibiram > 0 ? 2 : 0 }} />
                      <div style={{ height: `${(x.exibiram / maxDia) * 100}%`, backgroundColor: '#22c55e' }} />
                    </div>
                    <span className="text-[9px] uppercase text-muted-foreground sm:text-[10px]"><span className="lg:hidden">{diaDaSemana(x.dia).charAt(0)}</span><span className="hidden lg:inline">{diaDaSemana(x.dia)}</span></span>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 text-[9px] leading-tight text-muted-foreground sm:mt-2 sm:gap-x-3 sm:text-[11px]"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#22c55e]" />Exibiram</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#38bdf8]" />Só deram sinal</span></div>
              <dl className="mt-1 grid grid-cols-3 gap-1 text-center sm:mt-2 sm:gap-2" data-testid="resumo-ligadas">
                <div><dt className="text-[8px] uppercase leading-tight text-muted-foreground sm:text-[10px]"><span className="sm:hidden">Média</span><span className="hidden sm:inline">Média diária</span></dt><dd className="text-sm font-bold sm:text-lg">{String(resumo.media).replace('.', ',')}</dd></div>
                <div><dt className="text-[8px] uppercase leading-tight text-muted-foreground sm:text-[10px]">Pico</dt><dd className="text-sm font-bold sm:text-lg">{resumo.pico}</dd></div>
                <div><dt className="text-[8px] uppercase leading-tight text-muted-foreground sm:text-[10px]"><span className="sm:hidden">Sem. ant.</span><span className="hidden sm:inline">Semana anterior</span></dt><dd className={`whitespace-nowrap text-xs font-bold sm:text-lg ${tendencia(resumo.semanaAnterior) === 'sobe' ? 'text-emerald-400' : tendencia(resumo.semanaAnterior) === 'desce' ? 'text-rose-400' : ''}`}>{resumo.semanaAnterior === null ? '—' : `${resumo.semanaAnterior > 0 ? '+' : ''}${resumo.semanaAnterior}%`}</dd></div>
              </dl>
            </Cartao>
          )}
          {ver('status') && (
            <Cartao id="status" titulo="Status das telas">
              <Rosca itens={[{ chave: 'Online', valor: t.online, cor: '#22c55e' }, { chave: 'Hoje', valor: t.hoje, cor: '#f59e0b' }, { chave: 'Offline', valor: t.offline, cor: '#f43f5e' }]} centro={String(t.total)} rotulo="Telas por status" />
              <ul className="mt-1 grid grid-cols-3 gap-0.5 text-center text-[9px] sm:mt-2 sm:gap-1 sm:text-xs" data-testid="status-contagem">
                <li><span className="block text-sm font-bold text-emerald-400 sm:text-lg">{t.online}</span>Online</li>
                <li title="Deram sinal hoje, mas não nos últimos minutos"><span className="block text-sm font-bold text-amber-400 sm:text-lg">{t.hoje}</span>Hoje</li>
                <li title="Sem sinal hoje"><span className="block text-sm font-bold text-rose-400 sm:text-lg">{t.offline}</span>Offline</li>
              </ul>
            </Cartao>
          )}
          {ver('desatualizado') && (
            <Cartao id="desatualizado" titulo="Conteúdo desatualizado">
              {painel.desatualizados.length === 0 ? (
                <p className="py-3 text-center text-[10px] leading-tight text-muted-foreground sm:py-6 sm:text-sm" data-testid="desatualizado-vazio">{painel.sincronizacao.reportando === 0 ? 'Ainda sem informação dos aparelhos.' : 'Nenhuma tela com mídia pendente.'}</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto pr-0.5 sm:max-h-56 sm:space-y-1.5 sm:pr-1" data-testid="desatualizado-lista">
                  {painel.desatualizados.map((x) => (
                    <li key={x.id}>
                      <Link to={`/dashboard/screens/${x.id}`} className="flex items-center justify-between gap-1 rounded-md border border-border/60 px-1.5 py-1 text-[11px] hover:bg-muted/30 sm:gap-2 sm:px-2 sm:py-1.5 sm:text-sm">
                        <span className="min-w-0"><span className="block truncate font-medium">{x.nome}</span><span className="hidden text-[11px] text-muted-foreground sm:block">{ROTULO_SYNC[x.sync]} · {tempoDesde(x.ultimo_sync)}</span></span>
                        <span className="shrink-0 font-mono text-sm font-bold" style={{ color: COR_SYNC[x.sync] }}>{x.pendentes}/{x.midias}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          )}
        </div>
      )}
    </section>
  );
}

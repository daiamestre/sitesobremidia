import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as EventoDePonteiro } from 'react';
import { Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  ALTURA_DO_MAPA, APROXIMACAO_DAS_CIDADES, APROXIMACAO_MAXIMA, LARGURA_DO_MAPA, caixaDoEstado, caminhoDoEstado, detalheDaContagem,
  montarPresenca, projetar, type LinhaDePresenca, type Municipios, type PresencaNoMapa,
} from '@/lib/redePresenca';

/**
 * F-150 — Mapa da rede SOBRE MÍDIA, automático: os números saem do cadastro de anunciantes, gestores de mídias e pontos
 * parceiros (ninguém marca nada à mão). De longe mostra o total por estado; ao aproximar, as cidades com a quantidade.
 * Desenho próprio (malha dos estados do IBGE), sem serviço de mapas externo.
 */
interface EstadoGeo { uf: string; nome: string; lat: number; lon: number; aneis: number[][][] }
interface Vista { escala: number; x: number; y: number } // x,y = canto superior esquerdo visível, em unidades do desenho

const VISTA_INICIAL: Vista = { escala: 1, x: 0, y: 0 };
const limitar = (v: Vista): Vista => {
  const escala = Math.min(Math.max(v.escala, 1), APROXIMACAO_MAXIMA);
  const w = LARGURA_DO_MAPA / escala; const h = ALTURA_DO_MAPA / escala;
  return { escala, x: Math.min(Math.max(v.x, 0), LARGURA_DO_MAPA - w), y: Math.min(Math.max(v.y, 0), ALTURA_DO_MAPA - h) };
};

let geoEmCache: Promise<{ ufs: EstadoGeo[]; municipios: Municipios }> | null = null;
const carregarGeo = () => (geoEmCache ??= Promise.all([
  fetch('/geo/brasil-ufs.json').then((r) => r.json() as Promise<EstadoGeo[]>),
  fetch('/geo/brasil-municipios.json').then((r) => r.json() as Promise<Municipios>),
]).then(([ufs, municipios]) => ({ ufs, municipios })).catch((e) => { geoEmCache = null; throw e; }));

export function MapaDaRede({ linhas, className = '' }: { linhas?: LinhaDePresenca[]; className?: string }) {
  const [geo, setGeo] = useState<{ ufs: EstadoGeo[]; municipios: Municipios } | null>(null);
  const [dados, setDados] = useState<LinhaDePresenca[] | null>(linhas ?? null);
  const [erro, setErro] = useState(false);
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  const [ufAberta, setUfAberta] = useState<string | null>(null);
  const [larguraNaTela, setLarguraNaTela] = useState(600); // largura real do mapa, para os marcadores terem tamanho fixo na tela
  const svg = useRef<SVGSVGElement>(null);
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const arrasto = useRef<{ x: number; y: number; vista: Vista; moveu: boolean; distancia: number | null } | null>(null);

  useEffect(() => { carregarGeo().then(setGeo).catch(() => setErro(true)); }, []);
  useEffect(() => {
    if (linhas) { setDados(linhas); return; }
    let vivo = true;
    const buscar = async () => {
      const { data, error } = await supabase.rpc('fn_rede_presenca' as never);
      if (vivo && !error && Array.isArray(data)) setDados(data as unknown as LinhaDePresenca[]);
      else if (vivo && error) setErro(true);
    };
    buscar();
    const t = setInterval(buscar, 5 * 60_000); // cadastro novo aparece sozinho
    return () => { vivo = false; clearInterval(t); };
  }, [linhas]);

  const presenca: PresencaNoMapa | null = useMemo(() => (geo && dados ? montarPresenca(dados, geo.municipios) : null), [geo, dados]);
  const porUf = useMemo(() => new Map((presenca?.estados ?? []).map((e) => [e.uf, e])), [presenca]);
  const maior = Math.max(1, ...(presenca?.estados ?? []).map((e) => e.total));
  const formas = useMemo(() => (geo?.ufs ?? []).map((u) => ({ ...u, d: caminhoDoEstado(u.aneis), caixa: caixaDoEstado(u.aneis), centro: projetar(u.lon, u.lat) })), [geo]);

  // ---------------------------------------------------------------- aproximar e mover
  const pontoDoDesenho = (clientX: number, clientY: number, v: Vista) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: v.x + ((clientX - r.left) / r.width) * (LARGURA_DO_MAPA / v.escala), y: v.y + ((clientY - r.top) / r.height) * (ALTURA_DO_MAPA / v.escala) };
  };
  const aproximarEm = useCallback((fator: number, clientX?: number, clientY?: number) => {
    setVista((v) => {
      const r = svg.current?.getBoundingClientRect();
      const cx = clientX ?? (r ? r.left + r.width / 2 : 0); const cy = clientY ?? (r ? r.top + r.height / 2 : 0);
      const alvo = r ? pontoDoDesenho(cx, cy, v) : { x: LARGURA_DO_MAPA / 2, y: ALTURA_DO_MAPA / 2 };
      const escala = Math.min(Math.max(v.escala * fator, 1), APROXIMACAO_MAXIMA);
      const fx = r ? (cx - r.left) / r.width : 0.5; const fy = r ? (cy - r.top) / r.height : 0.5;
      return limitar({ escala, x: alvo.x - fx * (LARGURA_DO_MAPA / escala), y: alvo.y - fy * (ALTURA_DO_MAPA / escala) });
    });
  }, []);

  const irParaEstado = (uf: string) => {
    const f = formas.find((x) => x.uf === uf);
    if (!f) return;
    setUfAberta(uf);
    const margem = 1.25;
    const escala = Math.min(Math.max(Math.min(LARGURA_DO_MAPA / (f.caixa.largura * margem), ALTURA_DO_MAPA / (f.caixa.altura * margem)), APROXIMACAO_DAS_CIDADES), APROXIMACAO_MAXIMA);
    const w = LARGURA_DO_MAPA / escala; const h = ALTURA_DO_MAPA / escala;
    setVista(limitar({ escala, x: f.caixa.x + f.caixa.largura / 2 - w / 2, y: f.caixa.y + f.caixa.altura / 2 - h / 2 }));
  };

  // roda do mouse: aproxima o mapa em vez de rolar a página (precisa de ouvinte "não passivo")
  const pronto = !!geo && !!presenca;
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const aoRolar = (e: WheelEvent) => { e.preventDefault(); aproximarEm(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY); };
    el.addEventListener('wheel', aoRolar, { passive: false });
    return () => el.removeEventListener('wheel', aoRolar);
  }, [pronto, aproximarEm]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const medir = () => { const w = el.getBoundingClientRect().width; if (w > 0) setLarguraNaTela(w); };
    medir();
    let observador: ResizeObserver | null = null;
    try { observador = new ResizeObserver(medir); observador.observe(el); } catch { observador = null; }
    return () => observador?.disconnect();
  }, [pronto]);
  const aoPressionar = (e: EventoDePonteiro) => {
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.current?.setPointerCapture?.(e.pointerId);
    const pts = [...ponteiros.current.values()];
    arrasto.current = { x: e.clientX, y: e.clientY, vista, moveu: false, distancia: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : null };
  };
  const aoMover = (e: EventoDePonteiro) => {
    if (!ponteiros.current.has(e.pointerId) || !arrasto.current) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ponteiros.current.values()];
    const a = arrasto.current;
    if (pts.length === 2 && a.distancia) { // dois dedos: aproxima/afasta
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (Math.abs(d - a.distancia) > 4) { aproximarEm(d / a.distancia, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2); a.distancia = d; a.moveu = true; }
      return;
    }
    const r = svg.current!.getBoundingClientRect();
    const dx = e.clientX - a.x; const dy = e.clientY - a.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) a.moveu = true;
    setVista(limitar({ escala: a.vista.escala, x: a.vista.x - (dx / r.width) * (LARGURA_DO_MAPA / a.vista.escala), y: a.vista.y - (dy / r.height) * (ALTURA_DO_MAPA / a.vista.escala) }));
  };
  const aoSoltar = (e: EventoDePonteiro) => {
    ponteiros.current.delete(e.pointerId);
    svg.current?.releasePointerCapture?.(e.pointerId);
    if (ponteiros.current.size === 0) setTimeout(() => { arrasto.current = null; }, 0);
  };
  const foiArrasto = () => arrasto.current?.moveu === true;

  if (erro && !geo) return <p className="py-6 text-center text-sm text-slate-400">Não foi possível carregar o mapa agora.</p>;
  if (!geo || !presenca) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  const mostrarCidades = vista.escala >= APROXIMACAO_DAS_CIDADES;
  // unidades do desenho por pixel da tela: textos e marcadores ficam do mesmo tamanho em qualquer aproximação e largura
  const k = (LARGURA_DO_MAPA / Math.max(larguraNaTela, 1)) / vista.escala;
  const aberta = ufAberta ? porUf.get(ufAberta) ?? null : null;
  const nomeDa = (uf: string) => geo.ufs.find((u) => u.uf === uf)?.nome ?? uf;

  return (
    <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] ${className}`} data-testid="mapa-da-rede">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
        <svg ref={svg} role="img" aria-label={`Mapa da rede: ${presenca.total.total} cadastros em ${presenca.cidades} cidades e ${presenca.estados.length} estados`}
          viewBox={`${vista.x} ${vista.y} ${LARGURA_DO_MAPA / vista.escala} ${ALTURA_DO_MAPA / vista.escala}`}
          className="block w-full cursor-grab select-none active:cursor-grabbing" style={{ aspectRatio: `${LARGURA_DO_MAPA} / ${ALTURA_DO_MAPA}`, maxHeight: '70dvh', touchAction: 'none' }}
          onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar} data-escala={vista.escala.toFixed(2)}>
          {formas.map((f) => {
            const e = porUf.get(f.uf);
            const forca = e ? 0.22 + 0.5 * (e.total / maior) : 0;
            return (
              <path key={f.uf} d={f.d} data-uf={f.uf} data-ativo={e ? 'sim' : 'nao'} vectorEffect="non-scaling-stroke"
                fill={e ? `hsl(var(--primary) / ${forca.toFixed(2)})` : 'rgba(255,255,255,0.04)'}
                stroke={ufAberta === f.uf ? '#34D399' : e ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.22)'} strokeWidth={ufAberta === f.uf ? 2 : 1}
                className={e ? 'cursor-pointer' : ''} onClick={() => { if (e && !foiArrasto()) irParaEstado(f.uf); }}>
                <title>{e ? `${f.nome}: ${e.total} — ${detalheDaContagem(e)}` : f.nome}</title>
              </path>
            );
          })}

          {/* de longe: total por estado */}
          {!mostrarCidades && presenca.estados.map((e) => {
            const f = formas.find((x) => x.uf === e.uf);
            if (!f) return null;
            return (
              <g key={e.uf} transform={`translate(${f.centro[0]} ${f.centro[1]}) scale(${k})`} className="cursor-pointer" data-testid="marcador-estado" data-uf={e.uf}
                onClick={() => { if (!foiArrasto()) irParaEstado(e.uf); }}>
                <circle r={22} fill="#0f172a" stroke="hsl(var(--primary))" strokeWidth={2.5} />
                <text textAnchor="middle" y={-2} fontSize={11} fontWeight={700} fill="#cbd5e1">{e.uf}</text>
                <text textAnchor="middle" y={12} fontSize={13} fontWeight={900} fill="#fff">{e.total}</text>
              </g>
            );
          })}

          {/* de perto: cidades com a quantidade */}
          {mostrarCidades && presenca.estados.flatMap((e) => e.cidades.map((c) => {
            const [x, y] = projetar(c.lon, c.lat);
            const raio = 9 + Math.min(10, Math.sqrt(c.total) * 2.2);
            return (
              <g key={`${c.uf}-${c.nome}`} transform={`translate(${x} ${y}) scale(${k})`} data-testid="marcador-cidade" data-cidade={c.nome} data-uf={c.uf}>
                <circle r={raio} fill="hsl(var(--primary))" fillOpacity={0.9} stroke="#fff" strokeWidth={1.5} />
                <text textAnchor="middle" y={4} fontSize={11} fontWeight={900} fill="#fff">{c.total}</text>
                <text textAnchor="middle" y={raio + 13} fontSize={11} fontWeight={700} fill="#e2e8f0" stroke="#020617" strokeWidth={3} paintOrder="stroke">{c.nome}</text>
                <title>{`${c.nome}/${c.uf}: ${c.total} — ${detalheDaContagem(c)}`}</title>
              </g>
            );
          }))}
        </svg>

        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button type="button" aria-label="Aproximar" title="Aproximar" onClick={() => aproximarEm(1.6)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/90 text-white ring-1 ring-white/20 hover:bg-slate-800" data-testid="mapa-aproximar"><Plus className="h-4 w-4" /></button>
          <button type="button" aria-label="Afastar" title="Afastar" onClick={() => aproximarEm(1 / 1.6)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/90 text-white ring-1 ring-white/20 hover:bg-slate-800" data-testid="mapa-afastar"><Minus className="h-4 w-4" /></button>
          <button type="button" aria-label="Ver o Brasil inteiro" title="Ver o Brasil inteiro" onClick={() => { setVista(VISTA_INICIAL); setUfAberta(null); }} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/90 text-white ring-1 ring-white/20 hover:bg-slate-800" data-testid="mapa-inteiro"><RotateCcw className="h-4 w-4" /></button>
        </div>
        <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-400">
          {mostrarCidades ? 'Cidades com a quantidade de cadastros' : 'Toque num estado ou aproxime para ver as cidades'}
        </p>
      </div>

      {/* lista: estados e, no estado escolhido, as cidades */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left" data-testid="mapa-lista">
        <p className="text-sm font-semibold text-white">
          {presenca.total.total} {presenca.total.total === 1 ? 'cadastro' : 'cadastros'} · {presenca.cidades} {presenca.cidades === 1 ? 'cidade' : 'cidades'} · {presenca.estados.length} {presenca.estados.length === 1 ? 'estado' : 'estados'}
        </p>
        <p className="mb-2 text-[11px] text-slate-400">{detalheDaContagem(presenca.total) || 'Nenhum cadastro com endereço ainda.'}</p>
        <ul className="max-h-[52dvh] space-y-1 overflow-y-auto pr-1">
          {presenca.estados.map((e) => (
            <li key={e.uf}>
              <button type="button" onClick={() => (ufAberta === e.uf ? (setUfAberta(null), setVista(VISTA_INICIAL)) : irParaEstado(e.uf))} aria-expanded={ufAberta === e.uf} data-testid="lista-estado" data-uf={e.uf}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm ${ufAberta === e.uf ? 'border-emerald-400 bg-emerald-500/10 text-white' : 'border-white/10 text-slate-200 hover:bg-white/5'}`}>
                <span className="truncate">{nomeDa(e.uf)}</span><span className="font-mono font-bold">{e.total}</span>
              </button>
              {aberta?.uf === e.uf && (
                <ul className="mt-1 space-y-0.5 pl-2" data-testid="lista-cidades">
                  {e.cidades.map((c) => (
                    <li key={c.nome} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs text-slate-300" title={detalheDaContagem(c)}>
                      <span className="truncate">{c.nome}</span><span className="font-mono font-semibold text-white">{c.total}</span>
                    </li>
                  ))}
                  {e.semCidade > 0 && <li className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-slate-500"><span>Cidade não identificada no cadastro</span><span className="font-mono">{e.semCidade}</span></li>}
                </ul>
              )}
            </li>
          ))}
          {presenca.estados.length === 0 && <li className="py-3 text-center text-xs text-slate-500">Ainda não há cadastros com cidade e estado.</li>}
        </ul>
      </div>
    </div>
  );
}

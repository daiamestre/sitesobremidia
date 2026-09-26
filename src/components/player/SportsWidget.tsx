import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { coresDoConfig, gradienteDe, rgba, type CoresWidget } from '@/lib/widgetPaletas';
import type { WidgetConfig } from '@/types/models';
import { buscarEsportes, centroDoJogo, dataCurta, jogosVisiveis, ROTULO_MODO, type DadosEsportes } from '@/lib/esportes';

const SEGUNDOS_POR_PAGINA = 8;

/**
 * Widget "Esportes" (identidade SOBRE MÍDIA, cores do widget). Só jogos confirmados pelo Sports Engine; horário de
 * Brasília; sem placar ao vivo. Mesma composição do Android Player (NativeWidgetEngine.buildSports).
 * `dados`: resolvidos pelo servidor (Player web); sem eles, o painel pede a prévia com a mesma regra.
 */
export function SportsWidget({ config, dados: dadosServidor, backgroundImage, cores, className }: {
  config: WidgetConfig; dados?: DadosEsportes | null; backgroundImage?: string | null; cores?: CoresWidget; className?: string;
}) {
  const c = cores ?? coresDoConfig(config);
  const [dados, setDados] = useState<DadosEsportes | null>(dadosServidor ?? null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>(dadosServidor ? 'ok' : 'carregando');
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(4);
  const raiz = useRef<HTMLDivElement>(null);
  const chave = JSON.stringify([config.competicoes, config.modo, config.limite, config.time]);

  useEffect(() => {
    if (dadosServidor) { setDados(dadosServidor); setEstado('ok'); return; }
    let cancelado = false;
    setEstado('carregando');
    const t = setTimeout(async () => {
      try {
        const d = await buscarEsportes(config);
        if (!cancelado) { setDados(d); setEstado('ok'); setPagina(0); }
      } catch {
        if (!cancelado) setEstado('erro');
      }
    }, 300);
    return () => { cancelado = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, dadosServidor]);

  // Vertical (9:16) cabe mais linhas por página.
  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Nunca derruba a tela por causa da medição: sem ResizeObserver utilizável, fica em 4 por página.
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(([e]) => { if (e) setPorPagina(e.contentRect.height > e.contentRect.width * 1.2 ? 6 : 4); });
      ro.observe(el);
    } catch {
      ro = null;
    }
    return () => ro?.disconnect();
  }, []);

  const jogos = useMemo(() => jogosVisiveis(dados), [dados]);
  const paginas = Math.max(1, Math.ceil(jogos.length / porPagina));
  useEffect(() => {
    if (paginas < 2) { setPagina(0); return; }
    const t = setInterval(() => setPagina((p) => (p + 1) % paginas), SEGUNDOS_POR_PAGINA * 1000);
    return () => clearInterval(t);
  }, [paginas]);

  const modo = dados?.modo ?? config.modo ?? 'resultados';
  const visiveis = jogos.slice(pagina * porPagina, pagina * porPagina + porPagina);
  const umaCompeticao = new Set(jogos.map((j) => j.slug)).size === 1 ? jogos[0]?.competicao : null;

  return (
    <div
      ref={raiz}
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-[4.5%] text-white', className)}
      style={{ containerType: 'size', background: gradienteDe(c) }}
      data-testid="sports-widget"
    >
      {backgroundImage && <img src={backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 85% 8%, ${rgba(c.brilho, 0.55)}, transparent 55%)` }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: backgroundImage
        ? `linear-gradient(180deg, ${rgba(c.c1, 0.72)} 0%, ${rgba(c.c1, 0.55)} 45%, ${rgba(c.c1, 0.94)} 100%)`
        : `linear-gradient(180deg, ${rgba(c.c1, 0)} 0%, ${rgba(c.c1, 0.5)} 100%)` }} />

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="text-[clamp(8px,3cqmin,22px)] font-bold tracking-[0.28em] text-white/85">SOBRE MÍDIA</span>
        <span className="rounded-full px-[1.2em] py-[0.35em] text-[clamp(7px,2.7cqmin,18px)] font-extrabold tracking-widest" style={{ background: c.selo, color: c.seloTexto }}>
          ⚽ {ROTULO_MODO[modo]}
        </span>
      </div>
      {umaCompeticao && (
        <p className="relative z-10 mt-[1.5cqmin] text-[clamp(8px,3.6cqmin,26px)] font-bold uppercase tracking-wider text-white/90" data-testid="sports-competicao">{umaCompeticao}</p>
      )}

      <div className="relative z-10 mt-[2cqmin] flex flex-1 flex-col justify-center gap-[1.6cqmin]">
        {visiveis.map((j) => {
          const centro = centroDoJogo(j);
          return (
            <div key={`${j.slug}-${j.mandante}-${j.visitante}`} className="flex items-center gap-[1.8cqmin] rounded-[1.6cqmin] px-[2.2cqmin] py-[1.4cqmin]"
              style={{ background: 'rgba(255,255,255,0.09)', border: `1px solid ${rgba(c.brilho, 0.35)}` }} data-testid="sports-jogo">
              {!umaCompeticao && (
                <span className="w-[8cqmin] shrink-0 text-[clamp(6px,2.3cqmin,15px)] font-extrabold tracking-wider" style={{ color: c.selo }}>{j.codigo}</span>
              )}
              <span className="min-w-0 flex-1 truncate text-right text-[clamp(8px,3.8cqmin,28px)] font-bold">{j.mandante}</span>
              <span className="flex shrink-0 flex-col items-center">
                <span className="min-w-[14cqmin] rounded-[1cqmin] px-[1.4cqmin] text-center text-[clamp(9px,4.4cqmin,32px)] font-black tabular-nums"
                  style={centro.encerrado ? { background: c.selo, color: c.seloTexto } : { background: 'rgba(255,255,255,0.16)' }}>
                  {centro.principal}
                </span>
                <span className="mt-[0.5cqmin] text-[clamp(6px,2.1cqmin,14px)] font-semibold uppercase text-white/75">
                  {centro.encerrado ? 'FINAL' : dataCurta(j.data)}
                </span>
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-[clamp(8px,3.8cqmin,28px)] font-bold">{j.visitante}</span>
            </div>
          );
        })}
        {!visiveis.length && (
          <p className="text-center text-[clamp(8px,3.6cqmin,24px)] text-white/80" data-testid="sports-vazio">
            {estado === 'carregando' ? 'Carregando jogos…' : estado === 'erro' ? 'Não foi possível carregar os jogos agora.' : 'Sem jogos confirmados para exibir agora.'}
          </p>
        )}
      </div>

      <div className="relative z-10 mt-[1.5cqmin] flex items-center justify-between gap-2 text-[clamp(5px,1.9cqmin,13px)] text-white/60">
        <span>Horário de Brasília · {dados?.creditos ?? 'Dados: openfootball (CC0) · Wikipédia (CC BY-SA)'}</span>
        {paginas > 1 && <span className="tabular-nums">{pagina + 1}/{paginas}</span>}
      </div>
    </div>
  );
}

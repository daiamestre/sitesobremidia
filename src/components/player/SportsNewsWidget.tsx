import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { coresDoConfig, gradienteDe, type CoresWidget } from '@/lib/widgetPaletas';
import type { WidgetConfig } from '@/types/models';
import {
  buscarEsportesNews, creditoDaNoticia, indicesDaExibicao, noticiasComImagem, proximaDepois, quandoPublicada,
  SEGUNDOS_POR_NOTICIA, type DadosEsportesNews, type NoticiaEsporte,
} from '@/lib/esportesNews';

const chaveCursor = (widgetId: string) => `sm:esportesnews:proxima:${widgetId}`;
function lerProxima(widgetId?: string): string | null {
  if (!widgetId) return null;
  try { return localStorage.getItem(chaveCursor(widgetId)); } catch { return null; }
}
function gravarProxima(widgetId: string | undefined, id: string | null) {
  if (!widgetId || !id) return;
  try { localStorage.setItem(chaveCursor(widgetId), id); } catch { /* sem armazenamento: recomeça da mais nova */ }
}

/** Baixa e decodifica a imagem; resolve false se não carregar (a notícia sai da exibição). */
const imagens = new Map<string, Promise<boolean>>();
function carregar(url: string): Promise<boolean> {
  let p = imagens.get(url);
  if (!p) {
    p = new Promise<boolean>((ok) => {
      const img = new Image();
      img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).then(() => ok(true), () => ok(true)); };
      img.onerror = () => { imagens.delete(url); ok(false); };
      img.src = url;
    });
    imagens.set(url, p);
  }
  return p;
}
const podeCarregar = () => typeof window !== 'undefined' && typeof HTMLImageElement !== 'undefined' && 'decode' in HTMLImageElement.prototype;

/**
 * Widget "Esportes News" (F-90): notícia de esporte SEMPRE com a imagem da notícia — horizontal: foto na tela toda com
 * a manchete por cima; vertical: foto no alto e o texto abaixo. Crédito da foto sempre visível. 8 s por notícia.
 * - modo "player": 3 notícias por exibição e a próxima exibição continua da seguinte (cursor por widget);
 * - modo "previa" (painel): passa por todas.
 * Mesma composição do Android Player (NativeWidgetEngine.buildSportsNews).
 * Também desenha o widget Notícias (RSS) (F-91): `selo` "NOTÍCIAS" e `segundos` do widget.
 */
export function SportsNewsWidget({ config, dados: dadosServidor, cores, className, widgetId, modo, selo = 'ESPORTES NEWS', segundos = SEGUNDOS_POR_NOTICIA, vazio }: {
  config: WidgetConfig; dados?: DadosEsportesNews | null; cores?: CoresWidget; className?: string; widgetId?: string; modo?: 'player' | 'previa';
  selo?: string; segundos?: number; vazio?: string;
}) {
  const c = cores ?? coresDoConfig(config);
  const modoExibicao = modo ?? (dadosServidor ? 'player' : 'previa');
  const [dados, setDados] = useState<DadosEsportesNews | null>(dadosServidor ?? null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>(dadosServidor ? 'ok' : 'carregando');

  useEffect(() => {
    if (dadosServidor) { setDados(dadosServidor); setEstado('ok'); return; }
    let cancelado = false;
    setEstado('carregando');
    buscarEsportesNews(config)
      .then((d) => { if (!cancelado) { setDados(d); setEstado('ok'); } })
      .catch(() => { if (!cancelado) setEstado('erro'); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.maxItems, dadosServidor]);

  const raiz = useRef<HTMLDivElement>(null);
  const [vertical, setVertical] = useState(false);
  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let ro: ResizeObserver | null = null;
    try { ro = new ResizeObserver(([e]) => { if (e) setVertical(e.contentRect.height > e.contentRect.width * 1.2); }); ro.observe(el); } catch { ro = null; }
    return () => ro?.disconnect();
  }, []);

  // Só entram as notícias cuja imagem carregou (todas juntas, antes da primeira aparecer).
  const candidatas = useMemo(() => noticiasComImagem(dados?.itens), [dados]);
  const [prontas, setProntas] = useState<NoticiaEsporte[] | null>(podeCarregar() ? null : candidatas);
  useEffect(() => {
    if (!podeCarregar()) { setProntas(candidatas); return; }
    let vivo = true;
    setProntas(null);
    const limite = setTimeout(() => { if (vivo) setProntas([]); }, 12000);
    Promise.all(candidatas.map((n) => carregar(n.imagem))).then((ok) => {
      if (!vivo) return;
      clearTimeout(limite);
      setProntas(candidatas.filter((_, i) => ok[i]));
    });
    return () => { vivo = false; clearTimeout(limite); };
  }, [candidatas]);

  const lista = useMemo(() => prontas ?? [], [prontas]);
  const sequencia = useMemo(() => (modoExibicao === 'player'
    ? indicesDaExibicao(lista, lerProxima(widgetId))
    : lista.map((_, i) => i)), [modoExibicao, lista, widgetId]);
  const [passo, setPasso] = useState(0);
  useEffect(() => { setPasso(0); }, [sequencia]);
  useEffect(() => {
    if (!sequencia.length) return;
    if (modoExibicao === 'player') gravarProxima(widgetId, proximaDepois(lista, sequencia[passo]));
    if (modoExibicao === 'player' && passo >= sequencia.length - 1) return; // fica na última até o item acabar
    if (sequencia.length < 2) return;
    const t = setTimeout(() => setPasso((p) => (p + 1) % sequencia.length), Math.max(segundos, 3) * 1000);
    return () => clearTimeout(t);
  }, [passo, sequencia, modoExibicao, widgetId, lista, segundos]);

  const n = lista[sequencia[passo] ?? -1];

  return (
    <div ref={raiz} className={cn('relative flex h-full w-full flex-col overflow-hidden text-white', className)}
      style={{ containerType: 'size', background: gradienteDe(c) }} data-testid="sports-news-widget">
      {n ? (
        <div key={n.id} className="relative flex h-full w-full flex-col animate-in fade-in duration-300" data-testid="sports-news-item">
          {vertical ? (
            <>
              {/* vertical: a mesma foto desfocada preenche o fundo; a foto inteira fica no alto */}
              <img src={n.imagem} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-50" />
              <div className="relative z-10 flex h-full flex-col p-[4cqmin]">
                <Cabecalho cores={c} selo={selo} />
                <img src={n.imagem} alt={n.titulo} className="mt-[3cqmin] aspect-[16/10] w-full rounded-[2cqmin] object-cover shadow-2xl" data-testid="sports-news-imagem" />
                <p className="mt-[1cqmin] text-right text-[2.3cqmin] text-white/75" data-testid="sports-news-credito">{creditoDaNoticia(n)}</p>
                <div className="flex min-h-0 flex-1 flex-col justify-center">
                  <Texto n={n} cores={c} vertical />
                </div>
              </div>
            </>
          ) : (
            <>
              <img src={n.imagem} alt={n.titulo} className="absolute inset-0 h-full w-full object-cover" data-testid="sports-news-imagem" />
              <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.82) 72%, rgba(0,0,0,0.92) 100%)' }} />
              <div className="relative z-10 flex h-full flex-col p-[4cqmin]">
                <Cabecalho cores={c} selo={selo} />
                <div className="flex-1" />
                <Texto n={n} cores={c} />
                <p className="mt-[1.4cqmin] text-[2.1cqmin] text-white/75" data-testid="sports-news-credito">{creditoDaNoticia(n)}</p>
              </div>
            </>
          )}
          {sequencia.length > 1 && (
            <div key={`barra-${passo}`} className="absolute bottom-0 left-0 z-20 h-[0.8cqmin] origin-left"
              style={{ width: '100%', background: c.selo, animation: `sm-barra ${Math.max(segundos, 3)}s linear forwards` }} />
          )}
          <style>{'@keyframes sm-barra{from{transform:scaleX(0)}to{transform:scaleX(1)}}'}</style>
        </div>
      ) : (
        <div className="relative z-10 flex h-full flex-col p-[4cqmin]">
          <Cabecalho cores={c} selo={selo} />
          <p className="flex flex-1 items-center justify-center text-center text-[3.6cqmin] text-white/85" data-testid="sports-news-vazio">
            {estado === 'carregando' || (prontas === null && candidatas.length > 0) ? 'Carregando notícias…'
              : estado === 'erro' ? 'Não foi possível carregar as notícias agora.'
              : vazio ?? 'Nenhuma notícia de esporte com imagem no momento. Nas telas, o widget fica fora da reprodução até chegar notícia com imagem.'}
          </p>
        </div>
      )}
      {lista.length > 1 && <span className="sr-only" data-testid="sports-news-posicao">{(sequencia[passo] ?? 0) + 1}/{lista.length}</span>}
    </div>
  );
}

function Cabecalho({ cores, selo }: { cores: CoresWidget; selo: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[2.6cqmin] font-bold tracking-[0.28em] text-white/90 drop-shadow">SOBRE MÍDIA</span>
      <span className="rounded-full px-[1.2em] py-[0.35em] text-[2.4cqmin] font-extrabold tracking-widest shadow" style={{ background: cores.selo, color: cores.seloTexto }}>
        {selo}
      </span>
    </div>
  );
}

function Texto({ n, cores, vertical = false }: { n: NoticiaEsporte; cores: CoresWidget; vertical?: boolean }) {
  const quando = quandoPublicada(n.publicadoEm);
  return (
    <div className={cn('flex flex-col', vertical ? 'gap-[2cqmin]' : 'gap-[1.4cqmin] max-w-[88%]')}>
      {quando && (
        <span className="w-fit rounded-[0.8cqmin] px-[1.4cqmin] py-[0.3cqmin] text-[2.4cqmin] font-extrabold uppercase tracking-wider" style={{ background: cores.selo, color: cores.seloTexto }}>
          {quando}
        </span>
      )}
      <h2 className={cn('font-black leading-[1.08] drop-shadow-lg', vertical ? 'line-clamp-5 text-[6.4cqmin]' : 'line-clamp-3 text-[5.6cqmin]')} data-testid="sports-news-titulo">{n.titulo}</h2>
      {n.resumo && (
        <p className={cn('text-white/90 drop-shadow', vertical ? 'line-clamp-4 text-[3.6cqmin]' : 'line-clamp-2 text-[2.9cqmin]')} data-testid="sports-news-resumo">{n.resumo}</p>
      )}
    </div>
  );
}

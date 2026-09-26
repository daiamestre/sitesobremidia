import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { coresDoConfig, gradienteDe, rgba, type CoresWidget } from '@/lib/widgetPaletas';
import type { WidgetConfig } from '@/types/models';
import { buscarDataDeExemplo, buscarEsportes, type DadosEsportes } from '@/lib/esportes';
import {
  cursorDepois, diaDaSemana, diaEmBrasilia, iniciaisDoTime, montarPaginas, paginasDaExibicao, rotuloDia, SEGUNDOS_POR_PAGINA,
  type CursorEsportes, type JogoJanela, type PaginaEsportes,
} from '@/lib/esportesPaginas';

function lerCursor(widgetId?: string): CursorEsportes | null {
  if (!widgetId) return null;
  try {
    const v = JSON.parse(localStorage.getItem(`sm:esportes:cursor:${widgetId}`) ?? 'null');
    return v && typeof v.dia === 'string' && Number.isInteger(v.proxima) ? v : null;
  } catch { return null; }
}
/**
 * Pré-carga: escudos e fundos são baixados E decodificados antes de a primeira página aparecer, e ficam guardados em
 * memória — tudo entra junto, e trocar de página não carrega mais nada (pedido do proprietário: nada aparecendo aos poucos).
 */
const imagensProntas = new Map<string, Promise<void>>();
function preCarregar(url: string): Promise<void> {
  let p = imagensProntas.get(url);
  if (!p) {
    p = new Promise<void>((ok) => {
      const img = new Image();
      img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => undefined).then(() => ok()); };
      img.onerror = () => { imagensProntas.delete(url); ok(); };
      img.src = url;
    });
    imagensProntas.set(url, p);
  }
  return p;
}
/** Sem decodificação de imagem (ambiente de teste): nada a esperar. */
const podePreCarregar = () => typeof window !== 'undefined' && typeof HTMLImageElement !== 'undefined' && 'decode' in HTMLImageElement.prototype;

function gravarCursor(widgetId: string | undefined, c: CursorEsportes) {
  if (!widgetId) return;
  try { localStorage.setItem(`sm:esportes:cursor:${widgetId}`, JSON.stringify(c)); } catch { /* sem armazenamento: recomeça do início */ }
}

/**
 * Widget "Esportes" v2 (F-86): por campeonato ("BRASILEIRÃO SÉRIE A" / "Resultados e próximos jogos"), até 3 resultados
 * (D-3..D-1) + até 3 próximos jogos (hoje..D+2) por página, escudo oficial ao lado de cada time, 8 s por página.
 * - modo "player" (Player web): 3 páginas por exibição e a próxima exibição continua de onde parou (cursor por widget);
 * - modo "previa" (painel): passa por todas as páginas; sem jogos na janela de hoje, mostra um EXEMPLO com dados reais
 *   da última rodada (marcado como exemplo — nas telas o widget fica fora da reprodução até voltar a ter jogos).
 * Mesma composição do Android Player (NativeWidgetEngine.buildSportsV2).
 */
export function SportsWidget({ config, dados: dadosServidor, backgroundImage, cores, className, widgetId, modo }: {
  config: WidgetConfig; dados?: DadosEsportes | null; backgroundImage?: string | null; cores?: CoresWidget; className?: string;
  widgetId?: string; modo?: 'player' | 'previa';
}) {
  const c = cores ?? coresDoConfig(config);
  const modoExibicao = modo ?? (dadosServidor ? 'player' : 'previa');
  const [dados, setDados] = useState<DadosEsportes | null>(dadosServidor ?? null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>(dadosServidor ? 'ok' : 'carregando');
  const chave = JSON.stringify([config.competicoes, config.time]);

  useEffect(() => {
    if (dadosServidor) { setDados(dadosServidor); setEstado('ok'); return; }
    let cancelado = false;
    setEstado('carregando');
    const t = setTimeout(async () => {
      try {
        let d = await buscarEsportes(config);
        // Janela de hoje vazia (ex.: Data FIFA): a prévia mostra como fica com a última rodada real.
        if (!montarPaginas(d.janela ?? [], d.competicoes ?? [], Date.now()).length) {
          const ref = await buscarDataDeExemplo(config).catch(() => null);
          if (ref) d = await buscarEsportes(config, ref);
        }
        if (!cancelado) { setDados(d); setEstado('ok'); }
      } catch {
        if (!cancelado) setEstado('erro');
      }
    }, 300);
    return () => { cancelado = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, dadosServidor]);

  // Orientação da tela (fundo 16:9 ou 9:16 do campeonato).
  const raiz = useRef<HTMLDivElement>(null);
  const [vertical, setVertical] = useState(false);
  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let ro: ResizeObserver | null = null;
    try { ro = new ResizeObserver(([e]) => { if (e) setVertical(e.contentRect.height > e.contentRect.width * 1.2); }); ro.observe(el); } catch { ro = null; }
    return () => ro?.disconnect();
  }, []);

  const aPreCarregar = useMemo(() => {
    const u = new Set<string>();
    for (const j of dados?.janela ?? []) { if (j.escudoMandante) u.add(j.escudoMandante); if (j.escudoVisitante) u.add(j.escudoVisitante); }
    if (!backgroundImage) for (const comp of dados?.competicoes ?? []) { const f = vertical ? comp.fundoV : comp.fundoH; if (f) u.add(f); }
    return [...u];
  }, [dados, vertical, backgroundImage]);
  const [pronto, setPronto] = useState(!podePreCarregar());
  useEffect(() => {
    if (!podePreCarregar() || !aPreCarregar.length) { setPronto(true); return; }
    let vivo = true;
    const limite = setTimeout(() => { if (vivo) setPronto(true); }, 8000); // rede muito lenta: mostra com o que chegou
    Promise.all(aPreCarregar.map(preCarregar)).then(() => { if (vivo) { clearTimeout(limite); setPronto(true); } });
    return () => { vivo = false; clearTimeout(limite); };
  }, [aPreCarregar]);

  const agora = useMemo(() => (dados?.simulado && dados.agoraReferencia ? Date.parse(dados.agoraReferencia) : Date.now()), [dados]);
  const hoje = diaEmBrasilia(agora);
  const paginas = useMemo(() => montarPaginas(dados?.janela ?? [], dados?.competicoes ?? [], agora), [dados, agora]);

  // Sequência desta exibição: player = 3 páginas a partir do cursor; prévia = todas, em volta.
  const sequencia = useMemo(() => (modoExibicao === 'player'
    ? paginasDaExibicao(paginas.length, lerCursor(widgetId), hoje)
    : paginas.map((_, i) => i)), [modoExibicao, paginas, widgetId, hoje]);
  const [passo, setPasso] = useState(0);
  useEffect(() => { setPasso(0); }, [sequencia]);
  useEffect(() => {
    if (!sequencia.length || !pronto) return;
    if (modoExibicao === 'player') gravarCursor(widgetId, cursorDepois(sequencia[passo], paginas.length, hoje));
    const ultimo = passo >= sequencia.length - 1;
    if (modoExibicao === 'player' && ultimo) return; // fica na 3ª página até o item acabar
    if (sequencia.length < 2) return;
    const t = setTimeout(() => setPasso((p) => (p + 1) % sequencia.length), SEGUNDOS_POR_PAGINA * 1000);
    return () => clearTimeout(t);
  }, [passo, sequencia, modoExibicao, widgetId, paginas.length, hoje, pronto]);

  const indice = sequencia[passo] ?? 0;
  const pagina: PaginaEsportes | undefined = pronto ? paginas[indice] : undefined;
  const comp = pagina ? dados?.competicoes?.find((x) => x.slug === pagina.slug) : undefined;
  // Fundo: o escolhido no widget; senão, o do campeonato da página (estádio, gramado, bola e taça).
  const fundoTema = backgroundImage ? null : (vertical ? comp?.fundoV : comp?.fundoH) ?? null;
  const temaAtivo = !!fundoTema;
  // A arte do campeonato já traz a taça e o nome no alto (F-88): o título escrito sai e o conteúdo começa abaixo dela.
  const tituloNaArte = temaAtivo && !!comp?.fundoComTitulo;

  return (
    <div
      ref={raiz}
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-[4cqmin] text-white', className)}
      style={{ containerType: 'size', background: gradienteDe(c) }}
      data-testid="sports-widget"
    >
      {backgroundImage && <img src={backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {fundoTema && <img src={fundoTema} alt="" className="absolute inset-0 h-full w-full object-cover" data-testid="sports-fundo-tema" />}
      {!temaAtivo && <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 85% 8%, ${rgba(c.brilho, 0.55)}, transparent 55%)` }} />}
      <div className="pointer-events-none absolute inset-0" style={{ background: temaAtivo
        ? 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.45) 100%)'
        : backgroundImage
        ? `linear-gradient(180deg, ${rgba(c.c1, 0.78)} 0%, ${rgba(c.c1, 0.6)} 45%, ${rgba(c.c1, 0.94)} 100%)`
        : `linear-gradient(180deg, ${rgba(c.c1, 0)} 0%, ${rgba(c.c1, 0.5)} 100%)` }} />

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="text-[2.6cqmin] font-bold tracking-[0.28em] text-white/85">SOBRE MÍDIA</span>
        <span className="rounded-full px-[1.2em] py-[0.35em] text-[2.4cqmin] font-extrabold tracking-widest" style={{ background: c.selo, color: c.seloTexto }}>
          ⚽ FUTEBOL
        </span>
      </div>

      {dados?.simulado && modoExibicao === 'previa' && (
        <p className="relative z-10 mt-[1cqmin] rounded-[1cqmin] bg-black/45 px-[1.6cqmin] py-[0.6cqmin] text-[2.1cqmin] font-semibold text-amber-200" data-testid="sports-exemplo">
          EXEMPLO com a última rodada real (como estaria em {diaDaSemana(dados.referencia ?? hoje)}): sem jogos nos 3 dias anteriores nem nos próximos 3 dias,
          o widget fica fora da reprodução nas telas até voltar a ter jogos.
        </p>
      )}

      {pagina ? (
        <div key={`${indice}-${pagina.slug}`} className="relative z-10 mt-[1.6cqmin] flex min-h-0 flex-1 flex-col animate-in fade-in duration-300">
          {tituloNaArte ? (
            <div data-testid="sports-titulo-na-arte">
              <h2 className="sr-only" data-testid="sports-competicao">{pagina.competicao}</h2>
              <div style={{ height: vertical ? '30cqh' : '25cqh' }} />
              <p className="text-center text-[4.4cqmin] font-extrabold uppercase leading-tight tracking-[0.16em] text-white drop-shadow" data-testid="sports-subtitulo">Resultados e próximos jogos</p>
            </div>
          ) : (
            <div className="border-l-[0.9cqmin] pl-[1.8cqmin]" style={{ borderColor: c.selo }}>
              <h2 className="text-[6.2cqmin] font-black uppercase leading-none tracking-wide" data-testid="sports-competicao">{pagina.competicao}</h2>
              <p className="mt-[0.8cqmin] text-[3.2cqmin] font-semibold text-white/85" data-testid="sports-subtitulo">Resultados e próximos jogos</p>
            </div>
          )}
          <div className="mt-[1.8cqmin] flex min-h-0 flex-1 flex-col justify-center gap-[1.6cqmin]" style={tituloNaArte && !vertical ? { zoom: 0.8 } : undefined}>
            {pagina.resultados.length > 0 && (
              <Secao titulo="RESULTADOS" cor={c.selo}>
                {pagina.resultados.map((j) => <LinhaJogo key={chaveJogo(j)} j={j} hoje={hoje} cores={c} escuro={temaAtivo} encerrado />)}
              </Secao>
            )}
            {pagina.proximos.length > 0 && (
              <Secao titulo="PRÓXIMOS JOGOS" cor={c.selo}>
                {pagina.proximos.map((j) => <LinhaJogo key={chaveJogo(j)} j={j} hoje={hoje} cores={c} escuro={temaAtivo} />)}
              </Secao>
            )}
          </div>
        </div>
      ) : (
        <p className="relative z-10 flex flex-1 items-center justify-center text-center text-[3.6cqmin] text-white/80" data-testid="sports-vazio">
          {estado === 'carregando' || (!pronto && paginas.length > 0) ? 'Carregando jogos…' : estado === 'erro' ? 'Não foi possível carregar os jogos agora.'
            : 'Sem jogos nos 3 dias anteriores nem nos próximos 3 dias.'}
        </p>
      )}

      {/* Sem rodapé na tela (pedido do proprietário): a posição da página fica só para leitores de tela. */}
      {paginas.length > 1 && <span className="sr-only" data-testid="sports-pagina">{indice + 1}/{paginas.length}</span>}
    </div>
  );
}

function chaveJogo(j: JogoJanela) { return `${j.slug}-${j.data}-${j.mandante}-${j.visitante}`; }

function Secao({ titulo, cor, children }: { titulo: string; cor: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[1cqmin]" data-testid={`sports-secao-${titulo === 'RESULTADOS' ? 'resultados' : 'proximos'}`}>
      <div className="flex items-center justify-center gap-[1.6cqmin]">
        <span className="h-px flex-1" style={{ background: rgba(cor, 0.5) }} />
        <span className="text-[2.9cqmin] font-extrabold tracking-[0.2em]" style={{ color: cor }} data-testid="sports-rotulo-secao">{titulo}</span>
        <span className="h-px flex-1" style={{ background: rgba(cor, 0.5) }} />
      </div>
      {children}
    </section>
  );
}

function LinhaJogo({ j, hoje, cores, encerrado = false, escuro = false }: { j: JogoJanela; hoje: string; cores: CoresWidget; encerrado?: boolean; escuro?: boolean }) {
  const centro = encerrado ? `${j.placarMandante} × ${j.placarVisitante}` : (j.hora ?? 'a definir');
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-[1.4cqmin] rounded-[1.4cqmin] px-[2cqmin] py-[0.9cqmin]"
      style={{ background: escuro ? 'rgba(6,10,22,0.62)' : 'rgba(255,255,255,0.09)', border: `1px solid ${rgba(cores.brilho, escuro ? 0.28 : 0.35)}` }} data-testid="sports-jogo">
      <span className="min-w-0 line-clamp-2 break-words text-right text-[3.9cqmin] font-bold leading-tight">{j.mandante}</span>
      <Escudo url={j.escudoMandante} nome={j.mandante} />
      <span className="flex flex-col items-center">
        <span className="min-w-[13cqmin] rounded-[1cqmin] px-[1.2cqmin] text-center text-[4.4cqmin] font-black tabular-nums"
          style={encerrado ? { background: cores.selo, color: cores.seloTexto } : { background: 'rgba(255,255,255,0.16)' }}>
          {centro}
        </span>
        <span className="mt-[0.4cqmin] text-[1.9cqmin] font-bold uppercase text-white/75">{rotuloDia(j.data, hoje)}</span>
      </span>
      <Escudo url={j.escudoVisitante} nome={j.visitante} />
      <span className="min-w-0 line-clamp-2 break-words text-left text-[3.9cqmin] font-bold leading-tight">{j.visitante}</span>
    </div>
  );
}

/** Escudo oficial conferido; sem ele (ou se a imagem falhar), as iniciais — nunca o escudo de outro time. */
function Escudo({ url, nome }: { url?: string | null; nome: string }) {
  const [falhou, setFalhou] = useState(false);
  if (url && !falhou) {
    return <img src={url} alt={`Escudo ${nome}`} className="h-[7.4cqmin] w-[7.4cqmin] object-contain drop-shadow" onError={() => setFalhou(true)} data-testid="sports-escudo" />;
  }
  return (
    <span className="flex h-[7.4cqmin] w-[7.4cqmin] items-center justify-center rounded-full bg-white/20 text-[2cqmin] font-black" data-testid="sports-escudo-reserva">
      {iniciaisDoTime(nome)}
    </span>
  );
}

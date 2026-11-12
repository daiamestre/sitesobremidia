/**
 * F-302 (pedido do dono, 11/11/2026: "o tablet M10 da Multilaser tem que rodar liso") — REGENTE das animações do Studio.
 *
 * Antes, cada prévia animada tinha o seu próprio relógio desenhando a arte inteira 60 vezes por segundo, sem limite, e
 * continuava desenhando fora da tela e na pausa do fim. A tela inicial chegava a ter 22 prévias + 10 carrosséis ao mesmo
 * tempo: num tablet simples isso pede mais processador do que existe, e TUDO trava (toque, rolagem, botões).
 *
 * Agora há UM relógio só, com ORÇAMENTO por quadro: em cada quadro da tela o regente desenha as prévias da vez (em rodízio)
 * até gastar o orçamento e devolve o resto do tempo para o toque e a rolagem. Fora da tela e com o app em segundo plano
 * nada é desenhado. Em aparelho fraco (pouca memória ou processador simples) as prévias rodam a menos quadros por segundo
 * e em meia resolução — continuam em movimento, só que leves. Muitas prévias à vista = cada uma um pouco mais lenta,
 * nunca a tela travada.
 */

type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

let cacheFraco: boolean | null = null;
/** Aparelho fraco: até 3 GB de memória, até 4 núcleos, "economia de dados" ou "reduzir movimento" ligado. */
export function aparelhoFraco(): boolean {
  if (cacheFraco != null) return cacheFraco;
  if (typeof navigator === 'undefined') return (cacheFraco = false);
  // escolha manual (fica guardada no aparelho): ?leve=1 liga o modo leve, ?leve=0 desliga, ?leve=auto volta ao automático
  try {
    const q = new URLSearchParams(window.location.search).get('leve');
    if (q === '1' || q === '0') localStorage.setItem('sm-modo-leve', q);
    if (q === 'auto') localStorage.removeItem('sm-modo-leve');
    const guardado = localStorage.getItem('sm-modo-leve');
    if (guardado === '1' || guardado === '0') return (cacheFraco = guardado === '1');
  } catch { /* sem armazenamento: segue no automático */ }
  const n = navigator as Nav;
  const memoria = n.deviceMemory ?? 8;
  const nucleos = n.hardwareConcurrency ?? 8;
  const reduzir = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  cacheFraco = memoria <= 3 || nucleos <= 4 || !!n.connection?.saveData || reduzir;
  return cacheFraco;
}
/** só para os testes */
export const _redefinirAparelho = (v: boolean | null) => { cacheFraco = v; };

/** Densidade de pixels das prévias: até 2 no aparelho bom; 1 no fraco (metade do trabalho a cada quadro). */
export const densidadeDasPrevias = () => (aparelhoFraco() ? 1 : Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));

/** Quadros por segundo de cada prévia animada (o vídeo final continua com os quadros todos). */
export const quadrosPorSegundo = () => (aparelhoFraco() ? 15 : 30);
/** Quanto do quadro da tela o regente pode gastar desenhando (ms) — o resto é do toque e da rolagem. */
export const orcamentoPorQuadro = () => (aparelhoFraco() ? 5 : 9);

export interface Animador {
  /** desenha o instante de agora; devolve false quando não mudou nada (ex.: parado na pausa do fim) */
  desenhar: (agora: number) => boolean | void;
  visivel: boolean;
  ultimo: number;
}

const animadores = new Set<Animador>();
let raf = 0;
let vez = 0;

function laco(agora: number) {
  raf = 0;
  if (typeof document !== 'undefined' && document.hidden) return; // volta no visibilitychange
  const lista = [...animadores].filter((a) => a.visivel);
  if (!lista.length) return; // nada à vista: o relógio dorme até alguém aparecer
  const intervalo = 1000 / quadrosPorSegundo() - 2;
  const limite = orcamentoPorQuadro();
  const inicio = performance.now();
  for (let i = 0; i < lista.length; i++) {
    const a = lista[(vez + i) % lista.length];
    if (agora - a.ultimo < intervalo) continue;
    a.ultimo = agora;
    a.desenhar(agora);
    if (performance.now() - inicio > limite) { vez = (vez + i + 1) % lista.length; break; } // os próximos ficam para o quadro seguinte
  }
  acordar();
}

/** Liga o relógio (se ainda não estiver ligado e houver algo à vista). */
export function acordar() {
  if (raf || typeof requestAnimationFrame === 'undefined') return;
  if ([...animadores].some((a) => a.visivel)) raf = requestAnimationFrame(laco);
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) acordar(); });

/**
 * Registra uma prévia animada. Ela só é desenhada enquanto `el` está na tela (com uma folga de 100 px).
 * Devolve a função que tira o registro (chamar ao desmontar).
 */
export function registrarAnimacao(el: Element | null, desenhar: Animador['desenhar']): () => void {
  const a: Animador = { desenhar, visivel: !el || !('IntersectionObserver' in window), ultimo: 0 };
  animadores.add(a);
  let io: IntersectionObserver | null = null;
  if (el && 'IntersectionObserver' in window) {
    io = new IntersectionObserver((e) => { a.visivel = e.some((x) => x.isIntersecting); if (a.visivel) acordar(); }, { rootMargin: '100px' });
    io.observe(el);
  }
  acordar();
  return () => { animadores.delete(a); io?.disconnect(); };
}

/** quantas prévias estão registradas e quantas à vista (para conferir no navegador) */
export const estadoDoRegente = () => ({ registradas: animadores.size, aVista: [...animadores].filter((a) => a.visivel).length, fraco: aparelhoFraco(), qps: quadrosPorSegundo() });
if (typeof window !== 'undefined') (window as unknown as { __regente?: typeof estadoDoRegente }).__regente = estadoDoRegente;

/**
 * F-230 — capa que GIRA, como o Player nas telas (regra do dono):
 * - passa TODAS as mídias da pasta, 8 s cada, para sempre;
 * - vídeo (ou arte animada) toca ANIMADO na vez dele, e entra primeiro: é a capa da pasta;
 * - só trabalha quando está na tela (fora dela o relógio para e nada é baixado).
 * Usada nas 3 TVs do início do Studio, nos cartões das pastas de modelos e nas pastas da galeria.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

/** Quanto tempo cada mídia fica na capa (o mesmo de uma imagem no Player). */
export const TEMPO_DE_CADA_MIDIA = 8000;

export interface Slide { chave: string; imagem?: string | null; video?: string | null; /** arte animada desenhada ao vivo */ animada?: () => ReactNode }

/** Vídeos e artes animadas primeiro (a capa da pasta é a mídia animada); depois as imagens, na ordem. */
export function ordemDaCapa(slides: Slide[]): Slide[] {
  const animada = (s: Slide) => !!(s.video || s.animada);
  return [...slides.filter(animada), ...slides.filter((s) => !animada(s))];
}

/** Índice da mídia da vez depois de `passos` trocas (sempre dentro da lista). */
export const proximaDaVez = (i: number, total: number) => (total > 0 ? (i + 1) % total : 0);

/** O elemento está (perto de estar) na tela? */
export function useNaTela(ref: RefObject<Element>, margem = '200px'): boolean {
  const [na, setNa] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setNa(true); return; }
    let respondeu = false;
    const io = new IntersectionObserver(([e]) => { respondeu = true; setNa(e.isIntersecting); }, { rootMargin: margem });
    io.observe(el);
    // aparelho que não avisa (navegador antigo, aba em segundo plano): a capa não pode ficar parada — gira assim mesmo
    const reserva = setTimeout(() => { if (!respondeu) setNa(true); }, 1500);
    // e confere a posição de verdade ao rolar ou redimensionar (há navegadores que avisam uma vez e depois param)
    const px = parseInt(margem, 10) || 0;
    let quadro = 0;
    const conferir = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width || r.height) setNa(r.bottom > -px && r.top < window.innerHeight + px && r.right > -px && r.left < window.innerWidth + px);
      });
    };
    window.addEventListener('scroll', conferir, { capture: true, passive: true });
    window.addEventListener('resize', conferir);
    const inicio = setTimeout(conferir, 300);
    return () => { io.disconnect(); clearTimeout(reserva); clearTimeout(inicio); cancelAnimationFrame(quadro); window.removeEventListener('scroll', conferir, { capture: true }); window.removeEventListener('resize', conferir); };
  }, [ref, margem]);
  return na;
}

export function CapaQueGira({ slides, atraso = 0, tempo = TEMPO_DE_CADA_MIDIA, ajuste = 'cover', className, style, vazio }: {
  slides: Slide[]; atraso?: number; tempo?: number; ajuste?: 'cover' | 'contain'; className?: string; style?: React.CSSProperties; vazio?: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const naTela = useNaTela(caixa);
  const [i, setI] = useState(0);
  const primeira = useRef(true);
  const total = slides.length;
  const atual = total ? i % total : -1;

  useEffect(() => {
    if (!naTela || total < 2) return;
    // a 1ª troca espera o atraso (as capas vizinhas não trocam todas juntas); depois, uma a cada `tempo`
    const t = setTimeout(() => { primeira.current = false; setI((x) => proximaDaVez(x, total)); }, primeira.current ? tempo + atraso : tempo);
    return () => clearTimeout(t);
  }, [naTela, total, i, tempo, atraso]);

  const anterior = total ? (atual + total - 1) % total : -1;
  const proxima = total ? (atual + 1) % total : -1;
  const objeto = ajuste === 'cover' ? 'object-cover' : 'object-contain';
  return (
    <div ref={caixa} className={cn('relative overflow-hidden bg-black', className)} style={style} data-testid="capa-que-gira">
      {naTela && slides.map((s, k) => {
        // na página só ficam a da vez, a que está saindo e a próxima imagem (já baixando)
        const vez = k === atual;
        if (!(vez || k === anterior || (k === proxima && !s.video && !s.animada))) return null;
        const camada = cn('absolute inset-0 h-full w-full transition-opacity duration-700', objeto);
        const op = { opacity: vez ? 1 : 0 };
        if (s.video) return vez || k === anterior
          ? <video key={s.chave} src={s.video} poster={s.imagem ?? undefined} muted playsInline autoPlay loop preload="auto" className={camada} style={op} />
          : null;
        if (s.animada) return <div key={s.chave} className="absolute inset-0 transition-opacity duration-700" style={op}>{vez || k === anterior ? s.animada() : null}</div>;
        return s.imagem ? <img key={s.chave} src={s.imagem} alt="" draggable={false} decoding="async" className={camada} style={op} /> : null;
      })}
      {(!naTela || !total) && (vazio ?? <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#22004A] to-[#0B0420]" />)}
    </div>
  );
}

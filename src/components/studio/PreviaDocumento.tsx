/**
 * SOBRE MÍDIA STUDIO — prévia de um documento de camadas (F-221): o mesmo desenho do PNG final, na largura do
 * contenedor. Só desenha quando aparece na tela (catálogo com dezenas de modelos) e redesenha na hora a cada mudança
 * (editor), carregando fotos e fontes só quando a lista delas muda.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { TAMANHO_DOC, fontesDo, imagensDo, type Documento } from '@/lib/studio/documento';
import { desenharDocumento, prepararDocumento, type Imagens } from '@/lib/studio/desenhar';
import { duracaoDoVideo } from '@/lib/studio/animacao';
import { densidadeDasPrevias, registrarAnimacao } from '@/lib/studio/regente';

/** `animar`: toca as animações sem parar (F-225), como o vídeo vai ficar */
interface Props { doc: Documento; className?: string; style?: CSSProperties; ocultar?: string | null; sempre?: boolean; animar?: boolean; /** F-249: repete só este trecho (segundos): ver o movimento de um elemento */ ciclo?: number | null }

export function PreviaDocumento({ doc, className, style, ocultar, sempre = false, animar = false, ciclo = null }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [visivel, setVisivel] = useState(sempre);
  const [largura, setLargura] = useState(0);
  const [imgs, setImgs] = useState<Imagens | null>(null);
  const { w, h } = TAMANHO_DOC[doc.formato];
  const chave = imagensDo(doc).join('|') + '#' + fontesDo(doc).join('|');

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    setLargura(el.clientWidth);
    let io: IntersectionObserver | null = null;
    if (!sempre && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setVisivel(true); io?.disconnect(); } }, { rootMargin: '300px' });
      io.observe(el);
    } else setVisivel(true);
    return () => { ro.disconnect(); io?.disconnect(); };
  }, [sempre]);

  useEffect(() => {
    if (!visivel) return;
    let vivo = true;
    void prepararDocumento(doc).then((m) => { if (vivo) setImgs(m); });
    return () => { vivo = false; };
    // recarrega só quando muda a lista de fotos/fontes (não a cada arraste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel, chave]);

  useEffect(() => {
    const c = tela.current;
    if (!c || !imgs || !largura) return;
    const dpr = densidadeDasPrevias(); // F-302: 1 em aparelho fraco (metade do trabalho a cada quadro)
    const escala = (largura * dpr) / w;
    const cw = Math.round(w * escala), ch = Math.round(h * escala);
    if (c.width !== cw) c.width = cw;
    if (c.height !== ch) c.height = ch;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (!animar) { desenharDocumento(ctx, doc, imgs, escala, ocultar); return; }
    const total = ciclo ?? duracaoDoVideo(doc);
    const pausa = ciclo ? 0.35 : 1.2;
    const inicio = performance.now();
    let parado = false;
    // F-302: o REGENTE desenha (um relógio só para o sistema, com orçamento por quadro, parado fora da tela);
    // na pausa do fim a arte fica parada: desenha o último quadro uma vez e não gasta mais nada até recomeçar
    desenharDocumento(ctx, doc, imgs, escala, ocultar, 0, true);
    return registrarAnimacao(caixa.current, (agora) => {
      const t = ((agora - inicio) / 1000) % (total + pausa); // repete, com uma pausa no fim
      if (t > total) { if (parado) return false; parado = true; desenharDocumento(ctx, doc, imgs, escala, ocultar, total, true); return true; }
      parado = false;
      desenharDocumento(ctx, doc, imgs, escala, ocultar, t, true); // F-290: movimento liso
      return true;
    });
  }, [doc, imgs, largura, w, h, ocultar, animar, ciclo]);

  return (
    <div ref={caixa} className={className} style={{ position: 'relative', width: '100%', aspectRatio: `${w} / ${h}`, background: doc.fundo, overflow: 'hidden', ...style }} data-testid="previa-documento">
      <canvas ref={tela} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

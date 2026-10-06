/**
 * F-147 — Player web com a tela dividida em zonas. Cada zona tem a sua playlist e o seu ciclo.
 * Regras: REPRODUZINDO = SÓ MÍDIA (nenhum aviso sobre a área de exibição; zona sem conteúdo fica na cor de fundo);
 * a mesma mídia nunca toca em duas zonas ao mesmo tempo; a prova de exibição leva a zona.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { offlineLogger } from '@/utils/offlineLogger';
import { AJUSTE_CSS, estiloDaZona, proximoItemLivre } from '@/lib/layoutZonas';
import type { LayoutDoPlayer, ZonaDoPlayer } from './playerLayout';
import { WidgetNaTela } from './WidgetNaTela';

type EmUso = Map<string, string>; // zona -> mídia que ela está mostrando

function Zona({ zona, layout, emUso, screenId, somLiberado }: {
  zona: ZonaDoPlayer; layout: LayoutDoPlayer; emUso: React.MutableRefObject<EmUso>; screenId: string | null; somLiberado: boolean;
}) {
  const [indice, setIndice] = useState(-1);
  const [volta, setVolta] = useState(0); // força novo ciclo quando a zona tem um item só
  const itensRef = useRef(zona.itens);
  itensRef.current = zona.itens;
  const indiceRef = useRef(indice);
  indiceRef.current = indice;

  const outras = useCallback(() => {
    const s = new Set<string>();
    emUso.current.forEach((midia, z) => { if (z !== zona.id) s.add(midia); });
    return s;
  }, [emUso, zona.id]);

  const avancar = useCallback(() => {
    const itens = itensRef.current;
    const prox = proximoItemLivre(itens, indiceRef.current, outras());
    if (prox < 0) { emUso.current.delete(zona.id); setIndice(-1); setVolta((v) => v + 1); return; }
    emUso.current.set(zona.id, itens[prox].mediaId);
    setIndice(prox);
    setVolta((v) => v + 1);
  }, [emUso, outras, zona.id]);

  // conteúdo novo (ou primeira vez): recomeça o ciclo da zona
  const assinatura = zona.itens.map((i) => `${i.id}:${i.duration}`).join('|');
  useEffect(() => {
    indiceRef.current = -1;
    avancar();
    const reg = emUso.current;
    return () => { reg.delete(zona.id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  const item = indice >= 0 ? zona.itens[indice] : undefined;

  useEffect(() => {
    // sem item livre agora (vazia, ou tudo em uso por outra zona): tenta de novo em instantes
    if (!item) { const t = setTimeout(avancar, 1500); return () => clearTimeout(t); }
    const inicio = new Date();
    const fim = () => {
      // widget não é mídia do acervo: não entra na prova de exibição
      if (screenId && item.type !== 'widget') {
        offlineLogger.log({ screen_id: screenId, media_id: item.mediaId, playlist_id: null, duration: item.duration, status: 'completed',
          started_at: inicio.toISOString(), zona_id: zona.id, zona_numero: zona.numero });
      }
      avancar();
    };
    // imagem: tempo do item. vídeo: termina sozinho (onEnded); o prazo abaixo é só a rede de segurança.
    const prazo = item.type === 'video' ? (item.duration || 10) * 1000 + 4000 : (item.duration || 10) * 1000;
    const t = setTimeout(fim, prazo);
    fimRef.current = () => { clearTimeout(t); fim(); };
    return () => { clearTimeout(t); fimRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, indice, volta]);

  const fimRef = useRef<(() => void) | null>(null);
  const ajuste = AJUSTE_CSS[zona.modoEncaixe];
  // o estilo geral do Player força 'cover' em toda mídia; a zona precisa valer o encaixe escolhido no painel
  const fixarEncaixe = (el: HTMLElement | null) => { el?.style.setProperty('object-fit', ajuste, 'important'); };
  const estilo = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', objectFit: ajuste, backgroundColor: layout.corFundo };

  return (
    <div data-testid="zona-do-player" data-zona={zona.numero}
      style={{ position: 'absolute', overflow: 'hidden', zIndex: zona.ordemZ + 1, backgroundColor: layout.corFundo, ...estiloDaZona(zona, layout.largura, layout.altura) }}>
      {item?.type === 'image' && (
        <img key={`${item.id}-${volta}`} src={item.url} alt="" draggable={false} style={estilo} ref={fixarEncaixe} onError={() => fimRef.current?.()} />
      )}
      {item?.type === 'widget' && item.widgetType && (
        <div key={`${item.id}-${volta}`} style={{ position: 'absolute', inset: 0 }}>
          <WidgetNaTela id={item.mediaId.replace('widget:', '')} tipo={item.widgetType} config={item.widgetConfig} emPe={zona.altura > zona.largura} />
        </div>
      )}
      {item?.type === 'video' && (
        <video key={`${item.id}-${volta}`} src={item.url} style={estilo} ref={fixarEncaixe} autoPlay playsInline preload="auto" crossOrigin="anonymous"
          muted={!(zona.audio && somLiberado)} onEnded={() => fimRef.current?.()} onError={() => fimRef.current?.()} />
      )}
    </div>
  );
}

export function ZonasDoPlayer({ layout, screenId, somLiberado }: { layout: LayoutDoPlayer; screenId: string | null; somLiberado: boolean }) {
  const emUso = useRef<EmUso>(new Map());
  // a tela lógica inteira cabe no visor sem cortar nem esticar (mesma regra do Player: barras quando a proporção difere)
  const proporcao = layout.largura / layout.altura;
  return (
    <div data-testid="zonas-do-player"
      style={{ position: 'relative', backgroundColor: layout.corFundo, overflow: 'hidden', aspectRatio: `${layout.largura} / ${layout.altura}`,
               width: `min(100vw, calc(100dvh * ${proporcao}))`, maxHeight: '100dvh' }}>
      {layout.zonas.map((z) => (
        <Zona key={z.id} zona={z} layout={layout} emUso={emUso} screenId={screenId ?? layout.telaId} somLiberado={somLiberado} />
      ))}
    </div>
  );
}

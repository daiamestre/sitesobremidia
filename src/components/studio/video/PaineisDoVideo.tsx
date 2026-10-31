/**
 * SOBRE MÍDIA STUDIO — EDITOR DE VÍDEO (F-227): cartões de edição do clipe (cortar, velocidade, volume, filtros,
 * ajustes, enquadrar/zoom, girar/espelhar, transição), da música e do projeto. Mesmos controles grandes do editor de
 * imagens (régua com o valor ao lado, chaves, botões de 40 px).
 */
import { ArrowLeft, ArrowRight, FlipHorizontal, RotateCw, Scissors, Snowflake } from 'lucide-react';
import { Chave, Cor, Faixa, Segmento } from '@/components/studio/editor/Paineis';
import { FILTROS, TRANSICOES } from '@/lib/studio/video/efeitos';
import { AJUSTES_NEUTROS, duracaoDoClipe, formatarTempo, type Clipe, type FaixaDeAudio, type ProjetoDeVideo } from '@/lib/studio/video/linha';
import { cn } from '@/lib/utils';

export type AbaDoClipe = 'cortar' | 'velocidade' | 'volume' | 'filtros' | 'ajustes' | 'enquadrar' | 'transicao';

const VELOCIDADES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export function CartaoDoClipe({ aba, c, mudar, onDividir, onCongelar, onMover, temProximo }: {
  aba: AbaDoClipe; c: Clipe; mudar: (p: Partial<Clipe>) => void; onDividir: () => void; onCongelar: () => void; onMover: (d: -1 | 1) => void; temProximo: boolean;
}) {
  const d = duracaoDoClipe(c);
  switch (aba) {
    case 'cortar':
      return (
        <div className="space-y-3">
          {c.tipo === 'video' ? (
            <>
              <Faixa t="Começa no segundo" valor={c.inicio} min={0} max={Math.max(0.1, c.fim - 0.2)} passo={0.05} mostrar={formatarTempo(c.inicio)} onChange={(v) => mudar({ inicio: v })} />
              <Faixa t="Termina no segundo" valor={c.fim} min={c.inicio + 0.2} max={Math.max(c.inicio + 0.2, c.duracaoArquivo)} passo={0.05} mostrar={formatarTempo(c.fim)} onChange={(v) => mudar({ fim: v })} />
              <p className="text-[11px] text-slate-400">Vídeo original: {formatarTempo(c.duracaoArquivo)} · no projeto: {d.toFixed(1)} s. Também dá para cortar arrastando as pontas amarelas na linha do tempo.</p>
            </>
          ) : (
            <Faixa t="Tempo na tela" valor={c.duracao} min={0.5} max={30} passo={0.1} mostrar={`${c.duracao.toFixed(1)} s`} onChange={(v) => mudar({ duracao: v })} />
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={onDividir} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-[#FFD400]/50 bg-[#FFD400]/10 text-sm font-semibold text-[#FFD400]" data-testid="video-dividir"><Scissors className="h-4 w-4" />Dividir no cursor</button>
            <button type="button" onClick={onCongelar} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-white/15 text-sm text-white hover:bg-white/5" data-testid="video-congelar"><Snowflake className="h-4 w-4" />Congelar quadro</button>
            <button type="button" onClick={() => onMover(-1)} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-white/10 text-sm hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Mover para antes</button>
            <button type="button" onClick={() => onMover(1)} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-white/10 text-sm hover:bg-white/5">Mover para depois<ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      );
    case 'velocidade':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {VELOCIDADES.map((v) => <Segmento key={v} ativo={c.velocidade === v} onClick={() => mudar({ velocidade: v })} rotulo={`${v}x`}>{v}x</Segmento>)}
          </div>
          <Faixa t="Velocidade fina" valor={c.velocidade} min={0.25} max={4} passo={0.05} mostrar={`${c.velocidade.toFixed(2)}x`} onChange={(v) => mudar({ velocidade: v })} />
          <p className="text-[11px] text-slate-400">{c.tipo === 'video' ? `Câmera lenta abaixo de 1x, acelerado acima. Duração no projeto: ${d.toFixed(1)} s.` : 'Na foto/arte a velocidade muda o ritmo do zoom e das animações.'}</p>
        </div>
      );
    case 'volume':
      return (
        <div className="space-y-3">
          <Chave t="Sem som (mudo)" ligado={c.mudo} onChange={(v) => mudar({ mudo: v })} />
          <Faixa t="Volume" valor={Math.round(c.volume * 100)} min={0} max={200} sufixo="%" onChange={(v) => mudar({ volume: v / 100 })} />
          <Faixa t="Som entrando (fade in)" valor={c.somEntra} min={0} max={Math.min(5, d / 2)} passo={0.1} mostrar={`${c.somEntra.toFixed(1)} s`} onChange={(v) => mudar({ somEntra: v })} />
          <Faixa t="Som saindo (fade out)" valor={c.somSai} min={0} max={Math.min(5, d / 2)} passo={0.1} mostrar={`${c.somSai.toFixed(1)} s`} onChange={(v) => mudar({ somSai: v })} />
          {c.tipo !== 'video' && <p className="text-[11px] text-slate-400">Foto e arte não têm som próprio. Use <b>Música</b> para pôr som no vídeo.</p>}
        </div>
      );
    case 'filtros':
      return (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" onClick={() => mudar({ filtro: f.id })} aria-pressed={c.filtro === f.id}
              className={cn('flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[11px]', c.filtro === f.id ? 'border-[#FFD400] bg-[#FFD400]/10 text-[#FFD400]' : 'border-white/10 text-slate-200 hover:bg-white/5')}>
              <span className="h-5 w-8 rounded bg-gradient-to-r from-[#ff7a00] via-[#25D366] to-[#5D1BFF]" style={{ filter: f.css || undefined }} />{f.nome}
            </button>
          ))}
        </div>
      );
    case 'ajustes': {
      const a = c.ajustes;
      const m = (p: Partial<Clipe['ajustes']>) => mudar({ ajustes: { ...a, ...p } });
      return (
        <div className="space-y-2">
          <Faixa t="Brilho" valor={a.brilho} min={30} max={200} sufixo="%" onChange={(v) => m({ brilho: v })} />
          <Faixa t="Contraste" valor={a.contraste} min={30} max={200} sufixo="%" onChange={(v) => m({ contraste: v })} />
          <Faixa t="Saturação" valor={a.saturacao} min={0} max={250} sufixo="%" onChange={(v) => m({ saturacao: v })} />
          <Faixa t="Matiz (cor)" valor={a.matiz} min={-180} max={180} sufixo="°" onChange={(v) => m({ matiz: v })} />
          <Faixa t="Desfoque" valor={a.desfoque} min={0} max={20} sufixo="px" onChange={(v) => m({ desfoque: v })} />
          <Faixa t="Vinheta (bordas escuras)" valor={a.vinheta} min={0} max={100} sufixo="%" onChange={(v) => m({ vinheta: v })} />
          <button type="button" onClick={() => mudar({ ajustes: { ...AJUSTES_NEUTROS }, filtro: 'nenhum' })} className="h-10 w-full rounded-lg border border-white/10 text-xs hover:bg-white/5">Restaurar ajustes e filtro</button>
        </div>
      );
    }
    case 'enquadrar':
      return (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <Segmento ativo={c.ajuste === 'cobrir'} onClick={() => mudar({ ajuste: 'cobrir' })} rotulo="Encher a tela">Encher a tela</Segmento>
            <Segmento ativo={c.ajuste === 'conter'} onClick={() => mudar({ ajuste: 'conter' })} rotulo="Mostrar inteiro">Mostrar inteiro</Segmento>
          </div>
          <Faixa t="Zoom no começo" valor={c.zoomDe} min={0.5} max={3} passo={0.05} mostrar={`${Math.round(c.zoomDe * 100)}%`} onChange={(v) => mudar({ zoomDe: v })} />
          <Faixa t="Zoom no fim (movimento lento)" valor={c.zoomPara} min={0.5} max={3} passo={0.05} mostrar={`${Math.round(c.zoomPara * 100)}%`} onChange={(v) => mudar({ zoomPara: v })} />
          <Faixa t="Enquadrar ↔" valor={c.focoX} min={0} max={100} sufixo="%" onChange={(v) => mudar({ focoX: v })} />
          <Faixa t="Enquadrar ↕" valor={c.focoY} min={0} max={100} sufixo="%" onChange={(v) => mudar({ focoY: v })} />
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => mudar({ girar: (((c.girar + 90) % 360) as Clipe['girar']) })} className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/10 text-sm hover:bg-white/5"><RotateCw className="h-4 w-4" />Girar 90° ({c.girar}°)</button>
            <button type="button" onClick={() => mudar({ espelhar: !c.espelhar })} aria-pressed={c.espelhar} className={cn('flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm', c.espelhar ? 'border-[#FFD400]/60 text-[#FFD400]' : 'border-white/10 hover:bg-white/5')}><FlipHorizontal className="h-4 w-4" />Espelhar</button>
          </div>
        </div>
      );
    case 'transicao':
      return temProximo ? (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-400">Como este clipe passa para o próximo.</p>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {TRANSICOES.map((t) => <Segmento key={t.id} ativo={c.transicao.tipo === t.id} onClick={() => mudar({ transicao: { ...c.transicao, tipo: t.id, duracao: t.id === 'corte' ? 0 : c.transicao.duracao || 0.5 } })} rotulo={t.nome}><span className="truncate">{t.nome}</span></Segmento>)}
          </div>
          {c.transicao.tipo !== 'corte' && <Faixa t="Duração da transição" valor={c.transicao.duracao} min={0.2} max={2} passo={0.1} mostrar={`${c.transicao.duracao.toFixed(1)} s`} onChange={(v) => mudar({ transicao: { ...c.transicao, duracao: v } })} />}
        </div>
      ) : <p className="text-sm text-slate-400">Este é o último clipe. Adicione outro vídeo ou foto depois dele para escolher a transição.</p>;
  }
}

export function CartaoDoAudio({ a, mudar, total }: { a: FaixaDeAudio; mudar: (p: Partial<FaixaDeAudio>) => void; total: number }) {
  return (
    <div className="space-y-2">
      <Faixa t="Começa no vídeo em" valor={a.em} min={0} max={Math.max(0.5, total)} passo={0.1} mostrar={formatarTempo(a.em)} onChange={(v) => mudar({ em: v })} />
      <Faixa t="Trecho da música: início" valor={a.inicio} min={0} max={Math.max(0.1, a.fim - 0.3)} passo={0.1} mostrar={formatarTempo(a.inicio)} onChange={(v) => mudar({ inicio: v })} />
      <Faixa t="Trecho da música: fim" valor={a.fim} min={a.inicio + 0.3} max={Math.max(a.inicio + 0.3, a.duracaoArquivo)} passo={0.1} mostrar={formatarTempo(a.fim)} onChange={(v) => mudar({ fim: v })} />
      <Faixa t="Volume" valor={Math.round(a.volume * 100)} min={0} max={200} sufixo="%" onChange={(v) => mudar({ volume: v / 100 })} />
      <Faixa t="Entrando suave" valor={a.somEntra} min={0} max={5} passo={0.1} mostrar={`${a.somEntra.toFixed(1)} s`} onChange={(v) => mudar({ somEntra: v })} />
      <Faixa t="Saindo suave" valor={a.somSai} min={0} max={5} passo={0.1} mostrar={`${a.somSai.toFixed(1)} s`} onChange={(v) => mudar({ somSai: v })} />
      <Chave t="Repetir até o fim do vídeo" ligado={a.repetir} onChange={(v) => mudar({ repetir: v })} />
    </div>
  );
}

export function CartaoDoProjeto({ p, mudar, total }: { p: ProjetoDeVideo; mudar: (x: Partial<ProjetoDeVideo>) => void; total: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <Segmento ativo={p.formato === '16:9'} onClick={() => mudar({ formato: '16:9' })} rotulo="TV deitada 16:9">TV deitada 16:9</Segmento>
        <Segmento ativo={p.formato === '9:16'} onClick={() => mudar({ formato: '9:16' })} rotulo="TV em pé 9:16">TV em pé 9:16</Segmento>
      </div>
      <Cor t="Cor de fundo (aparece em fotos/vídeos mostrados inteiros)" valor={p.fundo} onChange={(v) => mudar({ fundo: v })} />
      <p className="text-[11px] text-slate-400">Duração do vídeo: <b className="text-white">{total.toFixed(1)} s</b> · {p.clipes.length} clipe(s) · {p.sobreposicoes.length} texto(s)/elemento(s) · {p.audios.length} áudio(s).</p>
    </div>
  );
}

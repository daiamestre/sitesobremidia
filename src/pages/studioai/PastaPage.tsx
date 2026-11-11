import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clapperboard, FolderOpen, Image as ImageIcon, Monitor, PenLine, Smartphone } from 'lucide-react';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { PalcoDeOfertas } from '@/components/studio/PalcoDeOfertas';
import { PASTA_PALCO, PASTA_PALCO_FARMACIA } from '@/lib/studio/palco';
import { PASTA_ENCARTES_FARMACIA } from '@/lib/studio/encartesOficiais';
import { SEGMENTO_DA_PASTA, SEGMENTO_DA_PASTA_DE_OFERTAS } from '@/lib/studio/pastasDoSegmento';
import { PastaDeOfertas } from '@/components/studio/PastaDeOfertas';
import { chaveDosProdutosDe } from '@/lib/studio/segmentosDeOferta';
import { PASTA_LOGOS, PastaDeLogos } from '@/components/studio/PastaDeLogos';
import { coreografia, temAnimacao } from '@/lib/studio/animacao';
import { modeloParaDocumento } from '@/lib/studio/documento';
import { MiniaturaDoModelo } from '@/components/studio/Vitrines';
import type { FormatoDoc } from '@/lib/studio/documento';
import { nomeDoSegmento } from '@/lib/studio/catalogo';
import type { ModeloDeArte } from '@/lib/studio/modelos';
import { useCatalogo } from '@/lib/studioai/modelos';
import { cn } from '@/lib/utils';
import { PASTA_ENCARTES } from '@/components/studio/EncartesDoStudio';
import { PastaDeEncartes } from '@/components/studio/PastaDeEncartes';
import { CHAVE_PRODUTOS_DA_FARMACIA, CHAVE_PRODUTOS_DO_ENCARTE } from '@/components/studio/ProdutosComFotos';

/** F-234: a versão em VÍDEO do modelo — os mesmos elementos, em coreografia (a animação gravada no modelo vale mais). */
function CartaoVideo({ m, formato }: { m: ModeloDeArte; formato: FormatoDoc }) {
  const doc = useMemo(() => { const d = modeloParaDocumento(m, formato); return temAnimacao(d) ? d : coreografia(d); }, [m, formato]);
  const destino = `/studio/editar/${m.id}?formato=${encodeURIComponent(formato)}&video=1`;
  return (
    <article className="flex flex-col rounded-xl border border-white/10 bg-[#140632] p-3 transition hover:border-[#8A2EFF]/70 hover:shadow-[0_0_28px_rgba(93,27,255,0.35)]" data-testid="studio-video-da-pasta">
      <Link to={destino} className={cn('relative mx-auto block w-full overflow-hidden rounded-lg bg-black', formato === '9:16' && 'max-w-[260px]')} aria-label={`Personalizar o vídeo ${m.nome}`}>
        <PreviaDocumento doc={doc} animar />
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white"><Clapperboard className="h-3 w-3 text-[#FFD400]" />vídeo</span>
      </Link>
      <h3 className="mt-2 truncate text-sm font-semibold text-white" title={m.nome}>{m.nome}</h3>
      <Link to={destino} className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] py-2 text-sm font-bold text-[#0b2a17] transition hover:brightness-105"><Clapperboard className="h-4 w-4" />Personalizar vídeo</Link>
    </article>
  );
}

function Cartao({ m, formato }: { m: ModeloDeArte; formato: FormatoDoc }) {
  const destino = `/studio/editar/${m.id}?formato=${encodeURIComponent(formato)}`;
  return (
    <article className="flex flex-col rounded-xl border border-white/10 bg-[#140632] p-3 transition hover:border-[#8A2EFF]/70 hover:shadow-[0_0_28px_rgba(93,27,255,0.35)]" data-testid="studio-modelo-da-pasta">
      <Link to={destino} className={cn('mx-auto block w-full overflow-hidden rounded-lg bg-black', formato === '9:16' && 'max-w-[260px]')} aria-label={`Personalizar ${m.nome}`}>
        <MiniaturaDoModelo m={m} formato={formato} />
      </Link>
      <h3 className="mt-2 truncate text-sm font-semibold text-white" title={m.nome}>{m.nome}</h3>
      <Link to={destino} className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] py-2 text-sm font-semibold text-white transition hover:bg-[#8A2EFF]"><PenLine className="h-4 w-4" />Personalizar</Link>
    </article>
  );
}

/**
 * F-267 (MG-AUT-08): a Central de Comando abre o encarte/palco OFICIAL já com os produtos e preços que a pessoa escreveu
 * (`?produtos=` com uma linha por produto, no formato do lerLinha). A lista é gravada na MESMA chave que a pasta já usa,
 * antes dos componentes montarem; depois o parâmetro sai do endereço. Nada é publicado: a pessoa confere e salva.
 */
export const CHAVE_DA_PASTA: Record<string, string> = {
  [PASTA_ENCARTES]: CHAVE_PRODUTOS_DO_ENCARTE, [PASTA_PALCO]: CHAVE_PRODUTOS_DO_ENCARTE,
  [PASTA_ENCARTES_FARMACIA]: CHAVE_PRODUTOS_DA_FARMACIA, [PASTA_PALCO_FARMACIA]: CHAVE_PRODUTOS_DA_FARMACIA,
  // F-277: cada segmento guarda a sua lista (a mesma para o encarte e o palco dele)
  ...Object.fromEntries(Object.entries(SEGMENTO_DA_PASTA).map(([pasta, { segmento }]) => [pasta, chaveDosProdutosDe(segmento)])),
};
export function produtosDoLink(pastaId: string | undefined, valor: string | null): boolean {
  const chave = pastaId ? CHAVE_DA_PASTA[pastaId] : undefined;
  const linhas = (valor ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20);
  if (!chave || !linhas.length) return false;
  try { sessionStorage.setItem(chave, linhas.join('\n')); return true; } catch { return false; }
}

/** Pasta de um card do catálogo: o modelo de capa e as variações do mesmo segmento, em 16:9 ou 9:16. */
export default function PastaPage() {
  const { pastaId } = useParams();
  const [params, setParams] = useSearchParams();
  // grava a lista vinda da Central ANTES de PastaDeEncartes/PalcoDeOfertas lerem a sessão (initializer do 1º render)
  useState(() => produtosDoLink(pastaId, params.get('produtos')));
  useEffect(() => { if (params.has('produtos')) setParams((p) => { p.delete('produtos'); return p; }, { replace: true }); }, [params, setParams]);
  // F-299: a pasta do segmento com Encartes e Palco de Ofertas dentro
  if (pastaId && SEGMENTO_DA_PASTA_DE_OFERTAS[pastaId]) return <PastaDeOfertas key={pastaId} segmento={SEGMENTO_DA_PASTA_DE_OFERTAS[pastaId]} />;
  if (pastaId === PASTA_PALCO) return <PalcoDeOfertas />;
  // F-259: as pastas da farmácia (mesmas telas do mercado)
  if (pastaId === PASTA_PALCO_FARMACIA) return <PalcoDeOfertas key="farmacia" segmento="farmacia" />;
  if (pastaId === PASTA_ENCARTES_FARMACIA) return <PastaDeEncartes key="farmacia" segmento="farmacia" />;
  // F-277: as pastas de encarte e palco de cada segmento (mesmas telas do mercado)
  const doSegmento = pastaId ? SEGMENTO_DA_PASTA[pastaId] : undefined;
  if (doSegmento) return doSegmento.tipo === 'palco' ? <PalcoDeOfertas key={pastaId} segmento={doSegmento.segmento} /> : <PastaDeEncartes key={pastaId} segmento={doSegmento.segmento} />;
  if (pastaId === PASTA_LOGOS) return <PastaDeLogos />;
  return pastaId === PASTA_ENCARTES ? <PastaDeEncartes /> : <PastaDeModelos pastaId={pastaId} />;
}

function PastaDeModelos({ pastaId }: { pastaId: string | undefined }) {
  const catalogo = useCatalogo();
  const pasta = catalogo.pastas.find((p) => p.capa.id === pastaId);
  const [formato, setFormato] = useState<FormatoDoc>(() => (pasta?.capa.formato as FormatoDoc) ?? '16:9');
  // F-234: dentro da pasta, duas pastas — Imagens e Vídeos (a versão em vídeo de cada imagem)
  const [params, setParams] = useSearchParams();
  const tipo: 'imagens' | 'videos' = params.get('tipo') === 'videos' ? 'videos' : 'imagens';

  if (!pasta) return catalogo.carregando
    ? <p className="p-10 text-sm text-slate-400">Abrindo a pasta…</p>
    : <div className="p-10 text-sm text-slate-300">Pasta não encontrada. <Link to="/studio" className="text-[#FFD400] hover:underline">Voltar aos modelos</Link></div>;

  return (
    <div className="space-y-5" data-testid="studio-pasta">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/studio" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Modelos</Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-black text-white"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />{pasta.capa.nome.split(' – ')[0]}</h1>
          <p className="text-xs text-slate-400">{nomeDoSegmento(pasta.capa.segmento)} · {pasta.modelos.length} modelos com a mesma composição · todos em 16:9 e 9:16</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Formato">
          {(['16:9', '9:16'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={formato === f} onClick={() => setFormato(f)}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold', formato === f ? 'bg-[#5D1BFF] text-white' : 'text-slate-300 hover:bg-white/5')}>
              {f === '16:9' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}{f === '16:9' ? 'Horizontal 16:9' : 'Vertical 9:16'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:max-w-xl" role="tablist" aria-label="Imagens ou vídeos">
        {([['imagens', 'Imagens', ImageIcon], ['videos', 'Vídeos', Clapperboard]] as const).map(([id, nome, I]) => (
          <button key={id} type="button" role="tab" aria-selected={tipo === id} onClick={() => setParams(id === 'videos' ? { tipo: 'videos' } : {})} data-testid={`subpasta-${id}`}
            className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition', tipo === id ? 'border-[#FFD400] bg-[#FFD400]/10 shadow-[0_0_22px_rgba(255,212,0,0.25)]' : 'border-white/10 bg-[#140632] hover:border-[#8A2EFF]/60')}>
            <span className={cn('flex h-11 w-11 items-center justify-center rounded-lg', tipo === id ? 'bg-[#FFD400] text-[#22004A]' : 'bg-[#5D1BFF] text-white')}><FolderOpen className="h-5 w-5" /></span>
            <span><span className="flex items-center gap-1.5 text-sm font-bold text-white"><I className="h-4 w-4" />{nome}</span><span className="text-xs text-slate-400">{pasta.modelos.length} {id === 'videos' ? 'vídeos animados' : 'imagens'}</span></span>
          </button>
        ))}
      </div>
      <div className={cn('grid gap-4', formato === '16:9' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6')}>
        {pasta.modelos.map((m) => (tipo === 'videos' ? <CartaoVideo key={m.id} m={m} formato={formato} /> : <Cartao key={m.id} m={m} formato={formato} />))}
      </div>
      <p className="text-xs text-slate-500">{tipo === 'videos' ? 'Cada vídeo é a imagem com todos os elementos em movimento coerente (foto em panorâmica, títulos entrando na ordem de leitura, selo pulsando). Em "Personalizar vídeo" dá para trocar tudo e gravar o MP4.' : 'Tudo dentro do modelo é editável: arraste, gire e redimensione textos, formas, selos e fotos, troque cores, fontes e a foto pela do seu produto.'}</p>
    </div>
  );
}

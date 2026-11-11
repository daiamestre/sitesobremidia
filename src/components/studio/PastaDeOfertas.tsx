/**
 * F-299 (pedido do dono, 11/11/2026): UMA pasta por segmento no Studio (Mercado, Farmácia, Padaria, Adega, Suplementos…)
 * com as duas pastas dentro: ENCARTES e PALCO DE OFERTAS. Tocar numa delas abre os modelos dela (F-298: a escolha de
 * modelo); "Editar este modelo" leva à edição. Assim a tela inicial do Studio fica limpa (um cartão por segmento).
 */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clapperboard, FileText, FolderOpen } from 'lucide-react';
import { CapaDosEncartes, useSlidesDosEncartes } from './EncartesDoStudio';
import { CapaDaPastaPalco, useSlidesDosPalcos } from './PalcoDeOfertas';
import { CapaQueGira, type Slide } from '@/components/media/CapaQueGira';
import { infoDaPasta, nomeDoSegmentoDeOfertas, pastaDeOfertasDe } from '@/lib/studio/pastasDoSegmento';
import { encartesDoSegmento } from '@/lib/studio/encartesOficiais';
import { fundosDoSegmento, type SegmentoDoStudio } from '@/lib/studio/palco';
import { ENCARTES } from '@/lib/tabloide/encartes';

/** um de cada: encarte, palco, encarte, palco… */
function intercalar(a: Slide[], b: Slide[]): Slide[] {
  const n = Math.max(a.length, b.length), out: Slide[] = [];
  for (let k = 0; k < n; k++) { if (a[k]) out.push(a[k]); if (b[k]) out.push(b[k]); }
  return out;
}
/** F-299: capa do segmento no Studio: passa em loop um modelo de encarte e um modelo de palco, cada um em movimento */
function CapaDoSegmento({ segmento, atraso = 0 }: { segmento: SegmentoDoStudio; atraso?: number }) {
  const encartes = useSlidesDosEncartes(segmento, true), palcos = useSlidesDosPalcos(segmento);
  const slides = useMemo(() => intercalar(encartes, palcos), [encartes, palcos]);
  return <CapaQueGira slides={slides} atraso={atraso} ajuste="contain" className="h-full w-full" />;
}

const quantosEncartes = (s: SegmentoDoStudio) => encartesDoSegmento(s).length + (s === 'mercado' ? ENCARTES.length : 0);
const quantosPalcos = (s: SegmentoDoStudio) => fundosDoSegmento(s).length + (s === 'mercado' ? 1 : 0);

function Subpasta({ para, titulo, texto, selo, capa, testid }: { para: string; titulo: string; texto: string; selo: ReactNode; capa: ReactNode; testid: string }) {
  return (
    <article className="sm-cartao-luz flex min-w-0 flex-col overflow-hidden rounded-2xl p-2 sm:p-3" data-testid={testid}>
      <Link to={para} aria-label={`Abrir a pasta ${titulo}`} className="relative flex h-60 items-center justify-center overflow-hidden rounded-xl bg-black sm:h-80">
        {capa}
        <span className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-12px)] items-center gap-1 truncate rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur sm:text-[11px]">{selo}</span>
      </Link>
      <h2 className="mt-2 flex min-w-0 items-center gap-1.5 text-sm font-black leading-tight text-white sm:mt-3 sm:text-base"><FolderOpen className="h-4 w-4 shrink-0 text-[#FFD400] sm:h-5 sm:w-5" /><span className="min-w-0">{titulo}</span></h2>
      <p className="mt-0.5 flex-1 text-[11px] leading-snug text-slate-400 sm:text-sm">{texto}</p>
      <Link to={para} className="mt-2 flex h-10 items-center sm:mt-3 sm:h-11 justify-center gap-1.5 rounded-xl bg-[#5D1BFF] text-sm font-bold text-white transition hover:bg-[#8A2EFF]" data-testid={`${testid}-abrir`}><FolderOpen className="h-4 w-4" />Abrir pasta</Link>
    </article>
  );
}

export function PastaDeOfertas({ segmento }: { segmento: SegmentoDoStudio }) {
  const info = infoDaPasta(segmento);
  const nome = nomeDoSegmentoDeOfertas(segmento);
  const nE = quantosEncartes(segmento), nP = quantosPalcos(segmento);
  return (
    <div className="space-y-4" data-testid="studio-pasta-de-ofertas">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/studio" className="flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Studio</span></Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-lg font-black text-white sm:text-xl"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />{nome}</h1>
          <p className="text-xs text-slate-400 sm:text-sm">Encartes e Palco de Ofertas · abra uma pasta e escolha o modelo para editar</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:max-w-4xl">
        <Subpasta para={`/studio/pasta/${info.pastaEncartes}`} titulo="Encartes" testid="pasta-de-ofertas-encartes"
          texto="Encartes com os seus produtos e preços, para imprimir e para as telas"
          selo={<><FileText className="h-3.5 w-3.5 text-[#FFD400]" />{nE} {nE === 1 ? 'modelo' : 'modelos'}</>}
          capa={<CapaDosEncartes segmento={segmento} />} />
        <Subpasta para={`/studio/pasta/${info.pastaPalco}`} titulo="Palco de Ofertas" testid="pasta-de-ofertas-palco"
          texto="Vídeo com um produto de cada vez no palco, com nome e preço"
          selo={<><Clapperboard className="h-3.5 w-3.5 text-[#FFD400]" />{nP} {nP === 1 ? 'modelo' : 'modelos'} · vídeo</>}
          capa={<CapaDaPastaPalco segmento={segmento} atraso={1500} />} />
      </div>
    </div>
  );
}

/** F-299: o CARTÃO do segmento na tela inicial do Studio: o encarte e o palco lado a lado, "Abrir pasta" */
export function CartaoDaPastaDeOfertas({ segmento, atraso = 0 }: { segmento: SegmentoDoStudio; atraso?: number }) {
  const para = `/studio/pasta/${pastaDeOfertasDe(segmento)}`;
  const nome = nomeDoSegmentoDeOfertas(segmento);
  return (
    <article className="sm-cartao-luz group flex flex-col overflow-hidden rounded-xl p-3" data-testid={`studio-pasta-ofertas-${segmento}`}>
      <Link to={para} aria-label={`Abrir a pasta ${nome}: encartes e palco de ofertas`} className="relative block h-44 overflow-hidden rounded-lg bg-black">
        <CapaDoSegmento segmento={segmento} atraso={atraso * 700} />
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur"><FolderOpen className="h-3 w-3 text-[#FFD400]" />2 pastas</span>
      </Link>
      <span className="mt-2 flex flex-wrap gap-1">
        <span className="inline-flex w-fit items-center gap-1 rounded bg-[#5D1BFF] px-1.5 py-0.5 text-[10px] font-bold text-white"><FileText className="h-3 w-3" />encartes</span>
        <span className="inline-flex w-fit items-center gap-1 rounded bg-[#5D1BFF] px-1.5 py-0.5 text-[10px] font-bold text-white"><Clapperboard className="h-3 w-3" />palco de ofertas</span>
      </span>
      <h3 className="mt-1 truncate text-sm font-semibold text-white">{nome}</h3>
      <p className="truncate text-xs text-slate-400">Encartes e Palco de Ofertas · {descricaoCurta(segmento)}</p>
      <div className="mt-3">
        <Link to={para} className="flex items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] py-2 text-center text-sm font-semibold text-white transition hover:bg-[#8A2EFF]" data-testid={`abrir-pasta-ofertas-${segmento}`}><FolderOpen className="h-4 w-4" />Abrir pasta</Link>
      </div>
    </article>
  );
}
function descricaoCurta(s: SegmentoDoStudio) { return (s === 'mercado' ? 'Supermercados' : s === 'farmacia' ? 'Farmácias e drogarias' : infoDaPasta(s).descricao.split(' · ')[0]); }

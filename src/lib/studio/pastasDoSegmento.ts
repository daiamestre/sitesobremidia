// F-277 — o que muda em cada pasta de encartes/palco por segmento (mercado, farmácia e os segmentos novos): títulos, texto da
// pasta, cesta de exemplo e a chave onde fica a lista de produtos da pessoa (cada segmento guarda a sua).
import { CESTA_FARMACIA, CESTA_MERCADO } from '@/lib/tabloide/encartes';
import { SEGMENTOS_DE_OFERTA, chaveDosProdutosDe, pastaDeEncartesDe, pastaDoPalcoDe, type SegmentoNovo } from './segmentosDeOferta';
import type { SegmentoDoStudio } from './palco';

export interface InfoDaPasta {
  tituloEncartes: string; tituloPalco: string; descricao: string;
  /** cesta de exemplo; undefined = a do mercado (padrão da lista) */
  cesta?: string; cestaDaCapa: string;
  /** onde fica a lista de produtos da pessoa; undefined = a do mercado */
  chave?: string;
  pastaEncartes: string; pastaPalco: string;
}
export const CHAVE_PRODUTOS_DA_FARMACIA_ = 'studio-encarte-produtos-farmacia';

export function infoDaPasta(seg: SegmentoDoStudio): InfoDaPasta {
  if (seg === 'mercado') return { tituloEncartes: 'Encartes de Mercado', tituloPalco: 'Palco de Ofertas – Mercado', descricao: '', cestaDaCapa: CESTA_MERCADO, pastaEncartes: 'encartes-de-mercado', pastaPalco: 'palco-de-ofertas' };
  if (seg === 'farmacia') return { tituloEncartes: 'Encartes de Farmácia', tituloPalco: 'Palco de Ofertas – Farmácia', descricao: 'Farmácias e drogarias · remédios isentos de prescrição, vitaminas, higiene e beleza · o aviso “a persistirem os sintomas” já vem no encarte', cesta: CESTA_FARMACIA, cestaDaCapa: CESTA_FARMACIA, chave: CHAVE_PRODUTOS_DA_FARMACIA_, pastaEncartes: 'encartes-de-farmacia', pastaPalco: 'palco-de-ofertas-farmacia' };
  const sg = SEGMENTOS_DE_OFERTA.find((s) => s.id === seg)!;
  return { tituloEncartes: `Encartes de ${sg.nome}`, tituloPalco: `Palco de Ofertas – ${sg.nome}`, descricao: sg.descricao, cesta: sg.cesta, cestaDaCapa: sg.cesta, chave: chaveDosProdutosDe(sg.id as SegmentoNovo), pastaEncartes: pastaDeEncartesDe(sg.id), pastaPalco: pastaDoPalcoDe(sg.id) };
}
/** pasta → segmento, para as rotas */
export const SEGMENTO_DA_PASTA: Record<string, { segmento: SegmentoNovo; tipo: 'encartes' | 'palco' }> = Object.fromEntries(SEGMENTOS_DE_OFERTA.flatMap((s) => [
  [pastaDeEncartesDe(s.id), { segmento: s.id, tipo: 'encartes' as const }],
  [pastaDoPalcoDe(s.id), { segmento: s.id, tipo: 'palco' as const }],
]));

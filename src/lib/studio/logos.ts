// F-248 — LOGOS DO STUDIO: a pasta "Logos" junta as logos oficiais do dono (em public/studio/logos, sem fundo e em alta) com as
// da biblioteca (criadas no Criador de Logos ou enviadas; cada conta vê as suas e as da empresa). Cada encarte tem a sua logo
// padrão e o cliente pode trocar por qualquer logo da pasta: a escolha fica guardada por encarte, neste navegador.
import { logosDoCabecalho, type Selo } from '@/lib/tabloide/selos';
import { SEGMENTOS_DE_OFERTA, logoDoSegmento, type SegmentoNovo } from './segmentosDeOferta';

export interface LogoDaPasta { id: string; nome: string; url: string; largura: number; altura: number; oficial?: boolean; /** dono na biblioteca (a própria pessoa pode tirar) */ dono?: string | null; miniatura?: string | null }

export const LOGO_MEGA_OFERTA: LogoDaPasta = { id: 'oficial-mega-oferta', nome: 'Mega Oferta', url: '/studio/logos/mega-oferta.webp', largura: 1531, altura: 1024, oficial: true };
export const LOGO_SEMANA_DO_FRANGO: LogoDaPasta = { id: 'oficial-semana-do-frango', nome: 'Semana do Frango', url: '/studio/logos/semana-do-frango.webp', largura: 1460, altura: 1024, oficial: true };
export const LOGO_ALERTA_DE_OFERTA: LogoDaPasta = { id: 'oficial-alerta-de-oferta', nome: 'Alerta de Oferta', url: '/studio/logos/alerta-de-oferta.webp', largura: 1530, altura: 1164, oficial: true };
/** F-259: a logo da farmácia (encarte e palco de farmácia) */
export const LOGO_OFERTAS_DE_FARMACIA: LogoDaPasta = { id: 'oficial-ofertas-de-farmacia', nome: 'Ofertas de Farmácia', url: '/studio/logos/ofertas-de-farmacia.webp', largura: 1500, altura: 1050, oficial: true };
/** Logo oficial nova do dono = o arquivo em scripts/studio/preparar-logos.mjs e uma entrada aqui. */
/** F-277: a logo de cada segmento (padaria, adega, açougue...), gerada em scripts/studio/gerar-segmentos.mjs */
export const logoOficialDoSegmento = (s: SegmentoNovo): LogoDaPasta => ({ id: `oficial-ofertas-${s}`, nome: `Ofertas – ${SEGMENTOS_DE_OFERTA.find((x) => x.id === s)?.nome ?? s}`, url: logoDoSegmento(s), largura: 1500, altura: 1050, oficial: true });
export const LOGOS_OFICIAIS: LogoDaPasta[] = [LOGO_MEGA_OFERTA, LOGO_SEMANA_DO_FRANGO, LOGO_ALERTA_DE_OFERTA, LOGO_OFERTAS_DE_FARMACIA, ...SEGMENTOS_DE_OFERTA.map((x) => logoOficialDoSegmento(x.id))];

export const logosDaPasta = (selos: Selo[] | null): LogoDaPasta[] => [
  ...LOGOS_OFICIAIS,
  ...logosDoCabecalho(selos).map((s) => ({ id: s.id, nome: s.nome, url: s.imagem_url, largura: s.largura, altura: s.altura, dono: s.dono_id, miniatura: s.miniatura_url })),
];

const CHAVE = 'studio-logos-dos-encartes';
function lerTudo(): Record<string, LogoDaPasta> {
  try { return JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Record<string, LogoDaPasta>; } catch { return {}; }
}
/** A logo escolhida para um encarte (null = a logo padrão dele). */
export const lerLogoDoEncarte = (encarteId: string): LogoDaPasta | null => lerTudo()[encarteId] ?? null;
export function gravarLogoDoEncarte(encarteId: string, logo: LogoDaPasta | null) {
  const t = lerTudo();
  if (logo) t[encarteId] = logo; else delete t[encarteId];
  try { localStorage.setItem(CHAVE, JSON.stringify(t)); } catch { /* sem armazenamento: vale só nesta tela */ }
}
/** Endereço completo: o editor do Cartaz Digital só guarda logo com https://. */
export const urlCompleta = (url: string) => (/^https?:/.test(url) || typeof location === 'undefined' ? url : new URL(url, location.origin).href);

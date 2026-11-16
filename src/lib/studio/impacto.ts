// SOBRE MÍDIA STUDIO — P-34 (pedido do dono, 16/11/2026): o PACOTE DE IMPACTO do vídeo de ofertas, no padrão do concorrente que
// gera vídeos com IA: trilha sonora que abaixa sozinha quando o locutor fala, efeitos sonoros (sirene na abertura, whoosh
// em cada troca, impacto quando o preço estoura), efeitos visuais (chamas, estrelas, câmera na mão, explosão no preço),
// abertura e fechamento com a logo. Trilhas GRATUITAS do Pixabay; os efeitos sonoros já existentes ficam (sem gasto novo).
import type { SegmentoDoStudio } from './palco';

/**
 * As trilhas são GRATUITAS, do Pixabay (Licença de Conteúdo do Pixabay: uso comercial em vídeo, sem pagar e sem crédito; não
 * pode revender a música sozinha). Regra do dono (16/11/2026): nada de trilha paga ou da ElevenLabs. Recodificadas a 128 kbps,
 * com o volume igualado (loudnorm −14 LUFS) e até 2 min. `ate` = onde volta ao começo, antes do fim que some (medido no arquivo).
 * Origem de cada uma: docs/licencas/TRILHAS_PIXABAY.md.
 */
export interface Trilha { id: string; nome: string; estilo: string; src: string; dur: number; ate: number; segmentos: Array<SegmentoDoStudio | '*'> }
const t = (id: string, nome: string, estilo: string, dur: number, ate: number, segmentos: Array<SegmentoDoStudio | '*'>): Trilha => ({ id, nome, estilo, src: `/studio/trilhas/${id}.mp3`, dur, ate, segmentos });
/** a ordem decide a trilha padrão de cada segmento (a 1ª que cita o segmento) */
export const TRILHAS: Trilha[] = [
  t('varejo-dinamico', 'Varejo Dinâmico', 'Varejo animado', 117.2, 115, ['mercado', '*']),
  t('ukulele-feliz', 'Ukulele Feliz', 'Leve e alegre', 64.9, 62, ['farmacia', 'beleza', 'pet']),
  t('festa-boa', 'Festa Boa', 'Festa / latino', 120, 119.5, ['padaria']),
  t('sertanejo-fenix', 'Sertanejo Fênix', 'Sertanejo', 120, 119.5, ['acougue']),
  t('forro-alma-nordestina', 'Alma Nordestina', 'Forró com sanfona', 120, 119.5, ['hortifruti']),
  t('funk-joga-bonito', 'Joga Bonito', 'Funk', 71, 70, ['adega', 'moda']),
  t('black-friday', 'Black Friday', 'Urgente / Black Friday', 120, 119.5, ['eletronicos', 'suplementos']),
  t('mega-promocao', 'Mega Promoção', 'Promoção', 99.7, 96, []),
  t('grande-liquidacao', 'Grande Liquidação', 'Promoção', 103, 100, []),
  t('comercial-animado', 'Comercial Animado', 'Varejo animado', 86.5, 86, []),
];
export const trilhaPorId = (id: string | null | undefined) => TRILHAS.find((t) => t.id === id) ?? null;
/** a trilha que combina com o segmento (a 1ª da lista que cita o segmento; senão a "Varejo Dinâmico") */
export const trilhaDoSegmento = (s: SegmentoDoStudio | undefined) => TRILHAS.find((t) => s && t.segmentos.includes(s)) ?? TRILHAS[0];

export type SomDeImpacto = 'whoosh' | 'impacto' | 'sirene' | 'brilho' | 'caixa';
export const SONS: Record<SomDeImpacto, { nome: string; src: string; volume: number }> = {
  whoosh: { nome: 'Whoosh (troca de cena)', src: '/studio/sons/whoosh.mp3', volume: 0.6 },
  impacto: { nome: 'Impacto (preço)', src: '/studio/sons/impacto.mp3', volume: 2 },
  sirene: { nome: 'Sirene (abertura)', src: '/studio/sons/sirene.mp3', volume: 0.45 },
  brilho: { nome: 'Brilho', src: '/studio/sons/brilho.mp3', volume: 1 },
  caixa: { nome: 'Caixa registradora', src: '/studio/sons/caixa.mp3', volume: 0.6 },
};
/** um efeito sonoro marcado na linha do tempo (s) — não vira linha de áudio: o motor toca e mistura sozinho */
export interface SomNoVideo { som: SomDeImpacto; em: number; volume?: number }

/** P-34: o que o cliente liga e desliga (sem nada escolhido = tudo ligado, a trilha do segmento) */
export interface ImpactoDoPalco {
  /** desliga o pacote inteiro (volta ao vídeo simples de antes) */
  desligado?: boolean;
  chamas?: boolean; estrelas?: boolean; camera?: boolean; explosao?: boolean;
  /** sirene, whoosh e impacto */
  sons?: boolean; sirene?: boolean;
  /** id da trilha; null = sem trilha; sem valor = a trilha do segmento */
  trilha?: string | null;
  /** 0 a 1 */
  volumeTrilha?: number;
  /** abertura (logo gigante + frase) e fechamento */
  vinhetas?: boolean;
  textoAbertura?: string; textoFechamento?: string;
}
export interface ImpactoResolvido {
  ligado: boolean; chamas: boolean; estrelas: boolean; camera: boolean; explosao: boolean;
  sons: boolean; sirene: boolean; trilha: Trilha | null; volumeTrilha: number; vinhetas: boolean;
  textoAbertura: string; textoFechamento: string;
}
export function impactoResolvido(i: ImpactoDoPalco | undefined, segmento: SegmentoDoStudio | undefined, loja = ''): ImpactoResolvido {
  const ligado = !i?.desligado;
  const l = loja.trim().toUpperCase();
  return {
    ligado,
    chamas: ligado && i?.chamas !== false, estrelas: ligado && i?.estrelas !== false, camera: ligado && i?.camera !== false, explosao: ligado && i?.explosao !== false,
    sons: ligado && i?.sons !== false, sirene: ligado && i?.sons !== false && i?.sirene !== false,
    trilha: !ligado || i?.trilha === null ? null : (trilhaPorId(i?.trilha) ?? trilhaDoSegmento(segmento)),
    volumeTrilha: Math.max(0, Math.min(1, i?.volumeTrilha ?? 0.7)),
    vinhetas: ligado && i?.vinhetas !== false,
    textoAbertura: (i?.textoAbertura ?? '').trim() || (l ? `${l}\nOFERTAS IMPERDÍVEIS` : 'OFERTAS\nIMPERDÍVEIS'),
    textoFechamento: (i?.textoFechamento ?? '').trim() || (l ? `APROVEITE!\n${l}` : 'APROVEITE!\nVENHA CONFERIR'),
  };
}

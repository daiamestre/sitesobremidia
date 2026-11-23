/**
 * F-355 (pedido do dono, 22/11/2026) — as logos ficam SEPARADAS EM PASTAS: por segmento do estabelecimento (mercado,
 * açougue, farmácia, padaria, Black Friday…) e por data comemorativa (Natal, Dia das Mães, Dia dos Pais, São João,
 * Carnaval…). Abriu a pasta, vê todas as logos dela. Logo nova do dono: diga a pasta em scripts/studio/pastas-das-logos.json.
 */
import type { LogoDaPasta } from './logos';

export type GrupoDePasta = 'segmento' | 'data';
export interface PastaDeLogo { id: string; nome: string; grupo: GrupoDePasta; icone: string }

export const PASTAS_DE_LOGOS: PastaDeLogo[] = [
  // segmentos do estabelecimento
  { id: 'mercado', nome: 'Mercado e Ofertas', grupo: 'segmento', icone: '🛒' },
  { id: 'acougue', nome: 'Açougue', grupo: 'segmento', icone: '🥩' },
  { id: 'black-friday', nome: 'Black Friday', grupo: 'segmento', icone: '🖤' },
  { id: 'farmacia', nome: 'Farmácia', grupo: 'segmento', icone: '💊' },
  { id: 'padaria', nome: 'Padaria', grupo: 'segmento', icone: '🥖' },
  { id: 'hortifruti', nome: 'Hortifrúti', grupo: 'segmento', icone: '🥬' },
  { id: 'adega', nome: 'Adega', grupo: 'segmento', icone: '🍷' },
  { id: 'pet', nome: 'Pet Shop', grupo: 'segmento', icone: '🐾' },
  { id: 'beleza', nome: 'Beleza e Perfumaria', grupo: 'segmento', icone: '💄' },
  { id: 'suplementos', nome: 'Suplementos', grupo: 'segmento', icone: '💪' },
  { id: 'eletronicos', nome: 'Eletrônicos', grupo: 'segmento', icone: '📱' },
  { id: 'moda', nome: 'Moda', grupo: 'segmento', icone: '👕' },
  // datas comemorativas (na ordem do ano)
  { id: 'verao', nome: 'Verão', grupo: 'data', icone: '☀️' }, // 23/11/2026: Saldão/Ofertas de Verão do dono
  { id: 'carnaval', nome: 'Carnaval', grupo: 'data', icone: '🎭' },
  { id: 'pascoa', nome: 'Páscoa', grupo: 'data', icone: '🐰' },
  { id: 'dia-das-maes', nome: 'Dia das Mães', grupo: 'data', icone: '💐' },
  { id: 'dia-dos-namorados', nome: 'Dia dos Namorados', grupo: 'data', icone: '❤️' },
  { id: 'sao-joao', nome: 'São João', grupo: 'data', icone: '🌽' },
  { id: 'dia-dos-pais', nome: 'Dia dos Pais', grupo: 'data', icone: '👔' },
  { id: 'dia-das-criancas', nome: 'Dia das Crianças', grupo: 'data', icone: '🧸' },
  { id: 'natal', nome: 'Natal', grupo: 'data', icone: '🎄' },
  { id: 'fim-de-ano', nome: 'Fim de Ano', grupo: 'data', icone: '🎆' },
];

export const pastaDeLogo = (id: string | null | undefined) => PASTAS_DE_LOGOS.find((p) => p.id === id) ?? null;
/**
 * F-355 (pedido do dono, 23/11/2026): a logo GENÉRICA (não fala de segmento: Oferta do Dia, Super Ofertas, Mega Oferta…)
 * aparece também nas pastas dos SEGMENTOS que combinam com a COR dela. As cores de cada logo são medidas por
 * scripts/studio/cores-das-logos.mjs (nada na logo muda). Logo de segmento ou de data (açougue, Black Friday, Natal…) fica
 * só na pasta dela.
 */
export const PASTAS_DA_COR: Record<string, string[]> = {
  vermelho: ['mercado', 'acougue', 'farmacia', 'padaria', 'adega', 'suplementos'],
  amarelo: ['mercado', 'padaria', 'hortifruti', 'suplementos'],
  laranja: ['padaria', 'hortifruti', 'suplementos', 'pet'],
  verde: ['mercado', 'farmacia', 'hortifruti', 'pet'],
  azul: ['mercado', 'farmacia', 'eletronicos', 'pet'],
  roxo: ['beleza', 'moda', 'pet', 'adega'],
  rosa: ['beleza', 'moda'],
  preto: ['suplementos', 'eletronicos', 'adega', 'moda'],
};
/** todas as pastas em que a logo aparece: a dela + as das cores (só nas genéricas, que têm cores) */
export const pastasDaLogo = (l: LogoDaPasta): string[] => [...new Set([l.pasta, ...(l.cores ?? []).flatMap((c) => PASTAS_DA_COR[c] ?? [])].filter((p): p is string => !!p))];
/** as logos de uma pasta (na ordem da galeria) */
export const logosDaPastaDe = (logos: LogoDaPasta[], pasta: string) => logos.filter((l) => pastasDaLogo(l).includes(pasta));

/**
 * META DO DONO (23/11/2026): pelo menos 15 logos (antes 8) em CADA pasta. A ordem abaixo é a ordem em que o dono completa as pastas
 * (as que ele citou primeiro: farmácia, padaria, Dia das Mães, Dia dos Pais, São João, Carnaval…); a "próxima" é a
 * primeira desta ordem que ainda não chegou à meta (META_DE_LOGOS_POR_PASTA). Quando todas chegarem, o próximo passo é o dono mandar os FUNDOS.
 */
export const META_DE_LOGOS_POR_PASTA = 15; // 23/11/2026: o dono subiu de 8 para 15 (depois talvez 20)
export const ORDEM_DA_META = [
  'mercado', 'acougue', 'black-friday', 'natal', 'farmacia', 'padaria', 'dia-das-maes', 'dia-dos-pais', 'sao-joao', 'carnaval',
  'hortifruti', 'adega', 'pet', 'beleza', 'suplementos', 'eletronicos', 'moda', 'pascoa', 'dia-dos-namorados', 'dia-das-criancas', 'fim-de-ano', 'verao',
];
export interface ProgressoDaPasta { pasta: PastaDeLogo; tem: number; falta: number; completa: boolean }
export function progressoDaMeta(logos: LogoDaPasta[]): { pastas: ProgressoDaPasta[]; completas: number; proxima: ProgressoDaPasta | null } {
  const oficiais = logos.filter((l) => l.oficial);
  const pastas = ORDEM_DA_META.map((id) => pastaDeLogo(id)!).filter(Boolean).map((pasta) => {
    const tem = logosDaPastaDe(oficiais, pasta.id).length;
    return { pasta, tem, falta: Math.max(0, META_DE_LOGOS_POR_PASTA - tem), completa: tem >= META_DE_LOGOS_POR_PASTA };
  });
  return { pastas, completas: pastas.filter((p) => p.completa).length, proxima: pastas.find((p) => !p.completa) ?? null };
}

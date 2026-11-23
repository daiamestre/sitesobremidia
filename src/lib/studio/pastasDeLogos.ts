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
/** as logos de uma pasta (na ordem da galeria) */
export const logosDaPastaDe = (logos: LogoDaPasta[], pasta: string) => logos.filter((l) => l.pasta === pasta);

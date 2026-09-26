import type { Cobertura } from './tipos.ts';

/** Configuração das competições (auditada em 26/09/2026 — Gates 1 e 2). Nova competição = nova entrada aqui. */
export interface ConfigCompeticao {
  slug: string;
  codigo: string;
  nome: string;
  pais: string;
  temporada: string;
  cobertura: Cobertura;
  fuso: string;                          // fuso dos horários publicados pela fonte primária
  openfootball: { caminho: string } | null;
  wikipedia: { host: string; pagina: string; tipo: 'tabela' | 'footballbox' };
  /** Nome no openfootball -> código da Wikipédia, quando o nome não basta (comparado já normalizado). */
  apelidos?: Record<string, string>;
  /** Código da Wikipédia -> nome de exibição, quando o rótulo da Wikipédia não é o usual. */
  exibicao?: Record<string, string>;
}

export const COMPETICOES: ConfigCompeticao[] = [
  {
    slug: 'brasileirao', codigo: 'BSA', nome: 'Brasileirão Série A', pais: 'Brasil', temporada: '2026',
    cobertura: 'FULL', fuso: 'America/Sao_Paulo',
    openfootball: { caminho: '2026/br.1.json' },
    wikipedia: { host: 'pt.wikipedia.org', pagina: 'Campeonato Brasileiro de Futebol de 2026 - Série A', tipo: 'tabela' },
    apelidos: { 'CA Paranaense': 'ATP', 'CA Mineiro': 'ATM' },
    exibicao: { ATP: 'Athletico-PR', ATM: 'Atlético-MG', INT: 'Internacional', RBB: 'Bragantino' },
  },
  {
    slug: 'premier-league', codigo: 'PL', nome: 'Premier League', pais: 'Inglaterra', temporada: '2026/27',
    cobertura: 'FULL', fuso: 'Europe/London',
    openfootball: { caminho: '2026-27/en.1.json' },
    wikipedia: { host: 'en.wikipedia.org', pagina: '2026–27 Premier League', tipo: 'tabela' },
  },
  {
    slug: 'la-liga', codigo: 'PD', nome: 'La Liga', pais: 'Espanha', temporada: '2026/27',
    cobertura: 'FULL', fuso: 'Europe/Madrid',
    openfootball: { caminho: '2026-27/es.1.json' },
    wikipedia: { host: 'en.wikipedia.org', pagina: 'Template:2026–27 La Liga table', tipo: 'tabela' },
  },
  {
    slug: 'champions-league', codigo: 'CL', nome: 'Champions League', pais: 'Europa', temporada: '2026/27',
    cobertura: 'PARTIAL', fuso: 'Europe/Paris',
    openfootball: null,
    wikipedia: { host: 'en.wikipedia.org', pagina: '2026–27 UEFA Champions League league phase', tipo: 'footballbox' },
  },
];

export const OPENFOOTBALL_REPO = 'openfootball/football.json';
export const USER_AGENT = 'SobreMidiaSportsEngine/1.0 (+https://sitesobremidia.vercel.app; contato daiamestre9@gmail.com)';
export const CREDITOS = 'Dados: openfootball (CC0) · Wikipédia (CC BY-SA)';

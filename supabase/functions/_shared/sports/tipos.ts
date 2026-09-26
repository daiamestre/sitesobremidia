/**
 * SOBRE MÍDIA Sports Engine — tipos do contrato (docs/engineering/SPORTS_ENGINE_CONTRATO.md).
 * Código puro (sem Deno/Node): roda na Edge Function e nos testes (vitest).
 */
export const PARSER_VERSION = 'sports-engine/1.0.0';

export type StatusPartida = 'SCHEDULED' | 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'UNKNOWN';
export type EstadoValidacao = 'VALIDATED' | 'PENDING_VALIDATION' | 'CONFLICT' | 'SUSPICIOUS' | 'REJECTED';
export type Cobertura = 'FULL' | 'PARTIAL' | 'UNAVAILABLE';
export type Confianca = 'DUAL_SOURCE' | 'DUAL_SOURCE+DOUBLE_READ' | 'DOUBLE_READ';
export type Placar = [number, number];

/** Uma leitura de uma fonte: commit do openfootball ou revisão da Wikipédia. */
export interface Leitura {
  fonte: 'openfootball' | 'wikipedia';
  versao: string;            // sha do commit ou revid
  url: string;               // URL exata lida (fixada na versão)
  publicadoEm: string | null; // data do commit / revisão (ISO)
}

/** Jogo do openfootball: horário local da competição, placar só quando há resultado final. */
export interface JogoOpenfootball {
  rodada: string | null;
  data: string;              // YYYY-MM-DD (local da competição)
  hora: string | null;       // HH:MM (local da competição)
  mandante: string;
  visitante: string;
  placar: Placar | null;
}

/** Confronto da tabela de resultados da Wikipédia (sem data), por código de time. */
export interface ConfrontoWiki {
  mandante: string;          // código (ex.: FLA)
  visitante: string;
  placar: Placar | null;
  bruto: string;             // valor original, para auditoria
}

export interface TabelaWiki {
  times: Record<string, { rotulo: string; artigo: string | null }>;
  confrontos: ConfrontoWiki[];
}

/** Jogo de um "Football box" da Wikipédia (Champions): data e hora em CET/CEST. */
export interface JogoWikiBox {
  data: string;              // YYYY-MM-DD
  hora: string | null;       // HH:MM
  mandante: string;          // rótulo
  visitante: string;
  placar: Placar | null;
  estadio: string | null;
}

/** Partida canônica produzida pela reconciliação (o que vai para content_sports_fixtures). */
export interface PartidaCanonica {
  match_key: string;
  competicao: string;        // slug
  codigo: string;            // BSA, PL, PD, CL
  temporada: string;
  rodada: string | null;
  mandante: string;          // rótulo de exibição
  visitante: string;
  mandante_fonte: string;    // nome na fonte primária
  visitante_fonte: string;
  data_local: string;        // YYYY-MM-DD no fuso da competição
  hora_local: string | null;
  fuso_fonte: string;        // IANA
  kickoff_utc: string | null;
  placar: Placar | null;
  status: StatusPartida;
  estado: EstadoValidacao;
  publicar: boolean;
  confianca: Confianca | null;
  motivo: string | null;     // por que não publica (quando não publica)
  fonte: Leitura;            // fonte primária
  validacao: Leitura | null; // segunda fonte ou segunda leitura
  evidencia: Record<string, unknown>;
}
